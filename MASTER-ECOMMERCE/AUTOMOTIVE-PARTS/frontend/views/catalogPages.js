'use strict';
const { html, raw, esc } = require('../lib/html');
const { layout } = require('../lib/layout');
const C = require('./components');
const seo = require('../lib/seo');
const fitment = require('../lib/fitment');
const { faqs } = require('../lib/content');
const { inr } = require('../lib/util');
const { HIGH_VALUE_INR } = require('../lib/pricing');

// Abstract headlight-glow / light-beam hero art (pure SVG, no photography). Real hero photography must be supplied by the business.
const heroArt = raw(`<svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="beamg" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#f6efe0" stop-opacity=".55"/><stop offset=".45" stop-color="#e3a53a" stop-opacity=".16"/><stop offset="1" stop-color="#e3a53a" stop-opacity="0"/></linearGradient>
<linearGradient id="drl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#f4f1ea"/><stop offset="1" stop-color="#e3a53a"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f7ecd2" stop-opacity=".9"/><stop offset=".35" stop-color="#e3a53a" stop-opacity=".35"/><stop offset="1" stop-color="#e3a53a" stop-opacity="0"/></radialGradient>
<filter id="b8"><feGaussianBlur stdDeviation="8"/></filter><filter id="b30"><feGaussianBlur stdDeviation="30"/></filter>
<pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern>
</defs>
<rect width="1600" height="760" fill="url(#grid)"/>
<g class="beam" filter="url(#b30)"><polygon points="1120,330 -120,90 -120,640" fill="url(#beamg)" opacity=".5"/></g>
<g class="beam" style="animation-delay:-3s"><polygon points="1120,360 -40,210 -40,520" fill="url(#beamg)" opacity=".55"/></g>
<ellipse cx="1180" cy="352" rx="300" ry="150" fill="url(#glow)" filter="url(#b30)" opacity=".8"/>
<g transform="translate(980 250)"><path d="M0 120C60 40 190 10 320 36L360 70C250 62 140 90 60 168C30 186 6 160 0 120Z" fill="#0f1114" stroke="#3a4048" stroke-width="2"/>
<path d="M20 126C80 62 190 36 310 54" fill="none" stroke="url(#drl)" stroke-width="7" stroke-linecap="round"/><path d="M34 146C96 90 196 66 300 80" fill="none" stroke="url(#drl)" stroke-width="3" stroke-linecap="round" opacity=".7"/>
<circle cx="250" cy="100" r="34" fill="#15181c" stroke="#4a525d" stroke-width="2"/><circle cx="250" cy="100" r="18" fill="#fff4da" filter="url(#b8)"/><circle cx="250" cy="100" r="8" fill="#fff"/></g>
<path d="M0 640 C 400 600 900 610 1600 660 L1600 760 L0 760Z" fill="#0b0c0e" opacity=".9"/>
</svg>`);

const BRAND_NOTE = { bmw: 'Headlights, DRL, modules', 'mercedes-benz': 'LED modules and control units', audi: 'Matrix / LED / xenon modules' };

