'use strict';
const { h, raw, esc, jsonLd } = require('../lib/html');
const { rupee, fmtDate } = require('../lib/util');
const U = require('./ui');
const { icon, productGrid, productRow, section, breadcrumbs, breadcrumbLd, pagination, field, select, csrfInput, priceBlock, svg } = U;
const blog = require('../../content/blog'); const pages = require('../../content/pages'); const seo = require('../../content/seo-landings');

const pick = (cat, { cats, flag, n = 8, pet, filter }) => {
  let items = cat.products.filter((p) => !p.rx && (!cats || cats.some((c) => cat.descendants(c).includes(p.category))) && (!flag || p[flag]) && (!pet || p.petType.includes(pet)) && (!filter || filter(p)));
  items = items.sort(cat.SORTS.relevance); return items.slice(0, n);
};
const articleCard = (a) => h`<article class="card article-card"><div class="article-art" aria-hidden="true">${raw(svg.pawPath ? `<svg viewBox="0 0 120 80" width="100%" height="100%"><rect width="120" height="80" fill="var(--c-sage-l)"/>${svg.pawPath(60, 44, 20, 'var(--c-sage)')}</svg>` : '')}</div><div class="card-body"><p class="eyebrow">${a.category}</p><h3 class="card-title"><a href="/blog/${a.slug}">${a.title}</a></h3><p class="muted small">${a.description}</p><p class="small muted">${fmtDate(a.date)}</p></div></article>`;

function reviewList(reviews) {
  return h`<ul class="reviews" role="list">${reviews.map((r) => h`<li class="review"><div class="review-top"><span class="stars" role="img" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span><strong>${r.title || ''}</strong></div><p>${r.body}</p><p class="small muted">${r.name}${r.verified ? ' - verified buyer' : ''} - ${fmtDate(r.createdAt)}</p></li>`)}</ul>`;
}

