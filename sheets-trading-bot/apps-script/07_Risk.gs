/**
 * 07_Risk.gs — the gate. Nothing reaches the exchange without passing here.
 *
 * ---------------------------------------------------------------------------
 * THE SINGLE MOST IMPORTANT DESIGN DECISION IN THIS PROJECT
 * ---------------------------------------------------------------------------
 * Google Apps Script is not a reliable real-time host. Time-driven triggers
 * have ~1 minute granularity and can be delayed or skipped; a run is capped at
 * 6 minutes; consumer accounts get ~90 minutes of total trigger runtime a day;
 * and there is no websocket, so prices are polled.
 *
 * That means: a stop-loss that exists only as logic inside this script is not a
 * stop-loss. If the trigger misses a cycle while a naked option position is
 * open, there is nothing between you and the whole premium.
 *
 * So the rule is absolute — the protective stop lives AT THE BROKER, as a real
 * SL-M order on the exchange, placed immediately after the entry fills. The
 * script's own monitoring is a second layer for targets and trailing, never the
 * primary protection. PLACE_EXCHANGE_STOP must stay true in live mode; the risk
 * gate refuses to arm live trading without it.
 * ---------------------------------------------------------------------------
 */

/**
 * Evaluate a proposed trade. Returns a verdict object; callers must check
 * `.pass` and must use `.lots` rather than any size they computed themselves.
 *
 * @param {Object} t  { underlying, tradingSymbol, premium, lotSize, horizon,
 *                      conviction, segment }
 */
function riskGate_(t) {
  var c = cfg();
  var reasons = [];
  var block = function (r) { reasons.push(r); };

  // ---- 0. Configuration sanity ------------------------------------------
  if (!c.DRY_RUN && !c.PLACE_EXCHANGE_STOP) {
    block('PLACE_EXCHANGE_STOP is false in live mode. Refusing: a script-only ' +
          'stop is not a stop. Set it true in Config.');
  }

  // ---- 1. Calendar and session ------------------------------------------
  if (!isTradingDay_()) block('Not a trading day (weekend or NSE holiday).');
  if (!isMarketOpen_())  block('Market is closed.');

  var now = nowIstMinutes_();
  if (now < hhmmToMinutes_(c.NO_ENTRY_BEFORE)) {
    block('Before NO_ENTRY_BEFORE (' + c.NO_ENTRY_BEFORE + ') — letting the open settle.');
  }

  var expiry = isExpiryToday_();
  var cutoff = expiry ? c.EXPIRY_NO_ENTRY_AFTER : c.NO_ENTRY_AFTER;
  if (now > hhmmToMinutes_(cutoff)) {
    block('After entry cutoff ' + cutoff + (expiry ? ' (expiry day)' : '') + '.');
  }

  // ---- 2. Kill switch ----------------------------------------------------
  var ks = killSwitchState_();
  if (ks.tripped) block('Kill switch is ON for today: ' + ks.reason);

  // ---- 3. Daily loss limit ----------------------------------------------
  var realised = dailyRealisedPnl_();
  var limit = -Math.abs(c.CAPITAL * c.DAILY_LOSS_LIMIT_PCT);
  if (realised <= limit) {
    tripKillSwitch_('Daily loss limit hit: realised ' + inr_(realised) +
                    ' vs limit ' + inr_(limit));
    block('Daily loss limit reached (' + inr_(realised) + ').');
  }

  // ---- 4. Trade and position counts -------------------------------------
  var openPos = countOpenPositions_();
  if (openPos >= c.MAX_CONCURRENT_POSITIONS) {
    block('Already at MAX_CONCURRENT_POSITIONS (' + openPos + ').');
  }
  var todayTrades = countTodayEntries_();
  if (todayTrades >= c.MAX_TRADES_PER_DAY) {
    block('Already at MAX_TRADES_PER_DAY (' + todayTrades + ').');
  }

  // ---- 5. Instrument sanity ---------------------------------------------
  var premium = Number(t.premium);
  var lotSize = Number(t.lotSize);
  if (!(premium > 0)) block('Premium missing or non-positive.');
  if (!(lotSize > 0)) block('Lot size missing or non-positive.');
  if (premium > 0 && premium < c.MIN_PREMIUM) {
    block('Premium ' + premium + ' below MIN_PREMIUM ' + c.MIN_PREMIUM +
          ' — the bid/ask spread would eat the edge.');
  }
  if (premium > c.MAX_PREMIUM) {
    block('Premium ' + premium + ' above MAX_PREMIUM ' + c.MAX_PREMIUM + '.');
  }
  if (!t.tradingSymbol) block('No trading symbol resolved.');

  // ---- 6. Conviction floor ----------------------------------------------
  if (Number(t.conviction) < 3) {
    block('Conviction ' + t.conviction + ' below the floor of 3.');
  }

  // ---- 7. Sizing ---------------------------------------------------------
  var sizing = { lots: 0, qty: 0, costRupees: 0, maxLossRupees: 0, limitedBy: null };
  if (premium > 0 && lotSize > 0) {
    sizing = sizePosition_(premium, lotSize, t.underlying);
    if (sizing.lots < 1) {
      block('Cannot size even one lot inside the risk budget (' +
            sizing.limitedBy + '). One lot would risk ' +
            inr_(premium * lotSize * c.STOP_PCT) + ' against a per-trade cap of ' +
            inr_(c.CAPITAL * c.RISK_PCT_PER_TRADE) + '.');
    }
  }

  // ---- 8. Funds ----------------------------------------------------------
  if (sizing.lots >= 1 && !c.DRY_RUN) {
    try {
      var m = apiUserMargin();
      var avail = Number(m.optionBuyAvailable || m.clearCash || 0);
      if (avail > 0 && sizing.costRupees > avail) {
        block('Cost ' + inr_(sizing.costRupees) + ' exceeds available option-buy ' +
              'balance ' + inr_(avail) + '.');
      }
    } catch (e) {
      block('Could not verify margin, refusing to trade blind: ' + e.message);
    }
  }

  var stopPrice  = roundTick_(premium * (1 - c.STOP_PCT));
  var targetPrice = roundTick_(premium * (1 + c.TARGET_PCT));

  var verdict = {
    pass: reasons.length === 0,
    reasons: reasons,
    lots: sizing.lots,
    qty: sizing.qty,
    costRupees: round2_(sizing.costRupees),
    maxLossRupees: round2_(sizing.maxLossRupees),
    limitedBy: sizing.limitedBy,
    entryRef: round2_(premium),
    stopPrice: stopPrice,
    targetPrice: targetPrice,
    isExpiry: expiry
  };

  audit_(verdict.pass ? 'RISK_PASS' : 'RISK_BLOCK',
    (t.tradingSymbol || '?') + ' | ' + JSON.stringify(verdict));
  return verdict;
}

