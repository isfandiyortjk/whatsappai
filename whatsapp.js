import axios from "axios";
import { aiAnswer } from "./ai.js";
import { buildReplyForRole } from "./templates.js";
import { writeToSheet } from "./google.js";

const META_BASE = "https://graph.facebook.com/v22.0";

const WA_TOKEN = process.env.META_WA_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

const ADMIN_PHONE = (process.env.ADMIN_PHONE || "").replace(/\D/g, "");
const DEFAULT_STAFF = ["79133318413"]; // +7 913 331-84-13
const STAFF_WHITELIST = Array.from(
  new Set(
    DEFAULT_STAFF.concat(
      (process.env.STAFF_PHONES || "")
        .split(",")
        .map(s => s.replace(/\D/g, ""))
        .filter(Boolean)
    )
  )
);

const store = {
  shifts: {},
  reports: [],
};

const BLOCK_TTL_MS = 15 * 60 * 1000;

const blockedRecipients = new Map();
const adminNotifiedFor = new Map();
const unknownStaffAlerts = new Set();

function senderInfo(body) {
  const change = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = change?.messages?.[0];
  const phone = (msg?.from || "").replace(/\D/g, "");
  const name = change?.contacts?.[0]?.profile?.name || "Сотрудник";
  const text = msg?.text?.body || "";
  return { msg, phone, name, text };
}

export async function handleIncoming(req, res) {
  res.sendStatus(200);
  try {
    const { msg, phone, text } = senderInfo(req.body);
    if (!msg || !phone) return;

    const role = phone === ADMIN_PHONE ? "manager" : "staff";
    const isKnownStaff = STAFF_WHITELIST.includes(phone) || role === "manager";

    if (!isKnownStaff) {
      console.warn(
        `🚫 Получено сообщение от номера вне списка сотрудников: ${displayPhone(phone)}.`
      );
      await notifyAdminOfUnknownStaff(phone, text);
      await sendText(
        phone,
        "❗️Доступ ограничен. Сообщите свой номер руководителю для добавления в список сотрудников."
      );
      return;
    }

    const t = text.trim().toLowerCase();

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
      store.reports.push({ phone, text, timestamp });
      await writeToSheet("Отчёты", { phone, text, timestamp });
      await sendText(phone, "📝 Отчёт сохранён и записан в таблицу. Спасибо!");
      return;
    }

    if (/^питание[:\-]/.test(t)) {
      const time = new Date().toLocaleString("ru-RU");
      await writeToSheet("Питание", { phone, text, timestamp: time });
      await sendText(phone, "🍽 Информация о питании сохранена. Спасибо!");
      return;
    }

    if (/статус/.test(t)) {
      const rec = store.shifts[phone] || {};
      await sendText(phone, `📊 Статус: ${rec.status || "не на смене"}`);
      return;
    }

    if (role === "manager") {
      if (/^рассылка[:\-]/.test(t)) {
        const payload = text.split(/[:\-]/).slice(1).join(":").trim();
        await broadcastToStaff(payload || "Сообщение от руководителя.");
        await sendText(phone, "📣 Рассылка отправлена всем сотрудникам.");
        return;
      }

      if (/^статистика/.test(t)) {
        const on = Object.values(store.shifts).filter(s => s.status === "on").length;
        await sendText(
          phone,
          `📈 На смене сейчас: ${on}. Всего отчётов за сегодня: ${store.reports.length}.`
        );
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

    const system = buildReplyForRole(role);
    const ai = await aiAnswer([
      { role: "system", content: system },
      { role: "user", content: text },
    ]);
    await sendText(phone, ai);
  } catch (e) {
    console.error("handleIncoming error:", e?.response?.data || e);
  }
}

function displayPhone(phone) {
  if (!phone) return "неизвестный номер";
  return phone.startsWith("+") ? phone : `+${phone}`;
}

async function dispatchMessage(to, body) {
  const url = `${META_BASE}/${PHONE_NUMBER_ID}/messages`;
  return axios.post(
    url,
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
}

async function sendText(to, body, options = {}) {
  const { skipNotifyAdmin, allowBlocked } = options;

  if (!allowBlocked && blockedRecipients.has(to)) {
    const info = blockedRecipients.get(to);
    if (Date.now() - info.timestamp > BLOCK_TTL_MS) {
      blockedRecipients.delete(to);
    } else {
    console.warn(
      `⏭️ Пропуск отправки на ${displayPhone(to)}: Meta вернул ошибку #${info.code} ${new Date(
        info.timestamp
      ).toLocaleString("ru-RU")}.`
    );
    return;
    }
  }

  try {
    await dispatchMessage(to, body);
    console.log(`✅ Отправлено ${to}: ${body}`);
  } catch (e) {
    const data = e?.response?.data || e;
    console.error("❌ sendText error:", data);

    const metaCode = data?.error?.code;
    if (metaCode === 131030) {
      blockedRecipients.set(to, { code: metaCode, timestamp: Date.now() });
    }
    const shouldNotifyAdmin =
      metaCode === 131030 &&
      !skipNotifyAdmin &&
      ADMIN_PHONE &&
      to !== ADMIN_PHONE;

    if (shouldNotifyAdmin) {
      const humanMessage =
        `⚠️ Не удалось отправить сообщение на ${displayPhone(to)}. ` +
        "Добавьте этот номер в разрешённый список WhatsApp Cloud API " +
        "(Meta Developers → App → WhatsApp → API Setup → Add phone number) " +
        "и попросите сотрудника написать боту, чтобы открыть 24-часовой диалог.";

      try {
        const lastNotified = adminNotifiedFor.get(to) || 0;
        if (Date.now() - lastNotified < BLOCK_TTL_MS) {
          return;
        }
        adminNotifiedFor.set(to, Date.now());
        await sendText(ADMIN_PHONE, humanMessage, {
          skipNotifyAdmin: true,
          allowBlocked: true,
        });
      } catch (notifyError) {
        console.error(
          "❌ Не удалось уведомить администратора о блокировке номера:",
          notifyError?.response?.data || notifyError.message
        );
      }
    }
  }
}

async function broadcastToStaff(body) {
  const unique = Array.from(new Set(STAFF_WHITELIST));
  await Promise.all(unique.map(p => p && sendText(p, body)));
}

async function notifyAdminOfUnknownStaff(phone, text) {
  if (!ADMIN_PHONE || unknownStaffAlerts.has(phone)) {
    return;
  }

  const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  const body =
    `⚠️ Новый номер ${displayPhone(phone)} написал боту, но не найден в STAFF_PHONES. ` +
    `Проверьте, добавлен ли он в разрешённый список Meta и обновите переменную окружения.\n` +
    `Сообщение: "${preview || "(пусто)"}"`;

  try {
    unknownStaffAlerts.add(phone);
    await sendText(ADMIN_PHONE, body, { skipNotifyAdmin: true, allowBlocked: true });
  } catch (error) {
    console.error(
      "❌ Не удалось уведомить администратора о новом номере:",
      error?.response?.data || error.message
    );
    unknownStaffAlerts.delete(phone);
  }
}