function home(ctx, d) {
  const c = ctx.catalogue; const brand = ctx.brand;
  const tiles = c.tree.map((top) => { const p = pick(c, { cats: [top.slug], n: 1 })[0]; return { top, img: p ? p.images[0].src : null }; });
  const row = (id, title, items, o = {}) => (items.length ? section(id, title, { ...o, body: productRow(items, ctx) }) : '');
  const body = h`
  <section class="hero" aria-labelledby="hero-h"><div class="wrap hero-grid">
    <div class="hero-copy"><p class="eyebrow">Dogs &amp; cats, considered</p><h1 id="hero-h">Everyday essentials for the dogs and cats you love</h1><p class="lead">Food, walking gear, beds, toys and care essentials, with the batch, expiry and manufacturer details you need on every product page.</p>
      <div class="hero-cta"><a class="btn btn-primary btn-lg" href="/dogs">Shop for dogs</a><a class="btn btn-secondary btn-lg" href="/cats">Shop for cats</a></div>
      <form class="pin-strip" novalidate data-pin-check action="/api/pincode" method="get"><label for="hero-pin">Check delivery to your PIN code</label><div class="pin-row"><input id="hero-pin" name="pin" inputmode="numeric" autocomplete="postal-code" maxlength="6" pattern="[1-9][0-9]{5}" placeholder="6-digit PIN" value="${ctx.pin || ''}"><button class="btn btn-ghost" type="submit">Check</button></div><p class="pin-result small" data-pin-result aria-live="polite"></p></form></div>
    <div class="hero-art">${raw(svg.heroScene())}</div></div></section>
  <section class="trust" aria-label="Why shop with us"><div class="wrap trust-grid"><div>${icon('pin', 22)}<p><strong>PIN-code delivery check</strong><span>Estimated delivery before you pay</span></p></div><div>${icon('shield', 22)}<p><strong>Batch &amp; expiry shown</strong><span>On food and supplement listings</span></p></div><div>${icon('repeat', 22)}<p><strong>Reorder &amp; repeat schedules</strong><span>One-click reorder from your account</span></p></div><div>${icon('check', 22)}<p><strong>Honest information</strong><span>No invented reviews or ratings</span></p></div></div></section>
  ${section('pet', 'Shop by pet', { body: h`<div class="pet-cards"><a class="pet-card pet-dog" href="/dogs"><span class="pet-art" aria-hidden="true">${raw(svg.dogHead())}</span><span><strong>Dogs</strong><span>Food, collars &amp; harnesses, beds, toys, grooming</span></span>${icon('chevronR', 20)}</a><a class="pet-card pet-cat" href="/cats"><span class="pet-art" aria-hidden="true">${raw(svg.catHead())}</span><span><strong>Cats</strong><span>Food, litter, scratchers, trees, toys, grooming</span></span>${icon('chevronR', 20)}</a></div>` })}
  ${section('cats', 'Shop by category', { cls: 'tint', body: h`<ul class="tiles" role="list">${tiles.map((t) => h`<li><a class="tile" href="/collections/${t.top.slug}">${t.img ? h`<img src="${t.img}" width="800" height="800" alt="" loading="lazy">` : ''}<span class="tile-label">${t.top.title}</span></a></li>`)}</ul>` })}
  ${row('featured', 'Featured picks', pick(c, { flag: 'featured', n: 10 }), { eyebrow: "Editor's picks", link: '/collections/bestsellers', intro: 'Hand-picked by our team - not a sales ranking.' })}
  ${row('food', 'Premium pet food', pick(c, { cats: ['dog-food', 'cat-food'], n: 10, filter: (p) => p.foodType === 'dry' || p.foodType === 'wet' }), { link: '/collections/dog-food', linkText: 'Dog food' })}
  ${row('walk', 'Collars & walking', pick(c, { cats: ['collars-walking'], n: 10 }), { link: '/collections/collars-walking' })}
  ${row('beds', 'Beds & furniture', pick(c, { cats: ['beds-furniture'], n: 10 }), { link: '/collections/beds-furniture' })}
  ${row('toys', 'Interactive toys', pick(c, { cats: ['toys'], n: 10 }), { link: '/collections/toys' })}
  ${row('feeders', 'Smart feeders &amp; drinking'.replace('&amp;', '&'), pick(c, { cats: ['feeders-drinking'], n: 10 }), { link: '/collections/feeders-drinking' })}
  ${row('grooming', 'Grooming & hygiene', pick(c, { cats: ['pet-grooming-products'], n: 10 }), { link: '/collections/pet-grooming-products' })}
  ${row('new', 'New arrivals', pick(c, { flag: 'isNew', n: 10 }), { link: '/collections/new-arrivals' })}
  ${section('offers', 'Offers & bundles', { cls: 'tint', link: '/bundles', linkText: 'All bundles', body: h`${row0(pick(c, { flag: 'discounted', n: 10, filter: (p) => p.maxDiscount >= 10 }), ctx)}<ul class="bundle-row" role="list">${c.bundles.slice(0, 3).map((b) => h`<li>${bundleCard(b, ctx)}</li>`)}</ul>` })}
  ${section('brands', 'Trusted brands', { body: h`<div class="empty-state"><p><strong>Brand partners will be listed here.</strong></p><p class="muted">We list brands only once the partnership is confirmed, and we never show logos we are not authorised to use.</p></div>` })}
  ${section('guides', 'Pet care guides', { link: '/blog', linkText: 'All guides', body: h`<ul class="grid article-grid" role="list">${blog.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((a) => h`<li>${articleCard(a)}</li>`)}</ul>` })}
  ${section('reviews', 'Customer reviews', { cls: 'tint', body: d.reviews.length ? reviewList(d.reviews) : h`<div class="empty-state"><p><strong>No reviews yet.</strong></p><p class="muted">We only show genuine reviews submitted by customers and approved by our team. After your order arrives, you can review any product from its page.</p></div>` })}
  <section class="section help-band" aria-labelledby="news-h"><div class="wrap help-grid">
    <div><h2 id="news-h">Stay in the loop</h2><p class="lead">Occasional care guides and offers. We only email you if you tick the consent box.</p>
      <form method="post" action="/newsletter" class="inline-form">${csrfInput(ctx)}<label class="vh" for="nl-email">Email address</label><input id="nl-email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"><button class="btn btn-primary" type="submit">Subscribe</button><label class="check consent"><input type="checkbox" name="consent" value="1" required> I agree to receive marketing emails and have read the <a href="/policies/privacy">privacy policy</a>.</label></form>
      <p class="small muted">Status: your email is saved with your consent. Our email service is not connected yet, so nothing is sent for now.</p></div>
    <div class="help-card"><h2>Need help choosing?</h2><p>Questions about sizing, delivery or your order? Reach us any time.</p>${ctx.cfg.whatsappNumber ? h`<a class="btn btn-secondary" href="https://wa.me/${ctx.cfg.whatsappNumber}" target="_blank" rel="noopener">${icon('whatsapp', 18)} Chat on WhatsApp</a>` : h`<p class="small muted">WhatsApp support has not been set up yet.</p>`}<a class="link-arrow" href="/contact">Contact us ${icon('chevronR', 16)}</a></div></div></section>`;
  return { title: `${brand.name} - Premium dog & cat supplies in India`, titleExact: true, description: 'Dog and cat food, collars, harnesses, beds, toys, feeders and grooming essentials with PIN-code delivery checks and clear batch and expiry information.', body, canonical: '/', bodyClass: 'home',
    jsonld: [{ '@context': 'https://schema.org', '@type': 'Organization', name: brand.name, url: ctx.cfg.siteUrl, logo: ctx.cfg.siteUrl + '/assets/img/logo.svg', ...(brand.supportEmail && !/invalid/.test(brand.supportEmail) ? { email: brand.supportEmail } : {}) },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: brand.name, url: ctx.cfg.siteUrl, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: ctx.cfg.siteUrl + '/search?q={search_term_string}' }, 'query-input': 'required name=search_term_string' } }] };
}
function row0(items, ctx) { return items.length ? productRow(items, ctx) : ''; }
function bundleCard(b, ctx) {
  const lines = b.items.map((i) => ctx.catalogue.bySku(i.sku)).filter(Boolean);
  const total = lines.reduce((s, x, i) => s + x.variant.price * b.items[i].qty, 0); const now = Math.round(total * (1 - b.discountPct / 100));
  return h`<article class="card bundle-card"><a class="card-media" href="/bundles#${b.slug}" tabindex="-1" aria-hidden="true"><img src="${b.image}" width="800" height="800" alt="" loading="lazy"></a><div class="card-body"><p class="eyebrow">Bundle - ${b.discountPct}% off</p><h3 class="card-title"><a href="/bundles#${b.slug}">${b.title}</a></h3><p class="price"><span class="price-now">${rupee(now)}</span> <span class="price-mrp"><span class="vh">Separately </span><s>${rupee(total)}</s></span></p></div></article>`;
}

