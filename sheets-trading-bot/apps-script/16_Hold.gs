/**
 * 16_Hold.gs — the exit discipline. The most expensive module in this repo.
 *
 * WHY THIS EXISTS
 *
 * On 25 Nov 2026 this account closed six positions and held five:
 *
 *     SIX positions CLOSED     -Rs 19,707.00
 *     FIVE positions HELD      +Rs 16,030.00
 *
 * Four of the six closures happened with the stated stop NOT hit. The next
 * morning the five held positions were +Rs 17,336. Every rupee lost came from
 * closing; every rupee made came from holding.
 *
 * On 26 Nov at 09:43 the book showed +Rs 131 and the instinct was to sell
 * everything. Eighteen minutes later it was +Rs 8,885. Selling would have
 * cost Rs 8,754.
 *
 * So this module exists to answer exactly one question — "do I exit?" — and
 * to refuse to answer any other. It does not forecast. It does not score
 * conviction. It does not compute the probability that holding beats selling;
 * that question was asked on 28 Oct with a Black-76 model, answered "sell",
 * and was wrong by Rs 5,287 within ninety minutes.
 *
 * THE ONLY FOUR LEGITIMATE EXITS
 *
 *   1. The stop was hit        (on the thesis variable, on a CLOSING basis)
 *   2. The thesis broke        (the named structural condition failed)
 *   3. The target was reached  (pre-committed at entry, never invented later)
 *   4. The time stop expired   (the move had its chance and did not come)
 *
 * Anything else returns HOLD. "It is underwater", "the odds have turned",
 * "I would rather fund something else" are not exits.
 */

var HOLD_DEFAULTS = {
  // No exit decisions on opening prints. On 26 Nov the 09:18 marks showed a
  // call up 6.5% while its stock was DOWN and VIX was flat — an untradeable
  // auction artifact that was reported as Rs 17,336 of profit.
  NO_DECISION_BEFORE: '09:45',

  // A stop closer than this many ATRs is too tight to survive normal noise.
  // On 25 Nov HDFCBANK's stop was trailed to 0.9% on a stock with a 2.6%
  // daily range; it breached, and the position was +Rs 3,282 next morning.
  MIN_STOP_DISTANCE_ATR: 0.6,

  // Stops trigger on a CLOSE, not an intraday wick.
  STOP_ON_CLOSE_ONLY: true,

  // A position with no target gets churned out by its own trailing stop.
  REQUIRE_TARGET: true,

  // Trailing only ever tightens, and only once the trade is meaningfully up.
  TRAIL_ARM_PCT: 0.40,
  TRAIL_MIN_ATR: 0.6
};

function holdCfg_(key) {
  // cfg() takes no arguments: it returns the whole resolved config object.
  var all = (typeof cfg === 'function') ? cfg() : null;
  var v = (all && key in all) ? all[key] : undefined;
  if (v === undefined || v === null || v === '') return HOLD_DEFAULTS[key];
  if (typeof HOLD_DEFAULTS[key] === 'number') {
    return isNaN(Number(v)) ? HOLD_DEFAULTS[key] : Number(v);
  }
  if (typeof HOLD_DEFAULTS[key] === 'boolean') {
    return (v === true || v === 'TRUE' || v === 'true');
  }
  return v;
}

/**
 * A position, as this module needs to see it.
 *
 * @typedef {Object} HoldPosition
 * @property {string} symbol            option trading symbol
 * @property {string} right             'CE' | 'PE'
 * @property {number} entryPrice        premium paid
 * @property {number} qty               total units
 * @property {number} ltp               current premium
 *
 * @property {string} thesisVar         what the stop is measured on, e.g.
 *                                      'AUROPHARMA'. NEVER the option.
 * @property {number} stopLevel         stock price that invalidates the trade
 * @property {number} targetPrice       premium at which to book. Required.
 * @property {number} underlyingPrice   current price of thesisVar
 * @property {number} underlyingClose   today's close, or null intraday
 * @property {number} atr               daily ATR of thesisVar
 *
 * @property {boolean} thesisIntact     caller's structural check (supertrend,
 *                                      DI, sector). Null = unknown = treat
 *                                      as intact and say so.
 * @property {number} peakPrice         highest premium seen since entry
 * @property {string} timeStopDate      'yyyy-MM-dd', exit regardless after
 * @property {string} nowHHMM           current IST time 'HH:MM'
 * @property {string} todayISO          'yyyy-MM-dd'
 */

