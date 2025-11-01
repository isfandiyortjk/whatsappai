import express from "express";
export const router = express.Router();

// --- Проверка webhook от Meta ---
router.get("/", (req, res) => {
  const verifyToken = process.env.META_VERIFY_TOKEN;
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (token === verifyToken) {
    console.log("✅ Webhook verification passed");
    res.status(200).send(challenge);
  } else {
    console.warn("❌ Webhook verification failed");
    res.sendStatus(403);
  }
});

// --- Обработка сообщений WhatsApp ---
import { handleIncoming } from "./whatsapp.js";
router.post("/", handleIncoming);
