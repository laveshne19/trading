'use strict';
const { h, raw, esc, jsonLd } = require('../lib/html');
const { icon, flash, svg } = require('./ui');
const fs = require('node:fs'); const path = require('node:path');

const assetVer = (f) => { try { return Math.floor(fs.statSync(path.join(__dirname, '..', '..', 'assets', f)).mtimeMs / 1000); } catch { return 1; } };
const FONTS = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap';

function megaMenu(ctx, pet) {
  const nav = ctx.catalogue.navFor(pet); const q = (slug, top) => `/collections/${slug}${top.pet === 'both' || (ctx.catalogue.flat[slug] && ctx.catalogue.flat[slug].pet === 'both') ? '?pet=' + pet : ''}`;
  return h`<div class="mega" id="mega-${pet}"><div class="wrap mega-grid">${nav.map((top) => h`<div class="mega-col"><a class="mega-head" href="${q(top.slug, top)}">${top.title}</a><ul>${top.children.map((c) => h`<li><a href="${q(c.slug, c)}">${c.title}</a></li>`)}</ul></div>`)}<div class="mega-aside"><div class="mega-art" aria-hidden="true">${raw(pet === 'dog' ? svg.dogHead() : svg.catHead())}</div><p class="mega-tag">${pet === 'dog' ? 'For dogs' : 'For cats'}</p><a class="btn btn-primary btn-sm" href="/${pet}s">Explore ${pet}s</a><a class="link-arrow" href="/collections/${pet}-supplies">All ${pet} supplies</a></div></div></div>`;
}

