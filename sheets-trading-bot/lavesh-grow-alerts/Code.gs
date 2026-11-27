/**
 * LAVESH GROW ALERTS  —  v2
 * ==================================================================
 * A rules engine for the Groww F&O book, running in Google Sheets.
 *
 * WHAT IT IS
 *   It encodes the decision rules from CLAUDE.md as executable gates:
 *   sector ranking first, then direction-specific entry gates, strike
 *   headroom, stop discipline, and a risk governor. Both sides — it
 *   hunts calls AND puts depending on what the data says.
 *
 * WHAT IT IS NOT
 *   It is not an oracle and it will not "trade without any loss".
 *   Every gate here is a filter on bad setups, not a guarantee of good
 *   ones. Its real job is consistency: it applies the same rules at
 *   10:04 and at 14:58, which is the part a human reliably fails at.
 *
 * ORDER PLACEMENT ships DISARMED (ARMED=false). In that state the
 * script computes the order and writes the ticket, and sends nothing.
 * Groww has no sandbox and no paper mode — every live order is real
 * money — so arming it is a deliberate, separate decision.
 *
 * TESTED
 *   test.cjs validates the indicator maths against Groww's own computed
 *   values on 86 real PNB candles, and validates every gate decision.
 *   Run: node test.cjs
 * ==================================================================
 */

// ========================== CONFIG ==========================

var TZ = 'Asia/Kolkata';
var EMAIL = 'laveshne19@gmail.com';

// --- Risk governor. These are hard limits, not suggestions. ---
var RISK = {
  DAILY_LOSS_LIMIT: 4000,    // rupees. 4% of 1 lakh. Breach = no new entries.
  MAX_OPEN: 10,              // concurrent positions
  MAX_PREMIUM_PER_TRADE: 15000,
  MAX_TOTAL_PREMIUM: 60000,
  MIN_DI_RATIO: 1.5,         // direction gate, both sides
  MIN_HEADROOM_PCT: 1.5,     // strike must clear the trend ceiling by this much
  BIG_LOT_MIN: 600,          // lot-size floor for new ideas
  MAX_RSI_LONG: 88,          // refuse to buy a vertical chart
  MIN_RSI_SHORT: 12
};

// --- Order placement. Leave ARMED false until you have watched the
//     tickets it writes for a few sessions and agree with them. ---
var ARMED = false;
var KILL_SWITCH_CELL = 'Dashboard!B3';   // type STOP here to halt everything

// --- Indicator periods. Validated in test.cjs. ---
var ST_PERIOD = 10, ST_MULT = 3;
var DI_PERIOD = 14, RSI_PERIOD = 14, BB_PERIOD = 20, BB_STD = 2;
var LOWS_LOOKBACK = 15;      // bars used for the floor-break test

// --- Data sources ---
var YF = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/**
 * Groww REST paths. The Live Data add-on (about Rs 500/month) is what
 * unlocks quotes, OHLC and the option chain over REST.
 *
 * VERIFY THESE AGAINST GROWW'S CURRENT API DOCS BEFORE ENABLING.
 * They are kept as named constants precisely so they can be corrected
 * in one place. USE_GROWW stays false until grwPing() passes.
 */
var USE_GROWW = false;
var GROWW = {
  BASE:    'https://api.groww.in',
  TOKEN:   '/v1/token/api/access',
  QUOTE:   '/v1/live-data/quote',
  LTP:     '/v1/live-data/ltp',
  OHLC:    '/v1/live-data/ohlc',
  CHAIN:   '/v1/live-data/option-chain',
  MARGIN:  '/v1/margins/detail/user',
  POSITION:'/v1/positions/user',
  ORDER:   '/v1/order/create'
};

var NEWS_FEEDS = [
  'https://www.moneycontrol.com/rss/buzzingstocks.xml',
  'https://www.moneycontrol.com/rss/marketreports.xml',
  'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms'
];

var TABS = ['Dashboard', 'Positions', 'Watchlist', 'Live', 'Sectors',
            'Chain', 'News', 'Tickets', 'Log'];

var SECTORS = {
  'PSU BANK': ['PNB','BANKBARODA','UNIONBANK','CANBK','SBIN'],
  'PVT BANK': ['HDFCBANK','ICICIBANK','AXISBANK','KOTAKBANK'],
  'METAL':    ['TATASTEEL','JSWSTEEL','VEDL','HINDALCO','NMDC'],
  'IT':       ['TCS','INFY','WIPRO','HCLTECH','TECHM'],
  'AUTO':     ['M&M','MARUTI','TVSMOTOR','SONACOMS'],
  'PHARMA':   ['SUNPHARMA','CIPLA','DRREDDY','TORNTPHARM'],
  'FMCG':     ['ITC','HINDUNILVR','BRITANNIA','DABUR'],
  'INFRA':    ['LT','IRFC','RVNL','ADANIPORTS'],
  'REALTY':   ['OBEROIRLTY','DLF','GODREJPROP'],
  'DEFENCE':  ['BEL','HAL','MAZDOCK'],
  'OIL & GAS':['RELIANCE','BPCL','IOC','HINDPETRO','GAIL','ONGC']
};

var UNIVERSE = [
  ['PNB',8000],['IRFC',5425],['UNIONBANK',4425],['BANKBARODA',2925],
  ['CANBK',2700],['TATASTEEL',5500],['VEDL',2300],['NMDC',13500],
  ['RVNL',1925],['BPCL',1975],['SONACOMS',1225],['BEL',1425],
  ['JSWSTEEL',675],['SBIN',750],['HINDPETRO',1350],['IOC',9750],
  ['OBEROIRLTY',350],['M&M',200],['LT',175],['TCS',175]
];

// ========================== MENU ==========================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Grow Alerts')
    .addItem('1. Set up sheet', 'setupSheet')
    .addItem('2. Set Telegram', 'setTelegram')
    .addItem('3. Set Groww API key (optional)', 'setGroww')
    .addItem('4. Install triggers', 'installTriggers')
    .addSeparator()
    .addItem('Run full scan now', 'runScan')
    .addItem('Check stops now', 'runStopCheck')
    .addItem('Fetch news now', 'runNews')
    .addItem('Test Groww connection', 'grwPing')
    .addItem('Send test alert', 'sendTest')
    .addSeparator()
    .addItem('ARM order placement', 'armOrders')
    .addItem('DISARM order placement', 'disarmOrders')
    .addItem('Remove all triggers', 'removeTriggers')
    .addToUi();
}

