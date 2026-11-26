/**
 * 19_PaperLive.gs — wires the paper book to live Groww quotes and the sheet.
 *
 * Apps Script is stateless between trigger runs, so the book cannot live in
 * memory. It lives in two sheets — PaperPositions and PaperTrades — which has
 * the useful side effect that you can watch it work without opening the code.
 *
 * Each tick:
 *   1. load the book from the sheets
 *   2. fetch a live quote for every open position AND its underlying
 *   3. mark, apply the hold rules, trail
 *   4. save the book back
 *   5. refresh the dashboard rows
 *
 * SAFETY. This file calls no order endpoint. There is no code path from here
 * to apiPlaceOrder. The worst a bug here can do is write a wrong number into
 * a spreadsheet.
 */

SCHEMA[SH.PAPER_POS = 'PaperPositions'] = [
  'id', 'symbol', 'underlying', 'right', 'strike', 'lotSize', 'lots', 'qty',
  'entryPrice', 'entryTs', 'entrySpread', 'thesisVar', 'stopLevel',
  'targetPrice', 'timeStopDate', 'atr', 'sector', 'peakPrice', 'ltp',
  'underlyingPrice', 'unrealised', 'lastRule', 'lastReason', 'exitAtOpen',
  'updatedTs'
];
SCHEMA[SH.PAPER_TRADES = 'PaperTrades'] = [
  'id', 'symbol', 'underlying', 'right', 'qty', 'entryPrice', 'exitPrice',
  'entryTs', 'exitTs', 'grossPnl', 'costs', 'netPnl', 'reason', 'sector'
];
SCHEMA[SH.PAPER_LOG = 'PaperLog'] = ['ts', 'type', 'symbol', 'detail'];

var PAPER_STATE_KEY = 'PAPER_STATE_V1';   // cash + counters, Script Properties

// ---------------------------------------------------------------- state

function paperStateLoad_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PAPER_STATE_KEY);
  if (!raw) {
    return { capital: paperCfg_('PAPER_CAPITAL'), cash: paperCfg_('PAPER_CAPITAL'),
             tradesToday: 0, lastDate: null };
  }
  try { return JSON.parse(raw); }
  catch (e) {
    return { capital: paperCfg_('PAPER_CAPITAL'), cash: paperCfg_('PAPER_CAPITAL'),
             tradesToday: 0, lastDate: null };
  }
}

function paperStateSave_(s) {
  PropertiesService.getScriptProperties()
    .setProperty(PAPER_STATE_KEY, JSON.stringify(s));
}

/** Rebuild the in-memory book from the sheets plus the state blob. */
function paperBookLoad_() {
  var st = paperStateLoad_();
  var book = newPaperBook(st.capital);
  book.cash = Number(st.cash);
  book.tradesToday = Number(st.tradesToday) || 0;
  book.lastDate = st.lastDate || null;

  readSheet_(SH.PAPER_POS).forEach(function (r) {
    if (!r.symbol) return;
    book.positions.push({
      id: r.id, symbol: r.symbol, underlying: r.underlying, right: r.right,
      strike: Number(r.strike), lotSize: Number(r.lotSize),
      lots: Number(r.lots), qty: Number(r.qty),
      entryPrice: Number(r.entryPrice), entryTs: r.entryTs,
      entrySpread: Number(r.entrySpread) || 0,
      thesisVar: r.thesisVar, stopLevel: Number(r.stopLevel),
      targetPrice: Number(r.targetPrice),
      timeStopDate: r.timeStopDate || null,
      atr: Number(r.atr), sector: r.sector,
      peakPrice: Number(r.peakPrice) || Number(r.entryPrice),
      ltp: Number(r.ltp) || Number(r.entryPrice),
      exitAtOpen: r.exitAtOpen || undefined,
      _row: r._row
    });
  });

  readSheet_(SH.PAPER_TRADES).forEach(function (r) {
    if (!r.id) return;
    book.closed.push({
      id: r.id, symbol: r.symbol, netPnl: Number(r.netPnl),
      costs: Number(r.costs), grossPnl: Number(r.grossPnl)
    });
  });

  return book;
}

