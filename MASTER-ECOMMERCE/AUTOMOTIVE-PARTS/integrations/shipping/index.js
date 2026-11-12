'use strict';
const dhl = require('./dhl'); const ups = require('./ups');
module.exports = { carriers: { dhl, ups }, trackUrl(carrier, n) { n = encodeURIComponent(n || ''); return carrier === 'dhl' ? `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${n}` : carrier === 'ups' ? `https://www.ups.com/track?tracknum=${n}` : null; } };