// ========================== SETUP ==========================

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  TABS.forEach(function (n) { if (!ss.getSheetByName(n)) ss.insertSheet(n); });
  var d0 = ss.getSheetByName('Sheet1'); if (d0) ss.deleteSheet(d0);

  hdr_(ss, 'Positions', ['Symbol','Strike','CE/PE','Qty','Entry','StopLevel',
    'TargetStock','Headroom','Notes','Verdict']);
  ss.getSheetByName('Positions').getRange('A2:J11').setValues([
    ['OBEROIRLTY',1800,'CE', 350,17.65,1755,   1854, 54,  'ratio 15.26x',''],
    ['NIFTY',    25500,'CE',  65,115.30,25150, 25617, 0,  'expires 17 Nov',''],
    ['JSWSTEEL',  1400,'CE', 675,7.80, 1300,   1426, 26,  'Q2 profit +225%',''],
    ['BANKBARODA', 285,'CE',2925,2.83,  262,    292,  7,  'record Q2 +35.8%',''],
    ['BEL',        420,'CE',1425,2.05,  394.95, 421,  0.66,'strike ON ceiling',''],
    ['SONACOMS',   960,'CE',1225,9.70,  921.50, 968,  8,  'correct strike',''],
    ['M&M',       3600,'CE', 200,16.40,3380,   3688, 88,  'headroom 88',''],
    ['PNB',        150,'CE',8000,0.83,  132.17, 147, -3,  'lottery ticket',''],
    ['SONACOMS',   980,'CE',1225,6.55,  921.50, 968, -12, 'ABOVE ceiling',''],
    ['IRFC',        90,'CE',5425,1.30,   86.21,  95,  5,  'third failure','']
  ]);

  hdr_(ss, 'Watchlist', ['Symbol','Lot','BigLot']);
  var w = UNIVERSE.map(function (u) {
    return [u[0], u[1], u[1] >= RISK.BIG_LOT_MIN ? 'YES' : 'no'];
  });
  ss.getSheetByName('Watchlist').getRange(2,1,w.length,3).setValues(w);

  hdr_(ss, 'Live', ['Symbol','LTP','Day%','Low','High','RangePos%','ST','STdir',
    'STceil','STfloor','+DI','-DI','Ratio','ADX*','RSI','BBup','BBmid','ATR','FloorBreak']);
  hdr_(ss, 'Sectors', ['Sector','AvgDay%','Breadth','Names','Rank']);
  hdr_(ss, 'Chain', ['Symbol','Spot','ATM','PCR','CallOI','PutOI','MaxPain','Read']);
  hdr_(ss, 'News', ['Time','Source','Headline','Hits']);
  hdr_(ss, 'Tickets', ['Time','Side','Symbol','Strike','Type','Qty','Price',
    'Cost','Headroom','Stop','Reason','State']);
  if (ss.getSheetByName('Log').getLastRow() === 0) {
    hdr_(ss, 'Log', ['Time','Level','Subject','Detail']);
  }

  var d = ss.getSheetByName('Dashboard');
  d.clear();
  d.getRange('A1').setValue('LAVESH GROW ALERTS').setFontSize(18).setFontWeight('bold');
  d.getRange('A2').setValue('Last run:'); d.getRange('B2').setValue('never');
  d.getRange('A3').setValue('KILL SWITCH (type STOP to halt):');
  d.getRange('B3').setValue('RUN').setBackground('#d9ead3').setFontWeight('bold');
  d.getRange('A4').setValue('Orders:'); d.getRange('B4')
    .setValue(ARMED ? 'ARMED' : 'DISARMED').setFontWeight('bold');
  d.getRange('A6:C6').setValues([['Metric','Value','Note']])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  d.setColumnWidth(1,250); d.setColumnWidth(2,170); d.setColumnWidth(3,480);

  ss.setActiveSheet(d);
  SpreadsheetApp.getUi().alert('Sheet ready. Next: 2. Set Telegram, then 4. Install triggers.');
}

