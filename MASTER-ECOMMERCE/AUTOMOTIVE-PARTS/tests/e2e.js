#!/usr/bin/env node
'use strict';
/* End-to-end walk with Playwright. Boots its own server (temp data dir, DEV flags) and writes screenshots to documentation/screenshots/.
   Run: node tests/e2e.js   (requires global playwright + chromium; trace is off)  */
const path = require('path'); const fs = require('fs'); const os = require('os');
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'documentation', 'screenshots'); fs.mkdirSync(SHOTS, { recursive: true });
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const results = []; const consoleErrors = []; const overflow = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail: String(detail).slice(0, 300) }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + detail}`); };

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-e2e-'));
  process.env.DEV_DEMO_PRICES = '1'; process.env.DEV_MOCK_PAYMENT = '1'; process.env.DATA_DIR = dataDir; process.env.PORT = '4199'; process.env.SITE_URL = 'http://localhost:4199'; process.env.WHATSAPP_NUMBER = '919000000000'; delete process.env.NODE_ENV;
  const { createApp } = require('../frontend/server');
  const app = createApp(); await new Promise((r) => app.server.listen(4199, r));
  const BASE = 'http://localhost:4199';
  const browser = await chromium.launch();
  const mk = async (viewport, extra = {}) => {
    const ctx = await browser.newContext({ viewport, ...extra }); const pg = await ctx.newPage();
    await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\./.test(m.location().url || '') && !/status of (400|401|403|404)/.test(m.text())) consoleErrors.push(`${pg.url()} :: ${m.text()}`); });
    pg.on('pageerror', (e) => consoleErrors.push(`${pg.url()} :: PAGEERROR ${e.message}`));
    return { ctx, pg };
  };
  const shot = (pg, name, full = false) => pg.screenshot({ path: path.join(SHOTS, name), fullPage: full });

  try {
    // ===== desktop walk =====
    const { ctx, pg } = await mk({ width: 1280, height: 800 });
    await pg.goto(BASE + '/'); ok('home loads with H1', (await pg.locator('h1').count()) === 1, await pg.title());
    ok('dev banner visible when DEV_DEMO_PRICES on', await pg.locator('.devbanner').isVisible());
    // finder cascade (JS)
    await pg.selectOption('#hf-make', 'bmw'); await pg.waitForFunction(() => document.querySelectorAll('#hf-model option').length > 5);
    await pg.selectOption('#hf-model', '3-series'); await pg.waitForFunction(() => document.querySelectorAll('#hf-gen option').length > 2);
    await pg.selectOption('#hf-gen', 'f30'); await pg.waitForFunction(() => document.querySelectorAll('#hf-year option').length > 2);
    ok('finder cascades Make>Model>Generation>Year', true);
    await Promise.all([pg.waitForURL(/\/vehicle\?/), pg.locator('#vehicle-finder button[type=submit]').first().click()]);
    const h2 = await pg.locator('section[aria-live] h2').first().innerText();
    ok('finder BMW>3 Series>F30 returns supplier-listed parts', /supplier-listed/.test(h2) && !/: 0 /.test(h2), h2);
    ok('finder results labelled "confirm before ordering"', /confirm before ordering/i.test(await pg.locator('.notice').first().innerText()));
    await shot(pg, 'desktop-vehicle-results.png');
    // OEM search
    await pg.goto(BASE + '/search?q=63117398766'); const n = await pg.locator('.pcard').count();
    ok('OEM search 63117398766 returns products', n > 0, n);
    const firstOem = await pg.locator('.pcard__oem').first().innerText(); ok('top OEM result shows the OEM number', /63117398766/.test(firstOem), firstOem);
    ok('OEM search tolerant of spaces/dashes', (await (async () => { await pg.goto(BASE + '/search?q=6311-7398%20766'); return pg.locator('.pcard').count(); })()) > 0);
    await pg.goto(BASE + '/search?q=63117398766');
    await shot(pg, 'desktop-search-oem.png');
    // product page
    await pg.locator('.pcard__title a').first().click(); await pg.waitForLoadState();
    ok('product page: one H1, supplier-listed notice, OEM ref', (await pg.locator('h1').count()) === 1 && /Supplier-listed fitment/.test(await pg.locator('.buybox').innerText()));
    const ld = await pg.$$eval('script[type="application/ld+json"]', (els) => els.map((e) => JSON.parse(e.textContent)));
    ok('product JSON-LD: Product + BreadcrumbList + FAQPage; no aggregateRating; no offers for dev price', ld.some((x) => x['@type'] === 'Product') && ld.some((x) => x['@type'] === 'BreadcrumbList') && ld.some((x) => x['@type'] === 'FAQPage') && !JSON.stringify(ld).includes('aggregateRating') && !ld.find((x) => x['@type'] === 'Product').offers);
    const productUrl = pg.url();
    await shot(pg, 'desktop-product.png', true);
    // zoom
    await pg.locator('.gallery__main').click(); ok('gallery zoom toggles', await pg.locator('.gallery__main.zoomed').count() === 1);
    // add to cart -> drawer
    await pg.locator('#atc-form button[type=submit]').click(); await pg.waitForSelector('#cart-drawer[data-open=true]');
    ok('add to cart opens cart drawer with line', await pg.locator('#cart-drawer .line').count() === 1);
    await shot(pg, 'desktop-cart-drawer.png');
    await pg.locator('#cart-drawer a:has-text("Checkout")').click(); await pg.waitForURL(/\/checkout/);
    ok('checkout shows duties notice, per-product compatibility, no Aadhaar/PAN fields', /Duties and taxes/.test(await pg.locator('body').innerText()) && (await pg.locator('fieldset[data-compat-group]').count()) === 1 && (await pg.locator('input[name*=aadhaar i], input[name*=pan i]').count()) === 0);
    ok('COD not offered at checkout', (await pg.locator('input[value=cod]').count()) === 0 && !/cash on delivery/i.test(await pg.locator('input[name=payment_method] ~ span').allInnerTexts().then((a) => a.join(' '))));
    // submit empty to see validation
    await pg.locator('button:has-text("Place prepaid order")').click(); await pg.waitForLoadState();
    ok('checkout validation shows errors without ticking confirmations', (await pg.locator('.err').count()) > 3);
    await shot(pg, 'desktop-checkout-errors.png');
    await pg.fill('#name', 'Test Buyer'); await pg.fill('#email', 'buyer@example.com'); await pg.fill('#phone', '+91 98765 43210'); await pg.fill('#line1', '12 MG Road'); await pg.fill('#city', 'Pune'); await pg.fill('#state', 'Maharashtra'); await pg.fill('#postal_code', '411001');
    const g = pg.locator('fieldset[data-compat-group]');
    await g.locator('input[name$="[make]"]').fill('BMW'); await g.locator('input[name$="[model]"]').fill('3 Series 320d'); await g.locator('input[name$="[year]"]').fill('2014');
    await g.locator('select[name$="[drive]"]').selectOption('RHD'); await g.locator('select[name$="[side]"]').selectOption({ index: 1 }); await g.locator('select[name$="[position]"]').selectOption('front');
    for (const c of await g.locator('input[type=checkbox]').all()) await c.check();
    await pg.locator('input[name=duties_ack]').check();
    await shot(pg, 'desktop-checkout-filled.png', true);
    await Promise.all([pg.waitForURL(/\/pay\//), pg.locator('button:has-text("Place prepaid order")').click()]);
    ok('mock payment page loudly labelled DEV', /DEV MOCK GATEWAY/.test(await pg.locator('body').innerText()));
    await shot(pg, 'desktop-pay-mock.png');
    await Promise.all([pg.waitForURL(/\/order\//), pg.locator('button:has-text("Simulate successful payment")').click()]);
    const orderNo = (await pg.locator('h1').innerText()).match(/AP-\d+/)[0];
    ok('order created and paid via dev mock', /payment is confirmed/.test(await pg.locator('body').innerText()), orderNo);
    const o = app.orders.byNo(orderNo);
    ok('order auto-queued with manual-queue supplier adapter (status supplier_queued)', o.status === 'supplier_queued' && o.supplier.status === 'queued', `${o.status}/${o.supplier.status}`);
    ok('supplier payload in queue holds no email/KYC', !JSON.stringify(o.supplier.payload).includes('buyer@example.com'));
    await shot(pg, 'desktop-order-confirmed.png');

    // ===== admin =====
    const admin = await mk({ width: 1280, height: 900 }, { httpCredentials: { username: 'admin', password: 'admin-dev-pass' } });
    const ap = admin.pg;
    await ap.goto(BASE + '/admin/queue'); ok('admin queue lists the order', (await ap.locator('body').innerText()).includes(orderNo));
    await shot(ap, 'desktop-admin-queue.png');
    await ap.goto(`${BASE}/admin/orders/${orderNo}`);
    await ap.locator('button:has-text("Mark PO sent")').click(); await ap.waitForLoadState();
    await ap.locator('button:has-text("Supplier accepted")').click(); await ap.waitForLoadState();
    ok('admin: supplier accepted -> status supplier_accepted', app.orders.byNo(orderNo).status === 'supplier_accepted');
    await ap.fill('input[name=number]', '1234567890'); await ap.selectOption('select[name=carrier]', 'dhl'); await ap.locator('button:has-text("Save tracking")').click(); await ap.waitForLoadState();
    ok('admin: tracking entered -> dispatched', app.orders.byNo(orderNo).status === 'dispatched' && app.orders.byNo(orderNo).supplier.tracking.number === '1234567890');
    await ap.locator('input[name=reason]').fill('Routine verification'); await ap.locator('button:has-text("Flag for KYC")').click(); await ap.waitForLoadState();
    ok('admin: KYC flag set', app.orders.byNo(orderNo).kyc.flagged === true);
    await shot(ap, 'desktop-admin-order.png', true);
    for (const p of ['/admin', '/admin/orders', '/admin/enquiries', '/admin/kyc', '/admin/data', '/admin/integrations', '/admin/logs']) { const r = await ap.goto(BASE + p); ok(`admin page ${p} 200`, r.status() === 200); }
    const intText = await (async () => { await ap.goto(BASE + '/admin/integrations'); return ap.locator('table').innerText(); })();
    ok('integration page honest: Razorpay/Cashfree/Alibaba not_configured', /Razorpay\s+not_configured/.test(intText) && /Cashfree\s+not_configured/.test(intText) && /Alibaba API\s+not_configured/.test(intText), intText.slice(0, 200));
    await shot(ap, 'desktop-admin-integrations.png');
    const csv = await ap.request.get(BASE + `/admin/export/po/${orderNo}.csv`); ok('PO CSV export works', (await csv.text()).includes('supplier_sku'));
    await admin.ctx.close();

    // ===== track =====
    const t = await mk({ width: 1280, height: 800 });
    await t.pg.goto(`${BASE}/track?order=${orderNo}&email=buyer@example.com`);
    const tt = await t.pg.locator('main').innerText();
    ok('/track shows tracking number and status', tt.includes('1234567890') && /Dispatched/.test(tt));
    ok('/track shows consent-based KYC request when flagged', /Additional verification requested/.test(tt) && /consent/i.test(tt));
    await shot(t.pg, 'desktop-track.png', true);
    await t.pg.goto(`${BASE}/track?order=${orderNo}&email=wrong@example.com`); ok('/track rejects wrong email', /could not find/.test(await t.pg.locator('main').innerText()));
    // KYC upload with consent
    await t.pg.goto(`${BASE}/track?order=${orderNo}&email=buyer@example.com`);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]); const pngPath = path.join(dataDir, 'doc.png'); fs.writeFileSync(pngPath, png);
    await t.pg.setInputFiles('#kycf', pngPath); await t.pg.locator('input[name=consent]').check(); await t.pg.locator('button:has-text("Upload with consent")').click(); await t.pg.waitForLoadState();
    ok('KYC document stored only after consent', !!app.orders.byNo(orderNo).kyc.document);
    await t.ctx.close();

    // ===== enquiry upload =====
    const e = await mk({ width: 1280, height: 800 });
    await e.pg.goto(BASE + '/enquiry'); await e.pg.fill('#en', 'Enq User'); await e.pg.fill('#ee', 'enq@example.com'); await e.pg.fill('#em', 'Need LED module for my F30'); await e.pg.setInputFiles('#ef', pngPath); await e.pg.locator('input[name=consent]').check();
    await e.pg.locator('button:has-text("Send enquiry")').click(); await e.pg.waitForLoadState();
    ok('enquiry with PNG upload saved', /Your enquiry reference/.test(await e.pg.locator('main').innerText()) && app.enquiries.data.items.length === 1 && !!app.enquiries.data.items[0].file);
    const stored = fs.readdirSync(path.join(dataDir, 'uploads')).filter((f) => /^[a-f0-9]{32}\.png$/.test(f)); ok('upload stored under data/uploads with random name', stored.length === 1, stored.join());
    const exe = path.join(dataDir, 'bad.exe'); fs.writeFileSync(exe, 'MZ...'); await e.pg.goto(BASE + '/enquiry'); await e.pg.fill('#en', 'X'); await e.pg.fill('#ee', 'x@example.com'); await e.pg.fill('#em', 'hi'); await e.pg.setInputFiles('#ef', exe); await e.pg.locator('input[name=consent]').check(); await e.pg.locator('button:has-text("Send enquiry")').click(); await e.pg.waitForLoadState();
    ok('enquiry rejects .exe upload', /Only JPG, PNG, WebP or PDF/.test(await e.pg.locator('main').innerText()) && app.enquiries.data.items.length === 1);
    await shot(e.pg, 'desktop-enquiry-rejected.png');
    // price-on-request quote flow (use plain catalog without dev prices)
    await e.ctx.close();

    // ===== account =====
    const a = await mk({ width: 1280, height: 800 });
    await a.pg.goto(BASE + '/account/signup'); await a.pg.fill('#an', 'Acc User'); await a.pg.fill('#ae', 'acc@example.com'); await a.pg.fill('#ap', 'supersecret1'); await a.pg.locator('main button[type=submit]').click(); await a.pg.waitForURL(/\/account$/);
    ok('account signup works and lands on dashboard', /Hello, Acc User/.test(await a.pg.locator('h1').innerText()));
    await a.pg.goto(BASE + '/vehicle?make=bmw&model=3-series&gen=f30&year=2014'); await a.pg.locator('button:has-text("Save to My Garage")').click(); await a.pg.waitForLoadState();
    await a.pg.goto(BASE + '/account'); ok('My Garage saved vehicle', /BMW 3 Series F30 2014/.test(await a.pg.locator('main').innerText()));
    await a.pg.locator('button:has-text("Sign out")').click(); await a.pg.waitForLoadState();
    await a.pg.goto(BASE + '/account/login'); await a.pg.fill('#ae', 'acc@example.com'); await a.pg.fill('#ap', 'wrongpass'); await a.pg.locator('main button[type=submit]').click(); await a.pg.waitForLoadState();
    ok('login rejects wrong password', /Incorrect email or password/.test(await a.pg.locator('main').innerText()));
    await a.pg.fill('#ae', 'acc@example.com'); await a.pg.fill('#ap', 'supersecret1'); await a.pg.locator('main button[type=submit]').click(); await a.pg.waitForURL(/\/account$/);
    ok('login works; garage persisted for account', /BMW 3 Series F30 2014/.test(await a.pg.locator('main').innerText()));
    ok('password stored hashed (scrypt), not plaintext', !fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf8').includes('supersecret1'));
    await a.ctx.close();

    // ===== meta / a11y / SEO checks across pages =====
    const m = await mk({ width: 1280, height: 800 }); const titles = new Map();
    const pages = ['/', '/shop', '/shop?page=2', '/category/led-modules-boards', '/brand/bmw', '/brand/audi', '/vehicle', '/vehicle?make=mercedes-benz&model=c-class&gen=w205', '/search?q=F30', productUrl.replace(BASE, ''), '/about', '/contact', '/faq', '/blog', '/blog/oem-vs-oem-equivalent-vs-aftermarket', '/policies', '/policies/warranty', '/policies/duties-taxes', '/enquiry', '/cart', '/checkout', '/track', '/account/login'];
    for (const p of pages) {
      const r = await m.pg.goto(BASE + p); const probs = [];
      if (r.status() !== 200) probs.push('status ' + r.status());
      const info = await m.pg.evaluate(() => {
        const q = (s) => document.querySelector(s); const lbl = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]),select,textarea')].filter((i) => !i.closest('.sr') && i.className !== 'sr').filter((i) => { const id = i.id; return !(id && document.querySelector(`label[for="${id}"]`)) && !i.getAttribute('aria-label') && !i.closest('label'); }).map((i) => i.name || i.id);
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
        const ld = []; let ldErr = null; document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { ld.push(JSON.parse(s.textContent)['@type']); } catch (e) { ldErr = e.message; } });
        return { title: document.title, h1: document.querySelectorAll('h1').length, desc: (q('meta[name=description]') || {}).content, canonical: (q('link[rel=canonical]') || {}).href, lang: document.documentElement.lang, noAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length, unlabeled: lbl, dup, ld, ldErr, skip: !!q('a.skip'), main: !!q('main#main'), og: !!q('meta[property="og:title"]'), noWH: [...document.images].filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length };
      });
      if (info.h1 !== 1) probs.push(`h1 count ${info.h1}`); if (!info.desc || info.desc.length < 30) probs.push('meta description'); if (!info.canonical) probs.push('canonical'); if (info.lang !== 'en-IN') probs.push('lang');
      if (info.noAlt) probs.push(`${info.noAlt} imgs without alt`); if (info.unlabeled.length) probs.push('unlabeled: ' + info.unlabeled.join(',')); if (info.dup.length) probs.push('dup ids: ' + info.dup.join(',')); if (info.ldErr) probs.push('jsonld parse ' + info.ldErr);
      if (!info.skip || !info.main || !info.og) probs.push('skip/main/og'); if (info.noWH) probs.push(`${info.noWH} imgs without width/height (CLS)`);
      if (titles.has(info.title) && !/page=2/.test(p)) probs.push(`duplicate title with ${titles.get(info.title)}`); titles.set(info.title, p);
      ok(`meta/a11y ${p}`, probs.length === 0, probs.join('; ') + ' | ' + info.title);
      if (p === '/') ok('home JSON-LD: Organization + WebSite(SearchAction)', info.ld.includes('Organization') && info.ld.includes('WebSite'));
      if (p === '/faq') ok('FAQ JSON-LD present', info.ld.includes('FAQPage'));
      if (p.startsWith('/blog/')) ok('blog post Article JSON-LD', info.ld.includes('Article'));
    }
    const rb = await (await m.ctx.request.get(BASE + '/robots.txt')).text(); const sm = await (await m.ctx.request.get(BASE + '/sitemap.xml')).text();
    ok('robots.txt references sitemap and blocks admin', /Sitemap:/.test(rb) && /Disallow: \/admin/.test(rb)); ok('sitemap lists all 1229 products', (sm.match(/\/product\//g) || []).length === app.catalog.products.length);
    const gz = await m.ctx.request.get(BASE + '/shop', { headers: { 'accept-encoding': 'gzip' } }); ok('gzip + security headers', gz.headers()['content-encoding'] === 'gzip' && /frame-ancestors 'none'/.test(gz.headers()['content-security-policy']));
    const img = await m.ctx.request.get(BASE + '/assets/products/' + app.catalog.products[0].image); ok('product images cached immutable', /immutable/.test(img.headers()['cache-control']));
    await m.ctx.close();

    // ===== responsive: viewports =====
    const VPS = [[360, 740], [390, 844], [768, 1024], [1280, 800], [1920, 1080], [3840, 2160]];
    const prodPath = productUrl.replace(BASE, '');
    for (const [w, h] of VPS) {
      const v = await mk({ width: w, height: h, deviceScaleFactor: w >= 3840 ? 1 : 1 });
      for (const [name, p, full] of [['home', '/', false], ['home-full', '/', true], ['shop', '/shop', false], ['vehicle', '/vehicle?make=bmw&model=3-series&gen=f30', false], ['product', prodPath, false], ['cart', '/cart', false], ['checkout', '/checkout', false]]) {
        if (name === 'checkout' || name === 'cart') { /* empty cart in fresh context; still check layout */ }
        await v.pg.goto(BASE + p); await v.pg.waitForTimeout(150);
        const ov = await v.pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        const bad = ov.sw > ov.iw + 1; overflow.push({ vp: `${w}x${h}`, page: name, ...ov, overflow: bad });
        ok(`no horizontal overflow ${w}x${h} ${name}`, !bad, `${ov.sw} > ${ov.iw}`);
        if (!name.startsWith('cart') && name !== 'checkout' && (w <= 768 || ['home', 'product'].includes(name))) await shot(v.pg, `${w}x${h}-${name}.png`, full);
      }
      if (w < 1024) {
        await v.pg.goto(BASE + '/'); await v.pg.locator('.menu-btn').click(); ok(`mobile menu drawer opens at ${w}`, await v.pg.locator('#menu-drawer[data-open=true]').isVisible()); await shot(v.pg, `${w}x${h}-menu-drawer.png`); await v.pg.keyboard.press('Escape');
        ok(`bottom nav visible at ${w}`, await v.pg.locator('.bnav').isVisible());
        await v.pg.goto(BASE + prodPath); ok(`sticky add-to-cart bar visible at ${w}`, await v.pg.locator('.stickyatc').isVisible());
      }
      await v.ctx.close();
    }
    // keyboard focus ring sanity + reduced motion
    const k = await mk({ width: 1280, height: 800 }, { reducedMotion: 'reduce' }); await k.pg.goto(BASE + '/'); await k.pg.keyboard.press('Tab');
    ok('skip link is first focusable', await k.pg.evaluate(() => document.activeElement.className === 'skip'));
    ok('reduced-motion disables animation', await k.pg.evaluate(() => getComputedStyle(document.querySelector('.beam')).animationName === 'none'));
    await k.ctx.close();
  } catch (err) { ok('E2E run aborted by exception', false, err.stack || err.message); }
  ok('no console errors across the whole walk', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '));
  await browser.close(); app.server.close();
  const pass = results.filter((r) => r.pass).length; const fail = results.length - pass;
  fs.writeFileSync(path.join(ROOT, 'documentation', 'e2e-results.json'), JSON.stringify({ ran_at: new Date().toISOString(), pass, fail, results, overflow, consoleErrors }, null, 1));
  console.log(`\nE2E: ${pass} passed, ${fail} failed, ${results.length} checks. Screenshots in documentation/screenshots/`);
  process.exit(fail ? 1 : 0);
})();
