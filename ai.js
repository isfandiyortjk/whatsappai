import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;

if (!apiKey) {
  console.warn(
    "⚠️ OPENAI_API_KEY или OPENAI_KEY не заданы. Ответы ИИ будут недоступны."
  );
}

const client = new OpenAI({
  apiKey,
});

// Простая функция общения с ИИ
export async function aiAnswer(messages) {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // можно заменить на gpt-5
      messages,
      temperature: 0.8,
    });

    return completion.choices[0].message.content;
  } catch (e) {
    console.error("❌ Ошибка OpenAI:", e.response?.data || e.message);
    return "Извини, сейчас я не могу ответить. Попробуй чуть позже.";
  }
}