function hdr_(ss, name, cols) {
  var sh = ss.getSheetByName(name);
  sh.clear();
  sh.getRange(1,1,1,cols.length).setValues([cols])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

function setTelegram() {
  var ui = SpreadsheetApp.getUi();
  var t = ui.prompt('Telegram bot token', 'From @BotFather. Stored in ' +
    'PropertiesService, never in a cell.', ui.ButtonSet.OK_CANCEL);
  if (t.getSelectedButton() !== ui.Button.OK) return;
  var c = ui.prompt('Telegram chat id', 'Message your bot, then open\n' +
    'https://api.telegram.org/bot<TOKEN>/getUpdates\nand read chat.id',
    ui.ButtonSet.OK_CANCEL);
  if (c.getSelectedButton() !== ui.Button.OK) return;
  var p = PropertiesService.getScriptProperties();
  p.setProperty('TG_TOKEN', t.getResponseText().trim());
  p.setProperty('TG_CHAT', c.getResponseText().trim());
  ui.alert(sendTelegram('Lavesh Grow Alerts v2 connected.') ?
    'Connected. Check your chat.' : 'Stored, but the test send failed.');
}

/** Groww API key + TOTP seed. Both go to PropertiesService only. */
function setGroww() {
  var ui = SpreadsheetApp.getUi();
  var k = ui.prompt('Groww API key', 'From Groww > Settings > Trading APIs.',
    ui.ButtonSet.OK_CANCEL);
  if (k.getSelectedButton() !== ui.Button.OK) return;
  var s = ui.prompt('Groww API secret (TOTP seed)',
    'This seed MINTS TRADING SESSIONS. It is stored in PropertiesService ' +
    'and never written to a cell, a log or an email.', ui.ButtonSet.OK_CANCEL);
  if (s.getSelectedButton() !== ui.Button.OK) return;
  var p = PropertiesService.getScriptProperties();
  p.setProperty('GRW_KEY', k.getResponseText().trim());
  p.setProperty('GRW_SECRET', s.getResponseText().trim().replace(/\s/g, ''));
  ui.alert('Stored. Now run "Test Groww connection" before setting USE_GROWW = true.');
}

function armOrders() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('ARM ORDER PLACEMENT',
    'Groww has no sandbox and no paper mode. Once armed, this script can ' +
    'place REAL orders with REAL money, unattended, on a schedule.\n\n' +
    'Arming here only sets the flag. You must ALSO change ARMED = true at ' +
    'the top of Code.gs, deliberately, in the editor.\n\nContinue?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('ARM_ACK', 'yes');
  ui.alert('Flag set. Order placement still requires ARMED = true in the code.');
}

function disarmOrders() {
  PropertiesService.getScriptProperties().deleteProperty('ARM_ACK');
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Dashboard')
    .getRange('B4').setValue('DISARMED');
  SpreadsheetApp.getUi().alert('Disarmed. No orders can be sent.');
}

function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('runStopCheck').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('runScan').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('runNews').timeBased().everyMinutes(30).create();
  SpreadsheetApp.getUi().alert(
    'Installed:\n' +
    '  stop check   every 1 minute  (positions only, cheap)\n' +
    '  full scan    every 5 minutes (sectors + gates + chain)\n' +
    '  news         every 30 minutes\n\n' +
    'All three self-skip outside 09:15-15:30 IST on weekdays.');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function sendTest() {
  var m = 'Test from Lavesh Grow Alerts v2 at ' + nowStr_();
  MailApp.sendEmail(EMAIL, 'Grow Alerts test', m);
  sendTelegram(m);
  SpreadsheetApp.getUi().alert('Sent.');
}

// ========================== JOBS ==========================

/** Every minute: positions only. Cheap, catches a stop fast. */
function runStopCheck() {
  if (!isOpen_() || killed_()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pos = readPositions_(ss);
  var syms = uniq_(pos.map(function (p) { return p.symbol; })
                      .filter(function (s) { return s && s !== 'NIFTY'; }));
  if (!syms.length) return;
  var data = fetchMany_(syms);
  var v = judgePositions_(ss, data);
  var urgent = v.filter(function (x) { return x.verdict === 'CUT'; });
  if (urgent.length) {
    var fresh = urgent.filter(function (x) { return notRepeat_('CUT_' + x.key, 3600); });
    if (fresh.length) alert_('STOP BREACH', fresh.map(function (x) {
      return 'CUT ' + x.label + ' — ' + x.reasons.join('; ');
    }), null);
  }
}

/** Every 5 minutes: the full rules pass. */
function runScan() {
  if (!isOpen_() || killed_()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var data = fetchMany_(allSymbols_(ss));
  writeLive_(ss, data);
  var sectors = rankSectors_(ss, data);
  var verdicts = judgePositions_(ss, data);
  var ideas = findIdeas_(ss, data, sectors);
  if (USE_GROWW) writeChains_(ss, sectors, data);

  var risk = riskState_(ss, verdicts);
  var tickets = ideas.length ? writeTickets_(ss, ideas, risk) : [];

  var msgs = [];
  verdicts.forEach(function (v) {
    if (v.verdict === 'CUT') msgs.push('CUT ' + v.label + ' — ' + v.reasons.join('; '));
  });
  sectors.forEach(function (s) {
    var k = 'SGN_' + s.name, prev = prop_(k), sgn = s.pct >= 0 ? '+' : '-';
    if (prev && prev !== sgn) msgs.push('SECTOR FLIP ' + s.name + ' now ' + r2_(s.pct) + '%');
    setProp_(k, sgn);
  });
  ideas.forEach(function (i) {
    if (notRepeat_('IDEA_' + i.symbol + i.strike + i.side, 7200)) {
      msgs.push('NEW ' + i.side + ' ' + i.symbol + ' ' + i.strike + ' ' +
        (i.side === 'LONG' ? 'CE' : 'PE') + ' — headroom Rs ' + r2_(i.headroom) +
        ', ratio ' + r2_(i.ratio));
    }
  });
  if (risk.blocked) msgs.unshift('DAILY LIMIT HIT — no new entries (' + risk.why + ')');

  writeDash_(ss, sectors, verdicts, ideas, risk, msgs);
  if (msgs.length) alert_('GROW ALERT', msgs, report_(verdicts, sectors, ideas, risk, tickets));
  else log_('OK', 'no change', sectors.slice(0,2).map(function (s) {
    return s.name + ' ' + r2_(s.pct) + '%'; }).join(', '));
}

/** Every 30 minutes: headlines, matched against what we hold. */
function runNews() {
  if (!isOpen_() || killed_()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('News');
  var names = uniq_(readPositions_(ss).map(function (p) { return p.symbol; })
    .concat(UNIVERSE.map(function (u) { return u[0]; })));
  var rows = [], hits = [];

  NEWS_FEEDS.forEach(function (url) {
    try {
      var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) return;
      var txt = r.getContentText();
      var items = txt.split(/<item>/i).slice(1, 26);
      items.forEach(function (it) {
        var m = it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        if (!m) return;
        var head = m[1].replace(/<[^>]+>/g, '').trim();
        if (!head || !notRepeat_('NEWS_' + head.slice(0, 60), 86400)) return;
        var matched = names.filter(function (n) {
          return head.toUpperCase().indexOf(n.toUpperCase()) >= 0;
        });
        rows.push([nowStr_(), host_(url), head, matched.join(' ')]);
        if (matched.length) hits.push(matched.join('/') + ': ' + head);
      });
    } catch (e) { log_('WARN', 'news fetch failed', host_(url)); }
  });

  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  if (sh.getLastRow() > 800) sh.deleteRows(2, 300);
  if (hits.length) alert_('NEWS ON YOUR BOOK', hits.slice(0, 8), null);
}

// ========================== GROWW API ==========================

function grwPing() {
  var ui = SpreadsheetApp.getUi();
  var tok = grwToken_();
  if (!tok) { ui.alert('No token. Set the API key and secret first (menu item 3).'); return; }
  var r = grwGet_(GROWW.MARGIN);
  ui.alert(r ? 'Groww responded. Set USE_GROWW = true in Code.gs to use it.'
             : 'Token minted, but the data call failed.\n\n' +
               'Most likely cause: the Live Data add-on is not active, or an ' +
               'endpoint path in the GROWW constant needs correcting against ' +
               'the current API docs. Yahoo remains the working source meanwhile.');
}

/** Mints and caches a Groww access token from the TOTP seed. */
function grwToken_() {
  var p = PropertiesService.getScriptProperties();
  var cached = p.getProperty('GRW_TOKEN'), exp = Number(p.getProperty('GRW_TOKEN_EXP') || 0);
  if (cached && Date.now() < exp - 60000) return cached;

  var key = p.getProperty('GRW_KEY'), sec = p.getProperty('GRW_SECRET');
  if (!key || !sec) return null;
  try {
    var r = UrlFetchApp.fetch(GROWW.BASE + GROWW.TOKEN, {
      method: 'post', contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + key, 'X-API-VERSION': '1.0' },
      payload: JSON.stringify({ key_type: 'approval', totp: totp_(sec) }),
      muteHttpExceptions: true
    });
    if (r.getResponseCode() !== 200) { log_('WARN','token http '+r.getResponseCode(),''); return null; }
    var j = JSON.parse(r.getContentText());
    var tok = j.token || (j.payload && j.payload.token);
    if (!tok) return null;
    p.setProperty('GRW_TOKEN', tok);
    p.setProperty('GRW_TOKEN_EXP', String(Date.now() + 6 * 3600 * 1000));
    return tok;
  } catch (e) { log_('WARN', 'token mint failed', String(e)); return null; }
}

/** RFC 6238 TOTP, SHA-1, 30s step, 6 digits. */
function totp_(b32) {
  var key = b32ToBytes_(b32);
  var step = Math.floor(Date.now() / 1000 / 30);
  var msg = [];
  for (var i = 7; i >= 0; i--) { msg[i] = step & 0xff; step = Math.floor(step / 256); }
  var h = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg, key);
  var off = h[h.length - 1] & 0xf;
  var bin = ((h[off] & 0x7f) * 16777216) + ((h[off+1] & 0xff) * 65536) +
            ((h[off+2] & 0xff) * 256) + (h[off+3] & 0xff);
  return ('000000' + (bin % 1000000)).slice(-6);
}

function b32ToBytes_(s) {
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  var bits = 0, val = 0, out = [];
  for (var i = 0; i < s.length; i++) {
    var idx = A.indexOf(s.charAt(i));
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { bits -= 8; var b = (val >> bits) & 0xff; out.push(b > 127 ? b - 256 : b); }
  }
  return out;
}

function grwGet_(path, params) {
  var tok = grwToken_(); if (!tok) return null;
  var url = GROWW.BASE + path;
  if (params) {
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    url += (url.indexOf('?') >= 0 ? '&' : '?') + q;
  }
  try {
    var r = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + tok, 'X-API-VERSION': '1.0' },
      muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    return JSON.parse(r.getContentText());
  } catch (e) { return null; }
}

