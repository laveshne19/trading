'use strict';
// Paw & Hearth storefront: zero-dependency Node server (node:http). Server-rendered HTML + small progressive-enhancement JS.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const cfg = require('./lib/config');
const { build } = require('./lib/services');
const { h, raw } = require('./lib/html');
const { rupee, rid, timingSafeEq, isPin, isPhone, normPhone, isEmail, asArray, clamp } = require('./lib/util');
const { securityHeaders, hashPassword, verifyPassword, csrfOk } = require('./lib/security');
const { verifyShopify } = require('./lib/webhooks');
const petsLib = require('./lib/pets');
const { InsufficientStock } = require('./lib/inventory');
const { OrderError, TRANSITIONS } = require('./lib/orders');
const { layout } = require('./views/layout');
const S = require('./views/pages-shop');
const UP = require('./views/pages-user');
const A = require('./views/admin');
const content = require('../content/pages'); const blog = require('../content/blog');

const ASSETS = path.join(cfg.root, 'assets');
const S_ = build(cfg);
const { catalogue, inventory, orders, coupons, loyalty, payments, shipping, pincode, sessions, limiter, store, ilog, webhookLog, subscriptions, settings } = S_;
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const secHeaders = () => securityHeaders({ razorpay: payments.adapters.razorpay.configured(), cashfree: payments.adapters.cashfree.configured(), isProd: cfg.isProd, secure: cfg.secure });
const SEC = secHeaders();

// ---------------------------------------------------------------- routing
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }).replace(/\*/g, '(.*)') + '/?$');
  routes.push({ method, re, keys, handler, opts });
};
const safeBack = (b, fb = '/') => (typeof b === 'string' && b.startsWith('/') && !b.startsWith('//') && !b.includes('\\') && b.length < 300 ? b : fb);
const parseCookies = (h_) => Object.fromEntries(String(h_ || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const clientIp = (req) => (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
}
function parseForm(str) { const o = {}; for (const [k, v] of new URLSearchParams(str)) { if (k in o) o[k] = [].concat(o[k], v); else o[k] = v; } return o; }

function send(res, status, body, headers = {}, req) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const h_ = { ...SEC, ...headers };
  const ct = String(h_['Content-Type'] || '');
  if (req && buf.length > 860 && /(text|json|xml|javascript|svg)/.test(ct) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const z = zlib.gzipSync(buf); h_['Content-Encoding'] = 'gzip'; h_.Vary = 'Accept-Encoding'; h_['Content-Length'] = z.length; res.writeHead(status, h_); return res.end(req.method === 'HEAD' ? undefined : z);
  }
  h_['Content-Length'] = buf.length; res.writeHead(status, h_); res.end(req && req.method === 'HEAD' ? undefined : buf);
}
const staticCache = new Map();
function serveStatic(req, res, rel, versioned) {
  const file = path.normalize(path.join(ASSETS, rel));
  if (!file.startsWith(ASSETS + path.sep)) return send(res, 403, 'Forbidden');
  let st; try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase(); if (!MIME[ext]) return false;
  const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
  const headers = { 'Content-Type': MIME[ext], ETag: etag, 'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=86400' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ...SEC, ETag: etag, 'Cache-Control': headers['Cache-Control'] }); res.end(); return true; }
  let buf = staticCache.get(file); if (!buf || buf.etag !== etag) { buf = { etag, data: fs.readFileSync(file) }; staticCache.set(file, buf); }
  send(res, 200, buf.data, headers, req); return true;
}

