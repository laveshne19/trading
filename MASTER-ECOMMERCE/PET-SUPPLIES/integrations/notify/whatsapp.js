'use strict';
// WhatsApp Cloud API (Meta). Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
// POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages  Authorization: Bearer <token>
// Business-initiated messages MUST use pre-approved templates (names in templates.js) and the customer's opt-in.
// Status: NOT verified against a live WhatsApp Business account.
const { request } = require('../http');
function create(env = process.env) {
  const token = env.WHATSAPP_CLOUD_TOKEN; const pid = env.WHATSAPP_PHONE_NUMBER_ID; const configured = !!(token && pid);
  const base = env.WHATSAPP_BASE_URL || 'https://graph.facebook.com/v20.0';
  return {
    name: 'whatsapp', label: 'WhatsApp Cloud API', configured: () => configured,
    status: () => ({ configured, clickToChat: !!env.WHATSAPP_NUMBER, note: configured ? 'Token present; templates must be approved in Meta Business Manager.' : 'Set WHATSAPP_CLOUD_TOKEN and WHATSAPP_PHONE_NUMBER_ID. (WHATSAPP_NUMBER alone only enables the website click-to-chat button.)' }),
    async sendTemplate({ to, template, params = [], lang = 'en' }) {
      if (!configured) return { ok: false, status: 'not_configured', error: 'WhatsApp Cloud API is not configured.' };
      const phone = String(to).replace(/\D/g, ''); const num = phone.length === 10 ? '91' + phone : phone;
      try {
        const r = await request(`${base}/${pid}/messages`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: { messaging_product: 'whatsapp', to: num, type: 'template', template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }] } } });
        return r.status >= 200 && r.status < 300 ? { ok: true } : { ok: false, status: 'error', error: (r.json && r.json.error && r.json.error.message) || 'WhatsApp rejected the message', httpStatus: r.status };
      } catch (e) { return { ok: false, status: 'error', error: 'WhatsApp unreachable: ' + e.message }; }
    },
  };
}
module.exports = { create };