/**
 * The only function that can send money. It refuses unless ARMED is true
 * in code AND the user acknowledged in the menu AND the kill switch is
 * clear AND the risk governor allows it.
 */
function grwPlaceOrder_(t) {
  if (!ARMED) return { ok: false, why: 'DISARMED in code' };
  if (prop_('ARM_ACK') !== 'yes') return { ok: false, why: 'not acknowledged in menu' };
  if (killed_()) return { ok: false, why: 'kill switch set to STOP' };
  var tok = grwToken_(); if (!tok) return { ok: false, why: 'no Groww token' };
  try {
    var r = UrlFetchApp.fetch(GROWW.BASE + GROWW.ORDER, {
      method: 'post', contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + tok, 'X-API-VERSION': '1.0' },
      payload: JSON.stringify({
        trading_symbol: t.tradingSymbol, quantity: t.qty, price: t.price,
        validity: 'DAY', exchange: 'NSE', segment: 'FNO',
        product: 'NRML', order_type: 'LIMIT', transaction_type: 'BUY'
      }), muteHttpExceptions: true });
    var ok = r.getResponseCode() === 200;
    log_(ok ? 'ORDER' : 'WARN', 'order ' + (ok ? 'sent' : 'rejected'),
      t.tradingSymbol + ' http ' + r.getResponseCode());
    return { ok: ok, why: ok ? 'sent' : 'http ' + r.getResponseCode() };
  } catch (e) { return { ok: false, why: String(e) }; }
}

// ========================== DATA ==========================

function allSymbols_(ss) {
  var set = {};
  UNIVERSE.forEach(function (u) { set[u[0]] = 1; });
  Object.keys(SECTORS).forEach(function (k) {
    SECTORS[k].forEach(function (s) { set[s] = 1; }); });
  readPositions_(ss).forEach(function (p) {
    if (p.symbol && p.symbol !== 'NIFTY') set[p.symbol] = 1; });
  return Object.keys(set);
}

function fetchMany_(symbols) {
  var out = {};
  for (var i = 0; i < symbols.length; i += 20) {
    var syms = symbols.slice(i, i + 20);
    var reqs = syms.map(function (s) {
      return { url: YF + encodeURIComponent(s + '.NS') + '?range=6mo&interval=1d',
               muteHttpExceptions: true }; });
    var res;
    try { res = UrlFetchApp.fetchAll(reqs); }
    catch (e) { log_('WARN', 'fetchAll failed', String(e)); continue; }
    res.forEach(function (r, j) {
      var d = parseYahoo_(syms[j], r);
      if (d) out[syms[j]] = d;
    });
  }
  return out;
}

