/**
 * 20_PaperMenu.gs — seeding the paper book from the real account, and the
 * menu that drives it.
 *
 * Seeding reads the positions that actually exist at Groww and mirrors them
 * into the paper book so the engine starts managing what you already hold,
 * rather than waiting for a fresh signal.
 *
 * It does NOT run the entry gate on them. Those trades are already on; asking
 * "would the gate have taken this?" is a separate and useful question, and
 * paperSeedDryRun() answers it without opening anything. Seeding answers
 * "given that I hold it, when do I get out?", which is what 16_Hold decides.
 *
 * Every seeded position still needs a stop, a target and a thesis variable.
 * The sheet cannot invent them — a position with no stop is not managed, it
 * is merely watched, and 16_Hold refuses to manage one.
 */

SCHEMA[SH.PAPER_SEED = 'PaperSeed'] = [
  'tradingSymbol', 'thesisVar', 'right', 'strike', 'lotSize',
  'stopLevel', 'targetPrice', 'atr', 'sector', 'timeStopDate', 'notes'
];

/**
 * Read live F&O positions and write one PaperSeed row per position, with the
 * fields the engine needs left blank for you to fill.
 *
 * This is step 1. It opens nothing.
 */
function paperSeedPrepare() {
  var pos = paperLivePositions_();
  if (!pos.length) return uiAlert_('No open F&O positions found at Groww.');

  var sh = sheet_(SH.PAPER_SEED);
  var existing = {};
  readSheet_(SH.PAPER_SEED).forEach(function (r) {
    if (r.tradingSymbol) existing[String(r.tradingSymbol).trim()] = true;
  });

  var added = 0;
  pos.forEach(function (p) {
    if (existing[p.tradingSymbol]) return;
    var parsed = parseOptionSymbol_(p.tradingSymbol);
    appendObj_(SH.PAPER_SEED, {
      tradingSymbol: p.tradingSymbol,
      thesisVar: parsed.underlying || '',
      right: parsed.right || '',
      strike: parsed.strike || '',
      lotSize: p.lotSize || '',
      stopLevel: '', targetPrice: '', atr: '', sector: '',
      timeStopDate: '',
      notes: 'qty ' + p.qty + ' @ ' + p.entryPrice + ' — fill stopLevel, ' +
             'targetPrice and atr, then run Seed into paper book'
    });
    added++;
  });

  return uiAlert_('PaperSeed: ' + added + ' row(s) added, ' +
    (pos.length - added) + ' already present.\n\n' +
    'Now fill stopLevel, targetPrice and atr on each row.\n' +
    'stopLevel is a price of the UNDERLYING, never an option price.\n' +
    'Then run: Paper -> 2. Seed into paper book');
}

/**
 * Step 2. Read PaperSeed, match against the live positions, and open each one
 * in the paper book at its REAL entry price.
 */