function home(ctx) {
  const { catalog, cfg } = ctx;
  const brands = catalog.brands.filter((b) => !['universal', 'other-multi-brand'].includes(b.slug));
  const featured = catalog.featured(8); const recent = catalog.recent(4);
  const dashboards = catalog.products.filter((p) => /cluster|dashboard|instrument/i.test(p.title_raw));
  const body = html`
  <section class="hero"><div class="hero__art">${heroArt}</div>
    <div class="container hero__in">
      <div><span class="eyebrow">Lighting &amp; electronics &middot; European luxury vehicles</span>
        <h1>Headlight modules, <em>precisely matched.</em></h1>
        <p class="lede">${catalog.products.length.toLocaleString('en-IN')} supplier-listed parts for BMW, Mercedes-Benz, Audi and more. Select your vehicle, confirm the OEM reference, order prepaid.</p></div>
      <div class="finder" id="vehicle-finder"><div class="finder__title"><h2>Find parts for your vehicle</h2><span class="tag tag--accent">Supplier-listed fitment</span></div>
        ${C.finderForm(ctx, {}, { id: 'hf' })}
        <form class="oem-search" action="/search" method="get" role="search"><label class="sr" for="oemq">OEM number or part name</label><input id="oemq" name="q" placeholder="Or enter an OEM number, e.g. 63117398766" autocomplete="off"><button class="btn" type="submit">Search OEM</button></form>
      </div></div></section>

  <section class="section section--tight"><div class="container"><div class="row between" style="margin-bottom:24px"><h2 style="margin:0">Shop by brand</h2><a class="link-arrow" href="/vehicle">Vehicle finder</a></div>
    <div class="tiles">${brands.slice(0, 12).map((b) => html`<a class="tile" href="/brand/${b.slug}"><b>${b.name}</b><span>${b.count} parts</span></a>`)}</div></div></section>

  <section class="section section--alt"><div class="container"><span class="eyebrow">Categories</span><h2>Lighting and electronic modules</h2>
    <div class="tiles tiles--cat">${catalog.categories.map((c) => html`<a class="tile" href="/category/${c.slug}"><b>${c.name}</b><span>${c.count} parts</span></a>`)}</div></div></section>

  <section class="section"><div class="container split">
    <div><span class="eyebrow">Headlight specialist</span><h2>Replace the failing part, not the whole headlight.</h2>
      <p>Most of our catalogue is the inside of the headlight: LED modules and boards, angel-eye DRL rings, turn-signal modules, ballasts, igniters and driver units. Matching them by chassis code and OEM number is how we keep fitment questions short.</p>
      <ul class="feature-list"><li>Chassis-code finder (F30, G20, W205, X253, B9...) with supplier-listed results</li><li>OEM number search ignores spaces and dashes</li><li>Left / right pairs linked where the supplier lists both</li></ul>
      <p style="margin-top:24px"><a class="btn btn--primary" href="/category/led-modules-boards">Browse LED modules</a> <a class="btn btn--ghost" href="/category/drl-angel-eyes">DRL / angel eyes</a></p></div>
    <div class="card" style="padding:0;overflow:hidden"><div class="pgrid" style="grid-template-columns:repeat(2,1fr);padding:16px">${featured.slice(0, 2).map((p) => C.productCard(ctx, p))}</div></div></div></section>

  <section class="section section--alt"><div class="container"><span class="eyebrow">Digital dashboard upgrades</span><h2>Instrument clusters and digital displays</h2>
    ${dashboards.length ? html`<div class="pgrid">${dashboards.slice(0, 4).map((p) => C.productCard(ctx, p))}</div>` : html`<div class="notice notice--warn"><strong>Coming from supplier catalogue - not yet listed.</strong> The supplier catalogue we have received contains no digital dashboard or instrument cluster products yet. We will list them only once the supplier provides them. <a href="/enquiry">Ask about a specific cluster</a>.</div>`}</div></section>

  <section class="section"><div class="container"><div class="row between" style="margin-bottom:24px"><h2 style="margin:0">Featured</h2><a class="link-arrow" href="/shop">All parts</a></div>
    <div class="pgrid">${featured.slice(0, 8).map((p) => C.productCard(ctx, p))}</div>
    <h2 style="margin:56px 0 24px">Recently added</h2><div class="pgrid">${recent.map((p) => C.productCard(ctx, p))}</div></div></section>

  <section class="section section--alt"><div class="container grid"><div class="col-6"><span class="eyebrow">Sourcing &amp; inspection</span><h2>How we intend to source and check parts</h2>
    <p>${cfg.site.supplier_disclosure}</p>
    <p class="small muted">Our intended process: verify the part number against the supplier listing, request photos before dispatch, and check packaging. Details of supplier inspection are confirmed once the supplier agreement is verified. We do not claim certifications or testing that have not been documented.</p></div>
    <div class="col-6"><span class="eyebrow">International shipping</span><h2>Ships from ${cfg.site.shipping_origin}</h2><p>${cfg.site.delivery_estimate.india_text}</p><p class="small muted">${cfg.site.duties_text}</p><p><a class="link-arrow" href="/policies/shipping">Shipping policy</a> &nbsp; <a class="link-arrow" href="/policies/duties-taxes">Duties &amp; taxes</a></p></div></div></section>

  <section class="section"><div class="container"><span class="eyebrow">How ordering works</span><h2>Four steps, prepaid</h2>
    <ol class="steps"><li><b>Find and confirm</b><span>Pick your vehicle, compare the OEM number, confirm fitment with us if unsure.</span></li><li><b>Pay online</b><span>Prepaid via UPI, cards or netbanking. No cash on delivery.</span></li><li><b>We place the supplier order</b><span>Your order is queued, then confirmed with the supplier.</span></li><li><b>Track delivery</b><span>Tracking is added when the parcel is dispatched from China.</span></li></ol></div></section>

  <section class="section section--alt"><div class="container split"><div><span class="eyebrow">Compatibility assistance</span><h2>Not sure it fits? Ask before you order.</h2><p>Send a photo of the part or your vehicle details. Supported formats: JPG, PNG, WebP or PDF up to 5 MB.</p>
    <p><a class="btn btn--primary" href="/enquiry">Send a photo / enquiry</a> ${cfg.whatsapp ? html`<a class="btn" href="https://wa.me/${cfg.whatsapp}">WhatsApp us</a>` : ''}</p></div>
    <div class="acc"><h3>Common questions</h3>${faqs.slice(0, 4).map(([q, a]) => html`<details><summary>${q}</summary><div class="body">${a}</div></details>`)}<p style="margin-top:16px"><a class="link-arrow" href="/faq">All FAQs</a></p></div></div></section>`;
  return layout(ctx, {
    title: `${cfg.siteName} | Luxury car headlight modules and lighting electronics`, description: `Supplier-listed headlight modules, LED boards, angel eyes and control units for BMW, Mercedes-Benz and Audi. Find parts by chassis code or OEM number. Prepaid orders shipped to India.`,
    canonical: '/', body, jsonld: [seo.org(cfg), seo.website(cfg)],
  });
}