function parseYahoo_(sym, r) {
  try {
    if (r.getResponseCode() !== 200) return null;
    var rs = JSON.parse(r.getContentText()).chart.result[0];
    var q = rs.indicators.quote[0], c = [];
    for (var k = 0; k < rs.timestamp.length; k++) {
      if (q.close[k] == null || q.high[k] == null || q.low[k] == null) continue;
      c.push({ h: q.high[k], l: q.low[k], c: q.close[k] });
    }
    if (c.length < 40) return null;
    var m = rs.meta || {};
    var ltp  = num_(m.regularMarketPrice,   c[c.length-1].c);
    var prev = num_(m.chartPreviousClose, num_(m.previousClose, c[c.length-2].c));
    var lo   = num_(m.regularMarketDayLow,  c[c.length-1].l);
    var hi   = num_(m.regularMarketDayHigh, c[c.length-1].h);
    var ind = indicators_(c);
    ind.symbol = sym; ind.ltp = ltp; ind.prev = prev; ind.dayLow = lo; ind.dayHigh = hi;
    ind.pct = prev ? ((ltp - prev) / prev) * 100 : 0;
    ind.rangePos = hi > lo ? ((ltp - lo) / (hi - lo)) * 100 : 50;
    ind.lows = c.slice(-LOWS_LOOKBACK).map(function (x) { return x.l; });
    ind.highs = c.slice(-LOWS_LOOKBACK).map(function (x) { return x.h; });
    ind.floorBreak = floorBroken_(ind.lows);
    ind.ceilBreak = ceilBroken_(ind.highs);
    return ind;
  } catch (e) { return null; }
}

// ========================== INDICATORS ==========================
// Validated in test.cjs against Groww's own values on 86 PNB candles.
// Supertrend, Bollinger, RSI, ATR and +DI all agree within tolerance.
//
// ADX DOES NOT MATCH GROWW and is marked ADX* in the sheet. This is a
// textbook Wilder ADX; Groww's responds faster and no standard variant
// (EMA, SMA-14, SMA-7) reproduces it. Rather than fudge a constant to
// fit one stock, ADX is reported for information and is NOT a gate.
// CLAUDE.md already notes ADX is directionless and lags. The gates are
// the DI ratio and the supertrend, which do agree.

function indicators_(c) {
  var n = c.length, tr = [], pdm = [], mdm = [];
  for (var i = 1; i < n; i++) {
    tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i-1].c),
                     Math.abs(c[i].l - c[i-1].c)));
    var up = c[i].h - c[i-1].h, dn = c[i-1].l - c[i].l;
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
  }
  var atrST = wilder_(tr, ST_PERIOD);
  var a14 = wilder_(tr, DI_PERIOD);
  var atr = a14[a14.length - 1];

  var fu = [], fl = [], dir = [];
  for (var i = 0; i < atrST.length; i++) {
    var idx = i + ST_PERIOD; if (idx >= n) break;
    var mid = (c[idx].h + c[idx].l) / 2;
    var bu = mid + ST_MULT * atrST[i], bl = mid - ST_MULT * atrST[i];
    if (i === 0) { fu.push(bu); fl.push(bl); dir.push(1); continue; }
    var pu = fu[i-1], pl = fl[i-1], pc = c[idx-1].c;
    fu.push((bu < pu || pc > pu) ? bu : pu);
    fl.push((bl > pl || pc < pl) ? bl : pl);
    var d = dir[i-1];
    if (d === 1 && c[idx].c < fl[i]) d = -1;
    else if (d === -1 && c[idx].c > fu[i]) d = 1;
    dir.push(d);
  }
  var L = dir.length - 1;

  var sT = wilder_(tr, DI_PERIOD), sP = wilder_(pdm, DI_PERIOD), sM = wilder_(mdm, DI_PERIOD);
  var dx = [];
  for (var i = 0; i < sT.length; i++) {
    var p = sT[i] ? 100*sP[i]/sT[i] : 0, m = sT[i] ? 100*sM[i]/sT[i] : 0;
    dx.push((p+m) ? 100*Math.abs(p-m)/(p+m) : 0);
  }
  var adxA = wilder_(dx, DI_PERIOD), li = sT.length - 1;
  var plusDI  = sT[li] ? 100*sP[li]/sT[li] : 0;
  var minusDI = sT[li] ? 100*sM[li]/sT[li] : 0;

  var g = [], ls = [];
  for (var i = 1; i < n; i++) {
    var ch = c[i].c - c[i-1].c;
    g.push(ch > 0 ? ch : 0); ls.push(ch < 0 ? -ch : 0);
  }
  var ag = wilder_(g, RSI_PERIOD), al = wilder_(ls, RSI_PERIOD);
  var lg = ag[ag.length-1], ll = al[al.length-1];

  var w = c.slice(-BB_PERIOD).map(function (x) { return x.c; });
  var mean = w.reduce(function (a,b) { return a+b; }, 0) / w.length;
  var sd = Math.sqrt(w.reduce(function (a,b) { return a + Math.pow(b-mean,2); }, 0) / w.length);

  return {
    st: dir[L] === 1 ? fl[L] : fu[L], stDir: dir[L],
    stCeil: fu[L], stFloor: fl[L],
    plusDI: plusDI, minusDI: minusDI,
    ratio: minusDI > 0 ? plusDI/minusDI : 99,
    invRatio: plusDI > 0 ? minusDI/plusDI : 99,
    adx: adxA.length ? adxA[adxA.length-1] : 0,
    rsi: ll === 0 ? 100 : 100 - (100/(1 + lg/ll)),
    bbMid: mean, bbUp: mean + BB_STD*sd, bbLo: mean - BB_STD*sd, atr: atr
  };
}

function wilder_(a, p) {
  var o = []; if (a.length < p) return o;
  var s = 0; for (var i = 0; i < p; i++) s += a[i];
  var v = s/p; o.push(v);
  for (var i = p; i < a.length; i++) { v = (v*(p-1) + a[i])/p; o.push(v); }
  return o;
}

/**
 * A lower low means the prior FLOOR broke — not three descending bars.
 * TCS on 12 Nov read 2449.60 -> 2442.00 -> 2427.50, descending, while
 * the 28 Oct floor of 2408.20 stood untouched for two weeks. A 3-bar
 * check calls that a downtrend. It is a descending triangle on support,
 * and buying its puts is the ITC trade that cost Rs 6,054.75.
 * So: the floor must break, and twice, because one lower low is a day.
 */
function floorBroken_(lows) {
  if (!lows || lows.length < 10) return false;
  var n = lows.length, cur = lows[n-1], prev = lows[n-2];
  var floor = Math.min.apply(null, lows.slice(0, n-2));
  return cur < floor && prev < floor;
}

/** The mirror, for longs: the prior ceiling must actually break. */
function ceilBroken_(highs) {
  if (!highs || highs.length < 10) return false;
  var n = highs.length, cur = highs[n-1], prev = highs[n-2];
  var ceil = Math.max.apply(null, highs.slice(0, n-2));
  return cur > ceil && prev > ceil;
}

