const axios = require("axios");

/**
 * Service to handle Meta WhatsApp Cloud API REST interactions (Graph API v26.0)
 * Supports Plain Text, Interactive Button Messages, Call-To-Action (CTA) URL Buttons,
 * Media (Image/Video/Audio), and Meta Message Templates.
 */
class WhatsAppService {
  constructor() {
    this.token = process.env.WHATSAPP_ACCESS_TOKEN || "EAA0GZCHnfff0BSiHkuuboCgbQ056pYYar2B0GgZA1TOjp4pqaN7Q0cROGABgJSedcEKw0VDOSBB9nxCxI9sAGU9xEnr2ooo7edCi3HM6iWRPivv8SUuVpVOitTPe18okFJeTfcwIQnPglXidbssoSu8JJg3yVZBLCo8mSl9hY3N6YXtZAlJt63u09ZCZC24ZC7xDgZDZD";
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1393037967216637";
    this.graphApiVersion = process.env.GRAPH_API_VERSION || "v26.0";
    this.baseUrl = `https://graph.facebook.com/${this.graphApiVersion}/${this.phoneNumberId}`;
  }

  /**
   * Clean recipient phone number (strip non-digits)
   */
  cleanPhone(to) {
    return String(to || "").replace(/\D/g, "");
  }

  /**
   * Authorization headers for Meta Graph API
   */
  getHeaders() {
    const token = process.env.WHATSAPP_ACCESS_TOKEN || this.token;
    if (!token || token === "your_token_here") {
      console.warn("[WhatsApp Service Warning] WHATSAPP_ACCESS_TOKEN is missing or placeholder!");
    }
    return {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };
  }

  /**
   * Central API caller with detailed error diagnostics
   */
  async executeSend(payload) {
    if (process.env.MOCK_WHATSAPP === 'true') {
      const mockMsgId = `wamid.MOCK_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      console.log(`[Mock WhatsApp Outbound] Dispatched message ID: ${mockMsgId} to +${payload.to}`);
      return {
        messaging_product: "whatsapp",
        contacts: [{ input: payload.to, wa_id: payload.to }],
        messages: [{ id: mockMsgId }]
      };
    }

    const url = `${this.baseUrl}/messages`;
    try {
      const response = await axios.post(url, payload, {
        headers: this.getHeaders(),
        timeout: 15000
      });
      const msgId = response.data?.messages?.[0]?.id || "OK";
      console.log(`[WhatsApp Outbound Success] Delivered message ID: ${msgId} to +${payload.to}`);
      return response.data;
    } catch (error) {
      const status = error.response ? error.response.status : "NETWORK_ERROR";
      const errorData = error.response?.data?.error || {};
      const errorMessage = errorData.message || error.message;
      const errorCode = errorData.code || "N/A";
      const fbtraceId = errorData.fbtrace_id || "N/A";

      console.error(`[WhatsApp API Error] Status: ${status} | Code: ${errorCode} | TraceID: ${fbtraceId}`);
      console.error(`[WhatsApp API Error Details]: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Send a standard text message
   * 
   * @param {string} to WhatsApp phone number
   * @param {string} text Message body text
   */
  async sendTextMessage(to, text) {
    if (!to || !text) {
      console.error("[WhatsApp Service] Missing recipient phone or message text.");
      return null;
    }
    const cleanTo = this.cleanPhone(to);
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "text",
      text: {
        preview_url: true,
        body: text
      }
    };
    return this.executeSend(payload);
  }

  /**
   * Send a native Image message directly in WhatsApp
   * 
   * @param {string} to WhatsApp phone number
   * @param {string} imageUrl Direct HTTPS link to JPG/PNG image
   * @param {string} [caption] Optional caption on image
   */
  async sendImageMessage(to, imageUrl, caption = "") {
    if (!to || !imageUrl) {
      console.error("[WhatsApp Service] Missing recipient phone or image URL.");
      return null;
    }
    const cleanTo = this.cleanPhone(to);
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "image",
      image: {
        link: imageUrl,
        caption: caption ? String(caption).slice(0, 1024) : undefined
      }
    };
    return this.executeSend(payload);
  }