function petPage(ctx, pet) {
  const c = ctx.catalogue; const nav = c.navFor(pet); const name = pet === 'dog' ? 'Dogs' : 'Cats';
  const body = h`<div class="page-head pet-head"><div class="wrap"><nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><span aria-current="page">${name}</span></li></ol></nav><div class="ph-grid"><div><h1>${pet === 'dog' ? 'Everything for your dog' : 'Everything for your cat'}</h1><p class="lead">${pet === 'dog' ? 'From daily meals to walks, naps and play. Filter by breed size, age and weight on any category.' : 'Food they will eat, litter they will use and places to scratch, climb and nap. Filter by age, flavour and litter type.'}</p><a class="btn btn-primary" href="/collections/${pet}-supplies">Browse all ${pet} supplies</a></div><div class="ph-art" aria-hidden="true">${raw(pet === 'dog' ? svg.dogHead() : svg.catHead())}</div></div></div></div>
  ${section('p-cats', `Shop ${name.toLowerCase()} by category`, { body: h`<div class="cat-groups">${nav.map((top) => h`<div class="cat-group"><h3><a href="/collections/${top.slug}${top.pet === 'both' ? '?pet=' + pet : ''}">${top.title}</a></h3><ul>${top.children.map((ch) => h`<li><a href="/collections/${ch.slug}${ch.pet === 'both' ? '?pet=' + pet : ''}">${ch.title}</a></li>`)}</ul></div>`)}</div>` })}
  ${section('p-feat', `Featured for ${name.toLowerCase()}`, { cls: 'tint', body: productRow(pick(c, { pet, flag: 'featured', n: 10 }), ctx), link: `/collections/${pet}-supplies` })}
  ${section('p-new', 'New arrivals', { body: productRow(pick(c, { pet, flag: 'isNew', n: 10 }), ctx), link: '/collections/new-arrivals?pet=' + pet })}
  ${ctx.user && ctx.pets.filter((x) => x.type === pet).length ? '' : h`<section class="section"><div class="wrap"><div class="callout"><p><strong>Add your ${pet} to see items that suit them.</strong> Simple matching on age group and size only.</p><a class="btn btn-ghost" href="/pets">Create a pet profile</a></div></div></section>`}`;
  return { title: pet === 'dog' ? 'Dog supplies online India - food, collars, beds, toys' : 'Cat supplies online India - food, litter, scratchers, toys', description: `Shop ${pet} food, accessories, beds, toys, feeders and grooming essentials. Delivery across India with PIN-code checks.`, body, tab: name.toLowerCase(),
    jsonld: [U.breadcrumbLd([{ name: 'Home', url: '/' }, { name, url: '/' + pet + 's' }], ctx.cfg.siteUrl)] };
}

const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) for (const x of [].concat(v)) if (x !== '' && x !== undefined && x !== null) p.append(k, x); const s = p.toString(); return s ? '?' + s : ''; };

