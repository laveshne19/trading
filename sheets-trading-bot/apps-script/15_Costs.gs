/**
 * 15_Costs.gs — what a trade actually costs.
 *
 * The README admits it: "No slippage or cost model in sizing... Treat logged
 * P&L as gross." That gap is fatal for two of the things this bot is being
 * asked to do:
 *
 *   1. Decide whether a quick in-and-out trade is worth taking at all.
 *   2. Report a P&L the user can trust.
 *
 * On a Rs 70 option with a 1% spread and a 2,750 lot, the round trip costs
 * roughly Rs 2,100 before the position has moved a paisa. A "small profit"
 * strategy that ignores that number is a machine for donating to the exchange.
 *
 * Every rate below is CONFIGURABLE because they change by circular. The
 * defaults are the NSE/SEBI schedule as understood on 2026-11-26 and are
 * marked with their basis. VERIFY THEM against your contract note before
 * trusting a single profitability figure — one wrong rate silently biases
 * every go/no-go decision this module makes.
 */

var COST_DEFAULTS = {
  // Flat per executed order. Groww charges Rs 20 per F&O order.
  BROKERAGE_PER_ORDER: 20,

  // STT on options: charged on the SELL side, on premium.
  STT_SELL_PCT: 0.001,            // 0.10% of premium turnover

  // NSE exchange transaction charge on options, on premium, both sides.
  EXCHANGE_TXN_PCT: 0.0003503,    // 0.03503%

  // SEBI turnover fee, both sides, on premium.
  SEBI_PCT: 0.000001,             // Rs 10 per crore

  // Investor Protection Fund Trust, options, both sides.
  IPFT_PCT: 0.0000005,            // Rs 50 per crore

  // Stamp duty, BUY side only, on premium.
  STAMP_BUY_PCT: 0.00003,         // 0.003%

  // GST on (brokerage + exchange txn + SEBI).
  GST_PCT: 0.18,

  // Modelled slippage, each side, as a fraction of the quoted spread that you
  // expect to give up. 1.0 = you cross the full spread every time. 0.5 is the
  // realistic default for a limit order that sometimes gets the mid.
  SLIPPAGE_SPREAD_FRACTION: 0.5
};

/** Read a cost rate, honouring any Config-sheet override. */
function costCfg_(key) {
  // cfg() takes no arguments: it returns the whole resolved config object.
  var all = (typeof cfg === 'function') ? cfg() : null;
  var v = (all && key in all) ? all[key] : undefined;
  if (v === undefined || v === null || v === '' || isNaN(Number(v))) {
    return COST_DEFAULTS[key];
  }
  return Number(v);
}

/**
 * Full round-trip cost of an option trade, in rupees.
 *
 * @param {number} entryPrice  premium paid, per unit
 * @param {number} exitPrice   premium received, per unit
 * @param {number} qty         total units (lots x lotSize), NOT lots
 * @param {number} spreadAbs   absolute bid-ask spread at entry, per unit.
 *                             Pass 0 to exclude modelled slippage.
 * @returns {{brokerage,stt,exchange,sebi,ipft,stamp,gst,slippage,total}}
 */
function optionRoundTripCost(entryPrice, exitPrice, qty, spreadAbs) {
  if (!(qty > 0)) throw new Error('optionRoundTripCost: qty must be > 0');
  if (!(entryPrice >= 0) || !(exitPrice >= 0)) {
    throw new Error('optionRoundTripCost: prices must be >= 0');
  }
  spreadAbs = spreadAbs || 0;

  var buyTurnover  = entryPrice * qty;
  var sellTurnover = exitPrice * qty;
  var bothTurnover = buyTurnover + sellTurnover;

  var brokerage = costCfg_('BROKERAGE_PER_ORDER') * 2;   // entry + exit
  var stt       = sellTurnover * costCfg_('STT_SELL_PCT');
  var exchange  = bothTurnover * costCfg_('EXCHANGE_TXN_PCT');
  var sebi      = bothTurnover * costCfg_('SEBI_PCT');
  var ipft      = bothTurnover * costCfg_('IPFT_PCT');
  var stamp     = buyTurnover  * costCfg_('STAMP_BUY_PCT');
  var gst       = (brokerage + exchange + sebi) * costCfg_('GST_PCT');

  // Slippage is a modelling assumption, not a charge. Kept separate so the
  // caller can see the regulatory floor on its own.
  var slippage = spreadAbs * costCfg_('SLIPPAGE_SPREAD_FRACTION') * qty * 2;

  var total = brokerage + stt + exchange + sebi + ipft + stamp + gst + slippage;

  return {
    brokerage: round2_(brokerage),
    stt:       round2_(stt),
    exchange:  round2_(exchange),
    sebi:      round2_(sebi),
    ipft:      round2_(ipft),
    stamp:     round2_(stamp),
    gst:       round2_(gst),
    slippage:  round2_(slippage),
    total:     round2_(total)
  };
}

