'use strict';
const { html, raw } = require('../lib/html');
const { layout } = require('../lib/layout');
const C = require('./components');
const { inr } = require('../lib/util');
const { TRANSITIONS } = require('../lib/orders');
const { STATUS_LABEL } = require('./commerce');

const NAV = [['/admin', 'Dashboard'], ['/admin/orders', 'Orders'], ['/admin/queue', 'Supplier queue'], ['/admin/enquiries', 'Enquiries / quotes'], ['/admin/kyc', 'KYC flags'], ['/admin/data', 'Low-data report'], ['/admin/integrations', 'Integrations'], ['/admin/logs', 'Logs'], ['/admin/export/orders.csv', 'Export orders CSV'], ['/admin/export/enquiries.csv', 'Export enquiries CSV']];
function shell(ctx, title, inner, flash) {
  return layout(ctx, { title: `Admin: ${title}`, description: 'Administration area for orders, supplier queue and integrations.', noindex: true, body: html`<div class="container section--tight"><h1 style="font-size:1.75rem">Admin: ${title}</h1>
    <nav class="admin-nav" aria-label="Admin">${NAV.map(([h, l]) => html`<a class="btn btn--sm ${ctx.path === h ? 'btn--primary' : ''}" href="${h}">${l}</a>`)}</nav>
    ${ctx.cfg.admin.devDefault ? html`<div class="notice notice--warn">Using DEV default admin credentials. Set ADMIN_USER / ADMIN_PASS.</div>` : ''}
    ${flash ? html`<div class="notice notice--ok" role="status" style="margin:12px 0">${flash}</div>` : ''}${inner}</div>` });
}
const pill = (s) => html`<span class="pill ${/^(configured|sent|dev_only|queued|accepted)/.test(s) ? 'pill--ok' : /not_configured|disabled/.test(s) ? 'pill--warn' : ''}">${s}</span>`;
const dt = (s) => (s ? new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');

function dashboard(ctx, d) {
  return shell(ctx, 'Dashboard', html`<div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">${d.stats.map(([k, v, h]) => html`<a class="tile" href="${h}"><b>${v}</b><span>${k}</span></a>`)}</div>
    <p class="muted" style="margin-top:24px">All integrations are reported honestly on the <a href="/admin/integrations">Integrations</a> page. Nothing is marked connected unless credentials are present.</p>`);
}
function ordersList(ctx, orders, title = 'Orders') {
  return shell(ctx, title, html`<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Created</th><th>Status</th><th>Supplier</th><th>Total</th><th>Email</th><th>KYC</th></tr></thead><tbody>${orders.map((o) => html`<tr><td><a href="/admin/orders/${o.order_no}">${o.order_no}</a></td><td>${dt(o.created_at)}</td><td>${STATUS_LABEL[o.status]}</td><td>${pill(o.supplier.status)}</td><td>${inr(o.totals.total)}${o.dev_prices ? ' (DEV)' : ''}</td><td>${o.email}</td><td>${o.kyc.flagged ? 'flagged' : ''}</td></tr>`)}${orders.length ? '' : html`<tr><td colspan="7" class="muted">None.</td></tr>`}</tbody></table></div>`);
}
function orderDetail(ctx, o, flash) {
  const next = TRANSITIONS[o.status] || [];
  const form = (action, inner, extra = '') => html`<form action="/admin/orders/${o.order_no}/${action}" method="post" class="row" style="margin-bottom:12px">${C.csrfInput(ctx)}${inner}${raw(extra)}</form>`;
  return shell(ctx, `Order ${o.order_no}`, html`<div class="grid"><div class="col-8">
    <div class="card"><div class="row between"><h2 style="margin:0">${STATUS_LABEL[o.status]}</h2>${pill(o.supplier.status)}</div>
      <table class="spec" style="margin-top:16px"><tbody><tr><th scope="row">Customer</th><td>${o.shipping.name}<br>${o.email}<br>${o.shipping.phone}</td></tr><tr><th scope="row">Ship to</th><td>${o.shipping.line1} ${o.shipping.line2}<br>${o.shipping.city}, ${o.shipping.state} ${o.shipping.postal_code}, ${o.shipping.country}</td></tr>
      <tr><th scope="row">Payment</th><td>${o.payment.provider} / ${o.payment.status} ${o.payment.id ? html`<span class="mono">${o.payment.id}</span>` : ''}</td></tr><tr><th scope="row">Total</th><td>${inr(o.totals.total)} ${o.dev_prices ? html`<strong>(DEV PLACEHOLDER PRICES)</strong>` : ''}</td></tr>
      ${o.business ? html`<tr><th scope="row">Business (consented)</th><td>${o.business.name} ${o.business.gstin}</td></tr>` : ''}
      ${o.supplier.tracking ? html`<tr><th scope="row">Tracking</th><td>${o.supplier.tracking.carrier} <span class="mono">${o.supplier.tracking.number}</span></td></tr>` : ''}${o.supplier.error ? html`<tr><th scope="row">Supplier error</th><td>${o.supplier.error}</td></tr>` : ''}</tbody></table></div>
    <h3 style="margin-top:24px">Lines and compatibility confirmations</h3>${o.lines.map((l) => { const c = o.compat[l.sku] || {}; return html`<div class="card" style="margin-bottom:12px"><b>${l.qty} x ${l.title}</b> <span class="mono muted">${l.sku} / OEM ${l.oem || '-'}</span><br><span class="small">Customer vehicle: ${c.make} ${c.model} ${c.year} ${c.generation || ''} | ${c.drive} | side: ${c.side} | position: ${c.position} | OEM compared: ${c.oem_ack ? 'yes' : 'no'}</span></div>`; })}
    <h3>History</h3><ul class="feature-list">${o.history.map((h) => html`<li>${dt(h.at)}: ${h.from || '-'} to ${h.to} (${h.actor}) ${h.note || ''}</li>`)}</ul></div>
    <div class="col-4"><div class="card stack"><h3>Actions</h3>
      ${next.length ? form('status', html`<label class="sr" for="ns">New status</label><select id="ns" name="to" style="flex:1">${next.map((s) => html`<option value="${s}">${STATUS_LABEL[s]}</option>`)}</select><input name="note" placeholder="Note" style="flex:1 1 100%"><button class="btn btn--sm">Change status</button>`) : html`<p class="muted small">No further transitions.</p>`}
      ${['paid', 'supplier_queued'].includes(o.status) ? form('supplier-submit', html`<button class="btn btn--sm">Submit to supplier adapter (retry)</button>`) : ''}
      ${o.supplier.status === 'queued' ? form('supplier-sent', html`<button class="btn btn--sm">Mark PO sent to supplier</button>`) : ''}
      ${['queued', 'sent'].includes(o.supplier.status) ? form('supplier-accepted', html`<button class="btn btn--sm">Supplier accepted</button>`) : ''}
      ${['supplier_accepted', 'dispatched', 'in_transit'].includes(o.status) ? form('tracking', html`<label class="sr" for="tc">Carrier</label><select id="tc" name="carrier"><option value="dhl">DHL</option><option value="ups">UPS</option><option value="other">Other</option></select><input name="number" placeholder="Tracking number" required style="flex:1 1 100%"><button class="btn btn--sm">Save tracking (marks dispatched)</button>`) : ''}
      <a class="btn btn--sm btn--ghost" href="/admin/export/po/${o.order_no}.csv">PO export CSV</a><a class="btn btn--sm btn--ghost" href="/admin/export/po/${o.order_no}.txt">PO export (email-ready text)</a>
      <hr style="border-color:var(--line)"><h3>KYC review</h3>${o.kyc.flagged ? html`<p class="small">Flagged: ${o.kyc.reason || ''}. ${o.kyc.document ? html`Document uploaded <a href="/admin/uploads/${o.kyc.document}">view</a>` : 'Awaiting customer.'}</p>` : form('kyc-flag', html`<input name="reason" placeholder="Reason shown to customer" style="flex:1 1 100%"><button class="btn btn--sm">Flag for KYC (request document with consent)</button>`)}
      ${o.kyc.flagged ? form('kyc-clear', html`<button class="btn btn--sm">Clear flag</button>`) : ''}</div></div></div>`, flash);
}
function queue(ctx, orders) {
  return shell(ctx, 'Supplier queue', html`<p class="muted">Default adapter: manual-queue. You send the PO to the supplier, then mark it sent/accepted and enter the tracking number. Nothing is sent automatically.</p><div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Status</th><th>Supplier</th><th>Items</th><th>Ship to</th><th></th></tr></thead><tbody>${orders.map((o) => html`<tr><td><a href="/admin/orders/${o.order_no}">${o.order_no}</a></td><td>${STATUS_LABEL[o.status]}</td><td>${pill(o.supplier.status)}${o.supplier.error ? html`<br><span class="small">${o.supplier.error}</span>` : ''}</td><td>${o.lines.map((l) => `${l.qty}x ${l.sku}`).join(', ')}</td><td>${o.shipping.city}, ${o.shipping.country}</td><td><a href="/admin/export/po/${o.order_no}.csv">PO CSV</a></td></tr>`)}${orders.length ? '' : html`<tr><td colspan="6" class="muted">Queue is empty.</td></tr>`}</tbody></table></div>`);
}
function enquiries(ctx, list) {
  return shell(ctx, 'Enquiries / quotes', html`<div class="table-wrap"><table class="data"><thead><tr><th>Ref</th><th>Date</th><th>Type</th><th>Contact</th><th>Vehicle / part</th><th>Message</th><th>File</th><th>Status</th></tr></thead><tbody>${list.map((e) => html`<tr><td class="mono">${e.id}</td><td>${dt(e.created_at)}</td><td>${e.type}</td><td>${e.name}<br>${e.email}<br>${e.phone || ''}</td><td>${e.vehicle || ''}<br>${e.sku || ''}</td><td style="max-width:320px">${e.message}</td><td>${e.file ? html`<a href="/admin/uploads/${e.file}">${e.file.slice(-8)}</a>` : ''}</td><td><form action="/admin/enquiries/${e.id}/status" method="post" class="row" style="gap:4px">${C.csrfInput(ctx)}<select name="status" aria-label="Status for ${e.id}" style="min-height:36px;padding:4px"><option ${e.status === 'new' ? raw('selected') : ''}>new</option><option ${e.status === 'replied' ? raw('selected') : ''}>replied</option><option ${e.status === 'closed' ? raw('selected') : ''}>closed</option></select><button class="btn btn--sm">Set</button></form></td></tr>`)}${list.length ? '' : html`<tr><td colspan="8" class="muted">No enquiries yet.</td></tr>`}</tbody></table></div>`);
}
function dataReport(ctx, r) {
  const list = (title, items) => html`<h3 style="margin-top:32px">${title} (${items.length})</h3><div class="table-wrap"><table class="data"><tbody>${items.slice(0, 50).map((p) => html`<tr><td class="mono">${p.sku}</td><td><a href="/product/${p.slug}">${p.title}</a></td></tr>`)}</tbody></table></div>${items.length > 50 ? html`<p class="small muted">Showing first 50.</p>` : ''}`;
  return shell(ctx, 'Low-data report', html`<p class="muted">Where catalogue data is missing. Prices come from catalog/pricing.json.</p><div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${r.summary.map(([k, v]) => html`<div class="tile"><b>${v}</b><span>${k}</span></div>`)}</div>${list('Missing price', r.noPrice)}${list('Missing image', r.noImage)}${list('Low-resolution image (<300px wide)', r.lowRes)}${list('No generation match (fitment finder cannot place these)', r.noFit)}`);
}
function integrations(ctx, rows, flags) {
  return shell(ctx, 'Integration status', html`<p class="muted">Honest status. "not_configured" means credentials are absent and the feature does nothing. "configured_untested" means credentials exist but this build has not been verified against the live service.</p>
    <div class="table-wrap"><table class="data"><thead><tr><th>Integration</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows.map(([n, s, note]) => html`<tr><td>${n}</td><td>${pill(s)}</td><td>${note}</td></tr>`)}</tbody></table></div>
    <h3 style="margin-top:32px">Runtime flags</h3><ul class="feature-list">${flags.map(([k, v]) => html`<li><span class="mono">${k}</span>: ${v}</li>`)}</ul>`);
}
function logs(ctx, entries) {
  return shell(ctx, 'Integration logs', html`<div class="table-wrap"><table class="data"><thead><tr><th>Time</th><th>Integration</th><th>Detail</th></tr></thead><tbody>${entries.map((e) => html`<tr><td>${dt(e.at)}</td><td>${e.integration || ''} ${e.op || ''}</td><td class="mono small">${JSON.stringify({ ...e, at: undefined, integration: undefined, op: undefined })}</td></tr>`)}${entries.length ? '' : html`<tr><td colspan="3" class="muted">No log entries.</td></tr>`}</tbody></table></div>`);
}
module.exports = { shell, dashboard, ordersList, orderDetail, queue, enquiries, dataReport, integrations, logs };
