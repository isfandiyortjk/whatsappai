import express from "express";
import dotenv from "dotenv";
import { router } from "./router.js";

dotenv.config();
const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.status(200).send("Assistant Doner Home: OK");
});

app.use("/webhook", router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Assistant Doner Home running on :${PORT}`));
