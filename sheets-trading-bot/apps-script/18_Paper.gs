/**
 * 18_Paper.gs — paper trading. Real prices, real gates, real costs, no money.
 *
 * This is the only honest way to find out whether the logic in 16_Hold and
 * 17_Gate has an edge. BOT-SAFETY.md states plainly that it has not been
 * shown to have one, and the single fully-audited session was 1 win in 6.
 * A profitable backtest will not settle that question; thirty forward
 * sessions might.
 *
 * WHAT MAKES THIS DIFFERENT FROM A BACKTEST
 *
 *   - It sees the same quote the live bot would see, at the same moment, with
 *     no future bars available. Look-ahead is structurally impossible because
 *     the data does not exist yet.
 *   - Fills cross the spread. A paper engine that fills at the mid will show
 *     an edge that evaporates the day it goes live.
 *   - Every charge from 15_Costs is deducted. Gross P&L is recorded only as a
 *     diagnostic, never reported as profit.
 *   - Entries go through runGate(); exits go through holdDecision(). The same
 *     code paths the live bot uses. If paper and live disagree, that is a bug,
 *     not a market condition.
 *
 * WHAT IT STILL CANNOT TELL YOU
 *
 *   - Market impact. Your order was never in the book, so nobody moved away.
 *   - Partial fills. Assumed complete at the touch.
 *   - Queue position. A limit at the bid may never have filled in reality.
 *   - Rejections, broker outages, auction halts.
 *
 * Those four are why paper results are an upper bound on live results, and
 * why PAPER_SLIPPAGE_EXTRA exists: bias the simulation against yourself.
 */

var PAPER_DEFAULTS = {
  PAPER_CAPITAL: 100000,
  // Fills cross the spread fully. Optimism here is paid for later in cash.
  PAPER_FILL_AT: 'ASK',          // ASK = buy at ask, sell at bid. Never MID.
  // Extra adverse slippage in rupees per unit, on top of crossing the spread.
  PAPER_SLIPPAGE_EXTRA: 0.0,
  PAPER_MAX_POSITIONS: 3,
  PAPER_MAX_TRADES_PER_DAY: 3
};

function paperCfg_(key) {
  var all = (typeof cfg === 'function') ? cfg() : null;
  var v = (all && key in all) ? all[key] : undefined;
  if (v === undefined || v === null || v === '') return PAPER_DEFAULTS[key];
  if (typeof PAPER_DEFAULTS[key] === 'number') {
    return isNaN(Number(v)) ? PAPER_DEFAULTS[key] : Number(v);
  }
  return v;
}

/**
 * A paper book. Pure state — no I/O, so it is fully testable.
 * @param {number} capital
 */
function newPaperBook(capital) {
  return {
    capital: capital || paperCfg_('PAPER_CAPITAL'),
    cash: capital || paperCfg_('PAPER_CAPITAL'),
    positions: [],      // open
    closed: [],         // completed round trips
    ledger: [],         // every event, append-only
    tradesToday: 0,
    lastDate: null,
    rejections: []      // gate refusals, with reasons — the useful half
  };
}

function paperLog_(book, type, detail) {
  book.ledger.push({
    seq: book.ledger.length + 1,
    ts: detail && detail.ts ? detail.ts : null,
    type: type,
    detail: detail
  });
}

/** Roll the day counter when the date changes. */
function paperNewDay_(book, todayISO) {
  if (book.lastDate !== todayISO) {
    book.lastDate = todayISO;
    book.tradesToday = 0;
    paperLog_(book, 'DAY_START', { ts: todayISO });
  }
}

/**
 * Attempt an entry. Runs the full gate; a refusal is recorded, not discarded —
 * the rejected trades are how you find out whether the gate is too tight.
 *
 * @param {object} book
 * @param {GateCandidate} c   must carry bid, ask, lotSize, and the gate inputs
 * @param {object} plan       { lots, stopLevel, targetPrice, thesisVar,
 *                              timeStopDate, todayISO, nowHHMM }
 * @returns {{accepted:boolean, reason:string, position:object|null, gate:object}}
 */