/** Write the whole book back. Positions are rewritten wholesale: simpler and
 *  safer than patching rows, and the sheet is small. */
function paperBookSave_(book) {
  paperStateSave_({
    capital: book.capital, cash: book.cash,
    tradesToday: book.tradesToday, lastDate: book.lastDate
  });

  var sh = sheet_(SH.PAPER_POS);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
               .map(function (h) { return String(h).trim(); });
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }
  if (book.positions.length) {
    var rows = book.positions.map(function (p) {
      var o = {
        id: p.id, symbol: p.symbol, underlying: p.underlying, right: p.right,
        strike: p.strike, lotSize: p.lotSize, lots: p.lots, qty: p.qty,
        entryPrice: p.entryPrice, entryTs: p.entryTs,
        entrySpread: p.entrySpread, thesisVar: p.thesisVar,
        stopLevel: p.stopLevel, targetPrice: p.targetPrice,
        timeStopDate: p.timeStopDate, atr: p.atr, sector: p.sector,
        peakPrice: p.peakPrice, ltp: p.ltp,
        underlyingPrice: p._underlyingPrice,
        unrealised: round2_((p.ltp - p.entryPrice) * p.qty),
        lastRule: p._lastRule, lastReason: p._lastReason,
        exitAtOpen: p.exitAtOpen || '',
        updatedTs: nowIst_()
      };
      return head.map(function (h) {
        var v = o[h];
        return (v === undefined || v === null) ? '' : v;
      });
    });
    sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  }
}

// ---------------------------------------------------------------- quotes

/**
 * Live quote for one option plus its underlying, with the symbol guard.
 *
 * The Groww MCP silently resolves "Nifty 50" to INFY when the segment is
 * wrong. The REST API is less prone to that, but the assertion costs nothing
 * and a silent substitution would corrupt every subsequent decision.
 *
 * @returns {{ok:boolean, ltp,bid,ask, underlyingPrice, reason}}
 */
function paperFetchMark_(p) {
  var out = { ok: false, reason: '' };

  // --- the option ---
  try {
    var q = apiQuote('NSE', 'FNO', p.symbol);
    var d = (q && (q.payload || q.data || q)) || {};
    var returned = d.trading_symbol || d.tradingSymbol || p.symbol;
    assertSymbol(p.symbol, returned);

    var depth = d.depth || d.market_depth || {};
    var buy  = (depth.buy  || depth.buyBook  || [])[0] || {};
    var sell = (depth.sell || depth.sellBook || [])[0] || {};

    out.bid = Number(buy.price  || d.bid_price || 0);
    out.ask = Number(sell.price || d.ask_price || 0);
    out.ltp = Number(d.last_price || d.ltp || 0);

    // No LTP but a two-sided book is usable — the 429 fallback observed live.
    if (!(out.ltp > 0) && out.bid > 0 && out.ask > 0) {
      out.ltp = round2_((out.bid + out.ask) / 2);
    }
    if (!(out.ltp > 0)) { out.reason = 'no usable option price'; return out; }
  } catch (e) {
    out.reason = 'option quote failed: ' + e.message;
    return out;
  }

  // --- the underlying: the stop is measured on THIS, not the option ---
  try {
    var uq = apiQuote('NSE', 'CASH', p.thesisVar);
    var ud = (uq && (uq.payload || uq.data || uq)) || {};
    assertSymbol(p.thesisVar, ud.trading_symbol || ud.tradingSymbol || p.thesisVar);
    out.underlyingPrice = Number(ud.last_price || ud.ltp || 0);
    if (!(out.underlyingPrice > 0)) {
      out.reason = 'no underlying price — cannot evaluate the stop';
      return out;
    }
  } catch (e) {
    out.reason = 'underlying quote failed: ' + e.message;
    return out;
  }

  out.ok = true;
  return out;
}

// ---------------------------------------------------------------- the tick

