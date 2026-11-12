/**
 * LAVESH GROW ALERTS — live market watch bot
 * ------------------------------------------------------------------
 * Watches the open F&O book, ranks sectors, hunts opportunities, and
 * alerts by email + Telegram. Runs every 10 minutes, 09:15–15:30 IST.
 *
 * WHY IT WATCHES UNDERLYINGS, NOT OPTION PRICES
 * The trading mandate says stops sit on the underlying stock level,
 * never the option price, because an option-price stop measures IV
 * normalisation and theta and mistakes them for the thesis failing.
 * So the bot tracks the thesis variable. That is the design, not a
 * compromise: free data covers underlyings, and underlyings are what
 * the rules actually key on.
 *
 * DATA: Yahoo Finance chart API (free, no key). Groww's live-data API
 * is a paid add-on, so it is deliberately not used here.
 *
 * SECRETS: the Telegram token lives in PropertiesService only. Never
 * in a cell, never in this file. Run setTelegram() once to store it.
 */

// ===================== CONSTANTS =====================

var TZ = 'Asia/Kolkata';
var EMAIL = 'laveshne19@gmail.com';
var YF = 'https://query1.finance.yahoo.com/v8/finance/chart/';

var ST_PERIOD = 10, ST_MULT = 3;
var DI_PERIOD = 14, RSI_PERIOD = 14, BB_PERIOD = 20, BB_STD = 2;

var DAILY_LOSS_LIMIT = 4000;   // rupees, 4% of 1 lakh
var MIN_DI_RATIO = 1.5;        // long gate
var BIG_LOT_MIN = 600;         // "big lot" threshold

var TABS = ['Dashboard', 'Positions', 'Watchlist', 'Live', 'Sectors', 'Log'];

// Sector buckets — sector strength is computed from constituents,
// because Yahoo does not carry the NSE sector indices reliably.
var SECTORS = {
  'PSU BANK':  ['PNB', 'BANKBARODA', 'UNIONBANK', 'CANBK', 'SBIN'],
  'PVT BANK':  ['HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK'],
  'METAL':     ['TATASTEEL', 'JSWSTEEL', 'VEDL', 'HINDALCO', 'NMDC'],
  'IT':        ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
  'AUTO':      ['M&M', 'MARUTI', 'TVSMOTOR', 'BAJAJ-AUTO', 'SONACOMS'],
  'PHARMA':    ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'TORNTPHARM'],
  'FMCG':      ['ITC', 'HINDUNILVR', 'BRITANNIA', 'DABUR'],
  'INFRA':     ['LT', 'IRFC', 'RVNL', 'ADANIPORTS'],
  'REALTY':    ['OBEROIRLTY', 'DLF', 'GODREJPROP'],
  'DEFENCE':   ['BEL', 'HAL', 'MAZDOCK']
};

// The 20-name trading universe, with lot sizes. Big lots first — lot
// size, not share price, decides how much a position can make.
var UNIVERSE = [
  ['PNB', 8000], ['IRFC', 5425], ['UNIONBANK', 4425], ['BANKBARODA', 2925],
  ['RVNL', 1925], ['BEL', 1425], ['SONACOMS', 1225], ['CANBK', 2700],
  ['TATASTEEL', 5500], ['VEDL', 2300], ['NMDC', 13500], ['SAIL', 19000],
  ['JSWSTEEL', 675], ['SBIN', 750], ['OBEROIRLTY', 350], ['M&M', 200],
  ['LT', 175], ['TCS', 175], ['MAZDOCK', 175], ['HAL', 150]
];

// ===================== MENU =====================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Grow Alerts')
    .addItem('1. Set up sheet', 'setupSheet')
    .addItem('2. Set Telegram credentials', 'setTelegram')
    .addItem('3. Install 10-minute trigger', 'installTriggers')
    .addSeparator()
    .addItem('Run watch now', 'runWatch')
    .addItem('Send test alert', 'sendTest')
    .addItem('Remove all triggers', 'removeTriggers')
    .addToUi();
}

