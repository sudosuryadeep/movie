const BOT_TOKEN = process.env.BOT_TOKEN;
const SOURCE_CHAT_ID = process.env.SOURCE_CHAT_ID;
const DESTINATION_CHAT_ID = process.env.DESTINATION_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function telegram(method, body = {}) {
  const response = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return response.json();
}

function json(res, status, data) {
  res.status(status).json(data);
}

export default async function handler(req, res) {
  try {
    // Health check
    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        service: "Telegram Vercel API",
        status: "online"
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, {
        ok: false,
        error: "Method not allowed"
      });
    }

    // Webhook secret protection
    const receivedSecret =
      req.headers["x-telegram-bot-api-secret-token"];

    if (WEBHOOK_SECRET && receivedSecret !== WEBHOOK_SECRET) {
      return json(res, 403, {
        ok: false,
        error: "Invalid webhook secret"
      });
    }

    const update = req.body;

    // Telegram may send normal messages or channel posts
    const message =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;

    if (!message) {
      return json(res, 200, {
        ok: true,
        ignored: true
      });
    }

    /*
     * We only react to /publish commands.
     *
     * Usage:
     * Reply to a video/document message with:
     * /publish
     */

    const text = message.text || message.caption || "";

    if (!text.trim().startsWith("/publish")) {
      return json(res, 200, {
        ok: true,
        ignored: true
      });
    }

    // The command must be a reply to the media message
    const replied = message.reply_to_message;

    if (!replied) {
      await telegram("sendMessage", {
        chat_id: message.chat.id,
        text:
          "❌ /publish ko media message ke reply mein bhejo."
      });

      return json(res, 200, {
        ok: false,
        error: "No replied message"
      });
    }

    // Optional source-chat restriction
    if (
      SOURCE_CHAT_ID &&
      String(message.chat.id) !== String(SOURCE_CHAT_ID)
    ) {
      return json(res, 200, {
        ok: false,
        error: "Unauthorized source chat"
      });
    }

    const sourceMessageId = replied.message_id;

    /*
     * copyMessage copies Telegram-hosted media without
     * downloading the actual video through Vercel.
     */
    const result = await telegram("copyMessage", {
      chat_id: DESTINATION_CHAT_ID,
      from_chat_id: replied.chat.id,
      message_id: sourceMessageId
    });

    if (!result.ok) {
      await telegram("sendMessage", {
        chat_id: message.chat.id,
        text:
          `❌ Publish failed.\n\n${result.description || "Telegram API error"}`
      });

      return json(res, 500, {
        ok: false,
        telegram: result
      });
    }

    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text:
        `✅ Published successfully.\n\nMessage ID: ${result.result.message_id}`
    });

    return json(res, 200, {
      ok: true,
      published: true,
      destination_message_id: result.result.message_id
    });

  } catch (error) {
    console.error(error);

    return json(res, 500, {
      ok: false,
      error: "Internal server error"
    });
  }
}