/**
 * The scheduled job. Install at 5 minutes; it does nothing outside market
 * hours and nothing at all if the kill switch is set.
 */
function jobPaperTick() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); }
  catch (e) { return { skipped: 'another tick is running' }; }

  try {
    var clock = { todayISO: todayIso_(), nowHHMM: nowHhmm_() };

    // 14_Util.isMarketOpen_: hours + weekend + NSE holiday list.
    if (!isMarketOpen_() || !isTradingDay_()) {
      return { skipped: 'market closed at ' + clock.nowHHMM };
    }

    var book = paperBookLoad_();
    var actions = [];

    // 1. Execute anything flagged for the open, before anything else.
    if (hhmmLess_(clock.nowHHMM, '10:00')) {
      var openMarks = paperCollectMarks_(book);
      actions = actions.concat(paperOpenExits(book, openMarks.marks, clock));
    }

    // 2. Mark and apply the hold rules.
    var collected = paperCollectMarks_(book);
    var marked = paperMark(book, collected.marks, clock);
    actions = actions.concat(marked);

    // Carry the rule onto the position so the sheet shows WHY it is held.
    book.positions.forEach(function (p) {
      var a = null;
      for (var i = 0; i < marked.length; i++) {
        if (marked[i].symbol === p.symbol) { a = marked[i]; break; }
      }
      if (a) { p._lastRule = a.rule || a.action; p._lastReason = a.reason; }
      var m = collected.marks[p.symbol];
      if (m) p._underlyingPrice = m.underlyingPrice;
    });

    // 3. Trail. Separate pass so a trailing bug cannot cause an exit.
    var trails = paperTrail(book, collected.marks, paperProposeTrail_);

    // 4. Record exits that happened this tick.
    for (var k = 0; k < actions.length; k++) {
      if (actions[k].action === 'EXIT') {
        var t = book.closed[book.closed.length - 1];
        if (t && t.symbol === actions[k].symbol) appendObj_(SH.PAPER_TRADES, t);
      }
    }

    // 5. Persist and report.
    paperBookSave_(book);
    paperWriteDashboard_(book, collected.failures);

    collected.failures.forEach(function (f) {
      paperLogRow_('QUOTE_FAIL', f.symbol, f.reason);
    });
    trails.forEach(function (t) {
      if (t.moved) paperLogRow_('TRAIL', t.symbol, t.reason);
    });
    actions.forEach(function (a) {
      if (a.action === 'EXIT' || a.action === 'EXIT_AT_OPEN') {
        paperLogRow_(a.action, a.symbol, a.reason);
      }
    });

    return { ts: nowIst_(), actions: actions, trails: trails,
             quoteFailures: collected.failures,
             report: paperReport(book) };
  } finally {
    lock.releaseLock();
  }
}

/** Fetch a mark for every open position. Failures are reported, not faked. */
function paperCollectMarks_(book) {
  var marks = {}, failures = [];
  for (var i = 0; i < book.positions.length; i++) {
    var p = book.positions[i];
    var m = paperFetchMark_(p);
    if (!m.ok) {
      failures.push({ symbol: p.symbol, reason: m.reason });
      continue;    // paperMark leaves an unmarked position alone
    }
    marks[p.symbol] = {
      ltp: m.ltp, bid: m.bid, ask: m.ask,
      underlyingPrice: m.underlyingPrice,
      // The close is only known after 15:30. Before that the stop cannot
      // trigger, by design.
      underlyingClose: isAfterClose_() ? m.underlyingPrice : null,
      thesisIntact: true
    };
  }
  return { marks: marks, failures: failures };
}

/**
 * Where to propose the stop. Chandelier-style: a fixed ATR multiple below the
 * peak the UNDERLYING has made. trailStop() then vetoes anything too tight or
 * anything that would widen, so this can be naive.
 */
function paperProposeTrail_(p, m) {
  if (!(p.atr > 0) || !(m.underlyingPrice > 0)) return null;
  var k = 1.5;
  return (p.right === 'PE')
    ? round2_(m.underlyingPrice + k * p.atr)
    : round2_(m.underlyingPrice - k * p.atr);
}