// ===================== SETUP =====================

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  TABS.forEach(function (name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  var def = ss.getSheetByName('Sheet1');
  if (def) ss.deleteSheet(def);

  // --- Positions: the live book. Edit this tab as trades change. ---
  var p = ss.getSheetByName('Positions');
  p.clear();
  p.getRange('A1:J1').setValues([[
    'Symbol', 'Strike', 'CE/PE', 'Qty', 'Entry', 'StopLevel',
    'TargetStock', 'Headroom', 'Notes', 'Status'
  ]]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  p.getRange('A2:J11').setValues([
    ['OBEROIRLTY', 1800, 'CE',  350, 17.65, 1755,    1854, 54,  'best in book, ratio 15.26x', ''],
    ['NIFTY',     25500, 'CE',   65, 115.30, 25150,  25617, 0,  'expires 17 Nov', ''],
    ['JSWSTEEL',   1400, 'CE',  675, 7.80,  1300,    1426, 26,  'Q2 profit +225%', ''],
    ['BANKBARODA',  285, 'CE', 2925, 2.83,   262,     292,  7,  'record Q2 +35.8%', ''],
    ['BEL',         420, 'CE', 1425, 2.05,   394.95,  421,  0.66, 'strike AT ceiling', ''],
    ['SONACOMS',    960, 'CE', 1225, 9.70,   921.50,  968,  8,  'correct strike', ''],
    ['M&M',        3600, 'CE',  200, 16.40, 3380,    3688, 88,  'headroom 88 pts', ''],
    ['PNB',         150, 'CE', 8000, 0.83,   132.17,  147, -3,  'lottery ticket', ''],
    ['SONACOMS',    980, 'CE', 1225, 6.55,   921.50,  968, -12, 'ABOVE ceiling - cut if <940 by 16 Nov', ''],
    ['IRFC',         90, 'CE', 5425, 1.30,    86.21,   95,  5,  'third failure', '']
  ]);

  // --- Watchlist ---
  var w = ss.getSheetByName('Watchlist');
  w.clear();
  w.getRange('A1:C1').setValues([['Symbol', 'Lot', 'BigLot']])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  var rows = UNIVERSE.map(function (u) {
    return [u[0], u[1], u[1] >= BIG_LOT_MIN ? 'YES' : 'no'];
  });
  w.getRange(2, 1, rows.length, 3).setValues(rows);

  // --- Live ---
  var l = ss.getSheetByName('Live');
  l.clear();
  l.getRange('A1:N1').setValues([[
    'Symbol', 'LTP', 'Day%', 'DayLow', 'DayHigh', 'RangePos%',
    'Supertrend', 'STdir', 'STceil', '+DI', '-DI', 'Ratio', 'ADX', 'RSI'
  ]]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');

  // --- Sectors ---
  var s = ss.getSheetByName('Sectors');
  s.clear();
  s.getRange('A1:D1').setValues([['Sector', 'AvgDay%', 'Names', 'Rank']])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');

  // --- Log ---
  var g = ss.getSheetByName('Log');
  if (g.getLastRow() === 0) {
    g.getRange('A1:D1').setValues([['Time', 'Level', 'Subject', 'Detail']])
      .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  }

  // --- Dashboard ---
  var d = ss.getSheetByName('Dashboard');
  d.clear();
  d.getRange('A1').setValue('LAVESH GROW ALERTS')
    .setFontSize(18).setFontWeight('bold');
  d.getRange('A2').setValue('Last run: never');
  d.getRange('A4:C4').setValues([['Metric', 'Value', 'Note']])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  d.setColumnWidth(1, 220); d.setColumnWidth(2, 160); d.setColumnWidth(3, 420);

  ss.setActiveSheet(d);
  log_('INFO', 'Setup complete', TABS.join(', '));
  SpreadsheetApp.getUi().alert(
    'Sheet ready.\n\nNext: menu > 2. Set Telegram credentials, then 3. Install trigger.'
  );
}

/** Stores the Telegram token in PropertiesService. Never in a cell. */
function setTelegram() {
  var ui = SpreadsheetApp.getUi();
  var t = ui.prompt('Telegram bot token',
    'Paste the token from @BotFather (e.g. 8123456789:AAH...).\n' +
    'It is stored in PropertiesService, never in the sheet.',
    ui.ButtonSet.OK_CANCEL);
  if (t.getSelectedButton() !== ui.Button.OK) return;
  var c = ui.prompt('Telegram chat id',
    'Your numeric chat id. Message your bot, then open:\n' +
    'https://api.telegram.org/bot<TOKEN>/getUpdates\n' +
    'and read chat.id from the JSON.',
    ui.ButtonSet.OK_CANCEL);
  if (c.getSelectedButton() !== ui.Button.OK) return;

  var props = PropertiesService.getScriptProperties();
  props.setProperty('TG_TOKEN', t.getResponseText().trim());
  props.setProperty('TG_CHAT', c.getResponseText().trim());
  var r = sendTelegram('Lavesh Grow Alerts connected. Alerts will arrive here.');
  ui.alert(r ? 'Telegram connected. Check your chat.' :
    'Stored, but the test message failed. Re-check the token and chat id.');
}

function installTriggers() {
  removeTriggers();
  // Every 10 minutes. runWatch() exits immediately outside market hours,
  // so this costs nothing overnight or at weekends.
  ScriptApp.newTrigger('runWatch').timeBased().everyMinutes(10).create();
  log_('INFO', 'Trigger installed', 'runWatch every 10 minutes');
  SpreadsheetApp.getUi().alert('Installed: runWatch every 10 minutes.\n' +
    'It self-skips outside 09:15-15:30 IST on weekdays.');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
}

function sendTest() {
  var msg = 'Test alert from Lavesh Grow Alerts at ' + nowStr_();
  MailApp.sendEmail(EMAIL, 'Grow Alerts test', msg);
  sendTelegram(msg);
  SpreadsheetApp.getUi().alert('Sent to email and Telegram.');
}

// ===================== MAIN =====================

function runWatch() {
  if (!isMarketOpen_()) { return; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var symbols = uniqueSymbols_(ss);
  var data = fetchMany_(symbols);

  writeLive_(ss, data);
  var sectors = writeSectors_(ss, data);
  var posVerdicts = checkPositions_(ss, data);
  var opps = scanOpportunities_(ss, data, sectors);
  var alerts = collectAlerts_(posVerdicts, sectors, data);

  writeDashboard_(ss, data, sectors, posVerdicts, alerts);

  // Only notify when something actually changed. A bot that mails every
  // ten minutes regardless gets ignored, and then the one that matters
  // gets ignored too.
  if (alerts.length) {
    var subject = 'GROW ALERT ' + nowStr_() + ' — ' + alerts.length + ' item(s)';
    var body = buildReport_(alerts, posVerdicts, sectors, opps, true);
    MailApp.sendEmail(EMAIL, subject, body);
    sendTelegram(buildTelegram_(alerts, sectors));
    log_('ALERT', subject, alerts.join(' | '));
  } else {
    log_('OK', 'No change', 'sectors: ' + sectors.slice(0, 2).map(function (s) {
      return s.name + ' ' + s.pct.toFixed(2) + '%';
    }).join(', '));
  }
}

/** Hourly digest — install separately if you want a regular heartbeat. */
function runDigest() {
  if (!isMarketOpen_()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = fetchMany_(uniqueSymbols_(ss));
  var sectors = writeSectors_(ss, data);
  var posVerdicts = checkPositions_(ss, data);
  var opps = scanOpportunities_(ss, data, sectors);
  MailApp.sendEmail(EMAIL, 'Grow digest ' + nowStr_(),
    buildReport_([], posVerdicts, sectors, opps, false));
}

// ===================== DATA =====================

function uniqueSymbols_(ss) {
  var set = {};
  UNIVERSE.forEach(function (u) { set[u[0]] = 1; });
  Object.keys(SECTORS).forEach(function (k) {
    SECTORS[k].forEach(function (s) { set[s] = 1; });
  });
  readPositions_(ss).forEach(function (p) {
    if (p.symbol && p.symbol !== 'NIFTY') set[p.symbol] = 1;
  });
  return Object.keys(set);
}

/** Batch-fetches 6 months of daily candles and computes every indicator. */
function fetchMany_(symbols) {
  var reqs = symbols.map(function (s) {
    return {
      url: YF + encodeURIComponent(s + '.NS') + '?range=6mo&interval=1d',
      muteHttpExceptions: true
    };
  });

  var out = {};
  // Chunk so one bad batch cannot fail the whole run.
  for (var i = 0; i < reqs.length; i += 20) {
    var slice = reqs.slice(i, i + 20);
    var syms = symbols.slice(i, i + 20);
    var res;
    try { res = UrlFetchApp.fetchAll(slice); }
    catch (e) { log_('WARN', 'fetchAll failed', String(e)); continue; }

    res.forEach(function (r, j) {
      var sym = syms[j];
      try {
        if (r.getResponseCode() !== 200) return;
        var j2 = JSON.parse(r.getContentText());
        var rs = j2.chart && j2.chart.result && j2.chart.result[0];
        if (!rs) return;
        var q = rs.indicators.quote[0];
        var c = [];
        for (var k = 0; k < rs.timestamp.length; k++) {
          if (q.close[k] == null || q.high[k] == null || q.low[k] == null) continue;
          c.push({ h: q.high[k], l: q.low[k], c: q.close[k] });
        }
        if (c.length < 40) return;

        var m = rs.meta || {};
        var ltp = m.regularMarketPrice != null ? m.regularMarketPrice : c[c.length - 1].c;
        var prev = m.chartPreviousClose != null ? m.chartPreviousClose
                 : (m.previousClose != null ? m.previousClose : c[c.length - 2].c);
        var dLow = m.regularMarketDayLow != null ? m.regularMarketDayLow : c[c.length - 1].l;
        var dHigh = m.regularMarketDayHigh != null ? m.regularMarketDayHigh : c[c.length - 1].h;

        var ind = indicators_(c);
        out[sym] = {
          symbol: sym, ltp: ltp, prev: prev, dayLow: dLow, dayHigh: dHigh,
          pct: prev ? ((ltp - prev) / prev) * 100 : 0,
          rangePos: (dHigh > dLow) ? ((ltp - dLow) / (dHigh - dLow)) * 100 : 50,
          st: ind.st, stDir: ind.stDir, stCeil: ind.stCeil,
          plusDI: ind.plusDI, minusDI: ind.minusDI,
          ratio: ind.minusDI > 0 ? ind.plusDI / ind.minusDI : 99,
          adx: ind.adx, rsi: ind.rsi,
          bbUp: ind.bbUp, bbMid: ind.bbMid, atr: ind.atr,
          lows: c.slice(-6).map(function (x) { return x.l; })
        };
      } catch (e) { /* skip this symbol, keep the run alive */ }
    });
  }
  return out;
}

// ===================== INDICATORS =====================

function indicators_(c) {
  var n = c.length;
  var tr = [], pdm = [], mdm = [];
  for (var i = 1; i < n; i++) {
    var hl = c[i].h - c[i].l;
    var hc = Math.abs(c[i].h - c[i - 1].c);
    var lc = Math.abs(c[i].l - c[i - 1].c);
    tr.push(Math.max(hl, hc, lc));
    var up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l;
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
  }

  // ATR for supertrend (Wilder, ST_PERIOD)
  var atrST = wilder_(tr, ST_PERIOD);
  // ATR 14 for reporting
  var atr14arr = wilder_(tr, DI_PERIOD);
  var atr = atr14arr[atr14arr.length - 1];

  // --- Supertrend ---
  var fu = [], fl = [], dir = [];
  for (var i = 0; i < atrST.length; i++) {
    var idx = i + ST_PERIOD;            // candle index this ATR maps to
    if (idx >= n) break;
    var mid = (c[idx].h + c[idx].l) / 2;
    var bu = mid + ST_MULT * atrST[i];
    var bl = mid - ST_MULT * atrST[i];
    if (i === 0) { fu.push(bu); fl.push(bl); dir.push(1); continue; }
    var pu = fu[i - 1], pl = fl[i - 1], pc = c[idx - 1].c;
    fu.push((bu < pu || pc > pu) ? bu : pu);
    fl.push((bl > pl || pc < pl) ? bl : pl);
    var d = dir[i - 1];
    if (d === 1 && c[idx].c < fl[i]) d = -1;
    else if (d === -1 && c[idx].c > fu[i]) d = 1;
    dir.push(d);
  }
  var last = dir.length - 1;
  var stDir = dir[last];
  var st = stDir === 1 ? fl[last] : fu[last];
  var stCeil = fu[last];

  // --- DI / ADX (Wilder) ---
  var sTR = wilder_(tr, DI_PERIOD);
  var sP = wilder_(pdm, DI_PERIOD);
  var sM = wilder_(mdm, DI_PERIOD);
  var dx = [];
  for (var i = 0; i < sTR.length; i++) {
    var p = sTR[i] ? 100 * sP[i] / sTR[i] : 0;
    var m = sTR[i] ? 100 * sM[i] / sTR[i] : 0;
    dx.push((p + m) ? 100 * Math.abs(p - m) / (p + m) : 0);
  }
  var adxArr = wilder_(dx, DI_PERIOD);
  var li = sTR.length - 1;
  var plusDI = sTR[li] ? 100 * sP[li] / sTR[li] : 0;
  var minusDI = sTR[li] ? 100 * sM[li] / sTR[li] : 0;
  var adx = adxArr.length ? adxArr[adxArr.length - 1] : 0;

  // --- RSI (Wilder) ---
  var g = [], ls = [];
  for (var i = 1; i < n; i++) {
    var ch = c[i].c - c[i - 1].c;
    g.push(ch > 0 ? ch : 0);
    ls.push(ch < 0 ? -ch : 0);
  }
  var ag = wilder_(g, RSI_PERIOD), al = wilder_(ls, RSI_PERIOD);
  var lg = ag[ag.length - 1], ll = al[al.length - 1];
  var rsi = ll === 0 ? 100 : 100 - (100 / (1 + lg / ll));

  // --- Bollinger (20, 2) ---
  var w = c.slice(-BB_PERIOD).map(function (x) { return x.c; });
  var mean = w.reduce(function (a, b) { return a + b; }, 0) / w.length;
  var varc = w.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / w.length;
  var sd = Math.sqrt(varc);

  return {
    st: st, stDir: stDir, stCeil: stCeil,
    plusDI: plusDI, minusDI: minusDI, adx: adx, rsi: rsi,
    bbMid: mean, bbUp: mean + BB_STD * sd, atr: atr
  };
}

/** Wilder's smoothing: seed with a simple average, then recursive. */
function wilder_(arr, p) {
  var out = [];
  if (arr.length < p) return out;
  var sum = 0;
  for (var i = 0; i < p; i++) sum += arr[i];
  var v = sum / p;
  out.push(v);
  for (var i = p; i < arr.length; i++) {
    v = (v * (p - 1) + arr[i]) / p;
    out.push(v);
  }
  return out;
}

// ===================== WRITERS =====================

function writeLive_(ss, data) {
  var sh = ss.getSheetByName('Live');
  var keys = Object.keys(data).sort();
  var rows = keys.map(function (k) {
    var d = data[k];
    return [d.symbol, r2_(d.ltp), r2_(d.pct), r2_(d.dayLow), r2_(d.dayHigh),
      r2_(d.rangePos), r2_(d.st), d.stDir === 1 ? 'UP' : 'DOWN', r2_(d.stCeil),
      r2_(d.plusDI), r2_(d.minusDI), r2_(d.ratio), r2_(d.adx), r2_(d.rsi)];
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 14).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 14).setValues(rows);
}

function writeSectors_(ss, data) {
  var list = [];
  Object.keys(SECTORS).forEach(function (name) {
    var vals = [], have = [];
    SECTORS[name].forEach(function (s) {
      if (data[s]) { vals.push(data[s].pct); have.push(s); }
    });
    if (!vals.length) return;
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    list.push({ name: name, pct: avg, names: have.join(' ') });
  });
  list.sort(function (a, b) { return b.pct - a.pct; });

  var sh = ss.getSheetByName('Sectors');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();
  var rows = list.map(function (s, i) {
    return [s.name, r2_(s.pct), s.names, i + 1];
  });
  if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
  return list;
}

function readPositions_(ss) {
  var sh = ss.getSheetByName('Positions');
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  return v.filter(function (r) { return r[0]; }).map(function (r, i) {
    return {
      row: i + 2, symbol: String(r[0]).trim(), strike: r[1], type: r[2],
      qty: r[3], entry: r[4], stop: r[5], target: r[6],
      headroom: r[7], notes: r[8]
    };
  });
}

/**
 * HOLD or CUT, per the mandate:
 *  - CUT only if the underlying is below its stop, or the thesis broke
 *    (supertrend flipped to DOWN, or +DI fell below -DI).
 *  - Otherwise HOLD. Never cut a winner whose stop is unhit.
 */
function checkPositions_(ss, data) {
  var out = [];
  readPositions_(ss).forEach(function (p) {
    var d = data[p.symbol];
    if (!d) {
      out.push({ p: p, verdict: 'NO DATA', reasons: ['no feed for ' + p.symbol], alert: false });
      return;
    }
    var reasons = [], cut = false;

    if (p.stop && d.ltp < p.stop) {
      cut = true; reasons.push('BELOW STOP ' + r2_(p.stop) + ' (ltp ' + r2_(d.ltp) + ')');
    }
    if (p.type === 'CE') {
      if (d.stDir !== 1) { cut = true; reasons.push('supertrend flipped DOWN'); }
      if (d.plusDI < d.minusDI) {
        cut = true;
        reasons.push('DI crossover: +DI ' + r2_(d.plusDI) + ' < -DI ' + r2_(d.minusDI));
      }
    } else if (p.type === 'PE') {
      if (!lowerLows_(d.lows)) reasons.push('no lower lows - put thesis unconfirmed');
      if (d.stDir === 1) { reasons.push('supertrend still UP'); }
    }

    // Headroom warning: a strike above the trend ceiling cannot pay.
    if (p.type === 'CE' && p.strike && d.stCeil && p.strike > d.stCeil) {
      reasons.push('STRIKE ' + p.strike + ' ABOVE ceiling ' + r2_(d.stCeil));
    }

    var verdict = cut ? 'CUT' : 'HOLD';
    out.push({ p: p, d: d, verdict: verdict, reasons: reasons, alert: cut });
    ss.getSheetByName('Positions').getRange(p.row, 10)
      .setValue(verdict + (reasons.length ? ' — ' + reasons[0] : ''));
  });
  return out;
}

/** Only a sequence of LOWER lows is a downtrend. Flat lows = a floor. */
function lowerLows_(lows) {
  if (!lows || lows.length < 3) return false;
  var a = lows[lows.length - 3], b = lows[lows.length - 2], c = lows[lows.length - 1];
  return c < b && b < a;
}

/** Long gate: supertrend UP, DI ratio >= 1.5, and real headroom. */
function scanOpportunities_(ss, data, sectors) {
  var top = sectors.slice(0, 2).map(function (s) { return s.name; });
  var pool = {};
  top.forEach(function (n) { SECTORS[n].forEach(function (s) { pool[s] = n; }); });

  var lots = {};
  UNIVERSE.forEach(function (u) { lots[u[0]] = u[1]; });

  var out = [];
  Object.keys(pool).forEach(function (sym) {
    var d = data[sym];
    if (!d || !lots[sym]) return;
    if (d.stDir !== 1) return;
    if (d.ratio < MIN_DI_RATIO) return;
    if (lots[sym] < BIG_LOT_MIN) return;          // big lots only
    var strike = niceStrike_(d.ltp);
    var headroom = d.stCeil - strike;
    if (headroom <= 0) return;                     // strike above ceiling = reject
    out.push({
      symbol: sym, sector: pool[sym], ltp: d.ltp, lot: lots[sym],
      strike: strike, headroom: headroom, ratio: d.ratio,
      adx: d.adx, rsi: d.rsi, ceil: d.stCeil
    });
  });
  out.sort(function (a, b) { return b.headroom / b.ltp - a.headroom / a.ltp; });
  return out.slice(0, 5);
}

/** Next round strike roughly 4% above spot. */
function niceStrike_(ltp) {
  var t = ltp * 1.04;
  var step = ltp < 100 ? 2.5 : ltp < 300 ? 5 : ltp < 1000 ? 20
           : ltp < 3000 ? 50 : 100;
  return Math.ceil(t / step) * step;
}

function collectAlerts_(verdicts, sectors, data) {
  var a = [];
  verdicts.forEach(function (v) {
    if (v.verdict === 'CUT') {
      a.push('CUT ' + v.p.symbol + ' ' + v.p.strike + v.p.type + ' — ' + v.reasons.join('; '));
    }
  });
  // Sector flips are the other thing worth waking someone for.
  var props = PropertiesService.getScriptProperties();
  sectors.forEach(function (s) {
    var key = 'SIGN_' + s.name;
    var prevSign = props.getProperty(key);
    var sign = s.pct >= 0 ? '+' : '-';
    if (prevSign && prevSign !== sign) {
      a.push('SECTOR FLIP ' + s.name + ' now ' + r2_(s.pct) + '% (was ' + prevSign + ')');
    }
    props.setProperty(key, sign);
  });
  return a;
}

function writeDashboard_(ss, data, sectors, verdicts, alerts) {
  var d = ss.getSheetByName('Dashboard');
  d.getRange('A2').setValue('Last run: ' + nowStr_() + ' IST');
  if (d.getLastRow() > 4) d.getRange(5, 1, d.getLastRow() - 4, 3).clearContent();

  var rows = [];
  rows.push(['ALERTS', alerts.length, alerts.length ? alerts.join(' | ') : 'none']);
  rows.push(['', '', '']);
  rows.push(['STRONGEST SECTOR', sectors.length ? sectors[0].name : '-',
    sectors.length ? r2_(sectors[0].pct) + '%' : '']);
  rows.push(['WEAKEST SECTOR', sectors.length ? sectors[sectors.length - 1].name : '-',
    sectors.length ? r2_(sectors[sectors.length - 1].pct) + '%' : '']);
  rows.push(['', '', '']);
  verdicts.forEach(function (v) {
    rows.push([v.p.symbol + ' ' + v.p.strike + v.p.type, v.verdict,
      v.reasons.length ? v.reasons.join('; ') : 'stop unhit, thesis intact']);
  });
  d.getRange(5, 1, rows.length, 3).setValues(rows);
}

// ===================== REPORTS =====================

function buildReport_(alerts, verdicts, sectors, opps, isAlert) {
  var L = [];
  L.push('LAVESH GROW ALERTS — ' + nowStr_() + ' IST');
  L.push('');
  if (isAlert && alerts.length) {
    L.push('*** ' + alerts.length + ' ALERT(S) ***');
    alerts.forEach(function (a) { L.push('  ' + a); });
    L.push('');
  } else {
    L.push('No alerts. No stop hit, no supertrend flip, no DI crossover.');
    L.push('');
  }

  L.push('SECTOR RANKING (average day % of constituents)');
  sectors.forEach(function (s, i) {
    L.push('  ' + pad_(i + 1 + '.', 4) + pad_(s.name, 12) + r2_(s.pct) + '%');
  });
  L.push('');

  L.push('POSITIONS');
  verdicts.forEach(function (v) {
    L.push('  ' + v.p.symbol + ' ' + v.p.strike + ' ' + v.p.type +
      '  qty ' + v.p.qty + '  entry ' + v.p.entry);
    if (v.d) {
      L.push('    underlying ' + r2_(v.d.ltp) + ' (' + r2_(v.d.pct) + '%)' +
        '  stop ' + v.p.stop + '  range pos ' + r2_(v.d.rangePos) + '%');
      L.push('    ratio ' + r2_(v.d.ratio) + '  ADX ' + r2_(v.d.adx) +
        '  RSI ' + r2_(v.d.rsi) + '  ceiling ' + r2_(v.d.stCeil));
    }
    L.push('    => ' + v.verdict +
      (v.reasons.length ? '  (' + v.reasons.join('; ') + ')' : '  (stop unhit, thesis intact)'));
    L.push('');
  });

  L.push('OPPORTUNITIES — big lots, supertrend UP, ratio >= ' + MIN_DI_RATIO +
    ', strike below ceiling');
  if (!opps.length) {
    L.push('  None passed the gate. No trade is a real answer.');
  } else {
    opps.forEach(function (o) {
      L.push('  ' + o.symbol + ' (' + o.sector + ')  spot ' + r2_(o.ltp) +
        '  lot ' + o.lot);
      L.push('    suggested strike ' + o.strike + '  HEADROOM Rs ' + r2_(o.headroom) +
        '  (ceiling ' + r2_(o.ceil) + ')');
      L.push('    ratio ' + r2_(o.ratio) + '  ADX ' + r2_(o.adx) + '  RSI ' + r2_(o.rsi));
    });
  }
  L.push('');
  L.push('Underlying prices from Yahoo Finance and may be delayed.');
  L.push('This bot is READ-ONLY. It places no orders. Verify on Groww before trading.');
  return L.join('\n');
}

function buildTelegram_(alerts, sectors) {
  var L = ['GROW ALERT ' + nowStr_()];
  alerts.forEach(function (a) { L.push('* ' + a); });
  if (sectors.length) {
    L.push('');
    L.push('Top: ' + sectors[0].name + ' ' + r2_(sectors[0].pct) + '%');
    L.push('Bottom: ' + sectors[sectors.length - 1].name + ' ' +
      r2_(sectors[sectors.length - 1].pct) + '%');
  }
  return L.join('\n');
}

function sendTelegram(text) {
  var p = PropertiesService.getScriptProperties();
  var tok = p.getProperty('TG_TOKEN'), chat = p.getProperty('TG_CHAT');
  if (!tok || !chat) return false;
  try {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
      method: 'post',
      payload: { chat_id: chat, text: text },
      muteHttpExceptions: true
    });
    return r.getResponseCode() === 200;
  } catch (e) {
    log_('WARN', 'Telegram failed', String(e));
    return false;
  }
}

// ===================== UTIL =====================

function isMarketOpen_() {
  var now = new Date();
  var day = Number(Utilities.formatDate(now, TZ, 'u'));   // 1=Mon .. 7=Sun
  if (day > 5) return false;
  var mins = Number(Utilities.formatDate(now, TZ, 'H')) * 60 +
             Number(Utilities.formatDate(now, TZ, 'm'));
  return mins >= 555 && mins <= 930;                       // 09:15 - 15:30
}

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'dd MMM HH:mm');
}

function r2_(v) {
  return (typeof v === 'number' && isFinite(v)) ? Math.round(v * 100) / 100 : v;
}

function pad_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

function log_(level, subject, detail) {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
    if (!sh) return;
    sh.appendRow([nowStr_(), level, subject, detail]);
    if (sh.getLastRow() > 2000) sh.deleteRows(2, 500);
  } catch (e) { /* logging must never break the run */ }
}
