import express from "express";
import dotenv from "dotenv";
import { router } from "./router.js"; // путь именно "./router.js"
dotenv.config();

const app = express();
app.use(express.json());
app.use("/webhook", router);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Assistant Doner Home running on :${PORT}`));