/**
 * How many lots fit inside every cap at once. The binding cap is reported so a
 * rejection is explainable rather than mysterious.
 */
function sizePosition_(premium, lotSize, underlying) {
  var c = cfg();
  var perLotCost = premium * lotSize;
  var perLotRisk = perLotCost * c.STOP_PCT;

  var byRisk     = Math.floor((c.CAPITAL * c.RISK_PCT_PER_TRADE) / perLotRisk);
  var byDeployed = Math.floor((c.CAPITAL * c.MAX_DEPLOYED_PCT) / perLotCost);

  var lots = Math.min(byRisk, byDeployed);
  var limitedBy = (lots === byRisk) ? 'RISK_PCT_PER_TRADE' : 'MAX_DEPLOYED_PCT';
  if (byRisk === byDeployed) limitedBy = 'RISK_PCT_PER_TRADE';
  if (lots < 0) lots = 0;

  return {
    lots: lots,
    qty: lots * lotSize,
    costRupees: lots * perLotCost,
    maxLossRupees: lots * perLotRisk,
    limitedBy: limitedBy,
    perLotCost: perLotCost,
    perLotRisk: perLotRisk
  };
}

// ---------------------------------------------------------------- kill switch

function killSwitchState_() {
  var on = props_().getProperty(PROP.KILLED_ON);
  if (!on) return { tripped: false, reason: null };
  var parts = String(on).split('|');
  if (parts[0] !== todayIst_()) return { tripped: false, reason: null };
  return { tripped: true, reason: parts[1] || 'manually set' };
}

function tripKillSwitch_(reason) {
  if (killSwitchState_().tripped) return;
  props_().setProperty(PROP.KILLED_ON, todayIst_() + '|' + truncate_(reason, 200));
  audit_('KILL_SWITCH', 'TRIPPED: ' + reason);
  notify_('Trading halted for today', 'Kill switch tripped.\n\n' + reason +
    '\n\nNo new entries will be taken. Open positions are still managed ' +
    'and will be squared off by ' + cfg().INTRADAY_FLAT_BY + '.');
}