function filtersPanel(ctx, base, state) {
  const { catalog } = ctx;
  const link = (patch) => { const u = new URLSearchParams(state.params); for (const [k, v] of Object.entries(patch)) { if (v == null) u.delete(k); else u.set(k, v); } u.delete('page'); const s = u.toString(); return base + (s ? '?' + s : ''); };
  return html`<aside class="filters" aria-label="Filters"><details class="filters-wrap" open><summary class="filters-toggle">Filters</summary><details open><summary>Brand</summary><ul>${catalog.brands.slice(0, 14).map((b) => html`<li><a href="${state.brandBase ? '/brand/' + b.slug + (state.qs ? '?' + state.qs : '') : link({ brand: b.slug })}" ${state.brand === b.slug ? raw('aria-current="true"') : ''}><span>${b.name}</span><span class="muted">${b.count}</span></a></li>`)}</ul></details>
    <details><summary>Category</summary><ul>${catalog.categories.map((c) => html`<li><a href="${link({ category: c.slug })}" ${state.category === c.slug ? raw('aria-current="true"') : ''}><span>${c.name}</span><span class="muted">${c.count}</span></a></li>`)}</ul></details>
    <details><summary>Side</summary><ul>${['left', 'right'].map((s) => html`<li><a href="${link({ side: state.side === s ? null : s })}" ${state.side === s ? raw('aria-current="true"') : ''}><span style="text-transform:capitalize">${s}</span></a></li>`)}</ul></details>
    <details><summary>Availability</summary><ul><li><a href="${link({ hasImage: state.hasImage ? null : '1' })}" ${state.hasImage ? raw('aria-current="true"') : ''}>With supplier photo</a></li><li><a href="${link({ hasPrice: state.hasPrice ? null : '1' })}" ${state.hasPrice ? raw('aria-current="true"') : ''}>Priced items only</a></li></ul></details>
    ${state.params.toString() ? html`<p style="margin-top:12px"><a href="${base}" class="link-arrow">Clear filters</a></p>` : ''}</details></aside>`;
}