function paperEnter(book, c, plan) {
  paperNewDay_(book, plan.todayISO);

  // --- house limits before the gate: cheaper, and they are hard rules ---
  if (book.positions.length >= paperCfg_('PAPER_MAX_POSITIONS')) {
    return paperRefuse_(book, c, 'max concurrent positions reached', null);
  }
  if (book.tradesToday >= paperCfg_('PAPER_MAX_TRADES_PER_DAY')) {
    return paperRefuse_(book, c, 'max trades per day reached', null);
  }

  // --- the stop must be survivable before anything else is considered ---
  var sv = validateEntryStop(c.spot, plan.stopLevel, c.atr, c.right);
  if (!sv.ok) return paperRefuse_(book, c, 'stop rejected: ' + sv.reason, null);

  // --- the gate ---
  var g = runGate(c);
  if (!g.pass) {
    return paperRefuse_(book, c, 'gate: ' + g.failures.join(' | '), g);
  }

  // --- fill: cross the spread, then add adverse slippage ---
  var fill = paperCfg_('PAPER_FILL_AT') === 'MID'
    ? (c.bid + c.ask) / 2
    : c.ask;
  fill = round2_(fill + paperCfg_('PAPER_SLIPPAGE_EXTRA'));

  var qty = plan.lots * c.lotSize;
  var cost = fill * qty;
  if (cost > book.cash) {
    return paperRefuse_(book, c, 'insufficient paper cash: need ' +
      round2_(cost) + ', have ' + round2_(book.cash), g);
  }

  var pos = {
    id: 'P' + (book.closed.length + book.positions.length + 1),
    symbol: c.symbol, underlying: c.underlying, right: c.right,
    strike: c.strike, lotSize: c.lotSize, lots: plan.lots, qty: qty,
    entryPrice: fill, entryTs: plan.todayISO + ' ' + plan.nowHHMM,
    entrySpread: round2_(c.ask - c.bid),
    thesisVar: plan.thesisVar || c.underlying,
    stopLevel: plan.stopLevel, targetPrice: plan.targetPrice,
    timeStopDate: plan.timeStopDate || null,
    atr: c.atr, sector: c.sector,
    peakPrice: fill, ltp: fill,
    gateMetrics: g.metrics
  };

  book.cash = round2_(book.cash - cost);
  book.positions.push(pos);
  book.tradesToday++;
  paperLog_(book, 'ENTRY', {
    ts: pos.entryTs, symbol: pos.symbol, qty: qty, fill: fill,
    cost: round2_(cost), stop: plan.stopLevel, target: plan.targetPrice,
    metrics: g.metrics
  });

  return { accepted: true, reason: 'filled at ' + fill, position: pos, gate: g };
}

function paperRefuse_(book, c, reason, gate) {
  var rec = { symbol: c.symbol, underlying: c.underlying, reason: reason,
              failures: gate ? gate.failures : [] };
  book.rejections.push(rec);
  paperLog_(book, 'REFUSED', rec);
  return { accepted: false, reason: reason, position: null, gate: gate };
}

/**
 * Mark every open position and apply the hold rules.
 *
 * @param {object} book
 * @param {object} marks  { symbol: { ltp, bid, ask,
 *                                    underlyingPrice, underlyingClose,
 *                                    thesisIntact } }
 * @param {object} clock  { todayISO, nowHHMM }
 * @returns {Array} the actions taken
 */