// ---------------------------------------------------------------- context
function makeCtx(req, res, url) {
  const cookies = parseCookies(req.headers.cookie);
  const q = {}; for (const [k, v] of url.searchParams) { if (k in q) q[k] = [].concat(q[k], v); else q[k] = v; }
  const ctx = { req, res, cfg, brand: cfg.brand, catalogue, url, path: url.pathname, fullPath: url.pathname + url.search, query: q, method: req.method, ip: clientIp(req), cookies, body: {}, rawBody: '', tab: '', searchValue: '', S: S_ };
  let session = cookies.pp_sid ? sessions.get(cookies.pp_sid) : null;
  const ensure = () => { if (!session) { session = sessions.create(null); ctx.setCookie('pp_sid', session.id, { maxAge: 30 * 86400 }); } return session; };
  ctx.setCookie = (name, val, o = {}) => { const c = `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax${o.maxAge ? '; Max-Age=' + o.maxAge : ''}${cfg.secure ? '; Secure' : ''}`; const ex = res.getHeader('Set-Cookie'); res.setHeader('Set-Cookie', ex ? [].concat(ex, c) : c); };
  Object.defineProperty(ctx, 'session', { get: () => session, set: (s) => { session = s; } });
  ctx.ensureSession = ensure;
  Object.defineProperty(ctx, 'csrf', { get: () => ensure().csrf });
  Object.defineProperty(ctx, 'sid', { get: () => ensure().id });
  Object.defineProperty(ctx, 'user', { get: () => (session && session.userId ? S_.users()[session.userId] || null : null) });
  Object.defineProperty(ctx, 'cartCount', { get: () => (session ? S_.cartCount(session.id) : 0) });
  Object.defineProperty(ctx, 'pin', { get: () => (session && session.pin) || '' });
  Object.defineProperty(ctx, 'pets', { get: () => { const u = ctx.user; return u && u.pets ? u.pets.map((p) => ({ ...p, ageGroup: petsLib.ageGroupOf(p.type, p.ageYears), sizeClass: petsLib.sizeOf(p.type, p.weightKg) })) : []; } });
  let flashVal;
  Object.defineProperty(ctx, 'flash', { get: () => { if (flashVal === undefined) { flashVal = null; if (session && session.flash) { flashVal = session.flash; delete session.flash; store.save('sessions'); } } return flashVal; } });
  ctx.setFlash = (type, msg) => { ensure().flash = { type, msg }; store.save('sessions'); };
  ctx.stockOf = (sku) => inventory.availableOf(sku);
  ctx.inv = (sku) => inventory.get(sku);
  ctx.wishButton = (slug, cls = '', text = false) => {
    const on = !!(ctx.user && (ctx.user.wishlist || []).includes(slug));
    if (!ctx.user) return h`<a class="${cls} wish" href="/account/login?next=${encodeURIComponent('/products/' + slug)}" aria-label="Sign in to save to wishlist">${UPicon('heart')}${text ? h` <span>Save to wishlist</span>` : ''}</a>`;
    return h`<form method="post" action="/wishlist/toggle" class="wish-form" data-wish>${raw(`<input type="hidden" name="_csrf" value="${ctx.csrf}">`)}<input type="hidden" name="slug" value="${slug}"><input type="hidden" name="back" value="${ctx.fullPath}"><button class="${cls} wish${on ? ' on' : ''}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Remove from wishlist' : 'Add to wishlist'}">${UPicon('heart')}${text ? h` <span>${on ? 'Saved to wishlist' : 'Save to wishlist'}</span>` : ''}</button></form>`;
  };
  ctx.notifyStatusNote = (!S_.notifier.email.configured() && !S_.notifier.wa.configured()) ? 'Note: email and WhatsApp notifications are not connected on this store yet, so use the Track order page for updates.' : '';
  ctx.sendPage = (o, status = 200) => { ctx.tab = o.tab || ''; ctx.searchValue = o.searchValue || ''; const html = layout(ctx, o); send(res, status, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' }, req); };
  ctx.html = (str, status = 200) => send(res, status, str, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, req);
  ctx.json = (obj, status = 200) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, req);
  ctx.text = (str, status = 200, ct = 'text/plain; charset=utf-8', extra = {}) => send(res, status, str, { 'Content-Type': ct, ...extra }, req);
  ctx.redirect = (to, status = 303) => { res.writeHead(status, { ...SEC, Location: to, 'Cache-Control': 'no-store' }); res.end(); };
  ctx.wantsJson = () => /json/.test(req.headers.accept || '') || req.headers['x-requested-with'] === 'fetch';
  const MULT = Number(process.env.RATE_LIMIT_MULT || 1); const STRICT = ['login', 'register', 'contact', 'newsletter', 'review', 'checkout', 'track'];
  ctx.limit = (name, limit, windowMs) => { const r = limiter.hit(`${name}:${ctx.ip}`, { limit: STRICT.includes(name) ? limit : limit * MULT, windowMs }); if (!r.allowed) { res.writeHead(429, { ...SEC, 'Retry-After': r.retryAfter, 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Too many requests. Please try again shortly.'); return false; } return true; };
  return ctx;
}
const UPicon = (n) => require('./views/ui').icon(n, 20);

// ---------------------------------------------------------------- shared helpers
function loginSession(ctx, user) {
  const old = ctx.session; const ns = sessions.create(user.id);
  if (old) { const carts = store.get('carts', {}); if (carts[old.id]) { carts[ns.id] = carts[old.id]; delete carts[old.id]; store.save('carts'); } if (old.pin) ns.pin = old.pin; sessions.destroy(old.id); }
  ctx.session = ns; ctx.setCookie('pp_sid', ns.id, { maxAge: 30 * 86400 });
}
const requireUser = (ctx) => { if (ctx.user) return true; ctx.setFlash('info', 'Please sign in to continue.'); ctx.redirect('/account/login?next=' + encodeURIComponent(ctx.method === 'GET' ? ctx.fullPath : '/account')); return false; };
const etaText = (r) => { if (!r.etaDays) return ''; const f = (d) => new Date(Date.now() + d * 864e5).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); return `${f(r.etaDays[0])} - ${f(r.etaDays[1])}`; };
async function pinInfo(ctx, pin, { withCod = true } = {}) {
  const r = await pincode.check(pin);
  if (!r.valid) return { ok: false, message: r.message };
  if (ctx.session) { ctx.session.pin = pin; store.save('sessions'); }
  const out = { ok: true, serviceable: r.serviceable, verified: r.verified, label: r.label || '', area: r.area || '', etaDays: r.etaDays || null };
  if (!r.serviceable) { out.message = `Sorry, we cannot deliver to ${pin} right now. ${r.verified ? '' : '(Estimate - not courier-verified.)'}`; return out; }
  out.message = `Delivery to ${pin}${r.area ? ' (' + r.area + ')' : ''}: about ${r.etaDays[0]}-${r.etaDays[1]} days (${etaText(r)}). ${r.verified ? r.label + '.' : 'Estimated, not courier-verified.'}`;
  if (withCod) {
    const priced = ctx.session ? S_.priceCart(ctx.session.id, { userId: ctx.user && ctx.user.id }) : { lines: [], totals: { subtotal: 0, couponDiscount: 0, loyaltyDiscount: 0 } };
    const cod = S_.codFor(priced, pin); out.cod = cod.allowed && r.cod !== false; out.codReason = out.cod ? '' : (cod.reason || 'COD is not available for this PIN code.');
  }
  return out;
}
const reviewsFor = (slug) => store.get('reviews', []).filter((r) => r.status === 'approved' && r.slug === slug).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

// ---------------------------------------------------------------- static-ish routes
route('GET', '/robots.txt', (ctx) => ctx.text(`User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nDisallow: /admin\nDisallow: /api/\nDisallow: /track\nDisallow: /pay/\nDisallow: /order/\nDisallow: /pets\nDisallow: /subscriptions\nDisallow: /webhooks/\nDisallow: /search\n\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`));
route('GET', '/sitemap.xml', (ctx) => {
  const urls = ['/', '/dogs', '/cats', '/bundles', '/blog', '/about', '/contact', '/faq', ...content.policies.map((p) => '/policies/' + p.slug), ...Object.keys(catalogue.flat).map((s) => '/collections/' + s), ...catalogue.smart.map((s) => '/collections/' + s.slug), ...catalogue.products.map((p) => '/products/' + p.slug), ...blog.map((b) => '/blog/' + b.slug)];
  ctx.text(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${cfg.siteUrl}${u}</loc></url>`).join('\n')}\n</urlset>\n`, 200, 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
});
route('GET', '/favicon.ico', (ctx) => ctx.redirect('/assets/img/favicon.svg', 301));
route('GET', '/healthz', (ctx) => ctx.json({ ok: true, products: catalogue.products.length, demoCatalogue: cfg.demoCatalogue }));

// ---------------------------------------------------------------- catalogue pages
route('GET', '/', (ctx) => ctx.sendPage(S.home(ctx, { reviews: store.get('reviews', []).filter((r) => r.status === 'approved').slice(-3).reverse() })));
route('GET', '/dogs', (ctx) => ctx.sendPage(S.petPage(ctx, 'dog')));
route('GET', '/cats', (ctx) => ctx.sendPage(S.petPage(ctx, 'cat')));
const FACET_KEYS = ['cat', 'brand', 'age', 'size', 'breed', 'weight', 'food', 'pref', 'litter', 'pet', 'price'];
route('GET', '/collections/:slug', (ctx) => {
  const def = catalogue.collection(ctx.params.slug); if (!def) return notFound(ctx);
  const sel = {}; for (const k of FACET_KEYS) sel[k] = asArray(ctx.query[k]).map(String).slice(0, 12);
  const petParam = ['dog', 'cat'].includes(ctx.query.pet) ? ctx.query.pet : '';
  const pet = def.pet !== 'both' ? def.pet : petParam || null;
  const sort = catalogue.SORTS[ctx.query.sort] ? ctx.query.sort : 'relevance'; const page = parseInt(ctx.query.page, 10) || 1;
  let forPet = null; let pool;
  if (ctx.query.for && ctx.user) { forPet = ctx.pets.find((p) => p.id === ctx.query.for) || null; if (forPet) pool = catalogue.base(def, forPet.type).filter((p) => !p.rx && petsLib.suits(p, forPet).suits); }
  const res = catalogue.list(def, sel, { pet: forPet ? forPet.type : pet, sort, page, pool });
  ctx.sendPage(S.collection(ctx, { def, res, sel, sort, pet, petParam, page, forPet, petDisclaimer: petsLib.DISCLAIMER }));
});
route('GET', '/products/:slug', (ctx) => {
  const p = catalogue.bySlug(ctx.params.slug); if (!p) return notFound(ctx);
  const dv = p.variants.find((v) => inventory.availableOf(v.sku) > 0) || p.variants[0];
  const petMatches = ctx.pets.filter((pt) => p.petType.includes(pt.type)).map((pt) => ({ pet: pt, r: petsLib.suits(p, pt) }));
  ctx.sendPage(S.productPage(ctx, { p, reviews: reviewsFor(p.slug), related: catalogue.related(p, 6), petMatches, defaultVariant: dv, petDisclaimer: petsLib.DISCLAIMER }));
});
route('GET', '/search', (ctx) => { if (!ctx.limit('search', 120, 60000)) return; const q = String(ctx.query.q || '').slice(0, 80).trim(); ctx.sendPage(S.searchPage(ctx, { q, items: q ? catalogue.search(q, 48) : [], sug: catalogue.suggest(q) })); });
route('GET', '/api/suggest', (ctx) => { if (!ctx.limit('suggest', 240, 60000)) return; const q = String(ctx.query.q || '').slice(0, 60); ctx.json(catalogue.suggest(q)); });
route('GET', '/api/pincode', async (ctx) => { if (!ctx.limit('pin', 60, 60000)) return; ctx.ensureSession(); const pin = String(ctx.query.pin || '').trim(); ctx.json(await pinInfo(ctx, pin)); });
route('GET', '/bundles', (ctx) => ctx.sendPage(S.bundlesPage(ctx)));
route('GET', '/blog', (ctx) => ctx.sendPage(S.blogIndex(ctx)));
route('GET', '/blog/:slug', (ctx) => { const a = blog.find((x) => x.slug === ctx.params.slug); if (!a) return notFound(ctx); ctx.sendPage(S.blogPost(ctx, a)); });
route('GET', '/about', (ctx) => ctx.sendPage(S.aboutPage(ctx)));
route('GET', '/faq', (ctx) => ctx.sendPage(S.faqPage(ctx)));
route('GET', '/contact', (ctx) => ctx.sendPage(S.contactPage(ctx)));
route('GET', '/policies/:slug', (ctx) => { const p = content.policies.find((x) => x.slug === ctx.params.slug); if (!p) return notFound(ctx); ctx.sendPage(S.policyPage(ctx, p)); });
function notFound(ctx) { ctx.sendPage(S.notFound(ctx), 404); }

route('POST', '/contact', (ctx) => {
  if (!ctx.limit('contact', 5, 3600000)) return; const b = ctx.body;
  if (!String(b.name || '').trim() || !isEmail(b.email) || String(b.message || '').trim().length < 5) { ctx.setFlash('error', 'Please fill in your name, a valid email and a message.'); return ctx.redirect('/contact'); }
  store.update('enquiries', [], (a) => a.push({ id: rid(5), ts: new Date().toISOString(), name: String(b.name).slice(0, 80), email: String(b.email).slice(0, 200), phone: String(b.phone || '').slice(0, 20), order: String(b.order || '').slice(0, 20), message: String(b.message).slice(0, 2000), status: 'new' }));
  ctx.setFlash('success', 'Thanks - your message has been saved for our team. We will reply by email.'); ctx.redirect('/contact');
});
route('POST', '/newsletter', (ctx) => {
  if (!ctx.limit('newsletter', 6, 3600000)) return; const b = ctx.body; const back = safeBack(b.back, '/');
  if (!isEmail(b.email) || b.consent !== '1') { ctx.setFlash('error', 'Please enter a valid email and tick the consent box.'); return ctx.redirect(back); }
  store.update('newsletter', [], (a) => { const e = String(b.email).toLowerCase(); if (!a.some((x) => x.email === e)) a.push({ email: e, consent: true, consentText: 'Agreed to marketing emails and privacy policy at signup', ts: new Date().toISOString(), source: 'website' }); });
  ctx.setFlash('success', 'Saved. Your email is stored with your consent. Our email service is not connected yet, so nothing will be sent until it is.'); ctx.redirect(back);
});
route('POST', '/reviews', (ctx) => {
  if (!ctx.limit('review', 6, 3600000)) return; const b = ctx.body; const p = catalogue.bySlug(b.slug); if (!p) return notFound(ctx);
  const rating = parseInt(b.rating, 10); const body = String(b.body || '').trim(); const name = String(b.name || '').trim();
  if (!(rating >= 1 && rating <= 5) || body.length < 10 || !name) { ctx.setFlash('error', 'Please add your name, a rating and a review of at least 10 characters.'); return ctx.redirect('/products/' + p.slug + '#reviews'); }
  const verified = !!(ctx.user && orders.byUser(ctx.user.id).some((o) => o.state === 'delivered' && o.items.some((i) => i.slug === p.slug)));
  store.update('reviews', [], (a) => a.push({ id: rid(5), slug: p.slug, name: name.slice(0, 60), rating, title: String(b.title || '').slice(0, 100), body: body.slice(0, 1500), status: 'pending', verified, userId: ctx.user ? ctx.user.id : null, createdAt: new Date().toISOString() }));
  ctx.setFlash('success', 'Thank you. Your review is awaiting moderation and will appear once approved.'); ctx.redirect('/products/' + p.slug + '#reviews');
});

// ---------------------------------------------------------------- cart
route('POST', '/cart/add', (ctx) => {
  const b = ctx.body; const r = S_.addToCart(ctx.sid, b.sku, b.qty);
  if (ctx.wantsJson()) return ctx.json({ ok: r.ok, message: r.ok ? (r.message || `Added ${r.product.title} to your cart`) : r.error, count: ctx.cartCount }, r.ok ? 200 : 400);
  if (!r.ok) ctx.setFlash('error', r.error); else if (b.buy === '1') return ctx.redirect('/checkout'); else ctx.setFlash('success', r.message || `Added ${r.product.title} to your cart.`);
  ctx.redirect(safeBack(b.back, '/cart'));
});
route('POST', '/cart/add-bundle', (ctx) => {
  const b = S_.bundleBySlug(ctx.body.slug); if (!b) return notFound(ctx); let ok = 0; const errs = [];
  for (const it of b.items) { const r = S_.addToCart(ctx.sid, it.sku, it.qty, b.slug); if (r.ok) ok++; else errs.push(r.error); }
  ctx.setFlash(errs.length ? 'error' : 'success', errs.length ? `Some items could not be added: ${errs.join(' ')}` : `${b.title} added to your cart.`); ctx.redirect('/cart');
});
route('POST', '/cart/update', (ctx) => {
  S_.setQty(ctx.sid, String(ctx.body.key || ''), ctx.body.qty);
  if (ctx.wantsJson()) return ctx.json({ ok: true, count: ctx.cartCount });
  ctx.redirect(safeBack(ctx.body.back, '/cart'));
});
route('POST', '/cart/coupon', (ctx) => {
  const c = S_.cartOf(ctx.sid);
  if (ctx.body.remove) c.coupon = ''; else { const code = String(ctx.body.code || '').trim().toUpperCase().slice(0, 30); c.coupon = code; const priced = S_.priceCart(ctx.sid, { userId: ctx.user && ctx.user.id }); if (priced.coupon && priced.coupon.error) { ctx.setFlash('error', priced.coupon.error); c.coupon = ''; } else if (code) ctx.setFlash('success', `Coupon ${code} applied.`); }
  S_.saveCarts(); ctx.redirect(safeBack(ctx.body.back, '/cart'));
});
route('POST', '/cart/points', (ctx) => { if (!ctx.user) return ctx.redirect('/account/login?next=/cart'); S_.cartOf(ctx.sid).points = Math.max(0, parseInt(ctx.body.points, 10) || 0); S_.saveCarts(); ctx.redirect('/cart'); });
route('GET', '/cart', (ctx) => ctx.sendPage(UP.cartPage(ctx, S_.priceCart(ctx.sid, { userId: ctx.user && ctx.user.id }))));
route('GET', '/cart/drawer', (ctx) => ctx.html(UP.cartDrawer(ctx, S_.priceCart(ctx.sid, { userId: ctx.user && ctx.user.id })).s));

// ---------------------------------------------------------------- checkout
function payOptions(ctx, priced, pin) {
  const ad = payments.preferred(); const cod = S_.codFor(priced, pin);
  return { prepaid: { available: !!ad, gatewayLabel: ad ? (ad.name === 'mock' ? '' : ad.label) : '', mock: !!ad && ad.name === 'mock', reason: ad ? '' : 'Online payment is not configured on this store yet.' }, cod: { allowed: cod.allowed, reason: cod.reason, fee: settings().codFee } };
}
route('GET', '/checkout', (ctx) => {
  const priced = S_.priceCart(ctx.sid, { userId: ctx.user && ctx.user.id });
  if (!priced.lines.length) { ctx.setFlash('info', 'Your cart is empty.'); return ctx.redirect('/cart'); }
  ctx.session.idem = ctx.session.idem || rid(10);
  const u = ctx.user; const a = u && u.addresses && u.addresses[0];
  const f = { email: u ? u.email : '', phone: u ? u.phone : '', name: a ? a.name : u ? u.name : '', line1: a ? a.line1 : '', line2: a ? a.line2 : '', city: a ? a.city : '', state: a ? a.state : '', pin: a ? a.pin : ctx.pin };
  ctx.sendPage(UP.checkoutPage(ctx, { cart: priced, f, addresses: u ? u.addresses || [] : [], pay: payOptions(ctx, priced, f.pin), idem: ctx.session.idem }));
});
route('POST', '/checkout', async (ctx) => {
  if (!ctx.limit('checkout', 20, 600000)) return; const b = ctx.body; const user = ctx.user;
  const f = { email: String(b.email || '').trim(), phone: String(b.phone || '').trim(), name: String(b.name || '').trim(), line1: String(b.line1 || '').trim(), line2: String(b.line2 || '').trim(), city: String(b.city || '').trim(), state: String(b.state || '').trim(), pin: String(b.pin || '').trim(), payment: b.payment, terms: b.terms === '1' };
  const method = f.payment === 'cod' ? 'cod' : 'prepaid';
  const priced = S_.priceCart(ctx.sid, { userId: user && user.id, paymentMethod: method });
  const rerender = (errors) => { const p0 = S_.priceCart(ctx.sid, { userId: user && user.id }); ctx.sendPage(UP.checkoutPage(ctx, { cart: p0, f, errors, addresses: user ? user.addresses || [] : [], pay: payOptions(ctx, p0, f.pin), idem: b.idem || rid(10) }), 422); };
  const errors = {};
  if (!priced.lines.length) { ctx.setFlash('info', 'Your cart is empty.'); return ctx.redirect('/cart'); }
  if (priced.hasUnavailable) errors._ = 'Some items in your cart are out of stock. Please remove them to continue.';
  if (!isEmail(f.email)) errors.email = 'Enter a valid email address.';
  if (!isPhone(f.phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (f.name.length < 2) errors.name = 'Enter the recipient name.'; if (f.line1.length < 5) errors.line1 = 'Enter the street address.'; if (f.city.length < 2) errors.city = 'Enter the city.';
  if (!require('./views/ui').STATES_IN.includes(f.state)) errors.state = 'Select a state.'; if (!isPin(f.pin)) errors.pin = 'Enter a valid 6-digit PIN code.'; if (!f.terms) errors.terms = 'Please accept the terms to continue.';
  if (!['prepaid', 'cod'].includes(f.payment)) errors.payment = 'Choose a payment method.';
  let pc = null;
  if (!errors.pin) { pc = await pincode.check(f.pin); if (!pc.serviceable) errors.pin = pc.message || 'We cannot deliver to this PIN code.'; }
  if (method === 'cod' && !errors.payment) { const cod = S_.codFor(priced, f.pin); if (!cod.allowed) errors.payment = cod.reason; else if (pc && pc.cod === false) errors.payment = 'COD is not available for this PIN code.'; }
  if (method === 'prepaid' && !payments.preferred()) errors.payment = 'Online payment is not configured on this store yet.';
  if (Object.keys(errors).length) return rerender(errors);
  const adapter = payments.preferred();
  let result;
  try {
    result = orders.create({ userId: user ? user.id : null, email: f.email.toLowerCase(), name: f.name, address: { name: f.name, phone: normPhone(f.phone), line1: f.line1, line2: f.line2, city: f.city, state: f.state, pin: f.pin },
      items: priced.lines.map((l) => ({ sku: l.sku, slug: l.slug, title: l.title, variantLabel: l.variantLabel, qty: l.qty, unitPrice: l.unitPrice, unitMrp: l.unitMrp, image: l.image })), totals: priced.totals,
      coupon: priced.coupon && priced.coupon.code ? { code: priced.coupon.code, discount: priced.coupon.discount } : null, loyaltyUsed: priced.loyalty.applied ? { points: priced.loyalty.applied, discount: priced.totals.loyaltyDiscount } : null,
      payment: { method, gateway: method === 'prepaid' ? adapter.name : null }, idempotencyKey: b.idem || null, eta: pc && pc.etaDays ? { min: pc.etaDays[0], max: pc.etaDays[1], label: pc.label } : null, weightG: priced.lines.reduce((s, l) => s + l.weightG * l.qty, 0) });
  } catch (e) {
    if (e instanceof InsufficientStock) { errors._ = `Sorry, only ${e.available} left of an item in your cart. Please adjust your cart.`; return rerender(errors); }
    throw e;
  }
  const { order, duplicate } = result;
  if (!duplicate && method === 'prepaid') {
    const gw = await adapter.createOrder({ orderNo: order.no, amountRupees: order.totals.total, customer: { id: user && user.id, email: order.email, phone: order.address.phone, name: order.name }, returnUrl: `${cfg.siteUrl}/pay/${order.no}/cashfree-return?t=${order.accessToken}`, notifyUrl: `${cfg.siteUrl}/webhooks/cashfree` });
    if (!gw.ok) { orders.cancel(order.no, { actor: 'system', note: 'Gateway order creation failed' }); ilog.log(adapter.name, 'error', 'createOrder failed: ' + gw.error, { order: order.no }); return rerender({ _: 'We could not start the payment. Please try again or choose another method.' }); }
    order.payment.gatewayOrderId = gw.gatewayOrderId; if (gw.paymentSessionId) order.payment.sessionId = gw.paymentSessionId; orders.persist();
  }
  S_.cartOf(ctx.sid).items = []; S_.cartOf(ctx.sid).coupon = ''; S_.cartOf(ctx.sid).points = 0; S_.saveCarts(); delete ctx.session.idem; store.save('sessions');
  ctx.redirect(method === 'prepaid' ? `/pay/${order.no}?t=${order.accessToken}` : `/order/${order.no}?t=${order.accessToken}`);
});
const orderByToken = (ctx) => { const o = orders.get(ctx.params.no); if (!o) return null; const t = String(ctx.query.t || ctx.body.t || ''); return (t && timingSafeEq(t, o.accessToken)) || (ctx.user && o.userId === ctx.user.id) ? o : null; };
route('GET', '/order/:no', (ctx) => { const o = orderByToken(ctx); if (!o) return notFound(ctx); ctx.sendPage(UP.orderConfirm(ctx, o)); });
route('GET', '/pay/:no', (ctx) => {
  const o = orderByToken(ctx); if (!o) return notFound(ctx);
  if (o.state !== 'pending_payment') return ctx.redirect(`/order/${o.no}?t=${o.accessToken}`);
  const ad = payments.get(o.payment.gateway); if (!ad || !ad.configured()) return ctx.sendPage({ title: 'Payment unavailable', noindex: true, body: h`<div class="wrap narrow"><h1>Payment unavailable</h1><p>The payment gateway for this order is not available right now. Your order will be cancelled automatically if unpaid.</p></div>` }, 503);
  ctx.sendPage(UP.payPage(ctx, { o, adapter: ad, token: o.accessToken, paymentSessionId: o.payment.sessionId }));
});
route('POST', '/pay/:no/mock', (ctx) => {
  const o = orderByToken(ctx); const mock = payments.adapters.mock; if (!o || !mock.configured() || o.payment.gateway !== 'mock') return notFound(ctx);
  if (ctx.body.outcome !== 'success') { orders.get(o.no).history.push({ ts: new Date().toISOString(), from: o.state, to: o.state, actor: 'mock', note: 'Simulated payment failed' }); orders.persist(); ctx.setFlash('error', 'Simulated payment failed. You can try again.'); return ctx.redirect(`/pay/${o.no}?t=${o.accessToken}`); }
  const paymentId = 'mockpay_' + rid(5); const sig = mock.sign(o.payment.gatewayOrderId, paymentId);
  if (!mock.verifyPayment({ orderId: o.payment.gatewayOrderId, paymentId, signature: sig })) return ctx.text('Verification failed', 400);
  try { orders.markPaid(o.no, { gateway: 'mock', paymentId, amountRupees: o.totals.total, key: 'pay:' + paymentId }); } catch (e) { ilog.log('mock', 'error', e.message, { order: o.no }); }
  ctx.redirect(`/order/${o.no}?t=${o.accessToken}`);
});
route('POST', '/pay/:no/razorpay', (ctx) => {
  const o = orderByToken(ctx); const rz = payments.adapters.razorpay; if (!o || !rz.configured() || o.payment.gateway !== 'razorpay') return notFound(ctx);
  const b = ctx.body; if (b.razorpay_order_id !== o.payment.gatewayOrderId || !rz.verifyPayment({ orderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id, signature: b.razorpay_signature })) { ilog.log('razorpay', 'warn', 'Signature verification failed', { order: o.no }); ctx.setFlash('error', 'Payment could not be verified. If money was debited it will be reconciled automatically.'); return ctx.redirect(`/pay/${o.no}?t=${o.accessToken}`); }
  try { orders.markPaid(o.no, { gateway: 'razorpay', paymentId: b.razorpay_payment_id, key: 'pay:' + b.razorpay_payment_id }); } catch (e) { ilog.log('razorpay', 'error', e.message, { order: o.no }); }
  ctx.redirect(`/order/${o.no}?t=${o.accessToken}`);
});
route('GET', '/pay/:no/cashfree-return', async (ctx) => {
  const o = orderByToken(ctx); const cf = payments.adapters.cashfree; if (!o || !cf.configured()) return notFound(ctx);
  const st = await cf.fetchOrderStatus(o.no);
  if (st.ok && st.orderStatus === 'PAID') { try { orders.markPaid(o.no, { gateway: 'cashfree', paymentId: 'cf_' + o.no, amountRupees: null, key: 'pay:cf:' + o.no }); } catch (e) { ilog.log('cashfree', 'error', e.message); } }
  ctx.redirect(`/order/${o.no}?t=${o.accessToken}`);
});

// ---------------------------------------------------------------- tracking
route('GET', '/track', (ctx) => ctx.sendPage(UP.trackPage(ctx, { no: String(ctx.query.no || '').slice(0, 20) })));
route('POST', '/track', (ctx) => {
  if (!ctx.limit('track', 20, 600000)) return; const no = String(ctx.body.no || '').trim().toUpperCase().slice(0, 20); const contact = String(ctx.body.contact || '').trim().slice(0, 200);
  const o = orders.lookup(no, contact);
  ctx.sendPage(UP.trackPage(ctx, { no, contact, order: o, error: o ? '' : 'We could not find an order matching those details. Check the order number and the phone number or email used at checkout.' }), o ? 200 : 404);
});

// ---------------------------------------------------------------- account
route('GET', '/account/login', (ctx) => ctx.sendPage(UP.loginPage(ctx, { next: safeBack(ctx.query.next, '') })));
const DUMMY = hashPassword('dummy-password-for-timing');
route('POST', '/account/login', (ctx) => {
  if (!ctx.limit('login', 12, 600000)) return; const email = String(ctx.body.email || '').trim().toLowerCase(); const u = S_.userByEmail(email);
  const ok = verifyPassword(String(ctx.body.password || ''), u ? u.hash : DUMMY) && !!u;
  if (!ok) return ctx.sendPage(UP.loginPage(ctx, { email, error: 'Incorrect email or password.', next: safeBack(ctx.body.next, '') }), 401);
  loginSession(ctx, u); ctx.redirect(safeBack(ctx.body.next, '/account'));
});
route('GET', '/account/register', (ctx) => ctx.sendPage(UP.registerPage(ctx, { next: safeBack(ctx.query.next, '') })));
route('POST', '/account/register', (ctx) => {
  if (!ctx.limit('register', 8, 3600000)) return; const b = ctx.body; const e = {}; const f = { name: String(b.name || '').trim(), email: String(b.email || '').trim().toLowerCase(), phone: String(b.phone || '').trim() };
  if (f.name.length < 2) e.name = 'Enter your name.'; if (!isEmail(f.email)) e.email = 'Enter a valid email.'; else if (S_.userByEmail(f.email)) e.email = 'An account with this email already exists. Try signing in.';
  if (!isPhone(f.phone)) e.phone = 'Enter a valid 10-digit mobile number.'; if (String(b.password || '').length < 8) e.password = 'Use at least 8 characters.'; if (b.privacy !== '1') e.privacy = 'Consent to the privacy policy is required to create an account.';
  if (Object.keys(e).length) return ctx.sendPage(UP.registerPage(ctx, { f, errors: e, next: safeBack(b.next, '') }), 422);
  const id = 'U' + rid(6); S_.users()[id] = { id, name: f.name, email: f.email, phone: normPhone(f.phone), hash: hashPassword(String(b.password)), createdAt: new Date().toISOString(), consent: { privacy: new Date().toISOString(), marketing: b.marketing === '1' ? new Date().toISOString() : null }, addresses: [], pets: [], wishlist: [], lists: [] }; store.save('users');
  loginSession(ctx, S_.users()[id]); ctx.setFlash('success', 'Welcome! Your account is ready.'); ctx.redirect(safeBack(b.next, '/account'));
});
route('POST', '/account/logout', (ctx) => { if (ctx.session) sessions.destroy(ctx.session.id); ctx.setCookie('pp_sid', '', { maxAge: 0 }); ctx.redirect('/'); });
const saveUsers = () => store.save('users');
route('GET', '/account', (ctx) => { if (!requireUser(ctx)) return; ctx.sendPage(UP.accountHome(ctx, { orders: orders.byUser(ctx.user.id), points: loyalty.balance(ctx.user.id), pets: ctx.pets })); });
route('GET', '/account/orders', (ctx) => { if (!requireUser(ctx)) return; ctx.sendPage(UP.accountOrders(ctx, orders.byUser(ctx.user.id))); });
route('GET', '/account/orders/:no', (ctx) => { if (!requireUser(ctx)) return; const o = orders.get(ctx.params.no); if (!o || o.userId !== ctx.user.id) return notFound(ctx); ctx.sendPage(UP.accountOrder(ctx, o)); });
route('POST', '/account/orders/:no/cancel', (ctx) => { if (!requireUser(ctx)) return; const o = orders.get(ctx.params.no); if (!o || o.userId !== ctx.user.id) return notFound(ctx); try { orders.cancel(o.no, { actor: 'customer' }); ctx.setFlash('success', 'Order cancelled.'); } catch (e) { ctx.setFlash('error', 'This order can no longer be cancelled. Please contact us.'); } ctx.redirect('/account/orders/' + o.no); });
route('POST', '/account/orders/:no/return', (ctx) => { if (!requireUser(ctx)) return; const o = orders.get(ctx.params.no); if (!o || o.userId !== ctx.user.id) return notFound(ctx); try { orders.transition(o.no, 'return_requested', { actor: 'customer' }); ctx.setFlash('success', 'Return requested. Our team will contact you.'); } catch (e) { ctx.setFlash('error', 'A return cannot be requested for this order.'); } ctx.redirect('/account/orders/' + o.no); });
route('POST', '/account/reorder/:no', (ctx) => {
  if (!requireUser(ctx)) return; const o = orders.get(ctx.params.no); if (!o || o.userId !== ctx.user.id) return notFound(ctx);
  let added = 0; const skipped = []; for (const i of o.items) { const r = S_.addToCart(ctx.sid, i.sku, i.qty); if (r.ok) added++; else skipped.push(i.title); }
  ctx.setFlash(skipped.length ? 'info' : 'success', `Added ${added} item${added === 1 ? '' : 's'} from ${o.no} to your cart.${skipped.length ? ' Unavailable: ' + skipped.join(', ') + '.' : ''} Current prices apply.`); ctx.redirect('/cart');
});
route('GET', '/account/addresses', (ctx) => { if (!requireUser(ctx)) return; ctx.sendPage(UP.addressesPage(ctx, { addresses: ctx.user.addresses || [] })); });
route('POST', '/account/addresses', (ctx) => {
  if (!requireUser(ctx)) return; const b = ctx.body; const a = { id: 'A' + rid(4), label: String(b.label || '').slice(0, 30), name: String(b.name || '').trim().slice(0, 80), phone: normPhone(b.phone), line1: String(b.line1 || '').trim().slice(0, 150), line2: String(b.line2 || '').trim().slice(0, 150), city: String(b.city || '').trim().slice(0, 60), state: String(b.state || ''), pin: String(b.pin || '').trim() };
  if (!a.name || !isPhone(a.phone) || a.line1.length < 5 || !a.city || !isPin(a.pin) || !require('./views/ui').STATES_IN.includes(a.state)) return ctx.sendPage(UP.addressesPage(ctx, { addresses: ctx.user.addresses || [], errors: { _: 'Please complete all required fields with a valid mobile number and PIN code.' } }), 422);
  ctx.user.addresses = (ctx.user.addresses || []).concat(a).slice(-10); saveUsers(); ctx.setFlash('success', 'Address saved.'); ctx.redirect('/account/addresses');
});
route('POST', '/account/addresses/:id/delete', (ctx) => { if (!requireUser(ctx)) return; ctx.user.addresses = (ctx.user.addresses || []).filter((a) => a.id !== ctx.params.id); saveUsers(); ctx.redirect('/account/addresses'); });
route('GET', '/account/wishlist', (ctx) => { if (!requireUser(ctx)) return; ctx.sendPage(UP.wishlistPage(ctx, { items: (ctx.user.wishlist || []).map((s) => catalogue.bySlug(s)).filter(Boolean) })); });
route('POST', '/wishlist/toggle', (ctx) => {
  if (!ctx.user) return ctx.redirect('/account/login'); const slug = String(ctx.body.slug || ''); if (!catalogue.bySlug(slug)) return notFound(ctx);
  const w = ctx.user.wishlist || (ctx.user.wishlist = []); const i = w.indexOf(slug); if (i >= 0) w.splice(i, 1); else w.push(slug); saveUsers();
  if (ctx.wantsJson()) return ctx.json({ ok: true, on: i < 0 }); ctx.redirect(safeBack(ctx.body.back, '/account/wishlist'));
});
const listOptions = () => catalogue.products.filter((p) => !p.rx).flatMap((p) => p.variants.map((v) => ({ value: v.sku, label: `${p.title} - ${v.label}` }))).slice(0, 400);
route('GET', '/account/lists', (ctx) => { if (!requireUser(ctx)) return; ctx.sendPage(UP.listsPage(ctx, { lists: ctx.user.lists || [], options: listOptions() })); });
route('POST', '/account/lists', (ctx) => { if (!requireUser(ctx)) return; const name = String(ctx.body.name || '').trim().slice(0, 50); if (name) { (ctx.user.lists = ctx.user.lists || []).push({ id: 'L' + rid(4), name, items: [] }); saveUsers(); } ctx.redirect('/account/lists'); });
route('POST', '/account/lists/add', (ctx) => { if (!requireUser(ctx)) return; const l = (ctx.user.lists || []).find((x) => x.id === ctx.body.list); if (l && catalogue.bySku(ctx.body.sku)) { const ex = l.items.find((i) => i.sku === ctx.body.sku); if (ex) ex.qty = Math.min(10, ex.qty + 1); else l.items.push({ sku: ctx.body.sku, qty: 1 }); saveUsers(); } ctx.redirect('/account/lists'); });
route('POST', '/account/lists/:id/remove', (ctx) => { if (!requireUser(ctx)) return; const l = (ctx.user.lists || []).find((x) => x.id === ctx.params.id); if (l) { l.items = l.items.filter((i) => i.sku !== ctx.body.sku); saveUsers(); } ctx.redirect('/account/lists'); });
route('POST', '/account/lists/:id/delete', (ctx) => { if (!requireUser(ctx)) return; ctx.user.lists = (ctx.user.lists || []).filter((x) => x.id !== ctx.params.id); saveUsers(); ctx.redirect('/account/lists'); });
route('POST', '/account/lists/:id/to-cart', (ctx) => { if (!requireUser(ctx)) return; const l = (ctx.user.lists || []).find((x) => x.id === ctx.params.id); if (l) l.items.forEach((i) => S_.addToCart(ctx.sid, i.sku, i.qty)); ctx.setFlash('success', 'List added to your cart.'); ctx.redirect('/cart'); });
route('GET', '/account/loyalty', (ctx) => { if (!requireUser(ctx)) return; ctx.sendPage(UP.loyaltyPage(ctx, { balance: loyalty.balance(ctx.user.id), entries: loyalty.entries(ctx.user.id), cfg: settings().loyalty })); });

// ---------------------------------------------------------------- pets & subscriptions
route('GET', '/pets', (ctx) => ctx.sendPage(UP.petsPage(ctx, { pets: ctx.pets, disclaimer: petsLib.DISCLAIMER })));
route('POST', '/pets', (ctx) => {
  if (!requireUser(ctx)) return; const { errors, pet } = petsLib.validatePet(ctx.body);
  if (errors.length) return ctx.sendPage(UP.petsPage(ctx, { pets: ctx.pets, disclaimer: petsLib.DISCLAIMER, errors, f: ctx.body }), 422);
  ctx.user.pets = (ctx.user.pets || []).concat({ id: 'P' + rid(4), ...pet }).slice(-10); saveUsers(); ctx.setFlash('success', `${pet.name} added.`); ctx.redirect('/pets');
});
route('POST', '/pets/:id/delete', (ctx) => { if (!requireUser(ctx)) return; ctx.user.pets = (ctx.user.pets || []).filter((p) => p.id !== ctx.params.id); saveUsers(); ctx.redirect('/pets'); });
route('GET', '/pets/:id', (ctx) => { if (!requireUser(ctx)) return; const pet = ctx.pets.find((p) => p.id === ctx.params.id); if (!pet) return notFound(ctx); ctx.sendPage(UP.petRecs(ctx, { pet, items: petsLib.recommend(catalogue.products, pet, 12), disclaimer: petsLib.DISCLAIMER })); });
route('GET', '/subscriptions', (ctx) => ctx.sendPage(UP.subscriptionsPage(ctx, { subs: ctx.user ? subscriptions.forUser(ctx.user.id) : [] })));
route('GET', '/subscriptions/new', (ctx) => { const x = catalogue.bySku(String(ctx.query.sku || '')); if (!x || x.product.rx) return notFound(ctx); ctx.sendPage(UP.subscriptionNew(ctx, x)); });
route('POST', '/subscriptions', (ctx) => {
  if (!requireUser(ctx)) return; const x = catalogue.bySku(String(ctx.body.sku || '')); if (!x || x.product.rx) return notFound(ctx);
  try { subscriptions.create({ userId: ctx.user.id, sku: x.variant.sku, title: x.product.title, variantLabel: x.variant.label, qty: ctx.body.qty, intervalDays: ctx.body.intervalDays }); ctx.setFlash('success', 'Schedule saved. No payment is taken automatically; we will remind you when it is due.'); } catch (e) { ctx.setFlash('error', 'Could not save the schedule: ' + e.message); }
  ctx.redirect('/subscriptions');
});
for (const [act, st] of [['pause', 'paused'], ['resume', 'active'], ['cancel', 'cancelled']]) route('POST', `/subscriptions/:id/${act}`, (ctx) => { if (!requireUser(ctx)) return; subscriptions.setStatus(ctx.params.id, ctx.user.id, st); ctx.redirect('/subscriptions'); });
route('POST', '/subscriptions/:id/add-to-cart', (ctx) => { if (!requireUser(ctx)) return; const s = subscriptions.forUser(ctx.user.id).find((x) => x.id === ctx.params.id); if (s) { const r = S_.addToCart(ctx.sid, s.sku, s.qty); ctx.setFlash(r.ok ? 'success' : 'error', r.ok ? 'Added to your cart. You choose when to pay.' : r.error); } ctx.redirect('/cart'); });

// ---------------------------------------------------------------- webhooks (raw body, signature verified, idempotent, retried)
const handlers = {
  razorpay: async (ev) => {
    const p = ev.payload; const pay = p.payload && p.payload.payment && p.payload.payment.entity;
    if (/^(payment\.captured|order\.paid)$/.test(p.event) && pay) { const o = orders.findByGatewayOrder(pay.order_id); if (!o) throw new Error('Unknown gateway order ' + pay.order_id); orders.markPaid(o.no, { gateway: 'razorpay', paymentId: pay.id, amountRupees: pay.amount / 100, key: 'pay:' + pay.id }); }
    else if (p.event === 'payment.failed') ilog.log('razorpay', 'info', 'payment.failed received', { gatewayOrder: pay && pay.order_id });
  },
  cashfree: async (ev) => {
    const p = ev.payload; const d = p.data || {};
    if (p.type === 'PAYMENT_SUCCESS_WEBHOOK' && d.order && d.payment) { const o = orders.get(d.order.order_id); if (!o) throw new Error('Unknown order ' + d.order.order_id); orders.markPaid(o.no, { gateway: 'cashfree', paymentId: String(d.payment.cf_payment_id), amountRupees: Number(d.payment.payment_amount), key: 'pay:cf:' + d.payment.cf_payment_id }); }
  },
  shiprocket: async (ev) => {
    const p = ev.payload; const ad = shipping.adapters.shiprocket; const to = ad.mapStatus(p); const o = orders.get(String(p.order_id || p.channel_order_id || '').toUpperCase());
    if (!o) throw new Error('Unknown order ' + p.order_id);
    if (p.awb && !o.shipment.awb) { o.shipment.awb = String(p.awb); o.shipment.courier = p.courier_name || o.shipment.courier; orders.persist(); }
    if (to) { let cur = o.state; const path_ = { shipped: ['packed', 'shipped'], out_for_delivery: ['packed', 'shipped', 'out_for_delivery'], delivered: ['packed', 'shipped', 'out_for_delivery', 'delivered'], rto: ['packed', 'shipped', 'rto'] }[to]; for (const st of path_) { if (st === cur) continue; if (orders.get(o.no).state === st) continue; try { orders.transition(o.no, st, { actor: 'shiprocket', key: `sr:${p.awb || ''}:${st}`, note: p.current_status }); } catch (e) { if (e.code !== 'BAD_TRANSITION') throw e; } } }
    o.shipment.events.push({ ts: new Date().toISOString(), status: p.current_status || '' }); orders.persist();
  },
  shopify: async () => { /* recorded for audit; automatic application is intentionally not implemented - see shopify/WEBHOOKS.md */ },
};
async function webhookRoute(ctx, source, verify, parse, eventIdFn, topicFn) {
  if (!ctx.limit('webhook', 600, 60000)) return;
  if (!verify()) { ilog.log(source, 'warn', 'Webhook signature/token verification failed', { ip: ctx.ip }); return ctx.text('invalid signature', 401); }
  let payload; try { payload = JSON.parse(ctx.rawBody); } catch { return ctx.text('bad json', 400); }
  const eid = eventIdFn(payload); if (eid && webhookLog.seen(source, eid)) return ctx.json({ ok: true, duplicate: true });
  const ev = webhookLog.record(source, eid, topicFn(payload), { keys: Object.keys(payload).slice(0, 10) }); ev.payload = payload;
  await webhookLog.process(ev, handlers[source]); delete ev.payload; ev.payload = { summary: topicFn(payload) }; store.save('webhook_events');
  ctx.json({ ok: true, status: ev.status });
}
route('POST', '/webhooks/razorpay', (ctx) => webhookRoute(ctx, 'razorpay', () => payments.adapters.razorpay.verifyWebhook(ctx.rawBody, ctx.req.headers['x-razorpay-signature']), null, () => ctx.req.headers['x-razorpay-event-id'] || null, (p) => p.event), { raw: true });
route('POST', '/webhooks/cashfree', (ctx) => webhookRoute(ctx, 'cashfree', () => payments.adapters.cashfree.verifyWebhook(ctx.rawBody, ctx.req.headers['x-webhook-signature'], ctx.req.headers['x-webhook-timestamp']), null, (p) => (p.data && p.data.payment ? 'cf:' + p.data.payment.cf_payment_id + ':' + p.type : null), (p) => p.type), { raw: true });
route('POST', '/webhooks/shiprocket', (ctx) => webhookRoute(ctx, 'shiprocket', () => shipping.adapters.shiprocket.verifyWebhook(ctx.req.headers), null, (p) => (p.awb ? `sr:${p.awb}:${p.current_status}:${p.current_timestamp || ''}` : null), (p) => p.current_status || 'shipment'), { raw: true });
route('POST', '/webhooks/shopify/:topic', (ctx) => webhookRoute(ctx, 'shopify', () => verifyShopify(ctx.rawBody, ctx.req.headers['x-shopify-hmac-sha256'], process.env.SHOPIFY_WEBHOOK_SECRET), null, () => ctx.req.headers['x-shopify-webhook-id'] || null, () => String(ctx.req.headers['x-shopify-topic'] || ctx.params.topic)), { raw: true });

// ---------------------------------------------------------------- admin
A.register({ route, ctx_: { S_, cfg, send, safeBack, notFound }, content });

// ---------------------------------------------------------------- dispatcher
async function handle(req, res) {
  const url = new URL(req.url, 'http://x'); let ctx;
  try {
    if (url.pathname.startsWith('/assets/')) { if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'Method not allowed'); const rel = decodeURIComponent(url.pathname.slice(8)); if (rel.includes('\0') || !serveStatic(req, res, rel, url.searchParams.has('v'))) send(res, 404, 'Not found', { 'Content-Type': 'text/plain' }); return; }
    ctx = makeCtx(req, res, url);
    if (!ctx.limit('global', req.method === 'GET' ? 600 : 120, 60000)) return;
    let match = null;
    for (const r of routes) { if (r.method !== (req.method === 'HEAD' ? 'GET' : req.method)) continue; const m = r.re.exec(url.pathname); if (m) { match = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; break; } }
    if (!match) { if (['GET', 'HEAD'].includes(req.method)) return notFound(ctx); return ctx.text('Not found', 404); }
    ctx.params = match.params;
    if (req.method === 'POST') {
      const isHook = url.pathname.startsWith('/webhooks/'); const buf = await readBody(req, isHook ? 1048576 : 204800); ctx.rawBody = buf.toString('utf8');
      const ct = String(req.headers['content-type'] || '');
      if (!isHook) { try { ctx.body = /json/.test(ct) ? JSON.parse(ctx.rawBody || '{}') : parseForm(ctx.rawBody); } catch { return ctx.text('Bad request', 400); } if (!csrfOk(ctx.session, ctx.body._csrf || req.headers['x-csrf-token'])) { if (ctx.wantsJson()) return ctx.json({ ok: false, message: 'Your session expired. Please reload the page.' }, 403); return ctx.sendPage({ title: 'Session expired', noindex: true, body: h`<div class="wrap narrow"><h1>Your session expired</h1><p>For your security the form could not be submitted. Please go back, reload the page and try again.</p><p><a class="btn btn-primary" href="/">Home</a></p></div>` }, 403); } }
    }
    await match.r.handler(ctx);
  } catch (e) {
    const status = e.status || 500; if (status >= 500) { console.error('[error]', req.method, req.url, e); try { ilog.log('app', 'error', `${req.method} ${url.pathname}: ${e.message}`); } catch { /* ignore */ } }
    if (!res.headersSent) { try { if (ctx && status !== 413) ctx.sendPage({ title: 'Something went wrong', noindex: true, body: h`<div class="wrap narrow center"><h1>Something went wrong</h1><p class="lead">We hit a problem. Please try again.</p><p><a class="btn btn-primary" href="/">Back to home</a></p></div>` }, status); else send(res, status, status === 413 ? 'Payload too large' : 'Server error', { 'Content-Type': 'text/plain' }); } catch { try { res.writeHead(500); res.end('Server error'); } catch { /* ignore */ } } }
  }
}

function start(port = cfg.port) {
  const server = http.createServer(handle);
  server.requestTimeout = 30000; server.headersTimeout = 15000; server.keepAliveTimeout = 5000;
  // Background jobs: release expired reservations, retry failed webhooks, prune sessions.
  const timers = [setInterval(() => { try { const r = orders.sweepExpired(); if (r.length) console.log('[sweep] cancelled unpaid orders:', r.join(', ')); webhookLog.retryDue(handlers).catch(() => {}); sessions.prune(); } catch (e) { console.error('[sweep]', e); } }, 60000)];
  timers.forEach((t) => t.unref());
  S_.startupSweep();
  return new Promise((resolve) => server.listen(port, () => { console.log(`\n  ${cfg.brand.name} store running at ${cfg.siteUrl.replace(/:\d+$/, '')}:${port}  (NODE_ENV=${process.env.NODE_ENV || 'development'})`); console.log(`  Demo catalogue notice: ${cfg.demoCatalogue ? 'ON' : 'off'}   DEV mock payment: ${cfg.devMockPayment ? 'ON (dev only)' : 'off'}`); if (cfg.adminUser && cfg.adminPass) console.log(`  Admin: /admin  user "${cfg.adminUser}"${cfg.adminIsDevDefault ? `  password "${cfg.adminPass}"  (DEV DEFAULT - set ADMIN_PASS)` : ''}`); else console.log('  Admin DISABLED: set ADMIN_USER and ADMIN_PASS'); resolve(server); }));
}
module.exports = { start, handle, S_ };
if (require.main === module) start();