// Shared listing renderer: /shop, /category/:slug, /brand/:slug, /search
function listing(ctx, { base, h1, intro, crumbItems, title, description, extra = {}, forced = {}, q = '', noindexIfFiltered = true }) {
  const params = new URLSearchParams(ctx.query);
  const o = { q, brand: params.get('brand') || forced.brand, category: params.get('category') || forced.category, side: params.get('side'), hasImage: params.get('hasImage') === '1', hasPrice: params.get('hasPrice') === '1', sort: params.get('sort') || 'relevance', page: parseInt(params.get('page'), 10) || 1 };
  const r = ctx.catalog.list(o);
  const qs = new URLSearchParams(params); qs.delete('page'); qs.delete('sort');
  const filtered = ['brand', 'category', 'side', 'hasImage', 'hasPrice', 'sort', 'page'].some((k) => params.has(k)) && !(forced.brand && [...params.keys()].every((k) => ['page', 'sort'].includes(k)));
  const state = { params: qs, brand: o.brand, category: o.category, side: o.side, hasImage: o.hasImage, hasPrice: o.hasPrice, brandBase: !!forced.brand, qs: qs.toString() };
  const sortOpt = (v, l) => html`<option value="${v}" ${o.sort === v ? raw('selected') : ''}>${l}</option>`;
  const body = html`<div class="container">${C.crumbs(crumbItems)}
    <div style="margin-bottom:32px"><h1 style="font-size:clamp(1.75rem,1.2rem + 2vw,2.75rem)">${h1}</h1>${intro ? html`<p class="lede">${intro}</p>` : ''}</div>
    <div class="shop">${filtersPanel(ctx, base, state)}
      <div><div class="toolbar"><p style="margin:0" aria-live="polite"><b>${r.total.toLocaleString('en-IN')}</b> ${r.total === 1 ? 'part' : 'parts'}${q ? html` for &ldquo;${q}&rdquo;` : ''}</p>
        <form method="get" action="${base}" class="row">${[...params.entries()].filter(([k]) => k !== 'sort' && k !== 'page').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}${q && base === '/search' ? html`<input type="hidden" name="q" value="${q}">` : ''}<label for="sort" class="sr">Sort</label><select id="sort" name="sort" style="min-height:44px;width:auto">${sortOpt('relevance', 'Sort: Featured')}${sortOpt('title', 'Name A-Z')}${sortOpt('year-new', 'Year: newest')}${sortOpt('year-old', 'Year: oldest')}${sortOpt('price-asc', 'Price: low to high')}${sortOpt('price-desc', 'Price: high to low')}</select><button class="btn btn--sm" type="submit">Apply</button></form></div>
        ${r.items.length ? html`<div class="pgrid">${r.items.map((p) => C.productCard(ctx, p))}</div>` : html`<div class="notice"><strong>No parts matched.</strong> Try a shorter OEM number or a chassis code such as F30. Or <a href="/enquiry">send us a photo</a> and we will look for it.</div>`}
        ${C.pager(qs, r.page, r.pages)}</div></div></div>`;
  const pg = r.page > 1 ? ` - Page ${r.page}` : '';
  return layout(ctx, { title: `${title}${pg} | ${ctx.cfg.siteName}`, description: description + (pg ? pg : ''), canonical: base + (r.page > 1 && !filtered ? '?page=' + r.page : ''), body: html`<div class="section--tight">${body}</div>`, noindex: base === '/search' || (filtered && noindexIfFiltered && !forced.brand && !forced.category),
    jsonld: [seo.breadcrumbs(ctx.cfg, crumbItems.map((c) => ({ name: c.name, url: c.url || ctx.path })))] });
}