function paperMark(book, marks, clock) {
  paperNewDay_(book, clock.todayISO);
  var actions = [];

  for (var i = book.positions.length - 1; i >= 0; i--) {
    var p = book.positions[i];
    var m = marks[p.symbol];
    if (!m) {
      actions.push({ symbol: p.symbol, action: 'NO_MARK',
        reason: 'no quote this tick — position left untouched' });
      continue;
    }

    p.ltp = m.ltp;
    if (m.ltp > p.peakPrice) p.peakPrice = m.ltp;

    var d = holdDecision({
      symbol: p.symbol, right: p.right, entryPrice: p.entryPrice,
      qty: p.qty, ltp: m.ltp,
      thesisVar: p.thesisVar, stopLevel: p.stopLevel,
      targetPrice: p.targetPrice,
      underlyingPrice: m.underlyingPrice,
      underlyingClose: (m.underlyingClose === undefined ? null : m.underlyingClose),
      atr: p.atr,
      thesisIntact: (m.thesisIntact === undefined ? true : m.thesisIntact),
      peakPrice: p.peakPrice,
      timeStopDate: p.timeStopDate,
      nowHHMM: clock.nowHHMM, todayISO: clock.todayISO
    });

    if (d.action === 'EXIT') {
      actions.push(paperExit_(book, i, m, clock, d.rule + ': ' + d.reason));
    } else {
      // EXIT_AT_OPEN is a decision for the NEXT session. Flag, do not sell.
      if (d.action === 'EXIT_AT_OPEN') p.exitAtOpen = d.reason;
      actions.push({ symbol: p.symbol, action: d.action, rule: d.rule,
        reason: d.reason, unrealised: d.detail.unrealised });
    }
  }
  return actions;
}

/** Execute any EXIT_AT_OPEN flags. Call once, at the open. */
function paperOpenExits(book, marks, clock) {
  var actions = [];
  for (var i = book.positions.length - 1; i >= 0; i--) {
    var p = book.positions[i];
    if (!p.exitAtOpen) continue;
    var m = marks[p.symbol];
    if (!m) {
      actions.push({ symbol: p.symbol, action: 'NO_MARK',
        reason: 'flagged for exit but no opening quote' });
      continue;
    }
    actions.push(paperExit_(book, i, m, clock, 'EXIT_AT_OPEN: ' + p.exitAtOpen));
  }
  return actions;
}

function paperExit_(book, idx, m, clock, reason) {
  var p = book.positions[idx];

  // Sell into the bid, then adverse slippage. Never the mid.
  var fill = paperCfg_('PAPER_FILL_AT') === 'MID'
    ? (m.bid + m.ask) / 2
    : m.bid;
  fill = round2_(Math.max(0, fill - paperCfg_('PAPER_SLIPPAGE_EXTRA')));

  var pnl = netPnl(p.entryPrice, fill, p.qty, p.entrySpread);

  book.cash = round2_(book.cash + fill * p.qty - pnl.costs);
  book.positions.splice(idx, 1);

  var rec = {
    id: p.id, symbol: p.symbol, underlying: p.underlying, right: p.right,
    qty: p.qty, entryPrice: p.entryPrice, exitPrice: fill,
    entryTs: p.entryTs, exitTs: clock.todayISO + ' ' + clock.nowHHMM,
    grossPnl: pnl.gross, costs: pnl.costs, netPnl: pnl.net,
    reason: reason, sector: p.sector, gateMetrics: p.gateMetrics
  };
  book.closed.push(rec);
  paperLog_(book, 'EXIT', rec);

  return { symbol: p.symbol, action: 'EXIT', reason: reason,
    exitPrice: fill, netPnl: pnl.net, costs: pnl.costs };
}

/**
 * Trail every open stop. Separate from paperMark so it can be run on its own
 * schedule, and so a trailing bug cannot cause an exit.
 */
function paperTrail(book, marks, proposer) {
  var moves = [];
  for (var i = 0; i < book.positions.length; i++) {
    var p = book.positions[i];
    var m = marks[p.symbol];
    if (!m) continue;
    var proposed = proposer(p, m);
    if (proposed === null || proposed === undefined) continue;

    var t = trailStop({
      right: p.right, entryPrice: p.entryPrice, ltp: m.ltp,
      underlyingPrice: m.underlyingPrice, stopLevel: p.stopLevel, atr: p.atr
    }, proposed);

    if (t.moved) {
      paperLog_(book, 'TRAIL', { symbol: p.symbol, from: p.stopLevel,
        to: t.stopLevel, reason: t.reason });
      p.stopLevel = t.stopLevel;
    }
    moves.push({ symbol: p.symbol, moved: t.moved, reason: t.reason,
      stopLevel: p.stopLevel });
  }
  return moves;
}