/**
 * Net P&L after every cost. This is the ONLY P&L figure the bot is allowed to
 * report as "profit". Gross P&L is for diagnostics.
 */
function netPnl(entryPrice, exitPrice, qty, spreadAbs) {
  var gross = (exitPrice - entryPrice) * qty;
  var c = optionRoundTripCost(entryPrice, exitPrice, qty, spreadAbs);
  return {
    gross: round2_(gross),
    costs: c.total,
    net:   round2_(gross - c.total),
    breakdown: c
  };
}

/**
 * The move required, per unit of premium, just to break even after costs.
 *
 * This is the number that kills most scalping ideas. Call it BEFORE deciding
 * a quick trade is worth taking.
 *
 * @returns {{absolute:number, pct:number, costs:number}}
 */
function breakevenMove(entryPrice, qty, spreadAbs) {
  // Costs depend slightly on the exit price, which depends on the move. Two
  // iterations converge well inside a paisa for any realistic input.
  var exit = entryPrice;
  for (var i = 0; i < 3; i++) {
    var c = optionRoundTripCost(entryPrice, exit, qty, spreadAbs);
    exit = entryPrice + c.total / qty;
  }
  var absolute = exit - entryPrice;
  return {
    absolute: round2_(absolute),
    pct: entryPrice > 0 ? round4_(absolute / entryPrice) : null,
    costs: round2_(absolute * qty)
  };
}

/**
 * Is a quick-profit trade viable at all?
 *
 * A scalp is only sane when the target move is a comfortable multiple of the
 * breakeven move. Below that multiple you are trading for the exchange.
 *
 * @param {number} entryPrice
 * @param {number} targetPrice   where you intend to exit
 * @param {number} qty
 * @param {number} spreadAbs
 * @param {number} minMultiple   default 3 — target must be >= 3x breakeven
 * @returns {{ok:boolean, reason:string, breakeven:object, targetMove:number,
 *            multiple:number, netAtTarget:number}}
 */
function scalpViability(entryPrice, targetPrice, qty, spreadAbs, minMultiple) {
  minMultiple = minMultiple || 3;
  var be = breakevenMove(entryPrice, qty, spreadAbs);
  var targetMove = targetPrice - entryPrice;

  if (targetMove <= 0) {
    return {
      ok: false, reason: 'target is not above entry',
      breakeven: be, targetMove: round2_(targetMove), multiple: 0, netAtTarget: null
    };
  }

  var multiple = be.absolute > 0 ? targetMove / be.absolute : Infinity;
  var net = netPnl(entryPrice, targetPrice, qty, spreadAbs);

  if (multiple < minMultiple) {
    return {
      ok: false,
      reason: 'target move ' + round2_(targetMove) + ' is only ' +
              round2_(multiple) + 'x the ' + be.absolute +
              ' breakeven (need ' + minMultiple + 'x)',
      breakeven: be, targetMove: round2_(targetMove),
      multiple: round2_(multiple), netAtTarget: net.net
    };
  }

  return {
    ok: true, reason: 'ok',
    breakeven: be, targetMove: round2_(targetMove),
    multiple: round2_(multiple), netAtTarget: net.net
  };
}

/**
 * Spread as a fraction of price, from a depth book. Returns null when the
 * book is not two-sided — which itself is a reason to refuse the trade.
 */
function spreadPct(bid, ask) {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  var mid = (bid + ask) / 2;
  return mid > 0 ? (ask - bid) / mid : null;
}

// round2_ lives in 14_Util.gs. round4_ is only needed here.
function round4_(n) { return Math.round(n * 10000) / 10000; }
