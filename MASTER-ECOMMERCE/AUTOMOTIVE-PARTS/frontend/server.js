'use strict';
/* Storefront server. Zero dependencies (node:http, node:crypto, node:fs, node:zlib). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const { load: loadConfig } = require('./lib/config');
const { html, raw } = require('./lib/html');
const { loadCatalog } = require('./lib/catalog');
const { Sessions, RateLimiter, csrfOk, securityHeaders } = require('./lib/security');
const { OrderStore, transition, TRANSITIONS } = require('./lib/orders');
const { Accounts } = require('./lib/accounts');
const { JsonStore } = require('./lib/store');
const cartLib = require('./lib/cart');
const fitment = require('./lib/fitment');
const { validateCheckout, buildOrderFields } = require('./lib/checkout');
const { parseMultipart, validateUpload, saveUpload, MAX_BYTES } = require('./lib/uploads');
const { onPaid, queueWithSupplier } = require('./lib/fulfilment');
const { rid, timingSafeEq, hmacB64 } = require('./lib/util');
const content = require('./lib/content');
const payments = require('../integrations/payments');
const supplierMod = require('../integrations/supplier');
const shippingMod = require('../integrations/shipping');
const notify = require('../integrations/notifications');
const { logEvent, readLog } = require('../integrations/log');
const { buildSupplierPayload } = require('../integrations/supplier/payload');

const catalogPages = require('./views/catalogPages');
const commerce = require('./views/commerce');
const info = require('./views/info');
const adminView = require('./views/admin');
const seo = require('./lib/seo');

function createApp(overrides = {}) {
  const cfg = { ...loadConfig(), ...overrides };
  if (cfg.isProd && !cfg.sessionSecret) throw new Error('SESSION_SECRET is required in production');
  fs.mkdirSync(path.join(cfg.dataDir, 'uploads', 'kyc'), { recursive: true });
  const app = {
    cfg, catalog: loadCatalog(cfg), orders: new OrderStore(cfg.dataDir), accounts: new Accounts(cfg.dataDir),
    enquiries: new JsonStore(path.join(cfg.dataDir, 'enquiries.json'), { seq: 0, items: [] }),
    shopifyEvents: new JsonStore(path.join(cfg.dataDir, 'shopify-webhooks.json'), { events: [] }),
    sessions: new Sessions(cfg.sessionSecret), limiter: new RateLimiter(),
  };
  const policiesBySlug = new Map(content.policies.map((p) => [p.slug, { ...p, bodyHtml: raw(p.body(cfg)) }]));
  const postsBySlug = new Map(content.posts.map((p) => [p.slug, { ...p, bodyHtml: raw(p.body) }]));
  const PUB = path.join(__dirname, 'public');
  const PRODUCT_IMG = path.join(cfg.ROOT, 'assets', 'products');
  const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };
  const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;

  // ---------- response helpers ----------
  function send(ctx, status, body, headers = {}) {
    const { req, res } = ctx;
    const ctype = headers['Content-Type'] || 'text/html; charset=utf-8';
    let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const h = { ...securityHeaders(ctx.nonce), 'Content-Type': ctype, ...(ctx.extraHeaders || {}), ...headers };
    if (cfg.isProd) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    if (ctx.setCookie) h['Set-Cookie'] = ctx.setCookie;
    if (COMPRESSIBLE.test(ctype) && buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { buf = zlib.gzipSync(buf, { level: 6 }); h['Content-Encoding'] = 'gzip'; }
    h.Vary = 'Accept-Encoding'; h['Content-Length'] = buf.length;
    if (!h['Cache-Control']) h['Cache-Control'] = 'private, no-cache';
    res.writeHead(status, h); res.end(req.method === 'HEAD' ? undefined : buf); ctx.done = true;
  }
  const page = (ctx, htmlStr, status = 200) => send(ctx, status, htmlStr);
  const redirect = (ctx, to, status = 303) => { const h = { Location: to }; if (ctx.setCookie) h['Set-Cookie'] = ctx.setCookie; ctx.res.writeHead(status, h); ctx.res.end(); ctx.done = true; };
  const json = (ctx, obj, status = 200) => send(ctx, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
  const wantsJson = (ctx) => /application\/json/.test(ctx.req.headers.accept || '');
  const notFound = (ctx) => page(ctx, info.notFound(ctx), 404);

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on('data', (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
    });
  }
  const BAD = new Set(['__proto__', 'constructor', 'prototype']);
  function parseForm(str) { // supports a[b][c]=v nesting
    const out = {};
    for (const [k, v] of new URLSearchParams(str)) {
      const parts = k.replace(/\]/g, '').split('['); if (parts.some((p) => BAD.has(p)) || parts.length > 4) continue;
      let o = out; parts.forEach((p, i) => { if (i === parts.length - 1) o[p] = v; else { if (typeof o[p] !== 'object' || o[p] === null) o[p] = {}; o = o[p]; } });
    }
    return out;
  }
  const clientIp = (req) => (cfg.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';

  // ---------- context ----------
  function garageEntries(ctx) { return ctx.user ? ctx.user.garage : ctx.session.garage; }
  function wishlistArr(ctx) { return ctx.user ? ctx.user.wishlist : ctx.session.wishlist; }
  function describeGarage(entry) {
    const o = fitment.options(app.catalog.vehicles, entry);
    const label = [o.make && o.make.name, o.model && o.model.name, o.gen && o.gen.code, entry.year].filter(Boolean).join(' ');
    return { ...entry, makeName: o.make ? o.make.name : '', modelName: o.model ? o.model.name : '', genCode: o.gen ? o.gen.code : '', label, url: `/vehicle?make=${entry.make}&model=${entry.model || ''}&gen=${entry.gen || ''}&year=${entry.year || ''}` };
  }
  function buildCtx(req, res, url) {
    const { s, fresh } = app.sessions.get(req);
    const user = s.user ? app.accounts.byId(s.user) : null;
    if (s.user && !user) s.user = null;
    const ctx = { req, res, cfg, catalog: app.catalog, session: s, user, path: url.pathname, query: Object.fromEntries(url.searchParams), nonce: crypto.randomBytes(12).toString('base64'), url };
    ctx.cartCount = s.cart.reduce((a, l) => a + l.qty, 0);
    ctx.garage = garageEntries(ctx).map(describeGarage); ctx.garageView = ctx.garage.map((g, i) => ({ ...g, i })); ctx.wishlist = wishlistArr(ctx);
    if (fresh) ctx.setCookie = app.sessions.cookie(s, cfg.isProd);
    return ctx;
  }
  const refreshCartCount = (ctx) => { ctx.cartCount = ctx.session.cart.reduce((a, l) => a + l.qty, 0); };

  // ---------- routing ----------
  const routes = [];
  const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:[a-z]+/gi, '([^/]+)')}$`), handler, opts });

  // static
  function serveFile(ctx, file, cache) {
    let st; try { st = fs.statSync(file); } catch { return notFound(ctx); }
    if (!st.isFile()) return notFound(ctx);
    const ext = path.extname(file).toLowerCase();
    send(ctx, 200, fs.readFileSync(file), { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, ETag: `"${st.size}-${st.mtimeMs | 0}"` });
  }
  const safeJoin = (base, rel) => { const p = path.normalize(path.join(base, decodeURIComponent(rel))); return p.startsWith(base + path.sep) ? p : null; };
  route('GET', '/css/(.+)', (ctx, m) => { const f = safeJoin(path.join(PUB, 'css'), m[1]); f ? serveFile(ctx, f, 'public, max-age=86400') : notFound(ctx); });
  route('GET', '/js/(.+)', (ctx, m) => { const f = safeJoin(path.join(PUB, 'js'), m[1]); f ? serveFile(ctx, f, 'public, max-age=86400') : notFound(ctx); });
  route('GET', '/assets/products/(.+)', (ctx, m) => { const f = safeJoin(PRODUCT_IMG, m[1]); f ? serveFile(ctx, f, 'public, max-age=31536000, immutable') : notFound(ctx); });
  route('GET', '/assets/(favicon\\.svg|og-default\\.svg)', (ctx, m) => serveFile(ctx, path.join(PUB, m[1]), 'public, max-age=86400'));

  // catalogue pages
  route('GET', '/', (ctx) => page(ctx, catalogPages.home(ctx)));
  route('GET', '/shop', (ctx) => page(ctx, catalogPages.listing(ctx, { base: '/shop', h1: 'All parts', intro: 'Headlight modules, LED boards, angel eyes, control units, cameras and more. All fitment is supplier-listed.', crumbItems: [{ name: 'Home', url: '/' }, { name: 'Shop' }], title: 'Shop all lighting parts and modules', description: 'Browse supplier-listed headlight modules, LED boards, DRL angel eyes, ballasts, cameras and control units for BMW, Mercedes-Benz, Audi and more.' })));
  route('GET', '/category/:slug', (ctx, m) => {
    const c = app.catalog.categories.find((x) => x.slug === m[1]); if (!c) return notFound(ctx);
    page(ctx, catalogPages.listing(ctx, { base: `/category/${c.slug}`, forced: { category: c.slug }, h1: c.name, intro: `${c.count} supplier-listed parts. Fitment is supplier-listed; confirm before ordering.`, crumbItems: [{ name: 'Home', url: '/' }, { name: 'Shop', url: '/shop' }, { name: c.name }], title: `${c.name} for BMW, Mercedes-Benz, Audi`, description: `${c.name}: ${c.count} supplier-listed parts with OEM references. Supplier-listed fitment, confirm before ordering.` }));
  });
  route('GET', '/brand/:slug', (ctx, m) => {
    const b = app.catalog.brands.find((x) => x.slug === m[1]); if (!b) return notFound(ctx);
    page(ctx, catalogPages.listing(ctx, { base: `/brand/${b.slug}`, forced: { brand: b.slug }, h1: `${b.name} parts`, intro: `${b.count} supplier-listed parts for ${b.name}. Fitment is supplier-listed; confirm before ordering.`, crumbItems: [{ name: 'Home', url: '/' }, { name: 'Brands', url: '/shop' }, { name: b.name }], title: `${b.name} headlight modules and lighting parts`, description: `${b.name} lighting parts: ${b.count} supplier-listed items with OEM references. Confirm fitment before ordering.` }));
  });
  route('GET', '/search', (ctx) => {
    const q = (ctx.query.q || '').trim().slice(0, 100);
    page(ctx, catalogPages.listing(ctx, { base: '/search', q, h1: q ? `Results for "${q}"` : 'Search parts', intro: 'Search by part name, chassis code (e.g. F30) or OEM number. Spaces and dashes in OEM numbers are ignored.', crumbItems: [{ name: 'Home', url: '/' }, { name: 'Search' }], title: q ? `Search: ${q}` : 'Search', description: 'Search parts by name, chassis code or OEM number.' }));
  });
  route('GET', '/vehicle', (ctx) => page(ctx, catalogPages.vehiclePage(ctx)));
  route('GET', '/api/vehicles', (ctx) => {
    const o = fitment.options(app.catalog.vehicles, { make: ctx.query.make, model: ctx.query.model, gen: ctx.query.gen });
    json(ctx, { models: o.models.map((m) => ({ value: m.slug, label: m.name })), generations: o.generations.map((g) => ({ value: g.slug, label: `${g.code} (${g.year_from}${g.year_to ? '-' + g.year_to : ' onward'})` })), years: o.years.map((y) => ({ value: y, label: y })) });
  });
  route('GET', '/product/:slug', (ctx, m) => { const p = app.catalog.bySlug.get(m[1]); if (!p) return notFound(ctx); page(ctx, catalogPages.productPage(ctx, p)); });

  // info pages
  route('GET', '/about', (ctx) => page(ctx, info.about(ctx)));
  route('GET', '/contact', (ctx) => page(ctx, info.contact(ctx)));
  route('GET', '/faq', (ctx) => page(ctx, info.faq(ctx)));
  route('GET', '/blog', (ctx) => page(ctx, info.blogIndex(ctx)));
  route('GET', '/blog/:slug', (ctx, m) => { const p = postsBySlug.get(m[1]); p ? page(ctx, info.blogPost(ctx, p)) : notFound(ctx); });
  route('GET', '/policies', (ctx) => page(ctx, info.policiesIndex(ctx)));
  route('GET', '/policies/:slug', (ctx, m) => { const p = policiesBySlug.get(m[1]); p ? page(ctx, info.policyPage(ctx, p)) : notFound(ctx); });
  for (const p of content.policies) if (['privacy', 'terms', 'shipping', 'returns', 'refunds', 'warranty'].includes(p.slug)) route('GET', `/${p.slug === 'returns' ? 'return-policy' : p.slug === 'refunds' ? 'refund-policy' : p.slug}`, (ctx) => redirect(ctx, `/policies/${p.slug}`, 301));

  route('GET', '/robots.txt', (ctx) => send(ctx, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nDisallow: /track\nDisallow: /pay\nDisallow: /order\nDisallow: /api/\nDisallow: /search\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }));
  route('GET', '/sitemap.xml', (ctx) => {
    const urls = ['/', '/shop', '/vehicle', '/about', '/contact', '/faq', '/blog', '/policies', '/enquiry', ...app.catalog.categories.map((c) => `/category/${c.slug}`), ...app.catalog.brands.map((b) => `/brand/${b.slug}`), ...content.posts.map((p) => `/blog/${p.slug}`), ...content.policies.map((p) => `/policies/${p.slug}`), ...app.catalog.products.map((p) => `/product/${p.slug}`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${cfg.siteUrl}${u.replace(/&/g, '&amp;')}</loc></url>`).join('\n')}\n</urlset>\n`;
    send(ctx, 200, xml, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  });

  // ---------- cart ----------
  const pricedCart = (ctx, country = 'IN') => cartLib.price(ctx.session.cart, app.catalog, cfg.shipping, country);
  route('GET', '/cart', (ctx) => page(ctx, commerce.cartPage(ctx, pricedCart(ctx))));
  route('GET', '/cart/drawer', (ctx) => send(ctx, 200, commerce.cartDrawer(ctx, pricedCart(ctx)).toString()));
  route('POST', '/cart/add', (ctx) => {
    const sku = String(ctx.form.sku || ''); const p = app.catalog.bySku.get(sku);
    const fail = (msg) => (wantsJson(ctx) ? json(ctx, { error: msg }, 400) : page(ctx, commerce.msgPage(ctx, 'Cannot add to cart', html`<p>${msg}</p><p><a class="btn" href="/shop">Back to shop</a></p>`), 400));
    if (!p) return fail('Product not found.');
    if (!app.catalog.price(p)) return fail('This part is "Price on request". Please request a quote on the product page.');
    cartLib.addItem(ctx.session.cart, sku, ctx.form.qty); refreshCartCount(ctx);
    wantsJson(ctx) ? json(ctx, { ok: true, count: ctx.cartCount }) : redirect(ctx, '/cart');
  });
  route('POST', '/cart/update', (ctx) => { cartLib.setQty(ctx.session.cart, String(ctx.form.sku), ctx.form.qty); refreshCartCount(ctx); wantsJson(ctx) ? json(ctx, { ok: true }) : redirect(ctx, '/cart'); });
  route('POST', '/garage/save', (ctx) => {
    const { make, model, gen, year } = ctx.form; const o = fitment.options(app.catalog.vehicles, { make, model, gen });
    if (!o.make) return redirect(ctx, '/vehicle');
    const g = garageEntries(ctx); const e = { make: o.make.slug, model: o.model ? o.model.slug : '', gen: o.gen ? o.gen.slug : '', year: /^\d{4}$/.test(year || '') ? year : '' };
    if (!g.some((x) => JSON.stringify(x) === JSON.stringify(e)) && g.length < 10) g.push(e);
    if (ctx.user) app.accounts.save();
    redirect(ctx, `/vehicle?make=${e.make}&model=${e.model}&gen=${e.gen}&year=${e.year}`);
  });
  route('POST', '/garage/remove', (ctx) => { const g = garageEntries(ctx); const i = parseInt(ctx.form.i, 10); if (i >= 0 && i < g.length) g.splice(i, 1); if (ctx.user) app.accounts.save(); redirect(ctx, '/account'); });
  route('POST', '/wishlist/toggle', (ctx) => {
    const sku = String(ctx.form.sku || ''); if (!app.catalog.bySku.has(sku)) return redirect(ctx, '/shop');
    const w = wishlistArr(ctx); const i = w.indexOf(sku); if (i >= 0) w.splice(i, 1); else if (w.length < 100) w.push(sku);
    if (ctx.user) app.accounts.save(); redirect(ctx, `/product/${app.catalog.bySku.get(sku).slug}`);
  });

  // ---------- enquiries ----------
  function addEnquiry(rec) { const d = app.enquiries.data; d.seq += 1; const e = { id: `ENQ-${1000 + d.seq}`, created_at: new Date().toISOString(), status: 'new', ...rec }; d.items.push(e); app.enquiries.save(); logEvent(cfg.dataDir, { integration: 'enquiry', status: 'queued', id: e.id }); return e; }
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
  route('GET', '/enquiry', (ctx) => { const p = app.catalog.bySku.get(ctx.query.sku || ''); page(ctx, commerce.enquiryPage(ctx, { product: p })); }, {});
  route('POST', '/enquiry', (ctx) => {
    const f = ctx.form; const errors = {}; const prod = app.catalog.bySku.get(f.sku || '');
    if (f.website) return redirect(ctx, '/enquiry'); // honeypot
    if (!String(f.name || '').trim()) errors.name = 'Enter your name'; if (!EMAIL_RE.test(String(f.email || '').trim())) errors.email = 'Enter a valid email';
    if (!String(f.message || '').trim()) errors.message = 'Tell us what you need'; if (!f.consent) errors._ = 'Please tick the consent box.';
    let fileName = null; const up = ctx.files && ctx.files.find((x) => x.field === 'file' && x.filename);
    if (up) { const v = validateUpload(up.filename, up.data); if (!v.ok) errors.file = v.error; else if (!Object.keys(errors).length) fileName = saveUpload(path.join(cfg.dataDir, 'uploads'), up.data, v.ext); }
    if (Object.keys(errors).length) return page(ctx, commerce.enquiryPage(ctx, { values: f, errors, product: prod }), 400);
    const e = addEnquiry({ type: fileName ? 'photo-enquiry' : 'enquiry', name: String(f.name).trim().slice(0, 80), email: String(f.email).trim().toLowerCase().slice(0, 120), phone: String(f.phone || '').slice(0, 20), vehicle: String(f.vehicle || '').slice(0, 140), message: String(f.message).slice(0, 2000), sku: prod ? prod.sku : null, file: fileName });
    page(ctx, commerce.enquiryPage(ctx, { done: e.id }));
  }, { multipart: true, rate: ['enquiry', 6, 600e3] });
  route('POST', '/enquiry/quote', (ctx) => {
    const f = ctx.form; const p = app.catalog.bySku.get(f.sku || ''); if (f.website) return redirect(ctx, '/shop');
    if (!p || !String(f.name || '').trim() || !EMAIL_RE.test(String(f.email || '').trim())) return page(ctx, commerce.msgPage(ctx, 'Check your details', html`<p>Please provide your name and a valid email.</p><p><a class="btn" href="javascript:history.back()">Back</a></p>`), 400);
    const e = addEnquiry({ type: 'quote', name: String(f.name).trim().slice(0, 80), email: String(f.email).trim().toLowerCase().slice(0, 120), phone: String(f.phone || '').slice(0, 20), vehicle: String(f.vehicle || '').slice(0, 140), message: `Quote request for ${p.title}`, sku: p.sku, file: null });
    page(ctx, commerce.msgPage(ctx, 'Quote request received', html`<div class="notice notice--ok"><strong>Reference ${e.id}.</strong> We saved your request for <a href="/product/${p.slug}">${p.title}</a> and will reply with a price after checking with the supplier.</div><p><a class="btn" href="/shop">Continue browsing</a></p>`));
  }, { rate: ['enquiry', 6, 600e3] });

  // ---------- checkout / payment ----------
  const availableProviders = () => payments.available().map((p) => ({ id: p.id, label: p.label }));
  route('GET', '/checkout', (ctx) => {
    if (!ctx.session.idem) ctx.session.idem = rid(12);
    const priced = pricedCart(ctx, ctx.query.country || 'IN');
    const g = ctx.garage[0];
    page(ctx, commerce.checkoutPage(ctx, priced, { idem: ctx.session.idem, providers: availableProviders(), values: ctx.user ? { email: ctx.user.email, name: ctx.user.name } : {} }));
  });
  route('POST', '/checkout', async (ctx) => {
    const f = ctx.form;
    const v = validateCheckout(f, ctx.session.cart, app.catalog, cfg.shipping);
    const providers = availableProviders();
    if (v.ok && !providers.some((p) => p.id === v.payment_method)) { v.ok = false; v.errors.payment_method = 'That payment method is not available'; }
    if (!v.ok) return page(ctx, commerce.checkoutPage(ctx, v.priced, { idem: f.idem || ctx.session.idem || rid(12), providers, values: f, errors: v.errors }), 400);
    const idem = String(f.idem || ctx.session.idem || '');
    if (!idem) return page(ctx, commerce.msgPage(ctx, 'Session expired', html`<p>Please <a href="/checkout">reload checkout</a>.</p>`), 400);
    const { order, duplicate } = app.orders.create(buildOrderFields(v, { idemKey: idem, userId: ctx.user && ctx.user.id }));
    ctx.session.idem = null; ctx.session.orders = [...(ctx.session.orders || []), order.order_no];
    if (!duplicate) {
      const prov = payments.providers[order.payment.provider];
      const r = await prov.createOrder(order);
      if (!r.ok) { order.payment.status = 'create_failed'; order.payment.error = r.error; app.orders.save(); logEvent(cfg.dataDir, { integration: `payment:${prov.id}`, op: 'createOrder', order_no: order.order_no, error: r.error }); return page(ctx, commerce.msgPage(ctx, 'Payment could not be started', html`<div class="notice notice--danger">${r.error}</div><p>Your order ${order.order_no} is saved as unpaid. Please contact us.</p>`), 502); }
      order.payment.provider_order_id = r.provider_order_id; order.payment.init = { key_id: r.key_id, amount: r.amount, payment_session_id: r.payment_session_id }; app.orders.save();
      ctx.session.cart = []; refreshCartCount(ctx);
    }
    redirect(ctx, `/pay/${order.order_no}?t=${order.access_token}`);
  }, { rate: ['checkout', 15, 600e3] });
  const ownedOrder = (ctx, no, t) => { const o = app.orders.byNo(no); if (!o) return null; return (t && timingSafeEq(o.access_token, t)) || (ctx.session.orders || []).includes(o.order_no) ? o : null; };
  route('GET', '/pay/:no', (ctx, m) => {
    const o = ownedOrder(ctx, m[1], ctx.query.t); if (!o) return notFound(ctx);
    if (o.status !== 'pending_payment') return redirect(ctx, `/order/${o.order_no}?t=${o.access_token}`);
    ctx.extraHeaders = {}; const prov = o.payment.provider;
    if (prov === 'razorpay') ctx.extraHeaders['Content-Security-Policy'] = securityHeaders2(ctx.nonce, { script: 'https://checkout.razorpay.com', frame: 'https://api.razorpay.com', connect: 'https://lumberjack.razorpay.com https://api.razorpay.com' });
    if (prov === 'cashfree') ctx.extraHeaders['Content-Security-Policy'] = securityHeaders2(ctx.nonce, { script: 'https://sdk.cashfree.com', frame: 'https://sdk.cashfree.com https://payments.cashfree.com', connect: 'https://api.cashfree.com https://sandbox.cashfree.com' });
    page(ctx, commerce.payPage(ctx, o, prov, o.payment.init || {}));
  });
  function securityHeaders2(nonce, x) {
    return ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' ${x.script}`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: https:", `connect-src 'self' ${x.connect}`, `frame-src ${x.frame}`, "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"].join('; ');
  }
  route('POST', '/pay/mock/:no', async (ctx, m) => {
    if (payments.mock.status() !== 'dev_only') return notFound(ctx);
    const o = ownedOrder(ctx, m[1], ctx.form.t); if (!o) return notFound(ctx);
    if (ctx.form.result === 'success') { await onPaid(app, o, `mock_pay_${rid(6)}`, 'DEV MOCK gateway'); }
    else { o.payment.status = 'failed'; app.orders.save(); return page(ctx, commerce.msgPage(ctx, 'Mock payment failed', html`<div class="notice notice--danger">DEV MOCK: payment failed. Order remains unpaid.</div><p><a class="btn" href="/pay/${o.order_no}?t=${o.access_token}">Try again</a></p>`)); }
    redirect(ctx, `/order/${o.order_no}?t=${o.access_token}`);
  });
  route('POST', '/pay/razorpay/verify', async (ctx) => {
    const f = ctx.form; const o = ownedOrder(ctx, f.order_no, f.t); if (!o) return notFound(ctx);
    if (!payments.razorpay.verifyPayment(f) || f.razorpay_order_id !== o.payment.provider_order_id) return page(ctx, commerce.msgPage(ctx, 'Payment not verified', html`<div class="notice notice--danger">We could not verify this payment signature. If money was debited, contact us with order ${o.order_no}.</div>`), 400);
    await onPaid(app, o, f.razorpay_payment_id, 'razorpay verified signature'); redirect(ctx, `/order/${o.order_no}?t=${o.access_token}`);
  });
  route('GET', '/order/:no', (ctx, m) => {
    const o = ownedOrder(ctx, m[1], ctx.query.t); if (!o) return notFound(ctx);
    page(ctx, commerce.msgPage(ctx, o.status === 'pending_payment' ? `Order ${o.order_no} awaiting payment` : `Order ${o.order_no} received`, html`${o.status === 'pending_payment' ? html`<div class="notice notice--warn">Payment has not been confirmed yet. <a href="/pay/${o.order_no}?t=${o.access_token}">Complete payment</a>.</div>` : html`<div class="notice notice--ok" role="status"><strong>Thank you.</strong> Your prepaid payment is confirmed. We will place the supplier order and email tracking once dispatched. A confirmation email is sent only if SMTP is configured.</div>`}<div style="margin-top:24px">${commerce.orderSummary(ctx, o)}</div><p class="small muted">Track any time at <a href="/track?order=${o.order_no}">/track</a> with your email.</p>`));
  });

  // webhooks (raw body, signature verified; exempt from CSRF)
  route('POST', '/webhooks/razorpay', (ctx) => {
    if (!payments.razorpay.verifyWebhook(ctx.rawBody.toString('utf8'), ctx.req.headers)) { logEvent(cfg.dataDir, { integration: 'payment:razorpay', op: 'webhook', status: 'bad_signature' }); return send(ctx, 400, 'invalid signature', { 'Content-Type': 'text/plain' }); }
    let evt; try { evt = JSON.parse(ctx.rawBody.toString('utf8')); } catch { return send(ctx, 400, 'bad json', { 'Content-Type': 'text/plain' }); }
    const ent = evt.payload && evt.payload.payment && evt.payload.payment.entity; const o = ent && app.orders.byPaymentRef(ent.order_id);
    const done = o && ['payment.captured', 'order.paid'].includes(evt.event) ? onPaid(app, o, ent.id, 'razorpay webhook') : Promise.resolve();
    done.then(() => send(ctx, 200, 'ok', { 'Content-Type': 'text/plain' }));
  }, { raw: true });
  route('POST', '/webhooks/cashfree', (ctx) => {
    if (!payments.cashfree.verifyWebhook(ctx.rawBody.toString('utf8'), ctx.req.headers)) { logEvent(cfg.dataDir, { integration: 'payment:cashfree', op: 'webhook', status: 'bad_signature' }); return send(ctx, 400, 'invalid signature', { 'Content-Type': 'text/plain' }); }
    let evt; try { evt = JSON.parse(ctx.rawBody.toString('utf8')); } catch { return send(ctx, 400, 'bad json', { 'Content-Type': 'text/plain' }); }
    const d = evt.data || {}; const o = d.order && app.orders.byNo(d.order.order_id);
    const done = o && evt.type === 'PAYMENT_SUCCESS_WEBHOOK' ? onPaid(app, o, d.payment && d.payment.cf_payment_id, 'cashfree webhook') : Promise.resolve();
    done.then(() => send(ctx, 200, 'ok', { 'Content-Type': 'text/plain' }));
  }, { raw: true });
  route('POST', '/webhooks/shopify/orders-paid', (ctx) => {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) return send(ctx, 503, 'shopify webhook not configured', { 'Content-Type': 'text/plain' });
    const sig = ctx.req.headers['x-shopify-hmac-sha256'] || '';
    if (!timingSafeEq(hmacB64(secret, ctx.rawBody), sig)) { logEvent(cfg.dataDir, { integration: 'shopify', op: 'webhook', status: 'bad_signature' }); return send(ctx, 401, 'invalid signature', { 'Content-Type': 'text/plain' }); }
    let o; try { o = JSON.parse(ctx.rawBody.toString('utf8')); } catch { return send(ctx, 400, 'bad json', { 'Content-Type': 'text/plain' }); }
    // Stored for admin review. Not auto-mapped into the local order flow (see INTEGRATIONS.md).
    app.shopifyEvents.data.events.push({ at: new Date().toISOString(), shopify_order_id: o.id, name: o.name, total: o.total_price, currency: o.currency, topic: ctx.req.headers['x-shopify-topic'] || 'orders/paid' }); app.shopifyEvents.save();
    logEvent(cfg.dataDir, { integration: 'shopify', op: 'orders-paid', status: 'received', shopify_order: o.name });
    send(ctx, 200, 'ok', { 'Content-Type': 'text/plain' });
  }, { raw: true });

  // ---------- tracking ----------
  route('GET', '/track', (ctx) => {
    const { order: no, email } = ctx.query; if (!no && !email) return page(ctx, commerce.trackPage(ctx, {}));
    const o = no && app.orders.byNo(no.trim());
    if (!o || !email || !timingSafeEq(o.email, String(email).trim().toLowerCase())) return page(ctx, commerce.trackPage(ctx, { error: 'We could not find an order with that number and email.', values: ctx.query }), 404);
    page(ctx, commerce.trackPage(ctx, { order: o, values: ctx.query }));
  }, { rate: ['track', 30, 600e3] });
  route('POST', '/track/kyc', (ctx) => {
    const f = ctx.form; const o = app.orders.byNo(String(f.order_no || '')); const up = ctx.files && ctx.files.find((x) => x.field === 'doc' && x.filename);
    if (!o || !timingSafeEq(o.email, String(f.email || '').toLowerCase()) || !o.kyc.flagged) return notFound(ctx);
    if (!f.consent) return page(ctx, commerce.msgPage(ctx, 'Consent required', html`<p>We cannot store a document without your consent.</p>`), 400);
    const v = up ? validateUpload(up.filename, up.data) : { ok: false, error: 'Choose a file' };
    if (!v.ok) return page(ctx, commerce.msgPage(ctx, 'Upload failed', html`<div class="notice notice--danger">${v.error}</div>`), 400);
    o.kyc.document = saveUpload(path.join(cfg.dataDir, 'uploads', 'kyc'), up.data, v.ext); o.kyc.consent_at = new Date().toISOString(); app.orders.save();
    redirect(ctx, `/track?order=${o.order_no}&email=${encodeURIComponent(o.email)}`);
  }, { multipart: true, rate: ['kyc', 6, 600e3] });

  // ---------- accounts ----------
  const mergeGuest = (ctx, u) => { for (const g of ctx.session.garage) if (!u.garage.some((x) => JSON.stringify(x) === JSON.stringify(g))) u.garage.push(g); for (const w of ctx.session.wishlist) if (!u.wishlist.includes(w)) u.wishlist.push(w); ctx.session.garage = []; ctx.session.wishlist = []; app.accounts.save(); };
  const login = (ctx, u) => { ctx.session.user = u.id; ctx.session.csrf = rid(16); mergeGuest(ctx, u); };
  route('GET', '/account', (ctx) => {
    if (!ctx.user) return redirect(ctx, '/account/login');
    const orders = app.orders.all().filter((o) => o.user_id === ctx.user.id || (o.email === ctx.user.email)).reverse();
    page(ctx, commerce.accountPage(ctx, { user: ctx.user, orders }));
  });
  route('GET', '/account/login', (ctx) => page(ctx, commerce.accountPage(ctx, { mode: 'login' })));
  route('GET', '/account/signup', (ctx) => page(ctx, commerce.accountPage(ctx, { mode: 'signup' })));
  route('POST', '/account/signup', (ctx) => {
    const r = app.accounts.signup(ctx.form); if (r.error) return page(ctx, commerce.accountPage(ctx, { mode: 'signup', error: r.error, values: ctx.form }), 400);
    login(ctx, r.user); redirect(ctx, '/account');
  }, { rate: ['auth', 10, 600e3] });
  route('POST', '/account/login', (ctx) => {
    const r = app.accounts.login(ctx.form.email, ctx.form.password); if (r.error) return page(ctx, commerce.accountPage(ctx, { mode: 'login', error: r.error, values: ctx.form }), 401);
    login(ctx, r.user); redirect(ctx, '/account');
  }, { rate: ['auth', 10, 600e3] });
  route('POST', '/account/logout', (ctx) => { ctx.session.user = null; ctx.session.csrf = rid(16); redirect(ctx, '/'); });

  // ---------- admin ----------
  const adminRoutes = [];
  const admin = (method, pattern, handler, opts = {}) => adminRoutes.push({ method, re: new RegExp(`^/admin${pattern}$`), handler, opts });
  function adminAuth(ctx) {
    if (!cfg.admin.enabled) { send(ctx, 503, 'Admin is disabled: set ADMIN_USER and ADMIN_PASS.', { 'Content-Type': 'text/plain' }); return false; }
    const ip = clientIp(ctx.req);
    const h = ctx.req.headers.authorization || ''; let ok = false;
    if (h.startsWith('Basic ')) { const [u, ...pw] = Buffer.from(h.slice(6), 'base64').toString().split(':'); ok = timingSafeEq(u, cfg.admin.user) && timingSafeEq(pw.join(':'), cfg.admin.pass); }
    if (!ok) { if (h && !app.limiter.check(`adminfail:${ip}`, 10, 600e3)) { send(ctx, 429, 'Too many attempts', { 'Content-Type': 'text/plain' }); return false; } send(ctx, 401, 'Authentication required', { 'Content-Type': 'text/plain', 'WWW-Authenticate': 'Basic realm="Admin", charset="UTF-8"' }); return false; }
    return true;
  }
  const csvEsc = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toCsv = (rows) => rows.map((r) => r.map(csvEsc).join(',')).join('\r\n') + '\r\n';
  admin('GET', '', (ctx) => {
    const os = app.orders.all(); const by = (s) => os.filter((o) => o.status === s).length;
    const dr = dataReport();
    page(ctx, adminView.dashboard(ctx, { stats: [['Orders', os.length, '/admin/orders'], ['Awaiting payment', by('pending_payment'), '/admin/orders'], ['Paid / to queue', by('paid') + by('supplier_queued'), '/admin/queue'], ['Dispatched / transit', by('dispatched') + by('in_transit') + by('out_for_delivery'), '/admin/orders'], ['Delivered', by('delivered'), '/admin/orders'], ['New enquiries', app.enquiries.data.items.filter((e) => e.status === 'new').length, '/admin/enquiries'], ['KYC flagged', os.filter((o) => o.kyc.flagged).length, '/admin/kyc'], ['Products without price', dr.noPrice.length, '/admin/data']] }));
  });
  admin('GET', '/orders', (ctx) => page(ctx, adminView.ordersList(ctx, app.orders.all().slice().reverse())));
  admin('GET', '/orders/([A-Za-z0-9-]+)', (ctx, m) => { const o = app.orders.byNo(m[1]); o ? page(ctx, adminView.orderDetail(ctx, o, ctx.query.flash)) : notFound(ctx); });
  const back = (ctx, o, msg) => redirect(ctx, `/admin/orders/${o.order_no}?flash=${encodeURIComponent(msg)}`);
  admin('POST', '/orders/([A-Za-z0-9-]+)/status', (ctx, m) => { const o = app.orders.byNo(m[1]); if (!o) return notFound(ctx); const r = transition(o, ctx.form.to, String(ctx.form.note || '').slice(0, 200), 'admin'); app.orders.save(); back(ctx, o, r.ok ? 'Status updated' : r.error); });
  admin('POST', '/orders/([A-Za-z0-9-]+)/supplier-submit', async (ctx, m) => { const o = app.orders.byNo(m[1]); if (!o) return notFound(ctx); const r = await queueWithSupplier(app, o, { retries: 1, baseMs: 200 }); back(ctx, o, r.ok ? 'Queued with supplier adapter' : `Supplier adapter: ${r.status} - ${r.error || ''}`); });
  admin('POST', '/orders/([A-Za-z0-9-]+)/supplier-sent', (ctx, m) => { const o = app.orders.byNo(m[1]); if (!o) return notFound(ctx); o.supplier.status = 'sent'; o.supplier.sent_at = new Date().toISOString(); o.history.push({ at: o.supplier.sent_at, from: o.status, to: o.status, note: 'PO sent to supplier (manual)', actor: 'admin' }); app.orders.save(); back(ctx, o, 'Marked as sent'); });
  admin('POST', '/orders/([A-Za-z0-9-]+)/supplier-accepted', (ctx, m) => { const o = app.orders.byNo(m[1]); if (!o) return notFound(ctx); if (o.status === 'paid') transition(o, 'supplier_queued', 'Queued', 'admin'); const r = transition(o, 'supplier_accepted', 'Supplier accepted', 'admin'); if (r.ok) o.supplier.status = 'accepted'; app.orders.save(); back(ctx, o, r.ok ? 'Supplier accepted' : r.error); });
  admin('POST', '/orders/([A-Za-z0-9-]+)/tracking', (ctx, m) => {
    const o = app.orders.byNo(m[1]); if (!o) return notFound(ctx);
    const carrier = ['dhl', 'ups', 'other'].includes(ctx.form.carrier) ? ctx.form.carrier : 'other'; const number = String(ctx.form.number || '').trim().slice(0, 40).replace(/[^\w\-]/g, '');
    if (!number) return back(ctx, o, 'Tracking number required');
    o.supplier.tracking = { carrier, number, added_at: new Date().toISOString() };
    let msg = 'Tracking saved'; if (o.status === 'supplier_accepted') { const r = transition(o, 'dispatched', `Tracking ${carrier.toUpperCase()} ${number}`, 'admin'); msg = r.ok ? 'Tracking saved, order dispatched' : r.error; }
    app.orders.save();
    notify.sendEmail(cfg.dataDir, { to: o.email, subject: `Order ${o.order_no} dispatched`, text: `Your order ${o.order_no} has been dispatched. Carrier: ${carrier.toUpperCase()}, tracking: ${number}. Track at ${cfg.siteUrl}/track.` }).catch(() => {});
    back(ctx, o, msg);
  });
  admin('POST', '/orders/([A-Za-z0-9-]+)/kyc-flag', (ctx, m) => { const o = app.orders.byNo(m[1]); if (!o) return notFound(ctx); o.kyc = { flagged: true, reason: String(ctx.form.reason || '').slice(0, 200), flagged_at: new Date().toISOString() }; app.orders.save(); back(ctx, o, 'Flagged: customer will see a consent-based document request on /track'); });
  admin('POST', '/orders/([A-Za-z0-9-]+)/kyc-clear', (ctx, m) => { const o = app.orders.byNo(m[1]); if (!o) return notFound(ctx); o.kyc.flagged = false; app.orders.save(); back(ctx, o, 'KYC flag cleared'); });
  admin('GET', '/queue', (ctx) => page(ctx, adminView.queue(ctx, app.orders.all().filter((o) => ['paid', 'supplier_queued', 'supplier_accepted'].includes(o.status)))));
  admin('GET', '/enquiries', (ctx) => page(ctx, adminView.enquiries(ctx, app.enquiries.data.items.slice().reverse())));
  admin('POST', '/enquiries/([A-Za-z0-9-]+)/status', (ctx, m) => { const e = app.enquiries.data.items.find((x) => x.id === m[1]); if (e && ['new', 'replied', 'closed'].includes(ctx.form.status)) { e.status = ctx.form.status; app.enquiries.save(); } redirect(ctx, '/admin/enquiries'); });
  admin('GET', '/kyc', (ctx) => page(ctx, adminView.ordersList(ctx, app.orders.all().filter((o) => o.kyc.flagged), 'KYC flagged orders')));
  function dataReport() {
    const ps = app.catalog.products; const noPrice = ps.filter((p) => !(cfg.pricing[p.sku] > 0) && !(p.price_inr > 0)); const noImage = ps.filter((p) => !p.image); const lowRes = ps.filter((p) => p.image_px && p.image_px[0] < 300);
    const noFit = ps.filter((p) => !p.fits.length && !['Universal', 'Other / multi-brand'].includes(p.brand));
    return { noPrice, noImage, lowRes, noFit, summary: [['Products', ps.length], ['No confirmed price', noPrice.length], ['No image', noImage.length], ['Low-res image', lowRes.length], ['No generation/model match', noFit.length], ['Without OEM number', ps.filter((p) => !p.oem_numbers.length).length], ['Without years', ps.filter((p) => !p.year_from && !p.year_to).length]] };
  }
  admin('GET', '/data', (ctx) => page(ctx, adminView.dataReport(ctx, dataReport())));
  function integrationRows() {
    const sup = supplierMod.getAdapter(cfg.supplierAdapter); const env = (k) => (process.env[k] ? 'set' : 'unset');
    return [
      ['Razorpay', payments.razorpay.status(), `Keys ${env('RAZORPAY_KEY_ID')}. Order creation + HMAC verification implemented; not tested against a live account.`],
      ['Cashfree', payments.cashfree.status(), `Keys ${env('CASHFREE_APP_ID')}. Order creation + webhook verification implemented; not tested live.`],
      ['DEV mock payment', payments.mock.status(), 'Only available when NODE_ENV != production and DEV_MOCK_PAYMENT=1. Takes no money.'],
      [`Supplier adapter (${sup.id})`, sup.status(), sup.id === 'manual-queue' ? 'Admin queue + PO export; nothing auto-sent.' : 'Alibaba has no verified single-unit dropship API; this stub never fakes success.'],
      ['Alibaba API', supplierMod.adapters['alibaba-api'].status(), 'Stub only. See INTEGRATIONS.md.'], ['DHL', shippingMod.carriers.dhl.status(), 'Tracking call only; rating/shipment not implemented.'], ['UPS', shippingMod.carriers.ups.status(), 'Tracking call only; not implemented otherwise.'],
      ['Email (SMTP)', notify.emailStatus(), 'Minimal SMTP client; not tested against a real server.'], ['WhatsApp Cloud API', notify.waStatus(), 'Text messages only; templates not implemented.'], ['WhatsApp chat button', cfg.whatsapp ? 'configured' : 'not_configured', 'WHATSAPP_NUMBER'],
      ['Shopify webhook', process.env.SHOPIFY_WEBHOOK_SECRET ? 'configured_untested' : 'not_configured', 'Events are stored for review, not auto-mapped to orders.'], ['Shopify Admin push', process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN ? 'configured_untested' : 'not_configured', 'shopify/push-to-shopify.js (dry-run by default).'],
    ];
  }
  admin('GET', '/integrations', (ctx) => page(ctx, adminView.integrations(ctx, integrationRows(), [['NODE_ENV', process.env.NODE_ENV || '(unset)'], ['DEV_DEMO_PRICES', cfg.devDemoPrices ? 'ON (fake prices)' : 'off'], ['DEV_MOCK_PAYMENT', cfg.devMockPayment ? 'ON' : 'off'], ['SITE_URL', cfg.siteUrl], ['Catalogue generated', app.catalog.generatedAt], ['Confirmed prices in pricing.json', Object.keys(cfg.pricing).length]])));
  admin('GET', '/logs', (ctx) => page(ctx, adminView.logs(ctx, readLog(cfg.dataDir))));
  admin('GET', '/uploads/([a-f0-9]{32}\\.(?:jpg|png|webp|pdf))', (ctx, m) => {
    const f = [path.join(cfg.dataDir, 'uploads', m[1]), path.join(cfg.dataDir, 'uploads', 'kyc', m[1])].find((x) => fs.existsSync(x)); if (!f) return notFound(ctx);
    send(ctx, 200, fs.readFileSync(f), { 'Content-Type': MIME[path.extname(f)], 'Content-Disposition': `attachment; filename="${m[1]}"`, 'Cache-Control': 'private, no-store' });
  });
  admin('GET', '/export/orders\\.csv', (ctx) => send(ctx, 200, toCsv([['order_no', 'created_at', 'status', 'supplier_status', 'email', 'name', 'country', 'total_inr', 'dev_prices', 'tracking'], ...app.orders.all().map((o) => [o.order_no, o.created_at, o.status, o.supplier.status, o.email, o.shipping.name, o.shipping.country, o.totals.total, o.dev_prices, o.supplier.tracking ? o.supplier.tracking.number : ''])]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="orders.csv"' }));
  admin('GET', '/export/enquiries\\.csv', (ctx) => send(ctx, 200, toCsv([['id', 'created_at', 'type', 'status', 'name', 'email', 'phone', 'vehicle', 'sku', 'message', 'file'], ...app.enquiries.data.items.map((e) => [e.id, e.created_at, e.type, e.status, e.name, e.email, e.phone, e.vehicle, e.sku, e.message, e.file])]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="enquiries.csv"' }));
  admin('GET', '/export/po/([A-Za-z0-9-]+)\\.(csv|txt)', (ctx, m) => {
    const o = app.orders.byNo(m[1]); if (!o) return notFound(ctx); const pl = buildSupplierPayload(o, app.catalog);
    if (m[2] === 'csv') return send(ctx, 200, toCsv([['reference', 'supplier_sku', 'supplier_ref', 'title_raw', 'oem_numbers', 'qty', 'veh_make', 'veh_model', 'veh_year', 'generation', 'drive', 'side', 'position', 'ship_name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country', 'phone'], ...pl.items.map((i) => [pl.reference, i.supplier_sku, i.supplier_ref, i.title_raw, i.oem_numbers.join('|'), i.quantity, i.fitment.make, i.fitment.model, i.fitment.year, i.fitment.generation, i.fitment.drive, i.fitment.side, i.fitment.position, pl.ship_to.name, pl.ship_to.line1, pl.ship_to.line2, pl.ship_to.city, pl.ship_to.state, pl.ship_to.postal_code, pl.ship_to.country, pl.ship_to.phone])]), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="PO-${o.order_no}.csv"` });
    const txt = `Purchase order ${pl.reference}\n\n${pl.items.map((i) => `- ${i.quantity} x ${i.title_raw} (supplier ref ${i.supplier_ref}, OEM ${i.oem_numbers.join(' / ')})\n  Vehicle: ${i.fitment.make} ${i.fitment.model} ${i.fitment.year} ${i.fitment.generation || ''}, ${i.fitment.drive}, side ${i.fitment.side}, position ${i.fitment.position}`).join('\n')}\n\nShip to:\n${pl.ship_to.name}\n${pl.ship_to.line1} ${pl.ship_to.line2}\n${pl.ship_to.city}, ${pl.ship_to.state} ${pl.ship_to.postal_code}\n${pl.ship_to.country}\nPhone: ${pl.ship_to.phone}\n`;
    send(ctx, 200, txt, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="PO-${o.order_no}.txt"` });
  });

  // ---------- dispatcher ----------
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const ctx = buildCtx(req, res, url);
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    try {
      let table = routes; let isAdmin = false;
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) { isAdmin = true; table = adminRoutes; if (!adminAuth(ctx)) return; }
      let hit = null, m = null;
      const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
      for (const r of table) { if (r.method !== method) continue; m = r.re.exec(pathname); if (m) { hit = r; break; } }
      if (!hit) { return isAdmin ? send(ctx, 404, 'Not found', { 'Content-Type': 'text/plain' }) : notFound(ctx); }
      if (method === 'POST') {
        const ip = clientIp(req); const [grp, lim, win] = hit.opts.rate || ['post', 60, 60e3];
        if (!app.limiter.check(`${ip}:${grp}`, lim, win)) return send(ctx, 429, 'Too many requests. Please wait and try again.', { 'Content-Type': 'text/plain', 'Retry-After': '60' });
        const isHook = pathname.startsWith('/webhooks/');
        const body = await readBody(req, hit.opts.multipart ? MAX_BYTES + 512 * 1024 : isHook ? 1024 * 1024 : 200 * 1024);
        ctx.rawBody = body;
        const ct = req.headers['content-type'] || '';
        if (hit.opts.multipart || /multipart\/form-data/.test(ct)) { try { const p = parseMultipart(body, ct); ctx.form = p.fields; ctx.files = p.files; } catch { return send(ctx, 400, 'Bad multipart body', { 'Content-Type': 'text/plain' }); } }
        else if (/application\/json/.test(ct)) { try { ctx.form = JSON.parse(body.toString('utf8')); } catch { ctx.form = {}; } }
        else ctx.form = parseForm(body.toString('utf8'));
        if (!isHook && !csrfOk(ctx.session, ctx.form._csrf || req.headers['x-csrf-token'])) return page(ctx, commerce.msgPage(ctx, 'Session check failed', html`<p>Your form session expired or was invalid. Please go back, reload the page and try again.</p>`), 403);
      }
      await hit.handler(ctx, m);
      if (!ctx.done) send(ctx, 204, '');
    } catch (err) {
      if (err && err.status === 413) { if (!ctx.done) send(ctx, 413, 'Payload too large (5 MB upload limit)', { 'Content-Type': 'text/plain' }); return; }
      console.error('[error]', req.method, req.url, err && err.stack || err);
      if (!ctx.done && !res.headersSent) send(ctx, 500, 'Something went wrong. Please try again.', { 'Content-Type': 'text/plain' });
    }
  }
  app.server = http.createServer((req, res) => { handle(req, res); });
  app.server.requestTimeout = 30000;
  const gcTimer = setInterval(() => { app.sessions.gc(); app.limiter.gc(); }, 600e3); gcTimer.unref();
  return app;
}

module.exports = { createApp };
if (require.main === module) {
  const app = createApp();
  app.server.listen(app.cfg.port, () => {
    const c = app.cfg;
    console.log(`Storefront listening on ${c.siteUrl.startsWith('http://localhost') ? 'http://localhost:' + c.port : c.siteUrl} (port ${c.port}, NODE_ENV=${process.env.NODE_ENV || 'development'})`);
    console.log(`Catalogue: ${app.catalog.products.length} products. Confirmed prices: ${Object.keys(c.pricing).length}. DEV_DEMO_PRICES=${c.devDemoPrices ? 'ON (fake prices)' : 'off'} DEV_MOCK_PAYMENT=${c.devMockPayment ? 'ON' : 'off'}`);
    if (!c.admin.enabled) console.log('Admin DISABLED: set ADMIN_USER and ADMIN_PASS (required in production).');
    else if (c.admin.devDefault) console.log(`Admin: /admin  (DEV default credentials) user="${c.admin.user}" pass="${c.admin.pass}"`);
    else console.log('Admin: /admin (credentials from env)');
  });
}