function paperSeedCommit() {
  var live = {};
  paperLivePositions_().forEach(function (p) { live[p.tradingSymbol] = p; });

  var rows = readSheet_(SH.PAPER_SEED);
  if (!rows.length) return uiAlert_('PaperSeed is empty. Run step 1 first.');

  var book = paperBookLoad_();
  var held = {};
  book.positions.forEach(function (p) { held[p.symbol] = true; });

  var opened = [], skipped = [];

  rows.forEach(function (r) {
    var sym = String(r.tradingSymbol || '').trim();
    if (!sym) return;

    if (held[sym]) { skipped.push(sym + ': already in the paper book'); return; }

    var p = live[sym];
    if (!p) { skipped.push(sym + ': not an open position at Groww'); return; }

    var stop   = Number(r.stopLevel);
    var target = Number(r.targetPrice);
    var atr    = Number(r.atr);
    var thesis = String(r.thesisVar || '').trim();

    if (!(stop > 0))   { skipped.push(sym + ': stopLevel is blank'); return; }
    if (!(target > 0)) { skipped.push(sym + ': targetPrice is blank — a ' +
      'position with no target gets churned out by its own trailing stop'); return; }
    if (!(atr > 0))    { skipped.push(sym + ': atr is blank — the stop cannot ' +
      'be checked against the instrument\'s own noise'); return; }
    if (!thesis)       { skipped.push(sym + ': thesisVar is blank'); return; }

    var parsed = parseOptionSymbol_(sym);
    var right = String(r.right || parsed.right || 'CE').toUpperCase();

    // Reject a stop that is already on the wrong side or inside the ATR floor.
    var spotGuess = right === 'CE' ? stop + atr : stop - atr;
    var sv = validateEntryStop(spotGuess, stop, atr, right);
    if (!sv.ok) { skipped.push(sym + ': ' + sv.reason); return; }

    book.positions.push({
      id: 'SEED-' + sym,
      symbol: sym,
      underlying: thesis,
      right: right,
      strike: Number(r.strike || parsed.strike || 0),
      lotSize: Number(r.lotSize || p.lotSize || 0),
      lots: p.lotSize ? Math.round(p.qty / p.lotSize) : 1,
      qty: p.qty,
      entryPrice: p.entryPrice,
      entryTs: todayIso_() + ' seeded',
      entrySpread: 0,
      thesisVar: thesis,
      stopLevel: stop,
      targetPrice: target,
      timeStopDate: r.timeStopDate ? String(r.timeStopDate) : null,
      atr: atr,
      sector: String(r.sector || ''),
      peakPrice: p.ltp || p.entryPrice,
      ltp: p.ltp || p.entryPrice,
      gateMetrics: { seeded: true }
    });

    // Paper cash mirrors the real premium outlay so the equity line is honest.
    book.cash = round2_(book.cash - p.entryPrice * p.qty);
    opened.push(sym + ' — ' + p.qty + ' @ ' + p.entryPrice +
      ', stop ' + stop + ' on ' + thesis + ', target ' + target);
  });

  paperBookSave_(book);
  opened.forEach(function (o) { paperLogRow_('SEED', o.split(' —')[0], o); });

  return uiAlert_(
    'Seeded ' + opened.length + ' position(s).\n\n' +
    (opened.length ? opened.join('\n') + '\n\n' : '') +
    (skipped.length ? 'SKIPPED:\n' + skipped.join('\n') : '') +
    '\n\nThe engine will mark these on the next tick. It sends no orders.');
}

/**
 * The separate, useful question: would the gate have taken these trades?
 * Runs the gate on each seeded position and reports, without opening anything.
 */
function paperSeedDryRun() {
  var rows = readSheet_(SH.PAPER_SEED);
  if (!rows.length) return uiAlert_('PaperSeed is empty.');
  var out = [];
  rows.forEach(function (r) {
    var sym = String(r.tradingSymbol || '').trim();
    if (!sym) return;
    out.push(sym + ': gate inputs not available from the sheet alone ' +
      '(needs the live chain: OI, spread, ADX, DI, supertrend). ' +
      'Use the scanner once it exists.');
  });
  return uiAlert_('Gate dry run\n\n' + out.join('\n\n'));
}

/** Live F&O positions, normalised. Read-only. */
function paperLivePositions_() {
  var resp;
  try { resp = apiPositions('FNO'); }
  catch (e) { throw new Error('could not read positions from Groww: ' + e.message); }

  var raw = (resp && (resp.payload || resp.data || resp.positions)) || [];
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var p = raw[i];
    var qty = Number(p.quantity || p.net_quantity || 0);
    if (!qty) continue;                       // closed today — not a position
    out.push({
      tradingSymbol: p.trading_symbol || p.tradingSymbol || p.symbol_isin,
      qty: qty,
      entryPrice: Number(p.buying_price || p.average_price || p.net_price || 0),
      ltp: Number(p.last_traded_price || p.ltp || 0),
      lotSize: Number(p.lot_size || p.lotSize || 0)
    });
  }
  return out;
}

