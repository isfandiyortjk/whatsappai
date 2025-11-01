import express from "express";
import { handleIncoming, verifyWebhook } from "./whatsapp.js";
export const router = express.Router();

router.get("/", verifyWebhook);
router.post("/", handleIncoming);