  /**
   * Send a native Video message that plays inline inside WhatsApp
   * 
   * @param {string} to WhatsApp phone number
   * @param {string} videoUrl Direct HTTPS link to MP4 video
   * @param {string} [caption] Optional caption
   */
  async sendVideoMessage(to, videoUrl, caption = "") {
    if (!to || !videoUrl) {
      console.error("[WhatsApp Service] Missing recipient phone or video URL.");
      return null;
    }
    const cleanTo = this.cleanPhone(to);
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "video",
      video: {
        link: videoUrl,
        caption: caption ? String(caption).slice(0, 1024) : undefined
      }
    };
    return this.executeSend(payload);
  }

  /**
   * Send an Interactive Quick Reply Button Message (1 to 3 buttons)
   * Supports both signatures:
   * (to, header, body, buttons, footer) OR (to, body, buttons, header, footer)
   */
  async sendButtonMessage(to, arg1, arg2, arg3, arg4) {
    let header = null;
    let body = "";
    let buttons = [];
    let footer = null;

    if (Array.isArray(arg2)) {
      // Signature: (to, body, buttons, header, footer)
      body = String(arg1 || "");
      buttons = arg2;
      header = arg3 || null;
      footer = arg4 || null;
    } else {
      // Signature: (to, header, body, buttons, footer)
      header = arg1 || null;
      body = String(arg2 || "");
      buttons = Array.isArray(arg3) ? arg3 : [];
      footer = arg4 || null;
    }

    if (!to || !body || !buttons.length) {
      console.error("[WhatsApp Service] Missing parameters for button message.");
      return null;
    }

    const cleanTo = this.cleanPhone(to);
    const formattedButtons = buttons.slice(0, 3).map(btn => ({
      type: "reply",
      reply: {
        id: String(btn.id).slice(0, 256),
        title: String(btn.title).slice(0, 20)
      }
    }));

    const interactivePayload = {
      type: "button",
      body: {
        text: body
      },
      action: {
        buttons: formattedButtons
      }
    };

    if (header) {
      if (typeof header === "object" && header !== null) {
        interactivePayload.header = header;
      } else {
        interactivePayload.header = {
          type: "text",
          text: String(header).slice(0, 60)
        };
      }
    }

    if (footer) {
      interactivePayload.footer = {
        text: String(footer).slice(0, 60)
      };
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "interactive",
      interactive: interactivePayload
    };

    const result = await this.executeSend(payload);

    // Fallback: If image header failed in interactive message, send image then text button
    if (!result && typeof header === "object" && header && header.type === "image" && header.image?.link) {
      console.log("[WhatsApp Service] Interactive with image header failed; falling back to separate image + buttons");
      await this.sendImageMessage(cleanTo, header.image.link);
      return this.sendButtonMessage(cleanTo, null, body, buttons, footer);
    }

    return result;
  }

  /**
   * Send an Interactive Call-To-Action (CTA) URL Button Message
   * Opens the secure classroom link directly in the browser with 1 tap.
   * 
   * @param {string} to WhatsApp phone number
   * @param {string} header Header text
   * @param {string} body Main body message
   * @param {string} buttonText Label on the button (max 20 chars)
   * @param {string} url Destination URL
   * @param {string} [footer] Optional footer text
   */
  async sendCtaUrlButton(to, header, body, buttonText, url, footer = null) {
    if (!to || !body || !url) {
      console.error("[WhatsApp Service] Missing parameters for CTA URL button message.");
      return null;
    }

    const cleanTo = this.cleanPhone(to);

    const interactivePayload = {
      type: "cta_url",
      body: {
        text: body
      },
      action: {
        name: "cta_url",
        parameters: {
          display_text: String(buttonText || "Open Link").slice(0, 20),
          url: url
        }
      }
    };

    if (header) {
      interactivePayload.header = {
        type: "text",
        text: String(header).slice(0, 60)
      };
    }

    if (footer) {
      interactivePayload.footer = {
        text: String(footer).slice(0, 60)
      };
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "interactive",
      interactive: interactivePayload
    };

    const result = await this.executeSend(payload);

    // Fallback: If Meta returns an error (e.g. CTA buttons not yet approved on specific account),
    // immediately send a rich text message with the direct link so the student is never blocked!
    if (!result) {
      console.log(`[WhatsApp CTA Fallback] Sending rich text fallback for ${url}`);
      const textFallback = `${header ? `*${header}*\n\n` : ""}${body}\n\n👉 *${buttonText}:*\n${url}${footer ? `\n\n_${footer}_` : ""}`;
      return this.sendTextMessage(to, textFallback);
    }

    return result;
  }

  /**
   * Send a Meta Pre-Approved Message Template
   * Essential for messaging customers outside the 24-hour service window.
   * 
   * @param {string} to WhatsApp phone number
   * @param {string} templateName Name of template approved in Meta Business Manager
   * @param {Array<string>} [parameters] Variable parameters for {{1}}, {{2}}, etc.
   * @param {string} [languageCode] e.g. "en", "en_US", "fr"
   */
  async sendTemplateMessage(to, templateName, parameters = [], languageCode = "en_US") {
    if (!to || !templateName) {
      console.error("[WhatsApp Service] Missing recipient or template name.");
      return null;
    }

    const cleanTo = this.cleanPhone(to);
    const components = [];

    if (parameters && parameters.length > 0) {
      components.push({
        type: "body",
        parameters: parameters.map(param => ({
          type: "text",
          text: String(param)
        }))
      });
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode
        },
        components: components.length > 0 ? components : undefined
      }
    };

    return this.executeSend(payload);
  }

  /**
   * Send a sequence of messages in order with pacing
   * 
   * @param {string} to WhatsApp phone number
   * @param {Array<object>} messages Array of message objects
   */
  async sendMessageSequence(to, messages = []) {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (i > 0) {
        const prevMsg = messages[i - 1];
        let delay = 350;
        if (prevMsg && prevMsg.type === "image") {
          delay = 2000;
        } else if (prevMsg && (prevMsg.type === "video" || prevMsg.type === "audio")) {
          delay = 1200;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      if (msg.type === "text") {
        await this.sendTextMessage(to, msg.text);
      } else if (msg.type === "image") {
        await this.sendImageMessage(to, msg.url, msg.caption);
      } else if (msg.type === "video") {
        await this.sendVideoMessage(to, msg.url, msg.caption);
      } else if (msg.type === "button") {
        await this.sendButtonMessage(to, msg.header, msg.body, msg.buttons, msg.footer);
      } else if (msg.type === "cta_url") {
        await this.sendCtaUrlButton(to, msg.header, msg.body, msg.buttonText, msg.url, msg.footer);
      } else if (msg.type === "template") {
        await this.sendTemplateMessage(to, msg.templateName, msg.parameters, msg.languageCode);
      }
    }
  }

  /**
   * Mark customer message as 'read'
   */
  async markAsRead(messageId) {
    if (!messageId) return;
    const url = `${this.baseUrl}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId
    };
    try {
      await axios.post(url, payload, {
        headers: this.getHeaders(),
        timeout: 10000
      });
    } catch (error) {
      // Non-critical, ignore
    }
  }
}

module.exports = new WhatsAppService();