/**
 * Pull the underlying, strike and right out of a Groww F&O trading symbol,
 * e.g. AUROPHARMA26DEC1800CE -> { AUROPHARMA, 1800, CE }.
 *
 * Returns blanks rather than guessing when the shape is unfamiliar — a wrong
 * underlying would point the stop at the wrong instrument.
 */
function parseOptionSymbol_(sym) {
  var s = String(sym || '').toUpperCase();
  var m = s.match(/^([A-Z&-]+?)(\d{2})([A-Z]{3})(\d+)(CE|PE)$/);
  if (!m) return { underlying: '', strike: 0, right: '' };
  return { underlying: m[1], strike: Number(m[4]), right: m[5] };
}

function uiAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* headless */ }
  Logger.log(msg);
  return msg;
}

/** Called from 11_Menu.gs. Kept here so the paper feature is self-contained. */
function addPaperMenu_(ui, menu) {
  menu.addSeparator()
      .addSubMenu(ui.createMenu('Paper trading')
        .addItem('1. Prepare seed rows from live positions', 'paperSeedPrepare')
        .addItem('2. Seed into paper book', 'paperSeedCommit')
        .addSeparator()
        .addItem('Run one tick now', 'paperTickNow')
        .addItem('Reconcile against Groww', 'paperReconcileNow')
        .addItem('Show report', 'paperShowReport')
        .addSeparator()
        .addItem('RESET paper book', 'paperResetConfirm'));
  return menu;
}

function paperTickNow() {
  var r = jobPaperTick();
  if (r.skipped) return uiAlert_('Tick skipped: ' + r.skipped);
  var lines = (r.actions || []).map(function (a) {
    return a.symbol + '  ' + a.action + (a.rule ? '  [' + a.rule + ']' : '') +
           '\n     ' + a.reason;
  });
  var qf = (r.quoteFailures || []).map(function (f) {
    return f.symbol + '  QUOTE FAILED: ' + f.reason;
  });
  return uiAlert_('Paper tick ' + r.ts + '\n\n' +
    (lines.length ? lines.join('\n\n') : 'no open positions') +
    (qf.length ? '\n\n' + qf.join('\n') : '') +
    '\n\n' + r.report.verdict);
}

function paperReconcileNow() {
  var r = paperReconcileLive();
  if (r.error) return uiAlert_(r.error);
  if (r.ok) return uiAlert_('Reconciled: the paper book matches Groww.');
  return uiAlert_('MISMATCHES:\n\n' + r.mismatches.map(function (m) {
    return m.symbol + '  internal ' + m.internal + ' vs broker ' + m.broker +
           '\n     ' + m.note;
  }).join('\n\n'));
}

function paperShowReport() {
  var rep = paperReport(paperBookLoad_());
  return uiAlert_(
    'PAPER BOOK\n\n' +
    'Equity           Rs ' + rep.equity + '\n' +
    'Cash             Rs ' + rep.cash + '\n' +
    'Open positions   ' + rep.openPositions + '\n' +
    'Open unrealised  Rs ' + rep.openUnrealised + '\n' +
    'Closed trades    ' + rep.trades + '\n' +
    'Net P&L          Rs ' + rep.netPnl + '  (after costs)\n' +
    'Costs paid       Rs ' + rep.totalCosts + '\n' +
    'Win rate         ' + (rep.winRate === null ? '-' :
                           (rep.winRate * 100).toFixed(1) + '%') + '\n' +
    'Gate refusals    ' + rep.refusals + '\n\n' +
    rep.verdict);
}

function paperResetConfirm() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return paperReset(); }
  var r = ui.alert('Reset the paper book?',
    'This clears PaperPositions, PaperTrades, PaperLog and the cash state. ' +
    'Your real Groww account is not touched.',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return 'cancelled';
  return uiAlert_(paperReset());
}
