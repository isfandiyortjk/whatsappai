import axios from "axios";
import { aiAnswer } from "./ai.js";
import { buildReplyForRole } from "./templates.js";
import { writeToSheet } from "./google.js";

const META_BASE = "https://graph.facebook.com/v22.0";

// === ENVIRONMENT VARIABLES ===
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const WA_TOKEN = process.env.META_WA_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

// === ROLES & LOGIC ===
const ADMIN_PHONE = (process.env.ADMIN_PHONE || "").replace(/\D/g, "");
const STAFF_WHITELIST = (process.env.STAFF_PHONES || "")
  .split(",")
  .map(s => s.replace(/\D/g, ""))
  .filter(Boolean);

// === SIMPLE MEMORY STORE ===
const store = {
  shifts: {}, // {phone: {status: "on|off", startAt, endAt}}
  reports: [] // {phone, ts, text}
};

// === VERIFY WEBHOOK ===
export function verifyWebhook(req, res) {
  try {
    const verifyToken = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (verifyToken === VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.sendStatus(403);
  } catch {
    return res.sendStatus(500);
  }
}

// === PARSE INCOMING MESSAGE ===
function senderInfo(body) {
  const change = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = change?.messages?.[0];
  const phone = (msg?.from || "").replace(/\D/g, "");
  const name = change?.contacts?.[0]?.profile?.name || "Сотрудник";
  const text = msg?.text?.body || "";
  return { msg, phone, name, text };
}

// === HANDLE INCOMING MESSAGES ===
export async function handleIncoming(req, res) {
  res.sendStatus(200);
  try {
    const { msg, phone, name, text } = senderInfo(req.body);
    if (!msg || !phone) return;

    const role = phone === ADMIN_PHONE ? "manager" : "staff";
    const isKnownStaff = STAFF_WHITELIST.includes(phone) || role === "manager";

    if (!isKnownStaff) {
      await sendText(phone, "❗️Доступ ограничен. Сообщите номер руководителю для добавления в список сотрудников.");
      return;
    }

    const t = text.trim().toLowerCase();

    // === STAFF COMMANDS ===
    if (/(смена старт|приш[её]л|начал)/.test(t)) {
      const startTime = new Date().toLocaleString("ru-RU");
      store.shifts[phone] = { status: "on", startAt: startTime };
      await writeToSheet("Смены", { phone, status: "начал смену", timestamp: startTime });
      await sendText(phone, "✅ Смена начата и записана в таблицу. Хорошей работы!");
      return;
    }

    if (/(смена стоп|уш[её]л|закончил|конец смены)/.test(t)) {
      const endTime = new Date().toLocaleString("ru-RU");
      const rec = store.shifts[phone] || {};
      rec.status = "off";
      rec.endAt = endTime;
      store.shifts[phone] = rec;

      await writeToSheet("Смены", { phone, status: "закончил смену", timestamp: endTime });
      await sendText(phone, "🕘 Смена завершена и записана в таблицу. Не забудь отчёт и питание.");
      return;
    }

    if (/^отч[её]т[:\-]/.test(t)) {
      const timestamp = new Date().toLocaleString("ru-RU");
      await writeToSheet("Отчёты", { phone, text, timestamp });
      await sendText(phone, "📝 Отчёт сохранён и записан в таблицу. Спасибо!");
      return;
    }

    if (/^питание[:\-]/.test(t)) {
      const time = new Date().toLocaleString("ru-RU");
      await writeToSheet("Питание", { phone, text, timestamp: time });
      await sendText(phone, "🍽 Информация о питании сохранена в таблицу. Спасибо!");
      return;
    }

    if (/статус/.test(t)) {
      const rec = store.shifts[phone] || {};
      await sendText(phone, `📊 Статус: ${rec.status || "не на смене"}`);
      return;
    }

    // === MANAGER COMMANDS ===
    if (role === "manager") {
      if (/^рассылка[:\-]/.test(t)) {
        const payload = text.split(/[:\-]/).slice(1).join(":").trim();
        await broadcastToStaff(payload || "Сообщение от руководителя.");
        await sendText(phone, "📣 Рассылка отправлена всем сотрудникам из списка.");
        return;
      }

      if (/^статистика/.test(t)) {
        const on = Object.values(store.shifts).filter(s => s.status === "on").length;
        await sendText(phone, `📈 На смене сейчас: ${on}. Всего отчётов за сегодня: ${store.reports.length}.`);
        return;
      }

      if (/^добавить[:\-]/.test(t)) {
        const newPhone = text.match(/\d{7,}/)?.[0];
        if (newPhone && !STAFF_WHITELIST.includes(newPhone)) {
          STAFF_WHITELIST.push(newPhone);
          await sendText(phone, `✅ Добавлен сотрудник: +${newPhone}`);
        } else {
          await sendText(phone, "⚠️ Укажи номер вида: 'добавить: +491234567890'");
        }
        return;
      }
    }

    // === AI FALLBACK ===
    const system = buildReplyForRole(role);
    const ai = await aiAnswer([{ role: "system", content: system }, { role: "user", content: text }]);
    await sendText(phone, ai);

  } catch (e) {
    console.error("handleIncoming error:", e?.response?.data || e);
  }
}

// === SEND MESSAGE TO WHATSAPP ===
async function sendText(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Сообщение отправлено ${to}: ${body}`);
  } catch (e) {
    console.error("❌ sendText error:", e?.response?.data || e.message);
  }
}
// === MASS BROADCAST ===
async function broadcastToStaff(body) {
  const unique = Array.from(new Set(STAFF_WHITELIST));
  await Promise.all(unique.map(p => p && sendText(p, body)));
}

