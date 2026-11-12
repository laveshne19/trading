#!/usr/bin/env node
'use strict';
// Renders assets/img/og-default.png (1200x630) from the brand SVG illustrations using Playwright. Placeholder artwork: replace with real brand imagery.
const path = require('node:path'); const svg = require('../../frontend/lib/brand-svg');
(async () => {
  const { chromium } = require('playwright'); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<style>:root{--c-forest:#1F3D2E;--c-cream:#FBF6EC;--c-ember:#E07A32;--c-peach:#F6D5BC;--c-sage:#9DB5A0;--c-sage-d:#4F6F58;--c-sage-l:#DCE6D8;--c-tan:#C9A27A;--c-ember-soft:#F9D9BE;--c-tan-soft:#EADCC6}body{margin:0;width:1200px;height:630px;background:#FBF6EC;display:flex;align-items:center;font-family:Georgia,serif;color:#1F3D2E}.t{padding:0 64px;width:640px}h1{font-size:64px;line-height:1.05;margin:24px 0 16px}p{font:26px Arial,sans-serif;color:#5E5E52;margin:0}.a{width:520px}</style><div class="t">${svg.mark('', 72)}<h1>Paw &amp; Hearth</h1><p>Considered supplies for dogs &amp; cats</p></div><div class="a">${svg.heroScene()}</div>`);
  await p.screenshot({ path: path.join(__dirname, '..', '..', 'assets', 'img', 'og-default.png') }); await b.close(); console.log('og-default.png written');
})();