/**
 * The decision. Returns one of HOLD / EXIT / EXIT_AT_OPEN, with the reason
 * and the rule that fired.
 *
 * @param {HoldPosition} p
 * @returns {{action:string, reason:string, rule:string, detail:object}}
 */
function holdDecision(p) {
  var d = {
    unrealised: round2_((p.ltp - p.entryPrice) * p.qty),
    pctFromEntry: p.entryPrice > 0 ? round4_((p.ltp - p.entryPrice) / p.entryPrice) : null,
    stopDistance: null,
    stopDistanceAtr: null
  };

  // ---- Guard 0: the opening minutes are not data ------------------------
  if (p.nowHHMM && hhmmLess_(p.nowHHMM, holdCfg_('NO_DECISION_BEFORE'))) {
    return mk_('HOLD', 'before ' + holdCfg_('NO_DECISION_BEFORE') +
      ' the prints are auction artifacts, not tradeable prices',
      'OPENING_MINUTES_GUARD', d);
  }

  // ---- Guard 1: a position without a target is misconfigured ------------
  if (holdCfg_('REQUIRE_TARGET') && !(p.targetPrice > 0)) {
    return mk_('HOLD', 'no target was set at entry — fix the position record, ' +
      'do not manage this by nerve', 'MISSING_TARGET', d);
  }

  // ---- Guard 2: the stop must be measured on the thesis variable --------
  if (!p.thesisVar || !(p.stopLevel > 0) || !(p.underlyingPrice > 0)) {
    return mk_('HOLD', 'stop is not anchored to a thesis variable — an ' +
      'option-price stop measures IV and theta, not the thesis',
      'STOP_NOT_ANCHORED', d);
  }

  var isCall = (p.right || 'CE').toUpperCase() === 'CE';

  // Distance, signed so positive always means "still safe".
  d.stopDistance = round2_(isCall
    ? p.underlyingPrice - p.stopLevel
    : p.stopLevel - p.underlyingPrice);
  if (p.atr > 0) d.stopDistanceAtr = round2_(d.stopDistance / p.atr);

  // ---- Exit 1: target reached (pre-committed) ---------------------------
  if (p.ltp >= p.targetPrice) {
    return mk_('EXIT', 'target ' + p.targetPrice + ' reached at ' + p.ltp +
      ' — this exit was committed at entry', 'TARGET_REACHED', d);
  }

  // ---- Exit 2: time stop ------------------------------------------------
  if (p.timeStopDate && p.todayISO && p.todayISO >= p.timeStopDate) {
    return mk_('EXIT', 'time stop ' + p.timeStopDate + ' reached — the move ' +
      'had its window and did not come; theta now beats the thesis',
      'TIME_STOP', d);
  }

  // ---- Exit 3: thesis broken -------------------------------------------
  if (p.thesisIntact === false) {
    return mk_('EXIT', 'thesis broken on ' + p.thesisVar +
      ' — structural condition failed', 'THESIS_BROKEN', d);
  }

  // ---- Exit 4: stop hit, on a CLOSING basis ----------------------------
  var breached = isCall
    ? (p.underlyingPrice <= p.stopLevel)
    : (p.underlyingPrice >= p.stopLevel);

  if (breached) {
    if (holdCfg_('STOP_ON_CLOSE_ONLY')) {
      var closeKnown = (p.underlyingClose !== null && p.underlyingClose !== undefined &&
                        p.underlyingClose > 0);
      if (!closeKnown) {
        return mk_('HOLD', p.thesisVar + ' is through ' + p.stopLevel +
          ' intraday at ' + p.underlyingPrice + ', but the stop is on a CLOSE. ' +
          'A wick does not trigger it.', 'STOP_INTRADAY_ONLY', d);
      }
      var closedBreached = isCall
        ? (p.underlyingClose <= p.stopLevel)
        : (p.underlyingClose >= p.stopLevel);
      if (!closedBreached) {
        return mk_('HOLD', p.thesisVar + ' dipped through ' + p.stopLevel +
          ' but closed at ' + p.underlyingClose + ' — stop not triggered',
          'STOP_RECLAIMED', d);
      }
      return mk_('EXIT_AT_OPEN', p.thesisVar + ' CLOSED at ' + p.underlyingClose +
        ' through the ' + p.stopLevel + ' stop — sell at the next open',
        'STOP_HIT_ON_CLOSE', d);
    }
    return mk_('EXIT', p.thesisVar + ' through the ' + p.stopLevel + ' stop',
      'STOP_HIT', d);
  }

  // ---- Everything else is a HOLD ---------------------------------------
  if (p.ltp < p.entryPrice) {
    return mk_('HOLD', 'underwater at ' + d.pctFromEntry * 100 + '% but ' +
      p.thesisVar + ' is ' + d.stopDistance + ' clear of the ' + p.stopLevel +
      ' stop and the thesis holds. Being underwater is not an exit signal.',
      'UNDERWATER_BUT_INTACT', d);
  }

  return mk_('HOLD', 'winning, stop not hit, target not reached — hold and ' +
    'tighten the stop if the rules allow', 'WINNER_INTACT', d);
}

