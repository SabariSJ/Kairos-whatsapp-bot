const whatsappService = require("../services/whatsappService");
const chatbotService = require("../services/chatbotService");
const { isDuplicateMessage } = require("../utils/conversationState");

/**
 * Handle Meta Webhook Verification (GET /webhook)
 * Validates hub.mode === 'subscribe' and hub.verify_token === WHATSAPP_VERIFY_TOKEN
 */
function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || "sproutks_webhook_verify_token_2026";

  console.log(`[Webhook Verification] Mode: ${mode} | Token Provided: ${token ? "***" : "missing"}`);

  if (mode === "subscribe" && token === expectedToken) {
    console.log("[Webhook Verification SUCCESS] Meta Webhook challenge verified!");
    return res.status(200).send(challenge);
  }

  console.warn("[Webhook Verification FAILED] Token mismatch or invalid mode.");
  return res.status(403).json({ error: "Verification token mismatch" });
}

/**
 * Handle Incoming WhatsApp Messages & Events (POST /webhook)
 * Filters out duplicates, stale messages, self-messages, and dispatches to chatbot engine.
 */
async function handleWebhook(req, res) {
  // 1. Immediately respond with HTTP 200 EVENT_RECEIVED to prevent Meta timeouts
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body;

    // Validate Meta Webhook payload structure
    if (!body || body.object !== "whatsapp_business_account") {
      return;
    }

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) return;

    // Process delivery status updates (sent, delivered, read, failed)
    if (value.statuses && Array.isArray(value.statuses) && value.statuses.length > 0) {
      const axios = require("axios");
      const backendUrl = process.env.BACKEND_API_BASE_URL || "http://localhost:5000/api";
      const internalKey = process.env.INTERNAL_SERVICE_KEY || "kairos_internal_service_key_2026_bot_auth_secret";

      for (const st of value.statuses) {
        console.log(`[Meta Status Webhook] Message ID: ${st.id} | Status: ${st.status} | Recipient: ${st.recipient_id}`);
        // Asynchronously forward delivery status to Common Backend
        axios.post(`${backendUrl}/internal/notifications/status-update`, {
          metaMessageId: st.id,
          status: st.status,
          timestamp: st.timestamp,
          recipientId: st.recipient_id,
          details: {
            errors: st.errors,
            pricing: st.pricing,
            conversation: st.conversation
          }
        }, {
          headers: { 'x-service-key': internalKey },
          timeout: 5000
        }).catch(err => {
          console.warn(`[Meta Status Forward Warning] Failed to update backend: ${err.message}`);
        });
      }

      if (!value.messages || value.messages.length === 0) {
        return;
      }
    }

    const messages = value.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return;
    }

    const message = messages[0];
    const messageId = message.id;
    const from = String(message.from || "").replace(/\D/g, "");
    const messageType = message.type;
    const timestamp = Number(message.timestamp);

    // 2. Filter out stale messages older than 300 seconds (5 minutes)
    if (timestamp) {
      const nowSec = Math.floor(Date.now() / 1000);
      const ageSec = nowSec - timestamp;
      if (ageSec > 300) {
        console.log(`[Stale Message Dropped] Message ID: ${messageId} is ${ageSec}s old (> 300s). Ignoring.`);
        return;
      }
    }

    // 3. Prevent loopbacks from the bot's receiving phone ID (Never drop client testing numbers like 9629531891)
    const receivingPhone = value.metadata?.display_phone_number?.replace(/\D/g, "");
    if (receivingPhone && from === receivingPhone && from !== "919629531891" && from !== "9629531891") {
      console.log(`[Self Message Dropped] Ignoring loopback sent from bot's receiving number: +${from}`);
      return;
    }

    // 4. Ignore non-chat events (reactions, status receipts, system notices)
    if (messageType === "reaction" || messageType === "system" || messageType === "order" || messageType === "unsupported") {
      console.log(`[Non-Chat Message Dropped] Type: ${messageType}`);
      return;
    }

    // 5. Filter out duplicate messages using message ID caching
    if (isDuplicateMessage(messageId)) {
      console.log(`[Duplicate Dropped] Message ID ${messageId} was already processed.`);
      return;
    }

    console.log(`[Webhook Inbound] ID: ${messageId} | From: +${from} | Type: ${messageType}`);

    // Mark customer message as read asynchronously
    whatsappService.markAsRead(messageId).catch(() => {});

    let userText = "";
    let buttonId = null;

    // 6. Parse message types: text, interactive (button replies), and button_reply
    if (messageType === "text") {
      userText = message.text?.body || "";
    } else if (messageType === "interactive") {
      const interactive = message.interactive;
      if (interactive?.type === "button_reply") {
        buttonId = interactive.button_reply?.id;
        userText = interactive.button_reply?.title;
        console.log(`[Interactive Button Reply] ID: "${buttonId}" | Title: "${userText}"`);
      } else if (interactive?.type === "list_reply") {
        buttonId = interactive.list_reply?.id;
        userText = interactive.list_reply?.title;
        console.log(`[Interactive List Reply] ID: "${buttonId}" | Title: "${userText}"`);
      }
    } else if (messageType === "button" || messageType === "button_reply") {
      buttonId = message.button?.payload || message.button_reply?.id;
      userText = message.button?.text || message.button_reply?.title;
      console.log(`[Direct Button Reply] ID: "${buttonId}" | Text: "${userText}"`);
    } else {
      console.log(`[Ignored Message Type] Type: ${messageType}. No action taken.`);
      return;
    }

    if (!userText && !buttonId) {
      return;
    }

    // 7. Execute Chatbot Engine & Access Control
    const botReplies = await chatbotService.processMessage(from, userText, buttonId, messageId);

    if (botReplies && botReplies.length > 0) {
      await whatsappService.sendMessageSequence(from, botReplies);
    }
  } catch (error) {
    console.error("[Webhook Error] Unexpected error processing incoming event:", error.message);
  }
}

module.exports = {
  verifyWebhook,
  handleWebhook
};
