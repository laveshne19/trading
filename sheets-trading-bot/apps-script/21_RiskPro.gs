/**
 * 21_RiskPro.gs — the capital protection layer.
 *
 * This runs BEFORE the gate, not after. The gate asks "is this a good trade?";
 * this asks "am I allowed to trade at all, and how much?". A good trade taken
 * at the wrong size is how accounts die.
 *
 * The limits here have never actually bound on this account. From the profile:
 *
 *     27 Oct   day closed -7.5%        against a 4% limit
 *     25 Nov   day reached -6.95%      against a 4% limit
 *     25 Nov   book risked Rs 99,478   = 60% of equity, against a 1% rule
 *     13 Nov   ten longs, six banks    against a 2-per-sector cap
 *
 * So this module will refuse trades that previously got taken. That is the
 * point of it, and it means the historical record cannot be used to validate
 * rules it never followed.
 */

/**
 * Fallbacks ONLY, for running headless with no Config sheet. Every key here
 * also exists in CFG_DEFAULTS (00_Config.gs), which is authoritative — having
 * one key in two places with two values is how a limit silently stops binding.
 * Two tests caught exactly that while this module was being written.
 */
var RISK_DEFAULTS = {
  RISK_PCT_PER_TRADE: 0.02,
  DAILY_LOSS_LIMIT_PCT: 0.04,
  WEEKLY_LOSS_LIMIT_PCT: 0.03,
  MAX_CONCURRENT_POSITIONS: 2,
  MAX_POSITIONS_PER_SECTOR: 2,
  MAX_TRADES_PER_DAY: 3,
  MAX_CONSECUTIVE_LOSSES: 3,
  MAX_DEPLOYED_PCT: 0.30,
  MIN_RISK_REWARD: 2.0,
  BLOCK_ENTRY_IF_CASH_NEG: true
};

function riskCfg_(key) {
  var all = (typeof cfg === 'function') ? cfg() : null;
  var v = (all && key in all) ? all[key] : undefined;
  if (v === undefined || v === null || v === '') return RISK_DEFAULTS[key];
  if (typeof RISK_DEFAULTS[key] === 'boolean') {
    return (v === true || v === 'TRUE' || v === 'true');
  }
  return isNaN(Number(v)) ? RISK_DEFAULTS[key] : Number(v);
}

/**
 * @typedef {Object} RiskState
 * @property {number} capital           the capital basis — see the profile's
 *                                      REQUIRED INPUT on which number this is
 * @property {number} clearCash         real cash, which can be negative
 * @property {number} realisedToday
 * @property {number} realisedWeek
 * @property {number} deployed          premium currently at work
 * @property {number} openPositions
 * @property {number} tradesToday
 * @property {number} consecutiveLosses
 * @property {Object} sectorCounts      { SECTOR: n }
 * @property {boolean} killSwitch
 */

/**
 * May the bot open ANYTHING right now? Returns every reason it may not, so a
 * single call tells you the whole picture rather than the first failure.
 *
 * @returns {{allowed:boolean, blocks:Array<string>, warnings:Array<string>}}
 */
function riskGateGlobal(st) {
  var blocks = [], warnings = [];

  if (st.killSwitch) blocks.push('KILL_SWITCH is set');

  var dailyLimit = st.capital * riskCfg_('DAILY_LOSS_LIMIT_PCT');
  if (st.realisedToday <= -dailyLimit) {
    blocks.push('daily loss limit hit: ' + round2_(st.realisedToday) +
      ' against a ' + round2_(-dailyLimit) + ' floor');
  } else if (st.realisedToday <= -dailyLimit * 0.7) {
    warnings.push('70% of the daily loss limit used');
  }

  var weeklyLimit = st.capital * riskCfg_('WEEKLY_LOSS_LIMIT_PCT');
  if (st.realisedWeek <= -weeklyLimit) {
    blocks.push('weekly loss limit hit: ' + round2_(st.realisedWeek) +
      ' against a ' + round2_(-weeklyLimit) + ' floor');
  }

  if (st.openPositions >= riskCfg_('MAX_CONCURRENT_POSITIONS')) {
    blocks.push('max concurrent positions: ' + st.openPositions);
  }
  if (st.tradesToday >= riskCfg_('MAX_TRADES_PER_DAY')) {
    blocks.push('max trades per day: ' + st.tradesToday);
  }
  if (st.consecutiveLosses >= riskCfg_('MAX_CONSECUTIVE_LOSSES')) {
    blocks.push(st.consecutiveLosses + ' consecutive losses — stand down and ' +
      'review before the next entry');
  }

  var deployCap = st.capital * riskCfg_('MAX_DEPLOYED_PCT');
  if (st.deployed >= deployCap) {
    blocks.push('deployed ' + round2_(st.deployed) + ' against a ' +
      round2_(deployCap) + ' cap');
  }

  // The one that was ignored on 11, 12 and 13 Nov, every time.
  if (riskCfg_('BLOCK_ENTRY_IF_CASH_NEG') && st.clearCash < 0) {
    blocks.push('clear_cash is ' + round2_(st.clearCash) +
      ' — new premium would deepen a debit that accrues interest');
  }

  return { allowed: blocks.length === 0, blocks: blocks, warnings: warnings };
}

/**
 * Size a position from the risk at the STOP, not from what it costs.
 *
 * The 25 Nov error, in one line: three positions were sized by cost and
 * together risked Rs 99,478 at their stops, which was 60% of equity.
 *
 * @param {RiskState} st
 * @param {Object} t  { entryPrice, valueAtStop, lotSize, sector, targetPrice }
 * @returns {{lots:number, qty:number, cost:number, riskAtStop:number,
 *            reason:string, ok:boolean}}
 */