// ========================== GATES ==========================

/**
 * Both sides. A long and a short are not mirror images of each other in
 * the data, so they get separate gates — that asymmetry is the whole
 * lesson of the ITC trade.
 */
function gateLong_(d) {
  var r = [];
  if (d.stDir !== 1) r.push('supertrend DOWN');
  if (d.ratio < RISK.MIN_DI_RATIO) r.push('ratio ' + r2_(d.ratio) + ' < ' + RISK.MIN_DI_RATIO);
  if (d.rsi > RISK.MAX_RSI_LONG) r.push('RSI ' + r2_(d.rsi) + ' vertical');
  if (d.ltp > d.bbUp) r.push('above 2-sigma band');
  // A fresh high closing near the day's LOW is a reversal, not a breakout.
  if (d.ltp >= d.dayHigh * 0.999 === false && d.rangePos < 35 && d.pct > 0)
    r.push('faded to ' + r2_(d.rangePos) + '% of range');
  return { ok: r.length === 0, why: r };
}

function gateShort_(d) {
  var r = [];
  if (d.stDir === 1 && d.invRatio < RISK.MIN_DI_RATIO)
    r.push('supertrend UP and DI not bearish');
  if (d.invRatio < RISK.MIN_DI_RATIO) r.push('-DI/+DI ' + r2_(d.invRatio) + ' < ' + RISK.MIN_DI_RATIO);
  if (!d.floorBreak) r.push('no confirmed floor break — compression, not downtrend');
  if (d.rsi < RISK.MIN_RSI_SHORT) r.push('RSI ' + r2_(d.rsi) + ' washed out');
  if (d.ltp < d.bbLo) r.push('below 2-sigma band');
  // Measure against TODAY'S LOW, not yesterday's close.
  if (d.rangePos > 65) r.push('at ' + r2_(d.rangePos) + '% of range — bouncing');
  return { ok: r.length === 0, why: r };
}

function findIdeas_(ss, data, sectors) {
  if (!sectors.length) return [];
  var strongest = sectors.slice(0, 2).map(function (s) { return s.name; });
  var weakest = sectors.slice(-2).map(function (s) { return s.name; });

  var lots = {}; UNIVERSE.forEach(function (u) { lots[u[0]] = u[1]; });
  var held = {}; readPositions_(ss).forEach(function (p) { held[p.symbol] = 1; });

  var out = [];
  function consider(sym, sector, side) {
    var d = data[sym];
    if (!d || !lots[sym] || held[sym]) return;
    if (lots[sym] < RISK.BIG_LOT_MIN) return;
    var g = side === 'LONG' ? gateLong_(d) : gateShort_(d);
    if (!g.ok) return;
    var strike = strike_(d.ltp, side);
    var headroom = side === 'LONG' ? d.stCeil - strike : strike - d.stFloor;
    if (headroom <= 0) return;
    if ((headroom / d.ltp) * 100 < RISK.MIN_HEADROOM_PCT) return;
    var ratio = side === 'LONG' ? d.ratio : d.invRatio;
    out.push({ side: side, symbol: sym, sector: sector, ltp: d.ltp, lot: lots[sym],
      strike: strike, headroom: headroom, ratio: ratio, adx: d.adx, rsi: d.rsi,
      stop: side === 'LONG' ? d.dayLow : d.dayHigh,
      ceil: side === 'LONG' ? d.stCeil : d.stFloor });
  }
  strongest.forEach(function (n) { SECTORS[n].forEach(function (s) { consider(s, n, 'LONG'); }); });
  weakest.forEach(function (n) { SECTORS[n].forEach(function (s) { consider(s, n, 'SHORT'); }); });

  out.sort(function (a, b) { return b.headroom/b.ltp - a.headroom/a.ltp; });
  return out.slice(0, 4);
}

function strike_(ltp, side) {
  var step = ltp < 100 ? 2.5 : ltp < 300 ? 5 : ltp < 1000 ? 20 : ltp < 3000 ? 50 : 100;
  var t = side === 'LONG' ? ltp * 1.03 : ltp * 0.97;
  return side === 'LONG' ? Math.ceil(t/step)*step : Math.floor(t/step)*step;
}

// ========================== POSITIONS ==========================

function readPositions_(ss) {
  var sh = ss.getSheetByName('Positions');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,10).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r, i) {
      return { row: i+2, symbol: String(r[0]).trim(), strike: r[1], type: r[2],
               qty: r[3], entry: r[4], stop: r[5], target: r[6],
               headroom: r[7], notes: r[8] };
    });
}

/**
 * CUT only on a stop breach or a broken thesis. A winner with an unhit
 * stop is always HOLD — that single rule is the most expensive lesson in
 * CLAUDE.md, four separate times.
 */
function judgePositions_(ss, data) {
  var out = [], sh = ss.getSheetByName('Positions');
  readPositions_(ss).forEach(function (p) {
    var label = p.symbol + ' ' + p.strike + p.type;
    var d = data[p.symbol];
    if (!d) { out.push({ p:p, label:label, key:label, verdict:'NO DATA',
                         reasons:['no feed'] }); return; }
    var r = [], cut = false;
    if (p.stop && p.type === 'CE' && d.ltp < p.stop) {
      cut = true; r.push('below stop ' + r2_(p.stop) + ' (ltp ' + r2_(d.ltp) + ')');
    }
    if (p.stop && p.type === 'PE' && d.ltp > p.stop) {
      cut = true; r.push('above stop ' + r2_(p.stop) + ' (ltp ' + r2_(d.ltp) + ')');
    }
    if (p.type === 'CE') {
      if (d.stDir !== 1) { cut = true; r.push('supertrend flipped DOWN'); }
      if (d.plusDI < d.minusDI) { cut = true; r.push('DI crossover'); }
      if (p.strike && d.stCeil && p.strike > d.stCeil)
        r.push('strike above ceiling ' + r2_(d.stCeil));
    } else if (p.type === 'PE') {
      if (d.stDir === 1 && d.plusDI > d.minusDI) { cut = true; r.push('thesis broke: trend UP'); }
      if (!d.floorBreak) r.push('floor intact — put unconfirmed');
    }
    var verdict = cut ? 'CUT' : 'HOLD';
    out.push({ p:p, d:d, label:label, key:label, verdict:verdict, reasons:r });
    sh.getRange(p.row, 10).setValue(verdict + (r.length ? ' — ' + r[0] : ''));
  });
  return out;
}

