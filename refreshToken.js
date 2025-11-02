import axios from "axios";

const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const LONG_LIVED_TOKEN = process.env.META_WA_TOKEN;

async function refreshToken() {
  try {
    const res = await axios.get(
      https://graph.facebook.com/v22.0/oauth/access_token, {
        params: {
          grant_type: "fb_exchange_token",
          client_id: APP_ID,
          client_secret: APP_SECRET,
          fb_exchange_token: LONG_LIVED_TOKEN
        }
      }
    );
    console.log("✅ Новый токен:", res.data.access_token);
  } catch (e) {
    console.error("❌ Ошибка обновления токена:", e.response?.data || e.message);
  }
}

refreshToken();