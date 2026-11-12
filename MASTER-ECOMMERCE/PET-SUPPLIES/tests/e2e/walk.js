'use strict';
/* Playwright end-to-end walk against a fresh server instance (temp data dir, DEV mock payment). Run: npm run e2e */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..', '..'); const SHOTS = path.join(ROOT, 'documentation', 'screenshots'); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4210; const BASE = `http://localhost:${PORT}`; const results = []; const consoleErrors = []; const overflow = [];
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-e2e-'));
const ADMIN = { username: 'admin', password: 'e2e-admin-pass' };
async function step(name, fn) { const t = Date.now(); try { await fn(); results.push({ name, ok: true, ms: Date.now() - t }); console.log('  PASS', name); } catch (e) { results.push({ name, ok: false, error: String(e.message).split('\n')[0].slice(0, 300) }); console.log('  FAIL', name, '-', String(e.message).split('\n')[0].slice(0, 300)); } }

(async () => {
  const srv = spawn('node', ['frontend/server.js'], { cwd: ROOT, env: { ...process.env, PH_SKIP_DOTENV: '1', PORT: String(PORT), SITE_URL: BASE, DATA_DIR: dataDir, RATE_LIMIT_MULT: '50', DEV_MOCK_PAYMENT: '1', NODE_ENV: 'development', ADMIN_USER: ADMIN.username, ADMIN_PASS: ADMIN.password, WHATSAPP_NUMBER: '919999999999' }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
  const browser = await chromium.launch();
  const mkCtx = async (opts = {}) => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts }); await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); return c; };
  const watch = (page, label) => { page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.|Failed to load resource/.test(m.text())) consoleErrors.push(`${label}: ${m.text()}`); }); page.on('response', (r) => { const t = r.request().resourceType(); if (r.status() >= 400 && ['image', 'script', 'stylesheet', 'fetch', 'xhr'].includes(t) && !/fonts\.g/.test(r.url())) consoleErrors.push(`${label}: ${r.status()} ${t} ${r.url()}`); }); page.on('pageerror', (e) => consoleErrors.push(`${label}: PAGEERROR ${e.message}`)); };
  const ctx = await mkCtx(); const page = await ctx.newPage(); watch(page, 'main');
  const adminCtx = await mkCtx({ httpCredentials: ADMIN }); const admin = await adminCtx.newPage(); watch(admin, 'admin');
  let orderNo; let codNo; const phone = '9876543210'; const email = 'e2e@example.com';
  const fillCheckout = async (p, payment) => {
    await p.fill('#co-email', email); await p.fill('#co-phone', phone); await p.fill('#co-name', 'Asha Verma'); await p.fill('#co-line1', '12 Park Street, Flat 4B'); await p.fill('#co-pin', '110001'); await p.fill('#co-city', 'New Delhi'); await p.selectOption('#co-state', 'Delhi'); await p.waitForTimeout(500);
    await p.check('input[name=terms]'); if (payment) await p.check(`input[name=payment][value=${payment}]`);
  };
  const addProduct = async (slug) => { await page.goto(`${BASE}/products/${slug}`); await page.click('#atc'); await page.waitForSelector('[data-toast]:not([hidden])'); };

  await step('home: one h1, title, JSON-LD (Organization + WebSite/SearchAction), no fake ratings', async () => {
    await page.goto(BASE + '/'); assert.equal(await page.locator('h1').count(), 1); assert.match(await page.title(), /Paw & Hearth/);
    const ld = await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)));
    assert.ok(ld.some((x) => x['@type'] === 'Organization')); assert.ok(ld.some((x) => x['@type'] === 'WebSite' && x.potentialAction['@type'] === 'SearchAction'));
    const html = await page.content(); assert.ok(!/aggregateRating/.test(html)); assert.match(await page.locator('#reviews-h').locator('xpath=ancestor::section').innerText(), /No reviews yet/);
    assert.match(await page.locator('#brands-h').locator('xpath=ancestor::section').innerText(), /Brand partners will be listed/);
  });
  await step('home sections appear in the specified order', async () => {
    const ids = await page.$$eval('main section[aria-labelledby]', (s) => s.map((x) => x.getAttribute('aria-labelledby').replace(/-h$/, '')));
    const want = ['hero', 'pet', 'cats', 'featured', 'food', 'walk', 'beds', 'toys', 'feeders', 'grooming', 'new', 'offers', 'brands', 'guides', 'reviews', 'news'];
    assert.deepEqual(ids.filter((i) => want.includes(i)), want);
  });
  await step('dog/cat navigation + mega menu', async () => {
    await page.hover('.primary .has-mega:first-child > a'); await page.waitForSelector('#mega-dog', { state: 'visible' });
    await page.click('#mega-dog a[href^="/collections/dog-dry-food"]'); assert.match(page.url(), /dog-dry-food/); assert.equal(await page.locator('h1').count(), 1);
    await page.goto(BASE + '/cats'); assert.match(await page.locator('h1').innerText(), /cat/i); await page.goto(BASE + '/dogs'); assert.match(await page.locator('h1').innerText(), /dog/i);
  });
  await step('filters (dog: brand/age/size/price...) + sort; cat facets', async () => {
    await page.goto(BASE + '/collections/dog-supplies'); const facets = await page.$$eval('.facet legend', (l) => l.map((x) => x.textContent)); for (const f of ['Category', 'Brand', 'Age', 'Size', 'Breed', 'Pet weight', 'Price']) assert.ok(facets.includes(f), 'dog facet ' + f);
    const cnt = async () => +(/(\d+) result/.exec(await page.locator('.list-tools .small').innerText())[1]); const before = await cnt(); await page.check('#filters input[name=age][value=puppy]'); await page.waitForURL(/age=puppy/); const after = await cnt(); assert.ok(after > 0 && after < before, `${after} < ${before}`);
    await page.goto(BASE + '/collections/dog-supplies?sort=price-asc'); const prices = await page.$$eval('.product-grid .price-now', (e) => e.map((x) => +x.textContent.replace(/[^0-9]/g, ''))); assert.ok(prices.slice(0, 10).every((p, i, a) => i === 0 || a[i - 1] <= p));
    await page.goto(BASE + '/collections/cat-supplies'); const cf = await page.$$eval('.facet legend', (l) => l.map((x) => x.textContent)); for (const f of ['Age', 'Food preference', 'Litter type', 'Brand']) assert.ok(cf.includes(f), 'cat facet ' + f);
    await page.goto(BASE + '/collections/litter?litter=Clumping'); assert.ok((await page.locator('.product-grid > li').count()) >= 1);
  });
  await step('rx categories flagged and not purchasable', async () => {
    await page.goto(BASE + '/collections/vet-diet-dog'); assert.match(await page.locator('.callout-rx').first().innerText(), /not sold online|cannot/i); assert.equal(await page.locator('.product-card .add-form').count(), 0);
    await page.goto(BASE + '/products/demo-veterinary-renal-diet-rx-listing'); assert.equal(await page.locator('#buy-form').count(), 0); assert.ok(!(await page.content()).includes('"offers"'), 'no offers JSON-LD for Rx');
    const csrf = await page.getAttribute('meta[name=csrf-token]', 'content'); const r = await page.request.post(BASE + '/cart/add', { form: { sku: 'PH-011-01', _csrf: csrf }, headers: { accept: 'application/json' } }); assert.ok(r.status() >= 400);
  });
  await step('search + suggestions endpoint', async () => {
    await page.goto(BASE + '/'); await page.fill('#q', 'harness'); await page.waitForSelector('#suggest:not([hidden]) a'); assert.ok((await page.locator('#suggest a').count()) >= 1);
    await page.press('#q', 'Enter'); await page.waitForURL(/search\?q=harness/); assert.ok((await page.locator('.product-grid > li').count()) >= 2);
    await page.goto(BASE + '/search?q=zzzzqq'); assert.match(await page.locator('main').innerText(), /No products found/);
  });
  await step('product page: variants, PIN check, SEO, no ratings, demo notice', async () => {
    await page.goto(BASE + '/products/no-pull-front-clip-dog-harness'); const p1 = await page.locator('#price-block .price-now').innerText();
    await page.click('.pill-opt:has-text("XL")'); const p2 = await page.locator('#price-block .price-now').innerText(); assert.notEqual(p1, p2);
    await page.fill('#pdp-pin', '560001'); await page.click('[data-pin-check] button'); await page.waitForFunction(() => /Delivery to 560001/.test(document.querySelector('.pin-result').textContent)); assert.match(await page.locator('.pin-result').innerText(), /not courier-verified/);
    await page.fill('#pdp-pin', '123'); await page.click('[data-pin-check] button'); assert.match(await page.locator('.pin-result').innerText(), /valid 6-digit/);
    assert.match(await page.locator('.demo-note').innerText(), /Demo catalogue/); assert.match(await page.locator('#reviews').innerText(), /No reviews yet/);
    const ld = await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent))); const prod = ld.find((x) => x['@type'] === 'Product'); assert.ok(prod.offers && (prod.offers.priceCurrency === 'INR')); assert.ok(!prod.aggregateRating); assert.ok(ld.some((x) => x['@type'] === 'BreadcrumbList')); assert.ok(ld.some((x) => x['@type'] === 'FAQPage'));
    assert.ok(await page.locator('link[rel=canonical]').getAttribute('href')); assert.ok(await page.locator('meta[property="og:title"]').count());
  });
  await step('add to cart (ajax), cart drawer, update quantity', async () => {
    await page.goto(BASE + '/products/chicken-and-rice-adult-dry-dog-food'); await page.click('#atc'); await page.waitForSelector('[data-toast]:not([hidden])'); assert.equal((await page.locator('.cart-btn .cart-count').innerText()).trim(), '1');
    await page.waitForSelector('#cart-drawer.open .cart-line'); await page.click('#cart-drawer [aria-label^="Increase quantity"]'); await page.waitForFunction(() => document.querySelector('#cart-drawer .qty-n') && /^2/.test(document.querySelector('#cart-drawer .qty-n').textContent)); await page.keyboard.press('Escape');
    await page.goto(BASE + '/cart'); assert.match(await page.locator('.totals').innerText(), /Subtotal/);
  });
  await step('coupon: valid applied, expired rejected', async () => {
    await page.goto(BASE + '/cart'); await page.fill('#coupon-code', 'WELCOME10'); await page.click('.coupon-form button'); assert.match(await page.locator('.coupon-form.applied').innerText(), /WELCOME10/); assert.match(await page.locator('.totals').innerText(), /Coupon/);
    await page.click('.coupon-form.applied button'); await page.fill('#coupon-code', 'EXPIRED5'); await page.click('.coupon-form button'); assert.match(await page.locator('.flash').innerText(), /expired/i);
  });
  await step('checkout validation errors; COD refused while disabled (UI + server)', async () => {
    await page.goto(BASE + '/checkout'); assert.equal(await page.locator('input[name=payment][value=cod]').isDisabled(), true); assert.match(await page.locator('[data-cod-opt]').innerText(), /unavailable/i);
    await page.fill('#co-email', 'bad'); await page.check('input[name=terms]'); await page.evaluate(() => { document.querySelector('[data-checkout]').noValidate = true; }); await page.click('[data-pay-btn]'); assert.match(await page.locator('main').innerText(), /valid email/i);
    await page.goto(BASE + '/checkout'); const csrf = await page.getAttribute('meta[name=csrf-token]', 'content');
    const r = await page.request.post(BASE + '/checkout', { form: { _csrf: csrf, email, phone, name: 'Asha Verma', line1: '12 Park Street', city: 'Delhi', state: 'Delhi', pin: '110001', payment: 'cod', terms: '1' } }); const body = await r.text(); assert.equal(r.status(), 422); assert.match(body, /Cash on delivery is currently unavailable/);
  });
  await step('checkout prepaid via DEV mock gateway: loud label, fail then success -> paid', async () => {
    await page.goto(BASE + '/checkout'); await fillCheckout(page, 'prepaid'); assert.match(await page.locator('.pay-opt').first().innerText(), /DEV MOCK PAYMENT/); await page.click('[data-pay-btn]'); await page.waitForURL(/\/pay\/PH-/); assert.match(await page.locator('.callout-dev').innerText(), /DEV MOCK PAYMENT/);
    orderNo = /\/pay\/(PH-\d+)/.exec(page.url())[1]; await page.click('button[value=fail]'); assert.match(await page.locator('.flash').innerText(), /failed/i); await page.click('button[value=success]'); await page.waitForURL(/\/order\/PH-/);
    assert.match(await page.locator('.status-pill').innerText(), /Paid/); assert.equal(await page.locator('.cart-btn .cart-count').isVisible(), false);
  });
  await step('tracking by order number + phone; wrong details rejected', async () => {
    await page.goto(BASE + '/track'); await page.fill('#tr-no', orderNo); await page.fill('#tr-contact', phone); await page.click('form[action="/track"] button'); assert.match(await page.locator('.order-detail').innerText(), new RegExp(orderNo));
    await page.goto(BASE + '/track'); await page.fill('#tr-no', orderNo); await page.fill('#tr-contact', 'wrong@example.com'); await page.click('form[action="/track"] button'); assert.match(await page.locator('main').innerText(), /could not find/);
  });
  await step('admin: auth required, enable COD, low stock, coupons, integrations honest, CSV, pack order', async () => {
    const anon = await (await browser.newContext()).newPage(); const resp = await anon.goto(BASE + '/admin'); assert.equal(resp.status(), 401);
    await admin.goto(BASE + '/admin'); assert.match(await admin.locator('h1').innerText(), /Dashboard/);
    await admin.goto(BASE + '/admin/settings'); await admin.check('input[name=codEnabled]'); await admin.click('form[action="/admin/settings"] button.btn-primary'); assert.match(await admin.locator('.flash').innerText(), /COD is now ENABLED/);
    await admin.goto(BASE + '/admin/low-stock'); assert.match(await admin.locator('main').innerText(), /Low stock report/); await admin.goto(BASE + '/admin/inventory?q=PH-001');
    await admin.goto(BASE + '/admin/coupons'); assert.match(await admin.locator('main').innerText(), /WELCOME10/); await admin.goto(BASE + '/admin/integrations'); const t = await admin.locator('main').innerText(); assert.match(t, /not configured/); assert.match(t, /Honest status/); assert.match(t, /DEV mock gateway/);
    await admin.goto(BASE + '/admin/logs'); const csv = await (await admin.request.get(BASE + '/admin/export/orders.csv')).text(); assert.match(csv, new RegExp(orderNo));
    await admin.goto(BASE + '/admin/orders/' + orderNo); await admin.selectOption('#to', 'packed'); await admin.click('form[action$="/transition"] button'); assert.match(await admin.locator('main').innerText(), /Packed/);
  });
  await step('COD order succeeds when enabled (fee shown); over-limit COD refused', async () => {
    await addProduct('peanut-butter-biscuit-dog-treats'); await page.goto(BASE + '/checkout'); await fillCheckout(page, 'cod'); assert.match(await page.locator('[data-cod-opt]').innerText(), /COD fee/); await page.click('[data-pay-btn]'); await page.waitForURL(/\/order\/PH-/);
    codNo = /order\/(PH-\d+)/.exec(page.url())[1]; assert.match(await page.locator('.status-pill').innerText(), /COD confirmed/); assert.match(await page.locator('.totals').innerText(), /COD fee/);
    await page.goto(BASE + '/products/high-density-foam-dog-bed'); await page.fill('#qty', '4'); await page.click('#atc'); await page.waitForSelector('[data-toast]:not([hidden])'); await page.goto(BASE + '/checkout'); assert.equal(await page.locator('input[name=payment][value=cod]').isDisabled(), true); assert.match(await page.locator('[data-cod-opt]').innerText(), /up to Rs 5000/);
    await page.goto(BASE + '/cart'); await page.click('button[aria-label^="Remove"]'); await page.waitForURL(/\/cart/); assert.match(await page.locator('main').innerText(), /cart is empty/);
  });
  await step('order lifecycle via admin; courier shipment honestly not configured', async () => {
    await admin.goto(BASE + '/admin/orders/' + codNo); await admin.selectOption('#to', 'packed'); await admin.click('form[action$="/transition"] button'); await admin.click('form[action$="/shipment"] button'); assert.match(await admin.locator('.flash').innerText(), /no courier|not configured/i);
    for (const s of ['shipped', 'out_for_delivery', 'delivered']) { await admin.selectOption('#to', s); await admin.click('form[action$="/transition"] button'); }
    assert.match(await admin.locator('main').innerText(), /Delivered/);
  });
  await step('account: register (consent required), pets, suits-my-pet, disclaimer', async () => {
    await page.goto(BASE + '/account/register'); await page.fill('#rg-name', 'Asha Verma'); await page.fill('#rg-email', email); await page.fill('#rg-phone', phone); await page.fill('#rg-pw', 'short'); await page.evaluate(() => { document.querySelector('form[action="/account/register"]').noValidate = true; }); await page.click('form[action="/account/register"] button.btn-primary'); assert.match(await page.locator('main').innerText(), /at least 8|privacy policy/i);
    await page.fill('#rg-pw', 'correct-horse-1'); await page.check('input[name=privacy]'); await page.click('form[action="/account/register"] button.btn-primary'); await page.waitForURL(/\/account$/); assert.match(await page.locator('h1').innerText(), /Hello, Asha/);
    await page.goto(BASE + '/pets'); assert.match(await page.locator('.callout').first().innerText(), /not veterinary advice/i); await page.selectOption('#pt-type', 'dog'); await page.fill('#pt-name', 'Bruno'); await page.fill('#pt-age', '0.5'); await page.fill('#pt-wt', '6'); await page.click('form[action="/pets"] button.btn-primary'); assert.match(await page.locator('.pet-profile').innerText(), /Bruno[\s\S]*puppy/);
    await page.click('text=Products that suit Bruno'); assert.ok((await page.locator('.product-grid > li').count()) >= 1); assert.match(await page.locator('.callout').innerText(), /not veterinary advice/i);
    await page.goto(BASE + '/collections/dog-supplies'); await page.selectOption('#for', { index: 1 }); await page.waitForURL(/for=/); assert.match(await page.locator('main').innerText(), /type, age group and size only/);
    await page.goto(BASE + '/products/puppy-dry-food-chicken-and-milk'); assert.match(await page.locator('.suit-box').innerText(), /Bruno/);
  });
  await step('subscription setup stores schedule and never charges / creates an order', async () => {
    const before = (await (await admin.request.get(BASE + '/admin/export/orders.csv')).text()).split('\n').length;
    await page.goto(BASE + '/products/chicken-and-rice-adult-dry-dog-food'); await page.click('#sub-link'); assert.match(await page.locator('.callout-rx').innerText(), /not be charged/i); await page.click('form[action="/subscriptions"] button.btn-primary');
    assert.match(await page.locator('main').innerText(), /Recurring payment is not enabled/); assert.match(await page.locator('.order-list').innerText(), /Chicken & Rice/);
    const after = (await (await admin.request.get(BASE + '/admin/export/orders.csv')).text()).split('\n').length; assert.equal(after, before); await admin.goto(BASE + '/admin/subscriptions'); assert.match(await admin.locator('main').innerText(), /disabled/);
  });
  await step('wishlist, saved address, shopping list, loyalty page', async () => {
    await page.goto(BASE + '/products/natural-rubber-chew-ball'); await page.click('.pdp-links .wish'); await page.goto(BASE + '/account/wishlist'); assert.match(await page.locator('.acct-main').innerText(), /Rubber Chew Ball/);
    await page.goto(BASE + '/account/addresses'); await page.fill('#ad-name', 'Asha'); await page.fill('#ad-phone', phone); await page.fill('#ad-line1', '12 Park Street'); await page.fill('#ad-pin', '110001'); await page.fill('#ad-city', 'Delhi'); await page.selectOption('#ad-state', 'Delhi'); await page.click('form[action="/account/addresses"] button.btn-primary'); assert.match(await page.locator('.addr-list').innerText(), /12 Park Street/);
    await page.goto(BASE + '/account/lists'); await page.fill('#ln', 'Monthly'); await page.click('form[action="/account/lists"] button'); assert.match(await page.locator('.acct-main').innerText(), /Monthly/);
    await page.goto(BASE + '/account/loyalty'); assert.match(await page.locator('.acct-main').innerText(), /Points balance/);
  });
  await step('logged-in order -> delivered -> loyalty points earned -> reorder + redeem option', async () => {
    await page.goto(BASE + '/products/natural-rubber-chew-ball'); await page.click('#atc'); await page.waitForSelector('[data-toast]:not([hidden])'); await page.goto(BASE + '/checkout'); await fillCheckout(page, 'cod'); await page.click('[data-pay-btn]'); await page.waitForURL(/\/order\/PH-/); const no = /order\/(PH-\d+)/.exec(page.url())[1];
    await admin.goto(BASE + '/admin/orders/' + no); for (const s of ['packed', 'shipped', 'delivered']) { await admin.selectOption('#to', s); await admin.click('form[action$="/transition"] button'); }
    await page.goto(BASE + '/account/orders'); assert.match(await page.locator('.order-list').innerText(), new RegExp(no)); await page.click('.order-row form button'); await page.waitForURL(/\/cart/); assert.match(await page.locator('.cart-lines').innerText(), /Chew Ball/);
    await page.goto(BASE + '/account/loyalty'); assert.match(await page.locator('.acct-main .stat-n').innerText(), /^[1-9]/); await page.goto(BASE + '/cart'); assert.match(await page.locator('.cart-extras').innerText(), /Points balance/);
  });
  await step('reviews: submit -> pending (hidden, no rating) -> admin approve -> shown + aggregateRating', async () => {
    const slug = 'natural-rubber-chew-ball'; await page.goto(`${BASE}/products/${slug}`); await page.click('.review-form summary'); await page.fill('#rv-name', 'Asha'); await page.selectOption('#rv-rating', '4'); await page.fill('#rv-body', 'Sturdy ball, my dog likes it a lot.'); await page.click('.review-form button.btn-primary');
    assert.match(await page.locator('.flash').innerText(), /awaiting moderation/); assert.match(await page.locator('#reviews').innerText(), /No reviews yet/); assert.ok(!(await page.content()).includes('aggregateRating'));
    await admin.goto(BASE + '/admin/reviews'); assert.match(await admin.locator('main').innerText(), /Sturdy ball/); await admin.click('button[value=approve]'); await page.goto(`${BASE}/products/${slug}`); assert.match(await page.locator('#reviews').innerText(), /Sturdy ball/); assert.ok((await page.content()).includes('aggregateRating'));
  });
  await step('newsletter consent + contact form stored; visible in admin', async () => {
    await page.goto(BASE + '/'); await page.fill('#nl-email', 'news@example.com'); await page.check('input[name=consent]'); await page.click('.inline-form button'); assert.match(await page.locator('.flash').innerText(), /not connected/i);
    await page.goto(BASE + '/contact'); await page.fill('#c-name', 'Asha'); await page.fill('#c-email', email); await page.fill('#c-msg', 'Hello there team'); await page.click('form[action="/contact"] button'); await admin.goto(BASE + '/admin/enquiries'); const t = await admin.locator('main').innerText(); assert.match(t, /news@example.com/); assert.match(t, /Hello there team/);
  });
  await step('security: CSRF, headers, gzip, cache, XSS escaped, webhook signatures rejected, login rate limit', async () => {
    const r = await page.request.post(BASE + '/cart/add', { form: { sku: 'PH-001-01' } }); assert.equal(r.status(), 403);
    const h = (await page.request.get(BASE + '/')).headers(); assert.match(h['content-security-policy'], /default-src 'self'/); assert.equal(h['x-content-type-options'], 'nosniff'); assert.equal(h['x-frame-options'], 'DENY');
    await page.goto(BASE + '/search?q=%3Cscript%3Ealert(1)%3C/script%3E'); assert.ok(!(await page.content()).includes('<script>alert(1)</script>'));
    const w = await page.request.post(BASE + '/webhooks/razorpay', { data: '{"event":"payment.captured"}', headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'bad' } }); assert.equal(w.status(), 401);
    const s = await page.request.post(BASE + '/webhooks/shopify/products-update', { data: '{}', headers: { 'content-type': 'application/json', 'x-shopify-hmac-sha256': 'bad' } }); assert.equal(s.status(), 401);
    const sr = await page.request.post(BASE + '/webhooks/shiprocket', { data: '{}', headers: { 'content-type': 'application/json' } }); assert.equal(sr.status(), 401);
    const gz = await fetch(BASE + '/', { headers: { 'accept-encoding': 'gzip' } }); assert.equal(gz.headers.get('content-encoding'), 'gzip'); const st = await fetch(BASE + '/assets/css/app.css?v=1'); assert.match(st.headers.get('cache-control'), /immutable/);
    const out = await page.request.post(BASE + '/account/logout', { form: { _csrf: await page.getAttribute('meta[name=csrf-token]', 'content') } });
    const c2 = await mkCtx(); const p2 = await c2.newPage(); await p2.goto(BASE + '/account/login'); const tok = await p2.getAttribute('meta[name=csrf-token]', 'content'); let last = 0; for (let i = 0; i < 15; i++) last = (await p2.request.post(BASE + '/account/login', { form: { _csrf: tok, email: 'x@y.z', password: 'nope' } })).status(); assert.equal(last, 429);
  });
  await step('SEO: robots, sitemap, unique titles, one h1, meta description, valid JSON-LD, img alt+dimensions', async () => {
    assert.match(await (await fetch(BASE + '/robots.txt')).text(), /Sitemap: http:\/\/localhost:4210\/sitemap.xml/); const sm = await (await fetch(BASE + '/sitemap.xml')).text(); assert.ok((sm.match(/<loc>/g) || []).length > 100);
    const pages = ['/', '/dogs', '/cats', '/collections/dog-food', '/collections/cat-food', '/collections/dog-collars', '/collections/dog-harnesses', '/collections/dog-beds', '/collections/dog-toys', '/collections/cat-toys', '/collections/automatic-pet-feeders', '/collections/pet-grooming-products', '/collections/cat-accessories', '/products/slow-feeder-bowl', '/blog', '/blog/home-grooming-basics', '/faq', '/about', '/policies/privacy', '/bundles'];
    const c3 = await mkCtx(); const q = await c3.newPage(); const titles = new Set();
    for (const u of pages) { await q.goto(BASE + u); const t = await q.title(); assert.ok(!titles.has(t), 'duplicate title ' + t); titles.add(t); assert.equal(await q.locator('h1').count(), 1, 'h1 count ' + u); const d = await q.getAttribute('meta[name=description]', 'content'); assert.ok(d && d.length > 40 && d.length <= 160, 'meta desc ' + u + ' ' + (d || '').length); await q.$$eval('script[type="application/ld+json"]', (s) => s.forEach((x) => JSON.parse(x.textContent))); const bad = await q.$$eval('img', (i) => i.filter((x) => !x.hasAttribute('alt') || !x.getAttribute('width')).length); assert.equal(bad, 0, 'img alt/dimensions ' + u); }
    await q.goto(BASE + '/blog/home-grooming-basics'); const ld = await q.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent))); assert.ok(ld.some((x) => x['@type'] === 'Article'));
  });
  await step('mobile UX (390x844): tab bar, menu drawer, filter sheet, sticky ATC, cart drawer', async () => {
    const m = await mkCtx({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const mp = await m.newPage(); watch(mp, 'mobile');
    await mp.goto(BASE + '/'); assert.ok(await mp.locator('.tabbar').isVisible()); await mp.click('.menu-btn'); await mp.waitForSelector('#mobile-nav.open'); assert.ok(await mp.locator('#mobile-nav summary:has-text("Dogs")').isVisible()); await mp.click('#mobile-nav [data-close]'); await mp.waitForTimeout(400);
    await mp.goto(BASE + '/collections/dog-dry-food'); await mp.click('[data-open-filters]'); await mp.waitForSelector('#filters.open'); assert.ok(await mp.locator('#filters').isVisible()); await mp.click('[data-close-filters]');
    await mp.goto(BASE + '/products/no-pull-front-clip-dog-harness'); await mp.evaluate(() => window.scrollTo(0, 2400)); await mp.waitForTimeout(500); assert.ok(await mp.locator('[data-sticky-atc]').isVisible()); await mp.click('[data-sticky-click]'); await mp.waitForSelector('[data-toast]:not([hidden])');
    await mp.waitForSelector('#cart-drawer.open .cart-line'); await mp.click('#cart-drawer [data-close]'); await mp.waitForTimeout(400); await mp.click('.tabbar [data-open=cart-drawer]'); await mp.waitForSelector('#cart-drawer.open .cart-line'); await m.close();
  });
  const VPS = [[360, 740], [390, 844], [768, 1024], [1280, 800], [1920, 1080], [3840, 2160]];
  const SHOT_PAGES = [['home', '/'], ['collection', '/collections/dog-dry-food'], ['product', '/products/no-pull-front-clip-dog-harness'], ['cats', '/cats'], ['cart', '/cart'], ['checkout', '/checkout'], ['track', '/track']];
  await step('viewports 360/390/768/1280/1920/3840: no horizontal overflow, screenshots saved', async () => {
    for (const [w, hh] of VPS) {
      const c = await mkCtx({ viewport: { width: w, height: hh }, isMobile: w < 800, hasTouch: w < 800 }); const p = await c.newPage(); watch(p, `vp${w}`);
      await p.goto(BASE + '/products/slow-feeder-bowl'); await p.click('#atc').catch(() => {}); await p.waitForTimeout(300);
      for (const [name, url] of SHOT_PAGES) {
        await p.goto(BASE + url); await p.waitForTimeout(250); const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); if (o.sw > o.cw + 1) overflow.push(`${name}@${w}: scrollWidth ${o.sw} > ${o.cw}`);
        await p.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`), fullPage: false });
      }
      await c.close();
    }
    assert.deepEqual(overflow, []);
  });
  await step('no unexpected console errors across the walk', async () => { assert.deepEqual(consoleErrors, []); });
  await step('stock accounting: active reservations only for open orders; no negative stock', async () => {
    const inv = JSON.parse(fs.readFileSync(path.join(dataDir, 'inventory.json'), 'utf8')); const resv = JSON.parse(fs.readFileSync(path.join(dataDir, 'reservations.json'), 'utf8')); const ord = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'));
    for (const r of Object.values(resv)) if (r.status === 'active') assert.ok(['pending_payment', 'paid', 'cod_confirmed', 'packed'].includes(ord[r.orderNo].state), 'active reservation for ' + ord[r.orderNo].state);
    assert.ok(Object.values(inv).every((s) => s.available >= 0 && s.reserved >= 0));
  });
  await browser.close(); srv.kill();
  const failed = results.filter((r) => !r.ok); const out = { when: new Date().toISOString(), node: process.version, total: results.length, passed: results.length - failed.length, failed: failed.length, results, overflow, consoleErrors };
  fs.writeFileSync(path.join(ROOT, 'documentation', 'e2e-results.json'), JSON.stringify(out, null, 1));
  if (consoleErrors.length) console.log('Console errors:\n  ' + consoleErrors.join('\n  '));
  console.log(`\nE2E: ${out.passed}/${out.total} passed`); process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