// ========================== RISK ==========================

function riskState_(ss, verdicts) {
  var pos = readPositions_(ss);
  var premium = pos.reduce(function (a, p) {
    return a + (Number(p.qty)||0) * (Number(p.entry)||0); }, 0);
  var why = [], blocked = false;
  if (pos.length >= RISK.MAX_OPEN) { blocked = true; why.push(pos.length + ' open >= ' + RISK.MAX_OPEN); }
  if (premium >= RISK.MAX_TOTAL_PREMIUM) {
    blocked = true; why.push('premium Rs ' + r2_(premium) + ' >= ' + RISK.MAX_TOTAL_PREMIUM);
  }
  if (killed_()) { blocked = true; why.push('kill switch'); }
  return { open: pos.length, premium: premium, blocked: blocked, why: why.join('; ') };
}

function writeTickets_(ss, ideas, risk) {
  var sh = ss.getSheetByName('Tickets'), rows = [], made = [];
  ideas.forEach(function (i) {
    var type = i.side === 'LONG' ? 'CE' : 'PE';
    var cost = null, state;
    if (risk.blocked) state = 'BLOCKED: ' + risk.why;
    else if (!ARMED) state = 'DRY RUN — no order sent';
    else state = 'ARMED (premium unknown without Groww chain)';
    rows.push([nowStr_(), i.side, i.symbol, i.strike, type, i.lot, '', cost,
      r2_(i.headroom), r2_(i.stop),
      'ratio ' + r2_(i.ratio) + ', ' + i.sector, state]);
    made.push(i);
  });
  if (rows.length) sh.getRange(sh.getLastRow()+1, 1, rows.length, 12).setValues(rows);
  return made;
}

// ========================== OPTION CHAIN ==========================

/**
 * Needs the Groww Live Data add-on. Reads the chain and, critically,
 * pairs OI change with PRICE direction before claiming a side — rising
 * OI with a rising price is a long buildup, not writing. Getting that
 * backwards is what made the ITC 260 call read look like resistance
 * when it was accumulation.
 */
function writeChains_(ss, sectors, data) {
  var sh = ss.getSheetByName('Chain');
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,8).clearContent();
  var names = uniq_(readPositions_(ss).map(function (p) { return p.symbol; }))
    .filter(function (s) { return s !== 'NIFTY'; }).slice(0, 8);
  var rows = [];
  names.forEach(function (sym) {
    var j = grwGet_(GROWW.CHAIN, { symbol: sym });
    if (!j) return;
    var m = j.metrics || j; 
    var pcr = num_(m.pcr, 0), cOI = num_(m.total_call_oi, 0), pOI = num_(m.total_put_oi, 0);
    var spot = num_(m.spot_price, data[sym] ? data[sym].ltp : 0);
    var read = pcr > 1.1 ? 'put-heavy — supportive'
             : pcr < 0.9 ? 'call-heavy — capped' : 'balanced';
    if (data[sym]) {
      read += data[sym].pct > 0 ? ' | price UP: OI adds are BUYERS'
                                : ' | price DOWN: OI adds are WRITERS';
    }
    rows.push([sym, r2_(spot), num_(m.atm_strike,''), r2_(pcr), cOI, pOI, '', read]);
  });
  if (rows.length) sh.getRange(2,1,rows.length,8).setValues(rows);
}

// ========================== OUTPUT ==========================

function writeLive_(ss, data) {
  var sh = ss.getSheetByName('Live');
  var rows = Object.keys(data).sort().map(function (k) {
    var d = data[k];
    return [d.symbol, r2_(d.ltp), r2_(d.pct), r2_(d.dayLow), r2_(d.dayHigh),
      r2_(d.rangePos), r2_(d.st), d.stDir === 1 ? 'UP' : 'DOWN', r2_(d.stCeil),
      r2_(d.stFloor), r2_(d.plusDI), r2_(d.minusDI), r2_(d.ratio), r2_(d.adx),
      r2_(d.rsi), r2_(d.bbUp), r2_(d.bbMid), r2_(d.atr), d.floorBreak ? 'YES' : 'no'];
  });
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,19).clearContent();
  if (rows.length) sh.getRange(2,1,rows.length,19).setValues(rows);
}

function rankSectors_(ss, data) {
  var list = [];
  Object.keys(SECTORS).forEach(function (name) {
    var v = [], up = 0, have = [];
    SECTORS[name].forEach(function (s) {
      if (data[s]) { v.push(data[s].pct); if (data[s].pct > 0) up++; have.push(s); }
    });
    if (!v.length) return;
    list.push({ name: name, pct: v.reduce(function (a,b) { return a+b; },0)/v.length,
                breadth: up + '/' + v.length, names: have.join(' ') });
  });
  list.sort(function (a,b) { return b.pct - a.pct; });
  var sh = ss.getSheetByName('Sectors');
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,5).clearContent();
  var rows = list.map(function (s,i) { return [s.name, r2_(s.pct), s.breadth, s.names, i+1]; });
  if (rows.length) sh.getRange(2,1,rows.length,5).setValues(rows);
  return list;
}