/**
 * The only report that matters. Every figure is net of costs.
 */
function paperReport(book) {
  var wins = 0, losses = 0, grossWin = 0, grossLoss = 0, totalCosts = 0, net = 0;

  for (var i = 0; i < book.closed.length; i++) {
    var t = book.closed[i];
    net += t.netPnl;
    totalCosts += t.costs;
    if (t.netPnl > 0) { wins++; grossWin += t.netPnl; }
    else { losses++; grossLoss += Math.abs(t.netPnl); }
  }

  var n = book.closed.length;
  var openValue = 0, openUnrealised = 0;
  for (var j = 0; j < book.positions.length; j++) {
    var p = book.positions[j];
    openValue += p.ltp * p.qty;
    openUnrealised += (p.ltp - p.entryPrice) * p.qty;
  }

  return {
    trades: n,
    wins: wins,
    losses: losses,
    winRate: n > 0 ? round4_(wins / n) : null,
    netPnl: round2_(net),
    totalCosts: round2_(totalCosts),
    // Costs as a share of gross movement — the number that kills scalping.
    costDrag: (grossWin + grossLoss) > 0
      ? round4_(totalCosts / (grossWin + grossLoss + totalCosts)) : null,
    profitFactor: grossLoss > 0 ? round2_(grossWin / grossLoss)
                 : (grossWin > 0 ? Infinity : null),
    avgWin: wins > 0 ? round2_(grossWin / wins) : null,
    avgLoss: losses > 0 ? round2_(grossLoss / losses) : null,
    expectancy: n > 0 ? round2_(net / n) : null,
    openPositions: book.positions.length,
    openValue: round2_(openValue),
    openUnrealised: round2_(openUnrealised),
    cash: round2_(book.cash),
    equity: round2_(book.cash + openValue),
    returnPct: book.capital > 0
      ? round4_((book.cash + openValue - book.capital) / book.capital) : null,
    refusals: book.rejections.length,
    // The honest verdict. No amount of paper profit makes this "proven".
    verdict: paperVerdict_(n, net)
  };
}

function paperVerdict_(trades, net) {
  if (trades < 30) {
    return 'NOT VALIDATED — ' + trades + ' of 30 sessions. Too few trades to ' +
           'distinguish edge from luck, whatever the P&L says.';
  }
  if (net <= 0) {
    return 'FAILED — ' + trades + ' trades, net ' + round2_(net) +
           ' after costs. Do not go live.';
  }
  return 'POSITIVE over ' + trades + ' trades, net ' + round2_(net) +
         ' after costs. Necessary, not sufficient: check the drawdown and ' +
         'whether one trade carried the result.';
}

/**
 * Reconciliation. The bot must never assume its own book is correct.
 * @param {object} book
 * @param {Array} brokerPositions  [{trading_symbol, quantity}]
 * @returns {{ok:boolean, mismatches:Array}}
 */
function paperReconcile(book, brokerPositions) {
  var mism = [];
  var bySym = {};
  for (var i = 0; i < (brokerPositions || []).length; i++) {
    var b = brokerPositions[i];
    bySym[b.trading_symbol] = (bySym[b.trading_symbol] || 0) + Number(b.quantity || 0);
  }
  for (var j = 0; j < book.positions.length; j++) {
    var p = book.positions[j];
    var bq = bySym[p.symbol] || 0;
    if (bq !== p.qty) {
      mism.push({ symbol: p.symbol, internal: p.qty, broker: bq,
        note: 'internal book disagrees with the broker' });
    }
    delete bySym[p.symbol];
  }
  for (var sym in bySym) {
    if (bySym[sym] !== 0) {
      mism.push({ symbol: sym, internal: 0, broker: bySym[sym],
        note: 'UNEXPECTED POSITION at the broker — the bot did not open this' });
    }
  }
  return { ok: mism.length === 0, mismatches: mism };
}