function collection(ctx, d) {
  const { def, res, sel, sort, pet, q } = d; const c = ctx.catalogue;
  const land = seo[def.slug]; const petWord = pet && def.pet === 'both' ? (pet === 'dog' ? 'Dog ' : 'Cat ') : '';
  const baseTitle = petWord + def.title; const h1 = land ? land.h1 : baseTitle;
  const path = '/collections/' + def.slug;
  const keep = { pet: d.petParam, sort: sort !== 'relevance' ? sort : '', for: d.forPet ? d.forPet.id : '' };
  const url = (extra) => path + qs({ ...keep, ...sel, ...extra });
  const hasFilters = Object.values(sel).some((v) => v.length) || sort !== 'relevance' || !!d.forPet;
  const chips = Object.entries(sel).flatMap(([k, vals]) => vals.map((v) => { const f = res.facets.find((x) => x.key === k); const lab = f ? (f.values.find((x) => x.value === v) || { label: v }).label : v; const next = { ...sel, [k]: vals.filter((x) => x !== v) }; return h`<a class="chip" href="${path + qs({ ...keep, ...next })}" aria-label="Remove filter ${lab}">${lab} ${icon('close', 14)}</a>`; }));
  const crumbs = [{ name: 'Home', url: '/' }]; if (def.node && def.parent) { crumbs.push({ name: def.parent.title, url: '/collections/' + def.parent.slug }); } crumbs.push({ name: baseTitle, url: path });
  const filterForm = h`<form class="filters" id="filters" method="get" action="${path}" data-filters>
    <div class="filters-head"><h2>Filters</h2><button class="icon-btn filters-close" type="button" data-close-filters aria-label="Close filters">${icon('close', 22)}</button></div>
    ${d.petParam ? h`<input type="hidden" name="pet" value="${d.petParam}">` : ''}<input type="hidden" name="sort" value="${sort}">${d.forPet ? h`<input type="hidden" name="for" value="${d.forPet.id}">` : ''}
    ${res.facets.map((f) => h`<fieldset class="facet"><legend>${f.label}</legend><ul>${f.values.map((v, i) => h`<li><label class="check"><input type="checkbox" name="${f.key}" value="${v.value}" ${v.checked ? raw('checked') : ''}> <span>${v.label}</span> <span class="count">${v.count}</span></label></li>`)}</ul></fieldset>`)}
    <div class="filters-foot"><button class="btn btn-primary" type="submit">Apply filters</button><a class="btn btn-ghost" href="${path + qs(keep)}">Clear all</a></div></form>`;
  const listJson = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: h1, url: ctx.cfg.siteUrl + path, ...(res.items.length ? { mainEntity: { '@type': 'ItemList', itemListElement: res.items.slice(0, 24).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: ctx.cfg.siteUrl + '/products/' + p.slug })) } } : {}) };
  const faqLd = land && land.faqs ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: land.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) } : null;
  const body = h`<div class="page-head"><div class="wrap">${breadcrumbs(crumbs)}<h1>${h1}</h1>${land ? h`<div class="lead-copy">${land.intro.map((t) => h`<p>${t}</p>`)}</div>` : def.slug === 'dog-supplies' || def.slug === 'cat-supplies' ? '' : h`<p class="lead">${res.total} ${res.total === 1 ? 'product' : 'products'}</p>`}
    ${def.rx ? h`<div class="callout callout-rx" role="note">${icon('alert', 20)}<p><strong>Prescription / regulated.</strong> ${def.note}</p></div>` : ''}</div></div>
  <div class="wrap listing">
    <div class="list-tools"><button class="btn btn-ghost btn-sm filter-open" type="button" data-open-filters aria-controls="filters" aria-expanded="false">${icon('filter', 18)} Filters${chips.length ? ` (${chips.length})` : ''}</button><p class="muted small" aria-live="polite">${res.total} ${res.total === 1 ? 'result' : 'results'}</p>
      <form class="sort-form" method="get" action="${path}">${d.petParam ? h`<input type="hidden" name="pet" value="${d.petParam}">` : ''}${Object.entries(sel).flatMap(([k, v]) => v.map((x) => h`<input type="hidden" name="${k}" value="${x}">`))}${d.forPet ? h`<input type="hidden" name="for" value="${d.forPet.id}">` : ''}<label for="sort">Sort by</label>${select('sort', 'sort', [{ value: 'relevance', label: 'Featured' }, { value: 'price-asc', label: 'Price: low to high' }, { value: 'price-desc', label: 'Price: high to low' }, { value: 'newest', label: 'Newest' }, { value: 'discount', label: 'Biggest discount' }, { value: 'name-asc', label: 'Name: A to Z' }], sort, 'data-autosubmit')}<noscript><button class="btn btn-ghost btn-sm">Sort</button></noscript></form></div>
    ${ctx.pets.length ? h`<form class="for-pet" method="get" action="${path}">${d.petParam ? h`<input type="hidden" name="pet" value="${d.petParam}">` : ''}<label for="for">Suits my pet</label>${select('for', 'for', [{ value: '', label: 'Show everything' }, ...ctx.pets.map((p) => ({ value: p.id, label: `${p.name} (${p.type})` }))], d.forPet ? d.forPet.id : '', 'data-autosubmit')}<noscript><button class="btn btn-ghost btn-sm">Apply</button></noscript></form>` : ''}
    ${d.forPet ? h`<p class="callout small">Showing items matching ${d.forPet.name}'s type, age group and size only. ${d.petDisclaimer}</p>` : ''}
    ${chips.length ? h`<div class="chips" aria-label="Active filters">${chips}</div>` : ''}
    <div class="listing-grid">${filterForm}<div class="results">${res.items.length ? productGrid(res.items, ctx, { eagerFirst: true }) : h`<div class="empty-state"><p><strong>No products match these filters.</strong></p><p class="muted">Try removing a filter. ${def.rx ? '' : ''}</p><a class="btn btn-ghost" href="${path + qs(keep)}">Clear filters</a></div>`}
      ${pagination(res.page, res.pages, (n) => url({ page: n }))}</div></div>
    ${land ? h`<div class="seo-copy">${land.guide.map((g) => h`<h2>${g.h}</h2><p>${g.p}</p>`)}<h2>Frequently asked questions</h2><div class="faq">${land.faqs.map((f) => h`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}</div></div>` : ''}
  </div>`;
  return { title: land ? land.title : baseTitle + (d.page > 1 ? ` - page ${d.page}` : ''), description: land ? land.description : `Shop ${baseTitle.toLowerCase()} online in India. ${res.total} products with PIN-code delivery checks.`, body, noindex: hasFilters || !!d.petParam && def.pet !== 'both' ? true : false,
    canonical: path + (res.page > 1 ? qs({ page: res.page }) : (d.petParam && def.pet === 'both' ? qs({ pet: d.petParam }) : '')),
    jsonld: [U.breadcrumbLd(crumbs, ctx.cfg.siteUrl), listJson, ...(faqLd ? [faqLd] : [])], tab: def.pet === 'cat' ? 'cats' : def.pet === 'dog' ? 'dogs' : '', ogImage: res.items[0] && res.items[0].images[0].src };
}