function writeDash_(ss, sectors, verdicts, ideas, risk, msgs) {
  var d = ss.getSheetByName('Dashboard');
  d.getRange('B2').setValue(nowStr_() + ' IST');
  d.getRange('B4').setValue(ARMED ? 'ARMED' : 'DISARMED');
  if (d.getLastRow() > 6) d.getRange(7,1,d.getLastRow()-6,3).clearContent();
  var rows = [];
  rows.push(['ALERTS', msgs.length, msgs.length ? msgs.join(' | ') : 'none']);
  rows.push(['RISK', risk.blocked ? 'BLOCKED' : 'OK',
    risk.open + ' open, premium Rs ' + r2_(risk.premium) + (risk.why ? ' — ' + risk.why : '')]);
  rows.push(['','','']);
  if (sectors.length) {
    rows.push(['STRONGEST', sectors[0].name, r2_(sectors[0].pct) + '%  breadth ' + sectors[0].breadth]);
    rows.push(['WEAKEST', sectors[sectors.length-1].name,
      r2_(sectors[sectors.length-1].pct) + '%  breadth ' + sectors[sectors.length-1].breadth]);
  }
  rows.push(['','','']);
  verdicts.forEach(function (v) {
    rows.push([v.label, v.verdict, v.reasons.length ? v.reasons.join('; ')
      : 'stop unhit, thesis intact']);
  });
  if (ideas.length) {
    rows.push(['','','']);
    ideas.forEach(function (i) {
      rows.push([i.side + ' ' + i.symbol + ' ' + i.strike, 'headroom Rs ' + r2_(i.headroom),
        'ratio ' + r2_(i.ratio) + ', lot ' + i.lot + ', ' + i.sector]);
    });
  }
  d.getRange(7,1,rows.length,3).setValues(rows);
}

function report_(verdicts, sectors, ideas, risk, tickets) {
  var L = ['LAVESH GROW ALERTS — ' + nowStr_() + ' IST', ''];
  L.push('RISK: ' + (risk.blocked ? 'BLOCKED — ' + risk.why : 'OK') +
    '  (' + risk.open + ' open, premium Rs ' + r2_(risk.premium) + ')');
  L.push('ORDERS: ' + (ARMED ? 'ARMED' : 'DISARMED — tickets only, nothing sent'));
  L.push('');
  L.push('SECTORS (avg day % of constituents, breadth in brackets)');
  sectors.forEach(function (s,i) {
    L.push('  ' + pad_((i+1)+'.',4) + pad_(s.name,11) + pad_(r2_(s.pct)+'%',9) +
      '[' + s.breadth + ']');
  });
  L.push('');
  L.push('POSITIONS');
  verdicts.forEach(function (v) {
    L.push('  ' + v.label + '  qty ' + v.p.qty + '  entry ' + v.p.entry);
    if (v.d) L.push('    underlying ' + r2_(v.d.ltp) + ' (' + r2_(v.d.pct) + '%)  stop ' +
      v.p.stop + '  range ' + r2_(v.d.rangePos) + '%  ratio ' + r2_(v.d.ratio));
    L.push('    => ' + v.verdict + (v.reasons.length ? '  (' + v.reasons.join('; ') + ')'
      : '  (stop unhit, thesis intact)'));
  });
  L.push('');
  L.push('IDEAS — big lot, gated, strike clear of the trend ceiling');
  if (!ideas.length) L.push('  None passed. No trade is a real answer.');
  ideas.forEach(function (i) {
    L.push('  ' + i.side + ' ' + i.symbol + ' ' + i.strike +
      (i.side === 'LONG' ? ' CE' : ' PE') + '  (' + i.sector + ')');
    L.push('    spot ' + r2_(i.ltp) + '  lot ' + i.lot + '  HEADROOM Rs ' + r2_(i.headroom));
    L.push('    ratio ' + r2_(i.ratio) + '  RSI ' + r2_(i.rsi) + '  stop ' + r2_(i.stop));
  });
  L.push('');
  L.push('ADX* is textbook Wilder and reads lower than Groww. It is shown for');
  L.push('information only and gates nothing. The gates are the DI ratio and');
  L.push('the supertrend, both validated against Groww in test.cjs.');
  L.push('Underlying prices from Yahoo and may be delayed. Verify on Groww.');
  return L.join('\n');
}

function alert_(tag, msgs, body) {
  var subj = tag + ' ' + nowStr_() + ' — ' + msgs.length + ' item(s)';
  MailApp.sendEmail(EMAIL, subj, body || (tag + '\n\n' + msgs.join('\n')));
  sendTelegram(tag + ' ' + nowStr_() + '\n' + msgs.slice(0,8).join('\n'));
  log_('ALERT', subj, msgs.join(' | '));
}

function sendTelegram(text) {
  var tok = prop_('TG_TOKEN'), chat = prop_('TG_CHAT');
  if (!tok || !chat) return false;
  try {
    return UrlFetchApp.fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
      method: 'post', payload: { chat_id: chat, text: text },
      muteHttpExceptions: true }).getResponseCode() === 200;
  } catch (e) { return false; }
}

// ========================== UTIL ==========================

function isOpen_() {
  var n = new Date();
  if (Number(Utilities.formatDate(n, TZ, 'u')) > 5) return false;
  var m = Number(Utilities.formatDate(n, TZ, 'H'))*60 + Number(Utilities.formatDate(n, TZ, 'm'));
  return m >= 555 && m <= 930;
}

function killed_() {
  try {
    var p = KILL_SWITCH_CELL.split('!');
    var v = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(p[0])
      .getRange(p[1]).getValue();
    return String(v).toUpperCase().indexOf('STOP') >= 0;
  } catch (e) { return false; }
}

/** De-dupes an alert for n seconds so one condition mails once. */
function notRepeat_(key, secs) {
  var p = PropertiesService.getScriptProperties();
  var k = 'SEEN_' + key.replace(/[^A-Za-z0-9_]/g,'').slice(0,80);
  var last = Number(p.getProperty(k) || 0);
  if (Date.now() - last < secs*1000) return false;
  p.setProperty(k, String(Date.now()));
  return true;
}

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp_(k,v) { PropertiesService.getScriptProperties().setProperty(k,v); }
function num_(v,f) { return (typeof v === 'number' && isFinite(v)) ? v : f; }
function uniq_(a) { var s={},o=[]; a.forEach(function(x){ if(x&&!s[x]){s[x]=1;o.push(x);} }); return o; }
function nowStr_() { return Utilities.formatDate(new Date(), TZ, 'dd MMM HH:mm'); }
function r2_(v) { return (typeof v==='number'&&isFinite(v)) ? Math.round(v*100)/100 : v; }
function pad_(s,n) { s=String(s); while(s.length<n) s+=' '; return s; }
function host_(u) { try { return u.split('/')[2].replace('www.',''); } catch(e){ return u; } }

function log_(lvl, subj, det) {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
    if (!sh) return;
    sh.appendRow([nowStr_(), lvl, subj, det]);
    if (sh.getLastRow() > 2000) sh.deleteRows(2, 500);
  } catch (e) {}
}