function vehiclePage(ctx) {
  const sel = { make: ctx.query.make || '', model: ctx.query.model || '', gen: ctx.query.gen || '', year: ctx.query.year || '' };
  const o = fitment.options(ctx.catalog.vehicles, sel);
  const res = sel.make ? fitment.find(ctx.catalog.products, ctx.catalog.vehicles, sel) : null;
  const page = Math.max(1, parseInt(ctx.query.page, 10) || 1); const per = 24;
  const items = res ? res.items.slice((page - 1) * per, page * per) : [];
  const pages = res ? Math.max(1, Math.ceil(res.items.length / per)) : 1;
  const label = [o.make && o.make.name, o.model && o.model.name, o.gen && o.gen.code, sel.year].filter(Boolean).join(' ');
  const saved = ctx.garage.some((g) => g.make === sel.make && g.model === sel.model && g.gen === sel.gen && String(g.year) === String(sel.year));
  const body = html`<div class="container section--tight">${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Shop by vehicle' }])}
    <h1 style="font-size:clamp(1.75rem,1.2rem + 2vw,2.75rem)">Shop by vehicle</h1>
    <p class="lede">Choose make, model and generation. Results are matched on the chassis codes the supplier lists - they are <strong>supplier-listed, not verified</strong>.</p>
    <div class="finder" style="margin:24px 0 40px">${C.finderForm(ctx, sel, { id: 'vf' })}</div>
    ${!sel.make ? html`<h2>Browse makes</h2><div class="tiles">${o.makes.map((m) => html`<a class="tile" href="/vehicle?make=${m.slug}"><b>${m.name}</b><span>${m.product_count ? m.product_count + ' supplier-listed' : 'No listed parts yet'}</span></a>`)}</div>` : ''}
    ${sel.make && !sel.model ? html`<h2>${o.make.name} models</h2><div class="tiles">${o.models.map((m) => html`<a class="tile" href="/vehicle?make=${sel.make}&amp;model=${m.slug}"><b>${m.name}</b><span>${m.product_count ? m.product_count + ' supplier-listed' : 'none listed yet'}</span></a>`)}</div>` : ''}
    ${sel.make && sel.model && !sel.gen && o.generations.length ? html`<h2>${o.model.name} generations</h2><div class="tiles">${o.generations.map((g) => html`<a class="tile" href="/vehicle?make=${sel.make}&amp;model=${sel.model}&amp;gen=${g.slug}"><b>${g.code}</b><span>${g.year_from}${g.year_to ? '-' + g.year_to : '+'} &middot; ${g.product_count || 0} listed</span></a>`)}</div>` : ''}
    ${res ? html`<section aria-live="polite" style="margin-top:40px"><div class="row between"><h2 style="margin:0">${label}: ${res.items.length} supplier-listed ${res.items.length === 1 ? 'part' : 'parts'}</h2>
      <form action="/garage/save" method="post">${C.csrfInput(ctx)}<input type="hidden" name="make" value="${sel.make}"><input type="hidden" name="model" value="${sel.model}"><input type="hidden" name="gen" value="${sel.gen}"><input type="hidden" name="year" value="${sel.year}"><button class="btn btn--sm" ${saved ? raw('disabled') : ''}>${saved ? 'Saved in My Garage' : 'Save to My Garage'}</button></form></div>
      ${o.variants.length ? html`<p class="small muted">Variants noted for this generation: ${o.variants.join(', ')}. Ask us if your headlight type matters.</p>` : ''}
      <div class="notice" style="margin:16px 0 24px"><strong>Supplier-listed fitment, confirm before ordering.</strong> ${res.strong} matched on chassis code${res.weak ? `, ${res.weak} matched on model name only (check years and chassis)` : ''}. Compare the OEM number and confirm with us if unsure.</div>
      ${items.length ? html`<div class="pgrid">${items.map((it) => html`<div>${C.productCard(ctx, it.product)}<p class="small muted" style="margin:6px 4px 0">${fitment.levelLabel(it.level)}${it.yearNote ? '. ' + it.yearNote : ''}</p></div>`)}</div>` : html`<div class="notice"><strong>No supplier-listed parts for this selection.</strong> The supplier catalogue may not include this vehicle yet. <a href="/enquiry?vehicle=${encodeURIComponent(label)}">Send us an enquiry</a>.</div>`}
      ${C.pager(new URLSearchParams(sel), page, pages)}</section>` : ''}</div>`;
  return layout(ctx, { title: `${label ? label + ' parts' : 'Shop by vehicle'} | ${ctx.cfg.siteName}`, description: `Find supplier-listed lighting parts by make, model and chassis code${label ? ' for ' + label : ''}. Fitment is supplier-listed; confirm before ordering.`, canonical: '/vehicle' + (sel.make ? `?make=${sel.make}${sel.model ? '&model=' + sel.model : ''}${sel.gen ? '&gen=' + sel.gen : ''}` : ''), body, noindex: !!sel.year, jsonld: [seo.breadcrumbs(ctx.cfg, [{ name: 'Home', url: '/' }, { name: 'Shop by vehicle', url: '/vehicle' }])] });
}