function riskSize(st, t) {
  var no = function (reason) {
    return { lots: 0, qty: 0, cost: 0, riskAtStop: 0, ok: false, reason: reason };
  };

  if (!(t.entryPrice > 0)) return no('no entry price');
  if (!(t.lotSize > 0))    return no('no lot size');
  if (t.valueAtStop === undefined || t.valueAtStop === null) {
    return no('valueAtStop is required — sizing from cost is the 25 Nov error');
  }

  var riskPerUnit = t.entryPrice - t.valueAtStop;
  if (!(riskPerUnit > 0)) {
    return no('the stop is not below the entry — risk per unit is ' +
      round2_(riskPerUnit));
  }

  // Reward:risk, measured on the same basis.
  if (t.targetPrice > 0) {
    var rr = (t.targetPrice - t.entryPrice) / riskPerUnit;
    if (rr < riskCfg_('MIN_RISK_REWARD')) {
      return no('reward:risk ' + round2_(rr) + ' below the ' +
        riskCfg_('MIN_RISK_REWARD') + ' floor');
    }
  }

  var sectorOpen = (st.sectorCounts && st.sectorCounts[t.sector]) || 0;
  if (sectorOpen >= riskCfg_('MAX_POSITIONS_PER_SECTOR')) {
    return no(sectorOpen + ' positions already open in ' + t.sector);
  }

  var budget = st.capital * riskCfg_('RISK_PCT_PER_TRADE');
  var riskPerLot = riskPerUnit * t.lotSize;
  var lotsByRisk = Math.floor(budget / riskPerLot);

  var deployRoom = st.capital * riskCfg_('MAX_DEPLOYED_PCT') - st.deployed;
  var costPerLot = t.entryPrice * t.lotSize;
  var lotsByDeploy = Math.floor(deployRoom / costPerLot);

  var lots = Math.max(0, Math.min(lotsByRisk, lotsByDeploy));

  if (lots < 1) {
    return no('sizes to zero lots: risk budget Rs ' + round2_(budget) +
      ' allows ' + lotsByRisk + ', deploy room allows ' + lotsByDeploy +
      '. One lot would risk Rs ' + round2_(riskPerLot) + '.');
  }

  return {
    lots: lots, qty: lots * t.lotSize,
    cost: round2_(lots * costPerLot),
    riskAtStop: round2_(lots * riskPerLot),
    ok: true,
    reason: 'sized by ' + (lotsByRisk <= lotsByDeploy ? 'risk budget' : 'deploy cap')
  };
}

/**
 * What a long option is worth when the UNDERLYING reaches the stop. Needed
 * because the stop is a stock level but the risk is in premium.
 *
 * Intrinsic is exact. Remaining time value is approximated by scaling the
 * current time value by the ratio of moneyness — crude, and deliberately
 * pessimistic so the risk is not understated.
 */
function optionValueAtStop(right, strike, spotNow, premiumNow, stopLevel) {
  var isCall = String(right).toUpperCase() === 'CE';
  var intrinsicNow  = isCall ? Math.max(0, spotNow - strike)
                             : Math.max(0, strike - spotNow);
  var intrinsicStop = isCall ? Math.max(0, stopLevel - strike)
                             : Math.max(0, strike - stopLevel);
  var timeNow = Math.max(0, premiumNow - intrinsicNow);

  // Assume HALF the time value survives the adverse move. Real decay depends
  // on vol and days left; understating the loss is the dangerous direction.
  return round2_(intrinsicStop + timeNow * 0.5);
}

/** Consecutive losses from the closed-trade list, most recent last. */
function consecutiveLosses(closed) {
  var n = 0;
  for (var i = (closed || []).length - 1; i >= 0; i--) {
    if (Number(closed[i].netPnl) < 0) n++; else break;
  }
  return n;
}

/** Realised P&L over the last N calendar days, from closed trades. */
function realisedSince(closed, sinceISO) {
  var sum = 0;
  (closed || []).forEach(function (t) {
    var d = String(t.exitTs || '').slice(0, 10);
    if (d && d >= sinceISO) sum += Number(t.netPnl) || 0;
  });
  return round2_(sum);
}

/** Monday of the week containing `iso`, as yyyy-MM-dd. */
function weekStartISO(iso) {
  var p = String(iso).split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  var dow = d.getUTCDay();                 // 0 Sun .. 6 Sat
  var back = (dow === 0) ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Sector counts from the open book. */
function sectorCounts(positions) {
  var out = {};
  (positions || []).forEach(function (p) {
    var s = p.sector || 'UNKNOWN';
    out[s] = (out[s] || 0) + 1;
  });
  return out;
}

/**
 * Build a RiskState from a paper book plus the account figures.
 */
function riskStateFromBook(book, account, todayISO) {
  var deployed = 0;
  (book.positions || []).forEach(function (p) {
    deployed += p.entryPrice * p.qty;
  });
  return {
    capital: (account && account.capital) || book.capital,
    clearCash: (account && account.clearCash !== undefined)
                 ? account.clearCash : book.cash,
    realisedToday: realisedSince(book.closed, todayISO),
    realisedWeek: realisedSince(book.closed, weekStartISO(todayISO)),
    deployed: round2_(deployed),
    openPositions: (book.positions || []).length,
    tradesToday: book.tradesToday || 0,
    consecutiveLosses: consecutiveLosses(book.closed),
    sectorCounts: sectorCounts(book.positions),
    killSwitch: !!(account && account.killSwitch)
  };
}