// ---------------------------------------------------------------- display

function paperWriteDashboard_(book, failures) {
  var rep = paperReport(book);
  var sh = sheet_(SH.DASH);

  var rows = [
    ['PAPER TRADING', ''],
    ['Mode', 'PAPER — no orders are sent'],
    ['Updated', nowIst_()],
    ['Equity', rep.equity],
    ['Cash', rep.cash],
    ['Open positions', rep.openPositions],
    ['Open unrealised', rep.openUnrealised],
    ['Closed trades', rep.trades],
    ['Net P&L (after costs)', rep.netPnl],
    ['Total costs paid', rep.totalCosts],
    ['Cost drag', rep.costDrag === null ? '' : (rep.costDrag * 100).toFixed(1) + '%'],
    ['Win rate', rep.winRate === null ? '' : (rep.winRate * 100).toFixed(1) + '%'],
    ['Profit factor', rep.profitFactor === null ? '' : rep.profitFactor],
    ['Expectancy / trade', rep.expectancy === null ? '' : rep.expectancy],
    ['Return', rep.returnPct === null ? '' : (rep.returnPct * 100).toFixed(2) + '%'],
    ['Gate refusals', rep.refusals],
    ['Quote failures this tick', (failures || []).length],
    ['VERDICT', rep.verdict]
  ];

  // Park the block well clear of whatever the live dashboard uses.
  sh.getRange(1, 6, rows.length, 2).setValues(rows);
  sh.getRange(1, 6, 1, 2).setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange(rows.length, 6, 1, 2).setFontWeight('bold');
  return rep;
}

function paperLogRow_(type, symbol, detail) {
  appendObj_(SH.PAPER_LOG, { ts: nowIst_(), type: type, symbol: symbol,
    detail: String(detail).slice(0, 500) });
}

// ---------------------------------------------------------------- manual

/**
 * Open a paper position by hand, so you can seed the book with the trades
 * already on. Runs the full gate: if the gate refuses, so does this.
 */
function paperEnterManual(candidate, plan) {
  var book = paperBookLoad_();
  var r = paperEnter(book, candidate, plan);
  if (r.accepted) {
    paperBookSave_(book);
    paperLogRow_('ENTRY', candidate.symbol, r.reason);
  } else {
    paperLogRow_('REFUSED', candidate.symbol, r.reason);
  }
  return r;
}

/** Reconcile the paper book against the real broker positions. */
function paperReconcileLive() {
  var book = paperBookLoad_();
  var pos = [];
  try {
    var resp = apiPositions('FNO');
    pos = (resp && (resp.payload || resp.data || resp.positions)) || [];
  } catch (e) {
    return { ok: false, error: 'could not read broker positions: ' + e.message };
  }
  var r = paperReconcile(book, pos);
  r.mismatches.forEach(function (m) {
    paperLogRow_('RECONCILE', m.symbol, m.note + ' internal=' + m.internal +
      ' broker=' + m.broker);
  });
  return r;
}

/** Wipe the paper book and start a clean run. */
function paperReset() {
  PropertiesService.getScriptProperties().deleteProperty(PAPER_STATE_KEY);
  [SH.PAPER_POS, SH.PAPER_TRADES, SH.PAPER_LOG].forEach(function (name) {
    var sh = ss_().getSheetByName(name);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    }
  });
  return 'paper book reset';
}

// ---------------------------------------------------------------- clock
//
// These defer to 14_Util.gs rather than reimplementing. Its isMarketOpen_
// also screens weekends and the NSE holiday list; a local copy here would
// have silently overridden it and ticked on a closed exchange.

function nowIst_()   { return fmtIst_(new Date()); }
function todayIso_() { return todayIst_(); }
function nowHhmm_()  {
  return Utilities.formatDate(new Date(), cfgTz_(), 'HH:mm');
}
function isAfterClose_() {
  return nowIstMinutes_() >= hhmmToMinutes_(cfg().MARKET_CLOSE || '15:30');
}