function resetKillSwitch_() {
  props_().deleteProperty(PROP.KILLED_ON);
  audit_('KILL_SWITCH', 'Reset');
}

function uiTripKillSwitch() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Halt trading for today?',
    'No new entries will be taken. Open positions keep being managed and ' +
    'squared off as normal.', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  tripKillSwitch_('Manual halt from the menu');
  ui.alert('Trading halted for ' + todayIst_() + '.');
}

function uiResetKillSwitch() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Re-enable trading?',
    'This clears the kill switch. If it tripped on a loss limit, understand ' +
    'why before clearing it.', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  resetKillSwitch_();
  ui.alert('Trading re-enabled.');
}

/** Cancel every open order and square off every open position, now. */
function panicFlatten() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  if (ui) {
    var r = ui.alert('FLATTEN EVERYTHING?',
      'Cancels all open orders and market-sells every open option position.',
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }

  tripKillSwitch_('Panic flatten');
  var out = [];

  try {
    apiOrderList(E.SEGMENT.FNO).forEach(function (o) {
      var st = String(o.order_status || '').toUpperCase();
      if (['NEW', 'OPEN', 'ACKED', 'TRIGGER_PENDING', 'PENDING'].indexOf(st) !== -1) {
        try { apiCancelOrder(o.groww_order_id, E.SEGMENT.FNO);
              out.push('cancelled ' + o.groww_order_id); }
        catch (e) { out.push('CANCEL FAILED ' + o.groww_order_id + ': ' + e.message); }
      }
    });
  } catch (e) { out.push('Could not list orders: ' + e.message); }

  openPositions_().forEach(function (p) {
    try {
      exitPosition_(p, 'PANIC_FLATTEN');
      out.push('exited ' + p.tradingSymbol);
    } catch (e) {
      out.push('EXIT FAILED ' + p.tradingSymbol + ': ' + e.message);
    }
  });

  var msg = out.length ? out.join('\n') : 'Nothing open.';
  audit_('PANIC', msg);
  notify_('Panic flatten executed', msg);
  if (ui) ui.alert('Flatten complete', msg, ui.ButtonSet.OK);
  return msg;
}

// ---------------------------------------------------------------- P&L

/** Realised P&L booked today, from the TradeLog sheet. */
function dailyRealisedPnl_() {
  var rows = readSheet_(SH.TRADELOG);
  var today = todayIst_();
  var sum = 0;
  rows.forEach(function (r) {
    if (String(r.exitDate || '').slice(0, 10) === today) sum += Number(r.pnl || 0);
  });
  return sum;
}

function countTodayEntries_() {
  var rows = readSheet_(SH.TRADELOG).concat(readSheet_(SH.POSITIONS));
  var today = todayIst_();
  var n = 0;
  rows.forEach(function (r) {
    if (String(r.entryDate || '').slice(0, 10) === today) n++;
  });
  return n;
}

function selfTestRisk() {
  var c = cfg(), fails = [];

  // One lot of a Rs 20 option on a 75 lot = Rs 1,500 cost, Rs 525 risk at 35%.
  // With a Rs 2,000 per-trade cap that is 3 lots by risk.
  var s = sizePosition_(20, 75, 'NIFTY');
  var expectLots = Math.min(
    Math.floor((c.CAPITAL * c.RISK_PCT_PER_TRADE) / (20 * 75 * c.STOP_PCT)),
    Math.floor((c.CAPITAL * c.MAX_DEPLOYED_PCT) / (20 * 75)));
  if (s.lots !== expectLots) fails.push('sizing: want ' + expectLots + ' got ' + s.lots);
  if (s.qty !== s.lots * 75) fails.push('qty mismatch');

  // An option too expensive to risk-size must return zero lots, not one.
  var big = sizePosition_(5000, 75, 'NIFTY');
  if (big.lots !== 0) fails.push('expensive option should size to 0, got ' + big.lots);

  var msg = fails.length ? 'RISK TESTS FAILED:\n' + fails.join('\n')
                         : 'Risk self-test passed. Example: ' + JSON.stringify(s);
  Logger.log(msg);
  return msg;
}
