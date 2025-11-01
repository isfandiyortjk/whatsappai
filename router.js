import express from "express";
export const router = express.Router();

// --- Верификация webhook от Meta ---
router.get("/", (req, res) => {
  try {
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
  } catch (err) {
    console.error("Webhook verification error:", err);
    res.sendStatus(500);
  }
});

// --- Основная обработка входящих сообщений ---
import { handleIncoming } from "./whatsapp.js";
router.post("/", handleIncoming);