function layout(ctx, o) {
  const { cfg, brand } = ctx;
  const title = o.title ? (o.titleExact ? o.title : `${o.title} | ${brand.name}`) : `${brand.name} - ${brand.tagline}`;
  const desc = (o.description || brand.tagline).slice(0, 160);
  const canonical = o.canonical !== undefined ? o.canonical : ctx.path;
  const canonUrl = cfg.siteUrl + canonical;
  const img = o.ogImage ? (o.ogImage.startsWith('http') ? o.ogImage : cfg.siteUrl + o.ogImage) : cfg.siteUrl + '/assets/img/og-default.png';
  const dogNav = megaMenu(ctx, 'dog'); const catNav = megaMenu(ctx, 'cat');
  const tab = (href, label, ic, key, extra = '') => h`<a class="tab${ctx.tab === key ? ' active' : ''}" href="${href}" ${ctx.tab === key ? raw('aria-current="page"') : ''}>${icon(ic, 22)}<span>${label}</span>${extra}</a>`;
  const ann = brand.announcements || [];
  return '<!doctype html>' + h`<html lang="en-IN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${desc}">
<link rel="canonical" href="${canonUrl}">${o.noindex ? raw('<meta name="robots" content="noindex, follow">') : raw('<meta name="robots" content="index, follow, max-image-preview:large">')}
<meta property="og:site_name" content="${brand.name}"><meta property="og:type" content="${o.ogType || 'website'}"><meta property="og:title" content="${o.ogTitle || title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canonUrl}"><meta property="og:image" content="${img}"><meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${o.ogTitle || title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${img}">
<meta name="csrf-token" content="${ctx.csrf}"><meta name="theme-color" content="#FBF6EC">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}"><link rel="stylesheet" href="/assets/css/app.css?v=${assetVer('css/app.css')}">
<script src="/assets/js/boot.js"></script><script src="/assets/js/app.js?v=${assetVer('js/app.js')}" defer></script>
${(o.jsonld || []).map(jsonLd)}
</head><body class="${o.bodyClass || ''}">
<a class="skip" href="#main">Skip to main content</a>
<div class="announce" role="region" aria-label="Offers and announcements"><div class="wrap announce-inner"><p data-rotate>${ann.map((t, i) => h`<span class="ann${i === 0 ? ' on' : ''}">${t}</span>`)}</p></div></div>
${cfg.devMockPayment ? h`<div class="devbar" role="note"><strong>DEV MODE</strong> Mock payment enabled. No real money moves. Not for production.</div>` : ''}
<header class="site-header"><div class="wrap hdr">
  <button class="icon-btn menu-btn" type="button" aria-label="Open menu" aria-controls="mobile-nav" aria-expanded="false" data-open="mobile-nav">${icon('menu', 24)}</button>
  <a class="brand" href="/" aria-label="${brand.name} home">${raw(svg.mark('mark', 40))}<span class="brand-name">Paw <i>&amp;</i> Hearth</span></a>
  <nav class="primary" aria-label="Primary"><ul>
    <li class="has-mega"><a href="/dogs" class="${ctx.tab === 'dogs' ? 'active' : ''}">Dogs</a><button class="mega-toggle" type="button" aria-label="Show dog categories" aria-expanded="false" aria-controls="mega-dog">${icon('chevron', 16)}</button>${dogNav}</li>
    <li class="has-mega"><a href="/cats" class="${ctx.tab === 'cats' ? 'active' : ''}">Cats</a><button class="mega-toggle" type="button" aria-label="Show cat categories" aria-expanded="false" aria-controls="mega-cat">${icon('chevron', 16)}</button>${catNav}</li>
    <li><a href="/collections/new-arrivals">New</a></li><li><a href="/bundles">Bundles</a></li><li><a href="/collections/offers">Offers</a></li><li><a href="/blog">Guides</a></li>
  </ul></nav>
  <form class="search" action="/search" method="get" role="search"><label class="vh" for="q">Search products</label>${icon('search', 18, 'search-ic')}<input id="q" name="q" type="search" placeholder="Search food, collars, toys..." autocomplete="off" value="${ctx.searchValue || ''}" aria-controls="suggest" aria-expanded="false"><ul id="suggest" class="suggest" role="listbox" hidden></ul></form>
  <div class="hdr-actions"><a class="icon-btn" href="${ctx.user ? '/account' : '/account/login'}" aria-label="${ctx.user ? 'Your account' : 'Sign in'}">${icon('user', 22)}</a><a class="icon-btn hide-sm" href="/account/wishlist" aria-label="Wishlist">${icon('heart', 22)}</a><button class="icon-btn cart-btn" type="button" aria-label="Open cart, ${ctx.cartCount} items" aria-controls="cart-drawer" aria-expanded="false" data-open="cart-drawer">${icon('cart', 22)}<span class="cart-count" data-cart-count ${ctx.cartCount ? '' : raw('hidden')}>${ctx.cartCount}</span></button></div>
</div></header>
<div class="scrim" data-scrim hidden></div>
<aside id="mobile-nav" class="drawer drawer-left" role="dialog" aria-modal="true" aria-label="Menu" hidden><div class="drawer-head"><span class="brand-name">Menu</span><button class="icon-btn" type="button" data-close aria-label="Close menu">${icon('close', 22)}</button></div><div class="drawer-body">
  ${['dog', 'cat'].map((pet) => h`<details class="acc"><summary>${pet === 'dog' ? 'Dogs' : 'Cats'}</summary><ul><li><a href="/${pet}s"><strong>All ${pet} supplies</strong></a></li>${ctx.catalogue.navFor(pet).map((top) => h`<li><a href="/collections/${top.slug}${top.pet === 'both' ? '?pet=' + pet : ''}">${top.title}</a></li>`)}</ul></details>`)}
  <ul class="plain"><li><a href="/collections/new-arrivals">New arrivals</a></li><li><a href="/collections/offers">Offers</a></li><li><a href="/bundles">Bundles</a></li><li><a href="/blog">Pet care guides</a></li><li><a href="/pets">My pets</a></li><li><a href="/subscriptions">Subscribe &amp; save</a></li><li><a href="/track">Track order</a></li><li><a href="/faq">Help &amp; FAQ</a></li></ul>
</div></aside>
<aside id="cart-drawer" class="drawer drawer-right" role="dialog" aria-modal="true" aria-label="Shopping cart" hidden><div class="drawer-head"><span class="brand-name">Your cart</span><button class="icon-btn" type="button" data-close aria-label="Close cart">${icon('close', 22)}</button></div><div class="drawer-body" data-cart-body><p class="muted">Loading cart...</p></div></aside>
<div class="toast" role="status" aria-live="polite" data-toast hidden></div>
<main id="main" tabindex="-1">${flash(ctx.flash)}${o.body}</main>
<footer class="site-footer"><div class="wrap">
  <div class="foot-grid">
    <div class="foot-brand"><a class="brand" href="/">${raw(svg.mark('mark', 44))}<span class="brand-name">Paw <i>&amp;</i> Hearth</span></a><p>${brand.tagline}.</p>${cfg.whatsappNumber ? h`<a class="btn btn-ghost btn-sm" href="https://wa.me/${cfg.whatsappNumber}" rel="noopener" target="_blank">${icon('whatsapp', 18)} Chat on WhatsApp</a>` : h`<p class="small muted">WhatsApp support: not set up yet.</p>`}</div>
    <div><h2 class="foot-h">Shop</h2><ul><li><a href="/dogs">Dogs</a></li><li><a href="/cats">Cats</a></li><li><a href="/collections/new-arrivals">New arrivals</a></li><li><a href="/collections/offers">Offers</a></li><li><a href="/bundles">Bundles</a></li><li><a href="/subscriptions">Subscribe &amp; save</a></li></ul></div>
    <div><h2 class="foot-h">Help</h2><ul><li><a href="/track">Track order</a></li><li><a href="/faq">FAQ</a></li><li><a href="/contact">Contact</a></li><li><a href="/policies/shipping">Shipping</a></li><li><a href="/policies/returns">Returns</a></li><li><a href="/pets">My pets</a></li></ul></div>
    <div><h2 class="foot-h">Company</h2><ul><li><a href="/about">About</a></li><li><a href="/blog">Pet care guides</a></li><li><a href="/policies/privacy">Privacy</a></li><li><a href="/policies/terms">Terms</a></li><li><a href="/policies/pet-product-safety">Pet product safety</a></li><li><a href="/policies/food-nutrition-disclaimer">Food &amp; nutrition</a></li><li><a href="/policies/expiry-storage">Expiry &amp; storage</a></li><li><a href="/policies/return-restrictions">Return restrictions</a></li><li><a href="/policies/refunds">Refunds</a></li><li><a href="/policies/cancellation">Cancellation</a></li><li><a href="/policies/veterinary-disclaimer">Health &amp; vet disclaimer</a></li></ul></div>
  </div>
  <p class="foot-note small">Information on this site is general and is not veterinary advice. Prescription and regulated veterinary products are not sold online without authorisation.${cfg.demoCatalogue ? ' This is a demonstration catalogue: brands, products, images and prices are placeholders.' : ''}</p>
  <p class="foot-note small">&copy; ${new Date().getFullYear()} ${brand.legalName}. Prices in INR, inclusive of applicable taxes.</p>
</div></footer>
<nav class="tabbar" aria-label="Quick navigation">${tab('/', 'Home', 'home', 'home')}${tab('/dogs', 'Dogs', 'paw', 'dogs')}${tab('/cats', 'Cats', 'paw', 'cats')}<button class="tab" type="button" data-open="cart-drawer" aria-controls="cart-drawer">${icon('cart', 22)}<span>Cart</span><span class="cart-count" data-cart-count ${ctx.cartCount ? '' : raw('hidden')}>${ctx.cartCount}</span></button>${tab(ctx.user ? '/account' : '/account/login', 'Account', 'user', 'account')}</nav>
</body></html>`.s;
}
module.exports = { layout };
