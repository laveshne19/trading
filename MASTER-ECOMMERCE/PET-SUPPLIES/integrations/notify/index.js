'use strict';
// notify(event, subject) : fan out to email + WhatsApp. Always logs an outcome ('sent' | 'not_configured' | 'error'); never throws.
const templates = require('./templates'); const emailA = require('./email'); const waA = require('./whatsapp');
function createNotifier({ env = process.env, store, ilog, brand }) {
  const email = emailA.create(env); const wa = waA.create(env);
  const log = () => store.get('notifications', []);
  function record(entry) { const a = log(); a.push({ ts: new Date().toISOString(), ...entry }); if (a.length > 1500) a.splice(0, a.length - 1500); store.save('notifications'); }
  async function notify(event, subject, { orderNo } = {}) {
    const tpl = templates[event]; if (!tpl) return [];
    const m = tpl(subject, brand); const out = [];
    const to = subject.email || null; const phone = (subject.address && subject.address.phone) || subject.phone || null;
    if (to) { const r = await email.send({ to, subject: m.subject, text: m.text }).catch((e) => ({ ok: false, status: 'error', error: e.message })); const status = r.ok ? 'sent' : r.status || 'error'; record({ channel: 'email', event, orderNo, to, status, error: r.error }); if (status === 'error') ilog.log('email', 'error', r.error, { event, orderNo }); out.push({ channel: 'email', status }); }
    if (phone) { const r = await wa.sendTemplate({ to: phone, template: m.wa.template, params: m.wa.params }).catch((e) => ({ ok: false, status: 'error', error: e.message })); const status = r.ok ? 'sent' : r.status || 'error'; record({ channel: 'whatsapp', event, orderNo, to: phone, status, error: r.error }); if (status === 'error') ilog.log('whatsapp', 'error', r.error, { event, orderNo }); out.push({ channel: 'whatsapp', status }); }
    return out;
  }
  return { notify, email, wa, recent: (n = 200) => log().slice(-n).reverse(), templates: Object.keys(templates) };
}
module.exports = { createNotifier };