/**
 * Trailing stop. ONLY EVER TIGHTENS. A stop that moves away from price to
 * avoid booking a loss is not a stop.
 *
 * Refuses to trail closer than MIN_STOP_DISTANCE_ATR — the HDFCBANK error.
 *
 * @returns {{stopLevel:number, moved:boolean, reason:string}}
 */
function trailStop(p, proposedStop) {
  var isCall = (p.right || 'CE').toUpperCase() === 'CE';
  var cur = p.stopLevel;

  if (!(p.atr > 0)) {
    return { stopLevel: cur, moved: false,
      reason: 'no ATR available — refusing to trail blind' };
  }

  // Never widen.
  var wouldWiden = isCall ? (proposedStop < cur) : (proposedStop > cur);
  if (wouldWiden) {
    return { stopLevel: cur, moved: false,
      reason: 'proposed stop ' + proposedStop + ' is WIDER than ' + cur +
              ' — a stop never moves away from price' };
  }
  if (proposedStop === cur) {
    return { stopLevel: cur, moved: false, reason: 'unchanged' };
  }

  // Not until the trade is meaningfully up.
  var gain = p.entryPrice > 0 ? (p.ltp - p.entryPrice) / p.entryPrice : 0;
  if (gain < holdCfg_('TRAIL_ARM_PCT')) {
    return { stopLevel: cur, moved: false,
      reason: 'trail not armed — up ' + round2_(gain * 100) + '%, need ' +
              round2_(holdCfg_('TRAIL_ARM_PCT') * 100) + '%' };
  }

  // Never tighter than the instrument's own noise.
  var dist = isCall ? (p.underlyingPrice - proposedStop)
                    : (proposedStop - p.underlyingPrice);
  var distAtr = dist / p.atr;
  var minAtr = holdCfg_('TRAIL_MIN_ATR');
  if (distAtr < minAtr) {
    return { stopLevel: cur, moved: false,
      reason: 'proposed stop is ' + round2_(distAtr) + ' ATR from price, ' +
              'under the ' + minAtr + ' ATR floor — that is noise, not a stop' };
  }

  return { stopLevel: proposedStop, moved: true,
    reason: 'trailed ' + cur + ' -> ' + proposedStop + ' (' +
            round2_(distAtr) + ' ATR clear)' };
}

/**
 * Validate a stop BEFORE entry. Rejects stops that are too tight to survive.
 * @returns {{ok:boolean, reason:string, distanceAtr:number}}
 */
function validateEntryStop(underlyingPrice, stopLevel, atr, right) {
  var isCall = (right || 'CE').toUpperCase() === 'CE';
  if (!(atr > 0)) {
    return { ok: false, reason: 'no ATR — cannot size a stop', distanceAtr: null };
  }
  var dist = isCall ? (underlyingPrice - stopLevel) : (stopLevel - underlyingPrice);
  if (dist <= 0) {
    return { ok: false, reason: 'stop is on the wrong side of price',
      distanceAtr: round2_(dist / atr) };
  }
  var distAtr = dist / atr;
  var minAtr = holdCfg_('MIN_STOP_DISTANCE_ATR');
  if (distAtr < minAtr) {
    return { ok: false,
      reason: 'stop is ' + round2_(distAtr) + ' ATR away, under the ' + minAtr +
              ' ATR floor — it will be taken out by noise',
      distanceAtr: round2_(distAtr) };
  }
  return { ok: true, reason: 'ok', distanceAtr: round2_(distAtr) };
}

function mk_(action, reason, rule, detail) {
  return { action: action, reason: reason, rule: rule, detail: detail };
}

/** 'HH:MM' < 'HH:MM' */
function hhmmLess_(a, b) {
  var pa = String(a).split(':'), pb = String(b).split(':');
  return (Number(pa[0]) * 60 + Number(pa[1])) < (Number(pb[0]) * 60 + Number(pb[1]));
}
