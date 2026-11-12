'use strict';
const { html, raw, esc } = require('../lib/html');
const { layout } = require('../lib/layout');
const C = require('./components');
const { inr } = require('../lib/util');
const { COUNTRY_NAMES, countriesFrom } = require('../lib/checkout');
const { STATUSES } = require('../lib/orders');
const shippingLib = require('../../integrations/shipping');

const STATUS_LABEL = { pending_payment: 'Awaiting payment', paid: 'Paid', supplier_queued: 'Queued with supplier', supplier_accepted: 'Supplier accepted', dispatched: 'Dispatched from China', in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded', return_requested: 'Return requested' };
const msgPage = (ctx, title, inner, extra = {}) => layout(ctx, { title: `${title} | ${ctx.cfg.siteName}`, description: `${title}. ${ctx.cfg.siteName} prepaid order status and messages.`, noindex: true, body: html`<div class="container section"><div class="article"><h1 style="font-size:2rem">${title}</h1>${inner}</div></div>`, ...extra });

function totalsBlock(priced) {
  return html`<div class="totals"><div><span>Subtotal</span><span>${inr(priced.subtotal)}</span></div>
    <div><span>Shipping${priced.shipping.placeholder ? ' (estimate)' : ''}</span><span>${priced.lines.length ? inr(priced.shipping.amount || 0) : '-'}</span></div>
    <div><span>Import duties &amp; taxes</span><span class="small">confirmed before order</span></div>
    <div class="grand"><span>Total</span><span>${inr(priced.total)}</span></div></div>`;
}
function cartLines(ctx, priced, { editable = true, drawer = false } = {}) {
  const action = (a) => `/cart/${a}`;
  return priced.lines.map((l) => html`<div class="line"><div class="line__img">${l.product.image ? html`<img src="/assets/products/${l.product.image}" width="${l.product.image_px[0]}" height="${l.product.image_px[1]}" alt="" loading="lazy">` : ''}</div>
    <div><a href="/product/${l.slug}" style="font-size:.9375rem;font-weight:500">${l.title}</a><div class="small muted mono">${l.oem ? 'OEM ' + l.oem : l.sku}</div>${l.dev ? html`<div class="small" style="color:#ff9a57">DEV PLACEHOLDER PRICE</div>` : ''}
      ${editable ? html`<form action="/cart/update" method="post" ${drawer ? raw('data-drawer-form') : ''} class="row" style="margin-top:8px;gap:8px">${C.csrfInput(ctx)}<input type="hidden" name="sku" value="${l.sku}"><label class="sr" for="q-${l.sku}">Quantity</label><input id="q-${l.sku}" name="qty" value="${l.qty}" inputmode="numeric" style="width:64px;min-height:40px;padding:6px 8px;text-align:center"><button class="btn btn--sm" type="submit">Update</button><button class="btn btn--sm btn--ghost" type="submit" name="qty" value="0">Remove</button></form>` : html`<div class="small muted">Qty ${l.qty}</div>`}</div>
    <div style="font-weight:600">${inr(l.total)}</div></div>`);
}
function unpricedBlock(ctx, priced) {
  if (!priced.unpriced.length) return '';
  return html`<div class="notice notice--warn" style="margin:16px 0"><strong>Price on request:</strong> ${priced.unpriced.length} item(s) cannot be bought online until quoted.${priced.unpriced.map((p) => html`<div class="small" style="margin-top:6px"><a href="/product/${p.slug}">${p.title}</a> <form action="/cart/update" method="post" style="display:inline">${C.csrfInput(ctx)}<input type="hidden" name="sku" value="${p.sku}"><button class="btn btn--sm btn--ghost" name="qty" value="0">Remove</button></form></div>`)}</div>`;
}

function cartDrawer(ctx, priced) {
  const n = priced.lines.reduce((a, l) => a + l.qty, 0);
  if (!priced.lines.length && !priced.unpriced.length) return html`<div class="drawer__body" data-count="0"><p class="muted">Your cart is empty.</p><p><a class="btn" href="/shop">Browse parts</a></p></div>`;
  return html`<div class="drawer__body" data-count="${n}">${cartLines(ctx, priced, { drawer: true })}${unpricedBlock(ctx, priced)}</div>
    <div class="drawer__foot">${totalsBlock(priced)}<p style="margin:16px 0 8px"><a class="btn btn--primary btn--block" href="/checkout" ${priced.lines.length ? '' : raw('aria-disabled="true"')}>Checkout (prepaid)</a></p><a class="btn btn--ghost btn--block btn--sm" href="/cart">View cart</a></div>`;
}

function cartPage(ctx, priced) {
  const body = html`<div class="container section--tight">${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Cart' }])}<h1 style="font-size:2rem">Your cart</h1>
    ${priced.devPrices ? html`<div class="notice notice--danger">DEV PLACEHOLDER PRICES are active. Prices shown are fake and for testing only.</div>` : ''}
    ${!priced.lines.length && !priced.unpriced.length ? html`<p class="muted">Your cart is empty.</p><a class="btn btn--primary" href="/shop">Browse parts</a>` : html`<div class="grid" style="margin-top:24px"><div class="col-8">${cartLines(ctx, priced)}${unpricedBlock(ctx, priced)}</div>
      <div class="col-4"><div class="card">${totalsBlock(priced)}<p class="small muted" style="margin-top:12px">Prepaid only. No cash on delivery. Duties and taxes are explained at checkout.</p><a class="btn btn--primary btn--block" href="/checkout" ${priced.lines.length ? '' : raw('aria-disabled="true"')}>Proceed to checkout</a></div></div></div>`}</div>`;
  return layout(ctx, { title: `Cart | ${ctx.cfg.siteName}`, description: 'Review the items in your cart before prepaid checkout. Prices are in INR.', body, noindex: true });
}

function fieldErr(errors, k) { return errors[k] ? html`<p class="err" role="alert">${errors[k]}</p>` : ''; }
function checkoutPage(ctx, priced, { values = {}, errors = {}, idem, providers }) {
  const { cfg } = ctx;
  const countries = countriesFrom(cfg.shipping);
  const v = (k, d = '') => values[k] ?? d;
  const g = ctx.garage[0] || {};
  const gv = ctx.garageLabel || {};
  const inp = (name, label, extra = '', type = 'text', ac = '') => html`<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${v(name)}" ${raw(extra)} ${ac ? raw(`autocomplete="${ac}"`) : ''} ${errors[name] ? raw('aria-invalid="true"') : ''}>${fieldErr(errors, name)}</div>`;
  const compatBlock = priced.lines.map((l) => {
    const e = errors[`compat:${l.sku}`] || {}; const c = (values.compat && values.compat[l.sku]) || {};
    const f = (k, def = '') => (c[k] ?? def);
    const sel = (k, opts, cur) => html`${opts.map(([val, lab]) => html`<option value="${val}" ${String(cur) === val ? raw('selected') : ''}>${lab}</option>`)}`;
    return html`<fieldset class="card" data-compat-group style="margin:0 0 16px;${l.high_value ? 'border-color:var(--accent);' : ''}"><legend class="label" style="padding:0 8px;font-size:.9rem;color:var(--text)">Vehicle compatibility: ${l.title}</legend>
      ${l.high_value ? html`<div class="notice notice--warn" style="margin-bottom:16px"><strong>High-value item.</strong> Please double-check every field below. Orders for parts like this cannot be changed after the supplier order is placed.</div>` : ''}
      <p class="small muted">${l.oem ? html`OEM reference <span class="mono">${l.oem}</span>. ` : ''}Compare with the number on your existing part.</p>
      <div class="form-grid form-grid--2">
        <div><label for="m-${l.sku}">Vehicle make</label><input id="m-${l.sku}" name="compat[${l.sku}][make]" value="${f('make', g.makeName || l.product.brand)}" required>${fieldErr(e, 'make')}</div>
        <div><label for="mo-${l.sku}">Model</label><input id="mo-${l.sku}" name="compat[${l.sku}][model]" value="${f('model', g.modelName || '')}" required placeholder="e.g. 3 Series 320d">${fieldErr(e, 'model')}</div>
        <div><label for="y-${l.sku}">Model year</label><input id="y-${l.sku}" name="compat[${l.sku}][year]" value="${f('year', g.year || '')}" inputmode="numeric" required>${fieldErr(e, 'year')}</div>
        <div><label for="g-${l.sku}">Generation / chassis code</label><input id="g-${l.sku}" name="compat[${l.sku}][generation]" value="${f('generation', g.genCode || l.product.chassis_text.slice(0, 40))}" placeholder="e.g. F30"></div>
        <div><label for="d-${l.sku}">Drive</label><select id="d-${l.sku}" name="compat[${l.sku}][drive]"><option value="">Choose</option>${sel('drive', [['LHD', 'LHD (left-hand drive)'], ['RHD', 'RHD (right-hand drive, e.g. India)']], f('drive'))}</select>${fieldErr(e, 'drive')}</div>
        <div><label for="s-${l.sku}">Side needed</label><select id="s-${l.sku}" name="compat[${l.sku}][side]"><option value="">Choose</option>${sel('side', [['left', 'Left'], ['right', 'Right'], ['pair', 'Pair (left and right)'], ['na', 'Not applicable']], f('side', l.side === 'left' || l.side === 'right' ? l.side : ''))}</select>${fieldErr(e, 'side')}</div>
        <div><label for="p-${l.sku}">Position</label><select id="p-${l.sku}" name="compat[${l.sku}][position]"><option value="">Choose</option>${sel('position', [['front', 'Front'], ['rear', 'Rear'], ['na', 'Not applicable']], f('position'))}</select>${fieldErr(e, 'position')}</div></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" name="compat[${l.sku}][oem_ack]" ${f('oem_ack') ? raw('checked') : ''}><span>I compared the OEM number ${l.oem ? html`(<span class="mono">${l.oem}</span>)` : ''} with my existing part, or I accept the risk of not doing so.</span></label>${fieldErr(e, 'oem_ack')}
      <label class="check" style="margin-top:8px"><input type="checkbox" name="compat[${l.sku}][fit_ack]" ${f('fit_ack') ? raw('checked') : ''}><span>I understand fitment is <strong>supplier-listed, not verified</strong>, and I have confirmed my vehicle details.</span></label>${fieldErr(e, 'fit_ack')}
      ${l.high_value ? html`<label class="check" style="margin-top:8px;border:1px solid var(--accent);padding:12px;border-radius:8px"><input type="checkbox" name="compat[${l.sku}][high_ack]" ${f('high_ack') ? raw('checked') : ''}><span><strong>High-value confirmation:</strong> I have double-checked make, model, year, drive side, left/right and front/rear for this item.</span></label>${fieldErr(e, 'high_ack')}` : ''}
    </fieldset>`;
  });
  const body = html`<div class="container section--tight">${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Cart', url: '/cart' }, { name: 'Checkout' }])}<h1 style="font-size:2rem">Checkout</h1>
    ${priced.devPrices ? html`<div class="notice notice--danger" role="alert">DEV PLACEHOLDER PRICES are active. These amounts are fake.</div>` : ''}
    ${Object.keys(errors).length ? html`<div class="notice notice--danger" role="alert" style="margin:16px 0"><strong>Please fix the highlighted fields.</strong> ${errors._cart || ''}</div>` : ''}
    <form action="/checkout" method="post" novalidate><div class="grid" style="margin-top:24px">${C.csrfInput(ctx)}<input type="hidden" name="idem" value="${idem}">
      <div class="col-8">
        <h2 style="font-size:1.25rem">1. Delivery details</h2><div class="form-grid form-grid--2">${inp('name', 'Recipient name', 'required', 'text', 'name')}${inp('email', 'Email', 'required', 'email', 'email')}${inp('phone', 'Phone (for courier)', 'required inputmode="tel"', 'tel', 'tel')}
          <div class="field"><label for="country">Country</label><select id="country" name="country">${countries.map((c) => html`<option value="${c}" ${v('country', 'IN') === c ? raw('selected') : ''}>${COUNTRY_NAMES[c] || c}</option>`)}</select>${fieldErr(errors, 'country')}</div></div>
        ${inp('line1', 'Address line 1', 'required', 'text', 'address-line1')}${inp('line2', 'Address line 2 (optional)', '', 'text', 'address-line2')}
        <div class="form-grid form-grid--2">${inp('city', 'City', 'required', 'text', 'address-level2')}${inp('state', 'State', 'required', 'text', 'address-level1')}${inp('postal_code', 'PIN / postal code', 'required inputmode="numeric"', 'text', 'postal-code')}</div>
        <h2 style="font-size:1.25rem;margin-top:40px">2. Confirm vehicle compatibility</h2><p class="small">One short confirmation per part. We pass these details to the supplier so the right item is sent. ${priced.lines.length > 1 ? '' : ''}</p>${compatBlock}
        <h2 style="font-size:1.25rem;margin-top:40px">3. Optional business / GST details</h2>
        <div class="notice" style="margin-bottom:16px">Optional. We do <strong>not</strong> ask for Aadhaar or PAN. Skip this section if you do not need a GST invoice.</div>
        <div class="form-grid form-grid--2">${inp('business_name', 'Business name (optional)', 'maxlength="100"')}${inp('gstin', 'GSTIN (optional)', 'maxlength="15" style="text-transform:uppercase"')}</div>
        <label class="check"><input type="checkbox" name="business_consent" ${v('business_consent') ? raw('checked') : ''}><span>I consent to ${cfg.siteName} storing these business details to prepare my invoice. They are not shared with the supplier. <a href="/policies/kyc-privacy">KYC &amp; privacy</a></span></label>${fieldErr(errors, 'business_consent')}
        <h2 style="font-size:1.25rem;margin-top:40px">4. Duties, taxes and payment</h2>
        <div class="notice notice--warn"><strong>Duties and taxes.</strong> ${cfg.site.duties_text} <a href="/policies/duties-taxes">Read more</a></div>
        <label class="check" style="margin-top:12px"><input type="checkbox" name="duties_ack" ${v('duties_ack') ? raw('checked') : ''}><span>I have read the duties and taxes notice and understand delivery times are estimates. ${cfg.site.delivery_estimate.india_text}</span></label>${fieldErr(errors, 'duties_ack')}
        <fieldset style="border:0;padding:0;margin:24px 0 0"><legend class="label">Payment method (prepaid only, no cash on delivery)</legend>
          ${providers.length ? providers.map((pv, i) => html`<label class="check" style="margin-bottom:8px;${pv.id === 'mock' ? 'border:1px dashed #ff8a3d;padding:12px;border-radius:8px' : ''}"><input type="radio" name="payment_method" value="${pv.id}" ${(v('payment_method') ? v('payment_method') === pv.id : i === 0) ? raw('checked') : ''}><span>${pv.label}${pv.id === 'mock' ? html` <strong style="color:#ff9a57">(DEV ONLY - no real payment)</strong>` : ''}</span></label>`) : html`<div class="notice notice--danger"><strong>Online payment is not configured yet.</strong> No payment gateway has been connected, so orders cannot be placed. Please <a href="/enquiry">send an enquiry</a> and we will contact you.</div>`}
          ${fieldErr(errors, 'payment_method')}</fieldset>
      </div>
      <div class="col-4"><div class="card" style="position:sticky;top:88px"><h2 style="font-size:1.125rem">Order summary</h2>${cartLines(ctx, priced, { editable: false })}${totalsBlock(priced)}
        <p class="small muted" style="margin-top:12px">Shipping: ${priced.shipping.eta_text || ''}. Shipping amounts are estimates from our rate table.</p>
        <button class="btn btn--primary btn--block" type="submit" ${providers.length && priced.lines.length ? '' : raw('disabled')}>Place prepaid order</button></div></div>
    </div></form></div>`;
  return layout(ctx, { title: `Checkout | ${cfg.siteName}`, description: 'Prepaid checkout with vehicle compatibility confirmation and duties notice.', body, noindex: true });
}

function payPage(ctx, order, provider, init) {
  const mock = provider === 'mock';
  const body = html`<div class="container section"><div class="article">
    ${mock ? html`<div class="notice notice--danger" role="alert"><strong>DEV MOCK GATEWAY.</strong> This is NOT a real payment. It exists only for local testing (NODE_ENV is not production and DEV_MOCK_PAYMENT=1).</div>` : ''}
    <h1 style="font-size:2rem;margin-top:24px">Pay for order ${order.order_no}</h1><p>Amount: <strong>${inr(order.totals.total)}</strong> (prepaid)</p>
    ${mock ? html`<form action="/pay/mock/${order.order_no}" method="post" class="row">${C.csrfInput(ctx)}<input type="hidden" name="t" value="${order.access_token}"><button class="btn btn--primary" name="result" value="success">Simulate successful payment</button><button class="btn" name="result" value="failure">Simulate failed payment</button></form>` : ''}
    ${provider === 'razorpay' ? html`<div id="rzp-info"><button class="btn btn--primary" id="rzp-btn">Pay with Razorpay</button><p class="small muted">Razorpay checkout loads from checkout.razorpay.com. Not verified against a live account in this build.</p></div>
      <script src="https://checkout.razorpay.com/v1/checkout.js" nonce="${ctx.nonce}"></script>
      <script nonce="${ctx.nonce}">document.getElementById('rzp-btn').addEventListener('click',function(){var o=${raw(JSON.stringify({ key: init.key_id, amount: init.amount, currency: 'INR', order_id: init.provider_order_id, name: ctx.cfg.siteName }).replace(/</g, '\\u003c'))};o.handler=function(r){var f=document.createElement('form');f.method='post';f.action='/pay/razorpay/verify';[['_csrf',${raw(JSON.stringify(ctx.session.csrf))}],['t',${raw(JSON.stringify(order.access_token))}],['order_no',${raw(JSON.stringify(order.order_no))}],['razorpay_order_id',r.razorpay_order_id],['razorpay_payment_id',r.razorpay_payment_id],['razorpay_signature',r.razorpay_signature]].forEach(function(p){var i=document.createElement('input');i.type='hidden';i.name=p[0];i.value=p[1];f.appendChild(i)});document.body.appendChild(f);f.submit()};new Razorpay(o).open()});</script>` : ''}
    ${provider === 'cashfree' ? html`<button class="btn btn--primary" id="cf-btn">Pay with Cashfree</button><p class="small muted">Payment is confirmed by Cashfree's signed webhook. Not verified against a live account in this build.</p>
      <script src="https://sdk.cashfree.com/js/v3/cashfree.js" nonce="${ctx.nonce}"></script>
      <script nonce="${ctx.nonce}">document.getElementById('cf-btn').addEventListener('click',function(){var c=Cashfree({mode:${raw(JSON.stringify(process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox'))}});c.checkout({paymentSessionId:${raw(JSON.stringify(init.payment_session_id || ''))},redirectTarget:'_self'})});</script>` : ''}
    <p class="small muted" style="margin-top:24px">Your order status: ${STATUS_LABEL[order.status]}. Track at <a href="/track?order=${order.order_no}">/track</a> with your email.</p></div></div>`;
  return layout(ctx, { title: `Pay | ${ctx.cfg.siteName}`, description: 'Complete payment for your prepaid order.', body, noindex: true });
}

function statusTimeline(order) {
  const flow = ['pending_payment', 'paid', 'supplier_queued', 'supplier_accepted', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered'];
  const idx = flow.indexOf(order.status);
  return html`<ol class="steps" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">${flow.map((s, i) => html`<li style="${i <= idx ? 'border-color:var(--accent)' : 'opacity:.55'}"><b style="font-size:.875rem">${STATUS_LABEL[s]}</b></li>`)}</ol>`;
}
function orderSummary(ctx, order, { track = false } = {}) {
  const sup = order.supplier || {};
  return html`<div class="card"><div class="row between"><div><span class="eyebrow" style="margin:0">Order</span><h2 style="margin:4px 0 0">${order.order_no}</h2></div><span class="pill">${STATUS_LABEL[order.status] || order.status}</span></div>
    ${['cancelled', 'refunded', 'return_requested'].includes(order.status) ? '' : html`<div style="margin:24px 0">${statusTimeline(order)}</div>`}
    ${order.dev_prices ? html`<div class="notice notice--danger">This order used DEV PLACEHOLDER PRICES.</div>` : ''}
    <table class="spec"><tbody>${order.lines.map((l) => html`<tr><th scope="row">${l.qty} x</th><td>${l.title} <span class="muted">${inr(l.total)}</span></td></tr>`)}<tr><th scope="row">Total</th><td><strong>${inr(order.totals.total)}</strong> (goods + shipping estimate; duties/taxes confirmed before supplier order)</td></tr>
      ${sup.tracking ? html`<tr><th scope="row">Tracking</th><td><span class="mono">${sup.tracking.number}</span> (${sup.tracking.carrier.toUpperCase()}) ${shippingLib.trackUrl(sup.tracking.carrier, sup.tracking.number) ? html`<a href="${shippingLib.trackUrl(sup.tracking.carrier, sup.tracking.number)}" rel="noopener">Track with carrier</a>` : ''}</td></tr>` : html`<tr><th scope="row">Tracking</th><td class="muted">Added when the parcel is dispatched.</td></tr>`}
      <tr><th scope="row">Delivery estimate</th><td>${ctx.cfg.site.delivery_estimate.india_text}</td></tr></tbody></table>
    <h3 style="margin-top:24px">History</h3><ul class="feature-list">${order.history.map((h) => html`<li>${new Date(h.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}: ${STATUS_LABEL[h.to] || h.to}${h.note ? ' - ' + h.note : ''}</li>`)}</ul>
    ${track && order.kyc && order.kyc.flagged && !order.kyc.document ? html`<div class="notice notice--warn" style="margin-top:24px"><h3>Additional verification requested</h3><p>${order.kyc.reason || 'We need to verify your identity for this order.'} Providing a document is optional and needs your consent; if you prefer not to, contact us and we can discuss cancelling for a refund.</p>
      <form action="/track/kyc" method="post" enctype="multipart/form-data">${C.csrfInput(ctx)}<input type="hidden" name="order_no" value="${order.order_no}"><input type="hidden" name="email" value="${order.email}"><div class="field"><label for="kycf">Document (JPG, PNG, WebP or PDF, max 5 MB)</label><input id="kycf" type="file" name="doc" accept=".jpg,.jpeg,.png,.webp,.pdf" required></div>
      <label class="check"><input type="checkbox" name="consent" required><span>I consent to ${ctx.cfg.siteName} storing this document for identity verification of this order only. It is not shared with the supplier and is deleted on request after review. <a href="/policies/kyc-privacy">Details</a></span></label><button class="btn btn--primary" style="margin-top:16px">Upload with consent</button></form></div>` : ''}
    ${order.kyc && order.kyc.document ? html`<p class="small muted">Verification document received.</p>` : ''}</div>`;
}

function trackPage(ctx, { order, error, values = {} }) {
  const body = html`<div class="container section--tight">${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Track order' }])}<h1 style="font-size:2rem">Track your order</h1>
    <form action="/track" method="get" class="form-grid form-grid--2" style="max-width:720px;margin:24px 0"><div><label for="to">Order number</label><input id="to" name="order" value="${values.order || ''}" placeholder="AP-1001" required></div><div><label for="te">Email used at checkout</label><input id="te" name="email" type="email" value="${values.email || ''}" required></div><div><button class="btn btn--primary" type="submit">Track</button></div></form>
    ${error ? html`<div class="notice notice--danger" role="alert">${error}</div>` : ''}${order ? orderSummary(ctx, order, { track: true }) : ''}</div>`;
  return layout(ctx, { title: `Track order | ${ctx.cfg.siteName}`, description: 'Track your order with order number and email.', body, noindex: true });
}

function accountPage(ctx, { user, orders, mode, error, values = {}, next = '' }) {
  if (mode === 'login' || mode === 'signup') {
    const body = html`<div class="container section"><div style="max-width:440px;margin-inline:auto"><h1 style="font-size:2rem">${mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      ${error ? html`<div class="notice notice--danger" role="alert">${error}</div>` : ''}
      <form action="/account/${mode}" method="post" class="stack" style="margin-top:24px">${C.csrfInput(ctx)}<input type="hidden" name="next" value="${next}">
        ${mode === 'signup' ? html`<div><label for="an">Name</label><input id="an" name="name" value="${values.name || ''}" required autocomplete="name"></div>` : ''}
        <div><label for="ae">Email</label><input id="ae" name="email" type="email" value="${values.email || ''}" required autocomplete="email"></div>
        <div><label for="ap">Password${mode === 'signup' ? ' (8+ characters)' : ''}</label><input id="ap" name="password" type="password" required minlength="${mode === 'signup' ? 8 : 1}" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></div>
        <button class="btn btn--primary btn--block" type="submit">${mode === 'login' ? 'Sign in' : 'Create account'}</button></form>
      <p class="small" style="margin-top:16px">${mode === 'login' ? html`New here? <a href="/account/signup">Create an account</a>` : html`Already have an account? <a href="/account/login">Sign in</a>`}</p></div></div>`;
    return layout(ctx, { title: `${mode === 'login' ? 'Sign in' : 'Create account'} | ${ctx.cfg.siteName}`, description: 'Sign in or manage your account, garage and orders.', body, noindex: true });
  }
  const { catalog } = ctx;
  const body = html`<div class="container section--tight">${C.crumbs([{ name: 'Home', url: '/' }, { name: 'My account' }])}<div class="row between"><h1 style="font-size:2rem">Hello, ${user.name}</h1><form action="/account/logout" method="post">${C.csrfInput(ctx)}<button class="btn btn--sm">Sign out</button></form></div>
    <div class="grid" style="margin-top:24px"><div class="col-6"><h2>My Garage</h2>${ctx.garageView.length ? html`<ul class="feature-list">${ctx.garageView.map((g) => html`<li><a href="${g.url}">${g.label}</a> <form action="/garage/remove" method="post" style="display:inline">${C.csrfInput(ctx)}<input type="hidden" name="i" value="${g.i}"><button class="btn btn--sm btn--ghost">Remove</button></form></li>`)}</ul>` : html`<p class="muted">No saved vehicles. Use the <a href="/vehicle">vehicle finder</a> and choose "Save to My Garage".</p>`}
      <h2 style="margin-top:32px">Wishlist</h2>${ctx.wishlist.length ? html`<ul class="feature-list">${ctx.wishlist.map((sku) => catalog.bySku.get(sku)).filter(Boolean).map((p) => html`<li><a href="/product/${p.slug}">${p.title}</a></li>`)}</ul>` : html`<p class="muted">Nothing saved yet.</p>`}</div>
      <div class="col-6"><h2>Order history</h2>${orders.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead><tbody>${orders.map((o) => html`<tr><td><a href="/track?order=${o.order_no}&amp;email=${encodeURIComponent(o.email)}">${o.order_no}</a></td><td>${new Date(o.created_at).toLocaleDateString('en-IN')}</td><td>${STATUS_LABEL[o.status]}</td><td>${inr(o.totals.total)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No orders yet.</p>`}</div></div></div>`;
  return layout(ctx, { title: `My account | ${ctx.cfg.siteName}`, description: 'Sign in or manage your account, garage and orders.', body, noindex: true });
}

function enquiryPage(ctx, { values = {}, errors = {}, done = null, product = null }) {
  const body = html`<div class="container section--tight">${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Enquiry' }])}<div style="max-width:720px"><h1 style="font-size:2rem">Send a photo or enquiry</h1>
    <p class="lede">Not sure about a part number or fitment? Upload a photo of your existing part or vehicle label and tell us your car.</p>
    ${done ? html`<div class="notice notice--ok" role="status"><strong>Thank you.</strong> Your enquiry reference is <span class="mono">${done}</span>. We will reply by email. (Enquiries are saved to our queue; email notifications are only sent if SMTP is configured.)</div>` : ''}
    ${errors._ ? html`<div class="notice notice--danger" role="alert">${errors._}</div>` : ''}
    ${product ? html`<div class="notice" style="margin:16px 0">About: <a href="/product/${product.slug}">${product.title}</a></div>` : ''}
    <form action="/enquiry" method="post" enctype="multipart/form-data" class="stack" style="margin-top:24px">${C.csrfInput(ctx)}<input type="hidden" name="sku" value="${product ? product.sku : ''}"><input type="text" name="website" class="sr" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="form-grid form-grid--2"><div><label for="en">Name</label><input id="en" name="name" value="${values.name || ''}" required maxlength="80">${fieldErr(errors, 'name')}</div><div><label for="ee">Email</label><input id="ee" name="email" type="email" value="${values.email || ''}" required maxlength="120">${fieldErr(errors, 'email')}</div></div>
      <div><label for="ep">Phone / WhatsApp (optional)</label><input id="ep" name="phone" value="${values.phone || ''}" maxlength="20" inputmode="tel"></div>
      <div><label for="ev">Vehicle (make, model, year, LHD/RHD)</label><input id="ev" name="vehicle" value="${values.vehicle || ctx.query.vehicle || ''}" maxlength="140"></div>
      <div><label for="em">What do you need?</label><textarea id="em" name="message" rows="5" required maxlength="2000">${values.message || ''}</textarea>${fieldErr(errors, 'message')}</div>
      <div><label for="ef">Photo or PDF (JPG, PNG, WebP, PDF; max 5 MB)</label><input id="ef" type="file" name="file" accept=".jpg,.jpeg,.png,.webp,.pdf">${fieldErr(errors, 'file')}<p class="hint">Do not upload ID documents here.</p></div>
      <label class="check"><input type="checkbox" name="consent" required><span>I agree that ${ctx.cfg.siteName} may store and use this information to answer my enquiry. <a href="/policies/privacy">Privacy</a></span></label>
      <button class="btn btn--primary" type="submit">Send enquiry</button></form></div></div>`;
  return layout(ctx, { title: `Send a photo or enquiry | ${ctx.cfg.siteName}`, description: 'Upload a photo of your part or vehicle details and we will help confirm fitment.', body, canonical: '/enquiry' });
}

module.exports = { msgPage, cartPage, cartDrawer, checkoutPage, payPage, trackPage, accountPage, enquiryPage, orderSummary, STATUS_LABEL, totalsBlock };