function productPage(ctx, d) {
  const { p, reviews, related, petMatches, defaultVariant } = d; const first = defaultVariant; const demo = ctx.cfg.demoCatalogue;
  const vdata = p.variants.map((v) => ({ sku: v.sku, label: v.label, options: v.options, price: v.price, mrp: v.mrp, status: ctx.stockOf(v.sku) <= 0 ? 'out' : ctx.stockOf(v.sku) <= 5 ? 'low' : 'in', left: ctx.stockOf(v.sku) }));
  const optNames = p.variants.length > 1 ? Object.keys(p.variants[0].options) : [];
  const crumbs = [{ name: 'Home', url: '/' }, ...ctx.catalogue.breadcrumbs(p).map((b) => ({ name: b.title, url: '/collections/' + b.slug })), { name: p.title, url: '/products/' + p.slug }];
  const row = (k, v) => (v ? h`<tr><th scope="row">${k}</th><td>${v}</td></tr>` : '');
  const inv = first ? ctx.inv(first.sku) : null;
  const status = !first ? '' : ctx.stockOf(first.sku) <= 0 ? 'out' : ctx.stockOf(first.sku) <= 5 ? 'low' : 'in';
  const buyable = !p.rx && p.purchasable !== false && p.variants.length > 0;
  const offerBase = (v) => ({ '@type': 'Offer', url: ctx.cfg.siteUrl + '/products/' + p.slug, priceCurrency: 'INR', price: String(v.price), availability: ctx.stockOf(v.sku) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition' });
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.title, description: p.description, sku: p.sku, brand: { '@type': 'Brand', name: p.brand }, image: p.images.map((i) => ctx.cfg.siteUrl + i.src), category: p.categoryPath.map(ctx.catalogue.catTitle).join(' > '), ...(p.manufacturer ? { manufacturer: { '@type': 'Organization', name: p.manufacturer } } : {}), countryOfOrigin: p.countryOfOrigin };
  if (buyable && p.minPrice > 0) ld.offers = p.variants.length > 1 ? { '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: String(p.minPrice), highPrice: String(p.maxPrice), offerCount: p.variants.length, offers: p.variants.map(offerBase) } : offerBase(p.variants[0]);
  if (reviews.length) { ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1), reviewCount: reviews.length, bestRating: 5, worstRating: 1 }; ld.review = reviews.slice(0, 10).map((r) => ({ '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: r.rating }, author: { '@type': 'Person', name: r.name }, reviewBody: r.body })); }
  const faqLd = p.faqs && p.faqs.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) } : null;
  const isFood = ['dry', 'wet', 'treat', 'supplement'].includes(p.foodType);
  const body = h`<div class="wrap pdp-wrap">${breadcrumbs(crumbs)}
  ${demo ? h`<div class="callout demo-note" role="note">${icon('info', 20)}<p><strong>Demo catalogue.</strong> This product, its brand, images, price and specifications are placeholders for development. It is not a real product listing.</p></div>` : ''}
  <div class="pdp">
    <div class="gallery" data-gallery><div class="gallery-main"><img id="gal-main" src="${p.images[0].src}" width="${p.images[0].w}" height="${p.images[0].h}" alt="${p.images[0].alt}" fetchpriority="high"></div>
      <ul class="thumbs" role="list">${p.images.map((im, i) => h`<li><button type="button" class="thumb${i === 0 ? ' on' : ''}" data-src="${im.src}" data-alt="${im.alt}" aria-label="Show image ${i + 1} of ${p.images.length}" aria-pressed="${i === 0}"><img src="${im.src}" width="120" height="120" alt="" loading="lazy"></button></li>`)}</ul>
      <p class="small muted">Illustrations are development placeholders. Real product photography is required before launch.</p></div>
    <div class="pdp-info">
      <p class="eyebrow">${p.brand}</p><h1>${p.title}</h1><div class="pdp-badges">${U.pillBadges(p)}${p.demo && demo ? h`<span class="badge">Demo</span>` : ''}</div>
      <div id="price-block" aria-live="polite">${priceBlock(p, p.variants.length > 1 ? null : first)}</div>
      ${p.rx ? h`<div class="callout callout-rx" role="note">${icon('alert', 20)}<p><strong>Prescription required.</strong> This regulated veterinary product is listed for information and cannot be purchased online without authorisation from a veterinarian.</p></div>` : ''}
      ${buyable ? h`<form method="post" action="/cart/add" class="buy-form" id="buy-form">${csrfInput(ctx)}<input type="hidden" name="back" value="/products/${p.slug}">
        ${p.variants.length > 1 ? h`<div class="field"><label for="variant-select">${optNames.join(' / ')}</label>${select('variant-select', 'sku', p.variants.map((v) => ({ value: v.sku, label: `${v.label} - ${rupee(v.price)}${ctx.stockOf(v.sku) <= 0 ? ' (out of stock)' : ''}` })), first.sku, 'data-variant-select')}</div><div class="pills" data-pills aria-hidden="false"></div>` : h`<input type="hidden" name="sku" value="${first.sku}">`}
        <p class="stock stock-${status}" id="stock-line" role="status">${status === 'out' ? 'Out of stock' : status === 'low' ? `Only ${ctx.stockOf(first.sku)} left in stock` : 'In stock'}</p>
        <div class="qty-row"><div class="qty" data-qty><button type="button" class="qty-btn" data-dec aria-label="Decrease quantity">${icon('minus', 16)}</button><label class="vh" for="qty">Quantity</label><input id="qty" name="qty" type="number" inputmode="numeric" min="1" max="10" value="1"><button type="button" class="qty-btn" data-inc aria-label="Increase quantity">${icon('plus', 16)}</button></div>
          <button class="btn btn-primary btn-lg grow" type="submit" id="atc" ${status === 'out' ? raw('disabled') : ''}>Add to cart</button></div>
        <button class="btn btn-secondary btn-lg" type="submit" name="buy" value="1" id="buy-now" ${status === 'out' ? raw('disabled') : ''}>Buy now</button></form>
        <div class="pdp-links">${ctx.wishButton(p.slug, 'link-btn', true)}<a class="link-arrow" href="/subscriptions/new?sku=${first.sku}" id="sub-link">${icon('repeat', 16)} Subscribe &amp; save (schedule only)</a></div>` : ''}
      <script type="application/json" id="variants-data">${raw(JSON.stringify(vdata).replace(/</g, '\\u003c'))}</script>
      <div class="pin-box"><form novalidate data-pin-check action="/api/pincode" method="get"><label for="pdp-pin">${icon('truck', 18)} Delivery estimate</label><div class="pin-row"><input id="pdp-pin" name="pin" inputmode="numeric" autocomplete="postal-code" maxlength="6" pattern="[1-9][0-9]{5}" placeholder="Enter PIN code" value="${ctx.pin || ''}"><button class="btn btn-ghost" type="submit">Check</button></div><p class="pin-result small" data-pin-result aria-live="polite"></p></form></div>
      ${petMatches.length ? h`<div class="suit-box"><h2 class="h4">Suits your pets?</h2><ul>${petMatches.map((m) => h`<li>${m.r.suits ? icon('check', 16) : icon('info', 16)} <span><strong>${m.pet.name}</strong>: ${m.r.suits ? m.r.reasons.join('; ') : 'may not suit - ' + (m.r.mismatch || []).join('; ')}</span></li>`)}</ul><p class="small muted">${d.petDisclaimer}</p></div>` : ''}
      <ul class="assure"><li>${icon('shield', 18)} Manufacturer, origin and batch details listed below</li><li>${icon('box', 18)} Returns per our <a href="/policies/returns">return policy</a></li></ul>
    </div>
  </div>
  <div class="pdp-details">
    <section id="about" aria-labelledby="desc-h"><h2 id="desc-h">About this product</h2><p>${p.description}</p>${p.benefits && p.benefits.length ? h`<ul class="ticks">${p.benefits.map((b) => h`<li>${icon('check', 16)} ${b}</li>`)}</ul>` : ''}</section>
    ${p.ingredients ? h`<section aria-labelledby="ing-h"><h2 id="ing-h">Ingredients</h2><p>${p.ingredients}</p></section>` : ''}
    ${p.nutrition ? h`<section aria-labelledby="nut-h"><h2 id="nut-h">Nutritional information</h2><table class="spec"><tbody>${Object.entries(p.nutrition).map(([k, v]) => row(k, v))}</tbody></table></section>` : ''}
    ${p.feedingInstructions ? h`<section aria-labelledby="feed-h"><h2 id="feed-h">Feeding instructions</h2><p>${p.feedingInstructions}</p></section>` : ''}
    ${p.materials ? h`<section aria-labelledby="mat-h"><h2 id="mat-h">Materials &amp; care</h2><p>${p.materials}</p></section>` : ''}
    <section aria-labelledby="spec-h"><h2 id="spec-h">Product details</h2><table class="spec"><tbody>${row('Brand', p.brand)}${row('Pet type', p.petType.map((x) => ctx.catalogue.cap(x)).join(', '))}${row('Age group', p.ageGroup.map(ctx.catalogue.cap).join(', '))}${row('Breed suitability', p.breedSuitability.join(', '))}${row('Size', p.size.map(ctx.catalogue.cap).join(', '))}${row('Suitable pet weight', p.petWeightKg && p.petWeightKg.max ? `${p.petWeightKg.min} - ${p.petWeightKg.max} kg` : '')}${row('Manufacturer', p.manufacturer)}${row('Country of origin', p.countryOfOrigin)}${row('Batch (in stock)', inv && inv.batch)}${row('Best before / expiry', inv && inv.expiry ? fmtDate(inv.expiry) : '')}${row('Storage', p.storage)}${row('SKU', first && first.sku)}${row('Tags', p.tags.join(', '))}</tbody></table>${inv && inv.batch ? h`<p class="small muted">Batch and expiry are those recorded in our warehouse for the selected variant; the date printed on your pack is the final reference.</p>` : ''}${isFood ? h`<p class="small muted">Food &amp; nutrition information is general. See the <a href="/policies/food-nutrition-disclaimer">food &amp; nutrition disclaimer</a>.</p>` : ''}</section>
    ${p.faqs && p.faqs.length ? h`<section aria-labelledby="faq-h"><h2 id="faq-h">Questions &amp; answers</h2><div class="faq">${p.faqs.map((f) => h`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}</div></section>` : ''}
    <section id="reviews" aria-labelledby="rev-h"><h2 id="rev-h">Reviews</h2>${reviews.length ? reviewList(reviews) : h`<p class="empty-inline"><strong>No reviews yet.</strong> Be the first to share your experience.</p>`}
      <details class="review-form"><summary class="btn btn-ghost">Write a review</summary><form method="post" action="/reviews" class="form-stack">${csrfInput(ctx)}<input type="hidden" name="slug" value="${p.slug}">
        ${field({ id: 'rv-name', name: 'name', label: 'Your name', required: true, maxlength: 60, autocomplete: 'name' })}
        <div class="field"><label for="rv-rating">Rating<span class="req" aria-hidden="true"> *</span></label>${select('rv-rating', 'rating', [{ value: '', label: 'Choose...' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${n} out of 5` }))], '', 'required')}</div>
        ${field({ id: 'rv-title', name: 'title', label: 'Headline', optional: true, maxlength: 100 })}
        <div class="field"><label for="rv-body">Your review<span class="req" aria-hidden="true"> *</span></label><textarea id="rv-body" name="body" rows="4" required minlength="10" maxlength="1500"></textarea></div>
        <p class="small muted">Reviews are checked by our team before they appear. We never edit ratings or publish reviews we did not receive.</p><button class="btn btn-primary" type="submit">Submit review</button></form></details></section>
  </div>
  ${related.length ? section('rel', 'You may also like', { body: productRow(related, ctx) }) : ''}</div>
  ${buyable ? h`<div class="sticky-atc" data-sticky-atc hidden><div class="sticky-info"><strong>${p.title}</strong><span id="sticky-price">${rupee(first.price)}</span></div><button class="btn btn-primary" type="button" data-sticky-click ${status === 'out' ? raw('disabled') : ''}>Add to cart</button></div>` : ''}`;
  return { title: p.title + ' - ' + p.brand, description: `${p.title} by ${p.brand}. ${p.description}`.slice(0, 158), body, ogType: 'product', ogImage: p.images[0].src, jsonld: [ld, U.breadcrumbLd(crumbs, ctx.cfg.siteUrl), ...(faqLd ? [faqLd] : [])], bodyClass: 'pdp-page', tab: p.petType.length === 1 ? p.petType[0] + 's' : '' };
}

function searchPage(ctx, d) {
  const { q, items, sug } = d;
  const body = h`<div class="page-head"><div class="wrap">${breadcrumbs([{ name: 'Home', url: '/' }, { name: 'Search', url: '/search' }])}<h1>${q ? `Search results for "${q}"` : 'Search'}</h1>${q ? h`<p class="lead">${items.length} ${items.length === 1 ? 'product' : 'products'} found</p>` : ''}</div></div>
  <div class="wrap">${q ? (items.length ? productGrid(items, ctx, { eagerFirst: true }) : h`<div class="empty-state"><p><strong>No products found for "${q}".</strong></p><p class="muted">Check the spelling or try a broader word like "dog food", "collar" or "litter".</p>${sug.categories.length ? h`<p>Try: ${sug.categories.map((c) => h`<a class="chip" href="${c.url}">${c.title}</a>`)}</p>` : ''}</div>`) : h`<form class="search-big" action="/search" method="get"><label for="q2" class="vh">Search</label><input id="q2" name="q" type="search" placeholder="Search products"><button class="btn btn-primary">Search</button></form>`}</div>`;
  return { title: q ? `Search: ${q}` : 'Search', description: 'Search our dog and cat supplies.', body, noindex: true, canonical: '/search', searchValue: q };
}

function bundlesPage(ctx) {
  const c = ctx.catalogue;
  const body = h`<div class="page-head"><div class="wrap">${breadcrumbs([{ name: 'Home', url: '/' }, { name: 'Bundles', url: '/bundles' }])}<h1>Bundles &amp; starter kits</h1><p class="lead">Curated sets at a bundle price. The bundle discount is applied to each item automatically at checkout.</p></div></div>
  <div class="wrap"><ul class="bundles" role="list">${c.bundles.map((b) => { const lines = b.items.map((i) => ({ ...c.bySku(i.sku), qty: i.qty })); const total = lines.reduce((s, x) => s + x.variant.price * x.qty, 0); const now = Math.round(total * (1 - b.discountPct / 100)); const avail = lines.every((l) => ctx.stockOf(l.variant.sku) >= l.qty);
    return h`<li id="${b.slug}" class="bundle"><div class="bundle-img"><img src="${b.image}" width="800" height="800" alt="" loading="lazy"></div><div><p class="eyebrow">${b.pet === 'both' ? 'Dogs & cats' : b.pet === 'dog' ? 'For dogs' : 'For cats'}</p><h2>${b.title}</h2><p>${b.description}</p><ul class="bundle-items">${lines.map((l) => h`<li><a href="/products/${l.product.slug}">${l.product.title}</a> <span class="muted">(${l.variant.label}) x ${l.qty}</span></li>`)}</ul><p class="price"><span class="price-now">${rupee(now)}</span> <span class="price-mrp"><span class="vh">Bought separately </span><s>${rupee(total)}</s></span> <span class="badge badge-off">${b.discountPct}% off</span></p>${avail ? h`<form method="post" action="/cart/add-bundle">${csrfInput(ctx)}<input type="hidden" name="slug" value="${b.slug}"><button class="btn btn-primary" type="submit">Add bundle to cart</button></form>` : h`<p class="stock stock-out">Currently unavailable</p>`}</div></li>`; })}</ul></div>`;
  return { title: 'Bundles & starter kits for dogs and cats', description: 'Starter kits and curated bundles for dogs and cats at a bundle price.', body, jsonld: [U.breadcrumbLd([{ name: 'Home', url: '/' }, { name: 'Bundles', url: '/bundles' }], ctx.cfg.siteUrl)] };
}

function blogIndex(ctx) {
  const body = h`<div class="page-head"><div class="wrap">${breadcrumbs([{ name: 'Home', url: '/' }, { name: 'Guides', url: '/blog' }])}<h1>Pet care guides</h1><p class="lead">Practical, general guidance for dog and cat owners. Not veterinary advice.</p></div></div><div class="wrap"><ul class="grid article-grid" role="list">${blog.slice().sort((a, b) => b.date.localeCompare(a.date)).map((a) => h`<li>${articleCard(a)}</li>`)}</ul></div>`;
  return { title: 'Pet care guides for dog and cat owners', description: 'Practical guides on collars and harnesses, reading pet food labels, switching foods, kitten setup, litter, grooming and more.', body, jsonld: [U.breadcrumbLd([{ name: 'Home', url: '/' }, { name: 'Guides', url: '/blog' }], ctx.cfg.siteUrl)] };
}
function blogPost(ctx, a) {
  const related = blog.filter((x) => x.slug !== a.slug).slice(0, 3);
  const body = h`<article class="wrap article"><header>${breadcrumbs([{ name: 'Home', url: '/' }, { name: 'Guides', url: '/blog' }, { name: a.title, url: '/blog/' + a.slug }])}<p class="eyebrow">${a.category}</p><h1>${a.title}</h1><p class="muted small">${fmtDate(a.date)} - ${ctx.brand.name} editorial</p></header><div class="prose">${a.blocks.map((b) => (b.h ? h`<h2>${b.h}</h2>` : b.p ? h`<p>${b.p}</p>` : h`<ul>${b.ul.map((i) => h`<li>${i}</li>`)}</ul>`))}<p class="callout small">${icon('info', 18)} This guide is general information, not veterinary advice. For health or diet concerns, consult your veterinarian.</p></div></article>${section('more', 'More guides', { body: h`<ul class="grid article-grid" role="list">${related.map((x) => h`<li>${articleCard(x)}</li>`)}</ul>` })}`;
  return { title: a.title, description: a.description, body, ogType: 'article', jsonld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.description, datePublished: a.date, dateModified: a.date, author: { '@type': 'Organization', name: ctx.brand.name }, publisher: { '@type': 'Organization', name: ctx.brand.name, logo: { '@type': 'ImageObject', url: ctx.cfg.siteUrl + '/assets/img/logo.svg' } }, mainEntityOfPage: ctx.cfg.siteUrl + '/blog/' + a.slug }, U.breadcrumbLd([{ name: 'Home', url: '/' }, { name: 'Guides', url: '/blog' }, { name: a.title, url: '/blog/' + a.slug }], ctx.cfg.siteUrl)] };
}
const blocks = (bs) => bs.map((b) => (b.h ? h`<h2>${b.h}</h2>` : b.p ? h`<p>${b.p}</p>` : h`<ul>${b.ul.map((i) => h`<li>${i}</li>`)}</ul>`));
function policyPage(ctx, pol) {
  return { title: pol.title, description: pol.description, body: h`<div class="wrap narrow">${breadcrumbs([{ name: 'Home', url: '/' }, { name: pol.title, url: '/policies/' + pol.slug }])}<h1>${pol.title}</h1><div class="prose">${blocks(pol.blocks)}</div><nav class="policy-nav" aria-label="Policies"><h2 class="h4">All policies</h2><ul>${pages.policies.map((x) => h`<li><a href="/policies/${x.slug}">${x.title}</a></li>`)}</ul></nav></div>`, jsonld: [U.breadcrumbLd([{ name: 'Home', url: '/' }, { name: pol.title, url: '/policies/' + pol.slug }], ctx.cfg.siteUrl)] };
}
function aboutPage(ctx) { return { title: 'About us', description: `About ${ctx.brand.name}: a considered pet-supplies store for dogs and cats in India.`, body: h`<div class="wrap narrow">${breadcrumbs([{ name: 'Home', url: '/' }, { name: 'About', url: '/about' }])}<h1>About ${ctx.brand.name}</h1><div class="prose">${blocks(pages.about)}</div></div>` }; }
function faqPage(ctx) {
  return { title: 'Help & FAQ', description: 'Answers about delivery, payment, COD, returns, prescription products, subscriptions and loyalty points.', body: h`<div class="wrap narrow">${breadcrumbs([{ name: 'Home', url: '/' }, { name: 'FAQ', url: '/faq' }])}<h1>Help &amp; FAQ</h1><div class="faq">${pages.faqs.map((f) => h`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}</div></div>`,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: pages.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] };
}
function contactPage(ctx, d = {}) {
  return { title: 'Contact us', description: `Contact ${ctx.brand.name} for help with orders, products and delivery.`, body: h`<div class="wrap narrow">${breadcrumbs([{ name: 'Home', url: '/' }, { name: 'Contact', url: '/contact' }])}<h1>Contact us</h1><p class="lead">Questions about an order or a product? Send us a message and we will reply by email or phone.</p>
  <form method="post" action="/contact" class="form-stack">${csrfInput(ctx)}${field({ id: 'c-name', name: 'name', label: 'Name', required: true, maxlength: 80, autocomplete: 'name' })}${field({ id: 'c-email', name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email' })}${field({ id: 'c-phone', name: 'phone', label: 'Phone', optional: true, inputmode: 'tel', autocomplete: 'tel' })}${field({ id: 'c-order', name: 'order', label: 'Order number', optional: true, maxlength: 20 })}<div class="field"><label for="c-msg">Message<span class="req" aria-hidden="true"> *</span></label><textarea id="c-msg" name="message" rows="5" required maxlength="2000"></textarea></div><button class="btn btn-primary" type="submit">Send message</button><p class="small muted">Messages are stored for the store team. Email delivery to the team is not connected yet; see the admin enquiries page.</p></form>${ctx.cfg.whatsappNumber ? h`<p><a class="btn btn-secondary" href="https://wa.me/${ctx.cfg.whatsappNumber}" target="_blank" rel="noopener">${icon('whatsapp', 18)} Chat on WhatsApp</a></p>` : ''}</div>` };
}
function notFound(ctx) { return { title: 'Page not found', description: 'The page you asked for could not be found.', noindex: true, body: h`<div class="wrap narrow center"><div class="nf-art" aria-hidden="true">${raw(svg.dogHead())}</div><h1>We could not find that page</h1><p class="lead">It may have moved or never existed. Try search or head back to the shop.</p><p><a class="btn btn-primary" href="/">Back to home</a> <a class="btn btn-ghost" href="/search">Search</a></p></div>` }; }
module.exports = { home, petPage, collection, productPage, searchPage, bundlesPage, blogIndex, blogPost, policyPage, aboutPage, faqPage, contactPage, notFound, bundleCard, reviewList, qs };