function productPage(ctx, p) {
  const { catalog, cfg } = ctx;
  const price = catalog.price(p);
  const pair = p.pair_sku ? catalog.bySku.get(p.pair_sku) : null;
  const related = catalog.related(p, 4);
  const fitList = p.fits.filter((f) => f.level === 'chassis').map((f) => { const mk = catalog.vehicles.makes.find((m) => m.slug === f.make); const md = mk.models.find((m) => m.slug === f.model); const g = md.generations.find((x) => x.slug === f.gen); return { mk, md, g }; });
  const hasPos = /front|rear|mirror|surround/i.test(`${p.title_raw} ${p.supplier_note} ${p.used_for_raw}`);
  const setMatch = /1SET=(\d+)PCS/i.exec(p.title_raw);
  const crumbItems = [{ name: 'Home', url: '/' }, { name: p.brand, url: `/brand/${p.brand_slug}` }, { name: p.category_label, url: `/category/${p.category_slug}` }, { name: p.title }];
  const inList = ctx.wishlist.includes(p.sku);
  const high = price && price.amount >= HIGH_VALUE_INR;
  const row = (k, v) => (v ? html`<tr><th scope="row">${k}</th><td>${v}</td></tr>` : '');
  const pdFaq = [
    ['Is the fitment for my car verified?', 'No. Fitment is supplier-listed (chassis codes, models, years and OEM number from the supplier catalogue). Confirm your vehicle details with us before ordering.'],
    ['Does this part need coding?', 'Some electronic lighting modules need coding or calibration after installation. This is not confirmed per part by the supplier; consult a qualified technician.'],
    ['Is it OEM or aftermarket?', 'The supplier catalogue does not state the condition of this part. It is shown as "to be confirmed with supplier".'],
  ];
  const atc = price ? html`<form action="/cart/add" method="post" data-ajax-cart id="atc-form">${C.csrfInput(ctx)}<input type="hidden" name="sku" value="${p.sku}">
      <div class="row"><div class="qty"><button type="button" data-d="-" aria-label="Decrease quantity">-</button><label class="sr" for="qty">Quantity</label><input id="qty" name="qty" value="1" inputmode="numeric" aria-label="Quantity"><button type="button" data-d="+" aria-label="Increase quantity">+</button></div>
      <button class="btn btn--primary" style="flex:1" type="submit">Add to cart</button></div></form>` : html`<div class="notice"><strong>Price on request.</strong> The supplier catalogue has no price for this part. Request a quote and we will reply after confirming with the supplier.</div>
      <form action="/enquiry/quote" method="post" class="stack" style="margin-top:16px">${C.csrfInput(ctx)}<input type="hidden" name="sku" value="${p.sku}"><input type="text" name="website" class="sr" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="form-grid form-grid--2"><div><label for="qn">Your name</label><input id="qn" name="name" required maxlength="80" autocomplete="name"></div><div><label for="qe">Email</label><input id="qe" name="email" type="email" required maxlength="120" autocomplete="email"></div></div>
      <div><label for="qp">Phone / WhatsApp (optional)</label><input id="qp" name="phone" maxlength="20" inputmode="tel" autocomplete="tel"></div>
      <div><label for="qv">Your vehicle (make, model, year)</label><input id="qv" name="vehicle" maxlength="120" placeholder="e.g. BMW 320d F30 2015"></div>
      <button class="btn btn--primary btn--block" type="submit">Request quote</button></form>`;
  const body = html`<div class="container" data-product="${JSON.stringify({ slug: p.slug, title: p.title })}">${C.crumbs(crumbItems)}
  <div class="pdp">
    <div><div class="gallery__main">${p.image ? html`<img src="/assets/products/${p.image}" width="${p.image_px[0]}" height="${p.image_px[1]}" alt="${p.title} - photo from supplier catalogue" fetchpriority="high" decoding="async"><span class="gallery__cap">Photo from supplier catalogue</span>` : html`<span class="muted" style="color:#4b525c">No supplier photo listed</span>`}</div>
      <p class="small muted" style="margin-top:8px">${p.image_px && p.image_px[0] < 300 ? 'Low-resolution supplier thumbnail; request a larger photo before ordering.' : 'Click the image to zoom.'}</p>
      <div class="gallery__slot">Product video: not yet supplied. We will add a video when the supplier provides one.</div></div>
    <div><div class="row" style="gap:8px;margin-bottom:12px"><span class="tag">${p.brand}</span><span class="tag">${p.category_label}</span><span class="tag tag--accent">Supplier-listed fitment</span></div>
      <h1>${p.title}</h1>
      ${p.oem_numbers.length ? html`<p style="margin-bottom:8px"><span class="muted small">OEM reference:</span><br>${p.oem_numbers.map((o) => html`<span class="oemline">${o}</span>`)}</p>` : ''}
      <div class="buybox">
        <div class="row between"><div>${C.priceBlock(price)}</div><span class="tag">Made to order</span></div>
        ${p.side !== 'n/a' ? html`<div style="margin-top:16px"><div class="label">Side</div><div class="seg" role="group" aria-label="Left or right">${p.side === 'left' ? html`<a href="/product/${p.slug}" aria-current="true">Left</a>` : pair ? html`<a href="/product/${pair.slug}">Left</a>` : html`<span class="tag">Left: not listed</span>`}${p.side === 'right' ? html`<a href="/product/${p.slug}" aria-current="true">Right</a>` : pair ? html`<a href="/product/${pair.slug}">Right</a>` : html`<span class="tag">Right: not listed</span>`}</div></div>` : ''}
        ${hasPos ? html`<p class="small muted" style="margin-top:12px">Front / rear position is noted in the supplier text (${p.supplier_note || p.used_for_raw}). You will confirm the position at checkout.</p>` : ''}
        <div style="margin-top:16px">${atc}</div>
        <div class="notice notice--warn" style="margin-top:16px"><strong>Supplier-listed fitment, confirm before ordering.</strong> Compare the OEM number on your existing part and <a href="/enquiry?sku=${p.sku}">ask us to confirm</a>.${high ? html` <strong>High-value item: you will be asked to confirm your vehicle details twice at checkout.</strong>` : ''}</div>
        <form action="/wishlist/toggle" method="post" style="margin-top:12px">${C.csrfInput(ctx)}<input type="hidden" name="sku" value="${p.sku}"><button class="btn btn--ghost btn--sm" type="submit">${inList ? 'Remove from wishlist' : 'Save to wishlist'}</button></form>
      </div>
      <table class="spec" aria-label="Delivery and policy">
        ${row('Ships from', cfg.site.shipping_origin)}${row('Delivery estimate', cfg.site.delivery_estimate.india_text)}${row('Warranty', html`${cfg.site.warranty.summary} <a href="/policies/warranty">Warranty page</a>`)}${row('Returns', html`Terms pending supplier agreement. <a href="/policies/returns">Return policy</a>`)}${row('Payment', 'Prepaid only (no cash on delivery)')}
      </table></div></div>

  <div class="grid" style="margin-top:56px"><div class="col-8"><h2>Specifications</h2>
    <table class="spec">${row('Part type', p.part_type)}${row('Category', p.category_label)}${row('Brand / make', p.brand)}${row('OEM numbers', p.oem_numbers.join(', ') || null)}${row('Vehicle (supplier text)', [p.model_text, p.chassis_text].filter(Boolean).join(' - ') || null)}${row('Production years', p.years_text || 'Not stated by supplier')}${row('Side', p.side !== 'n/a' ? p.side : 'Not side-specific / not stated')}${row('Condition', 'To be confirmed with supplier (OEM / OEM-equivalent / aftermarket not stated)')}${row('Material', 'Not stated by supplier')}${row('Supplier note', p.supplier_note || null)}${row('Supplier reference', p.supplier_ref)}${row('Stock', 'Made to order (availability confirmed after enquiry)')}${row('SKU', html`<span class="mono">${p.sku}</span>`)}</table>
    <h2 style="margin-top:40px">Compatibility</h2>
    <p>Listed by the supplier for: <strong>${[p.brand, p.model_text, p.chassis_text, p.years_text].filter(Boolean).join(' | ')}</strong>. Supplier-listed, not verified.</p>
    ${fitList.length ? html`<ul class="feature-list">${fitList.map((f) => html`<li><a href="/vehicle?make=${f.mk.slug}&amp;model=${f.md.slug}&amp;gen=${f.g.slug}">${f.mk.name} ${f.md.name} ${f.g.code}</a> (${f.g.year_from}${f.g.year_to ? '-' + f.g.year_to : ' onward'}) - matched on chassis code</li>`)}</ul>` : html`<p class="small muted">This listing could not be matched to a specific generation in our vehicle database. Ask us to confirm.</p>`}
    <h2 style="margin-top:40px">What is included</h2>
    <p>${setMatch ? `Supplier lists this as a set of ${setMatch[1]} pcs.` : 'The supplier does not list included components for this item. We will confirm what is in the box before you pay if you ask.'}</p>
    <h2 style="margin-top:40px">Installation &amp; coding</h2>
    <p>Electronic lighting modules may need coding or calibration with dealer-level tools after installation. We do not guarantee plug-and-play. Have a qualified technician fit the part. <a href="/policies/installation-coding">Installation &amp; coding disclaimer</a>.</p>
    <h2 style="margin-top:40px">Questions</h2><div class="acc">${pdFaq.map(([q, a]) => html`<details><summary>${q}</summary><div class="body">${a}</div></details>`)}</div></div>
    <div class="col-4"><div class="card"><h3>Need help confirming?</h3><p class="small">Send a photo of your existing part or your vehicle details.</p><a class="btn btn--block" href="/enquiry?sku=${p.sku}">Ask about this part</a></div>
      <div class="card" style="margin-top:16px" id="recently-viewed" hidden><h3>Recently viewed</h3><ul class="feature-list"></ul></div></div></div>

  ${related.length ? html`<section style="margin-top:56px"><h2>Related parts</h2><div class="pgrid">${related.map((r) => C.productCard(ctx, r))}</div></section>` : ''}
  <div style="height:48px"></div></div>
  ${price ? html`<div class="stickyatc">${C.priceBlock(price)}<button class="btn btn--primary" type="submit" form="atc-form">Add to cart</button></div>` : html`<div class="stickyatc"><span class="price price--req">Price on request</span><a class="btn btn--primary" href="#qn">Request quote</a></div>`}`;
  return layout(ctx, { title: p.seo.title, description: p.seo.description, canonical: `/product/${p.slug}`, body, ogType: 'product', ogImage: p.image ? `/assets/products/${p.image}` : null,
    jsonld: [seo.product(cfg, p, price), seo.breadcrumbs(cfg, crumbItems.map((c) => ({ name: c.name, url: c.url || `/product/${p.slug}` }))), seo.faqPage(pdFaq)] });
}

module.exports = { home, listing, vehiclePage, productPage };
