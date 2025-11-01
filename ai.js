import axios from "axios";

const OPENAI_KEY = process.env.OPENAI_KEY;

export async function aiAnswer(messages) {
  try {
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-5", messages, temperature: 0.2 },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }
    );
    return r.data.choices[0].message.content;
  } catch (e) {
    console.error("OpenAI error:", e?.response?.data || e.message);
    return "Извините, временная ошибка ИИ. Попробуйте ещё раз.";
  }
}