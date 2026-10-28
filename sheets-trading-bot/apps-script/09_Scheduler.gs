/**
 * 09_Scheduler.gs — triggers and the position monitor.
 *
 * Apps Script's `atHour().nearMinute()` triggers fire within a ~15 minute
 * window, which is useless for a 15:15 square-off. So there is exactly one
 * recurring trigger — a 5-minute tick — and jobTick() dispatches on the IST
 * clock itself. That gives ±5 minute precision with no hidden scheduler drift.
 */

var TICK_MINUTES = 5;

function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('jobTick').timeBased().everyMinutes(TICK_MINUTES).create();
  audit_('SCHED', 'Installed the ' + TICK_MINUTES + '-minute tick.');
  try {
    SpreadsheetApp.getUi().alert('Scheduler installed',
      'A job now runs every ' + TICK_MINUTES + ' minutes and decides what to do ' +
      'from the IST clock.\n\n' +
      'Note Apps Script quotas: consumer Google accounts get roughly 90 minutes ' +
      'of total trigger runtime per day, and each run is capped at 6 minutes. ' +
      'Keep the watchlist short so a tick finishes quickly.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
}

/** The only recurring entry point. */
function jobTick() {
  clearCfgCache();
  var c = cfg();

  if (!isTradingDay_()) return;

  var n = nowIstMinutes_();
  var open  = hhmmToMinutes_(c.MARKET_OPEN);
  var close = hhmmToMinutes_(c.MARKET_CLOSE);

  try {
    // Pre-open housekeeping, once, in the 15 minutes before the bell.
    if (n >= open - 15 && n < open) {
      runOnce_('preopen', function () { jobPreOpen(); });
      return;
    }

    if (n < open || n > close + 20) return;

    // Positions are managed on every tick the market is open — this comes
    // first, because protecting what is open beats finding something new.
    monitorPositions_();

    // Square off intraday positions.
    if (n >= hhmmToMinutes_(c.INTRADAY_FLAT_BY)) {
      flattenIntraday_('TIME_STOP');
    }

    // Overnight carry decision, once.
    if (c.ENABLE_EOD_CARRY && n >= hhmmToMinutes_(c.EOD_CARRY_AT) &&
        n < hhmmToMinutes_(c.INTRADAY_FLAT_BY)) {
      runOnce_('eodcarry', function () { scanAndEnter_(); });
    }

    // Normal entry window.
    if (n >= hhmmToMinutes_(c.NO_ENTRY_BEFORE) &&
        n <= hhmmToMinutes_(isExpiryToday_() ? c.EXPIRY_NO_ENTRY_AFTER : c.NO_ENTRY_AFTER)) {
      scanAndEnter_();
    }

    // End-of-day report, once, after the close.
    if (n > close) {
      runOnce_('eodreport', function () { jobEodReport(); });
    }

    refreshDashboard_();
  } catch (e) {
    audit_('TICK_ERROR', e.message + ' | ' + truncate_(e.stack || '', 400));
    notify_('Bot error', 'jobTick failed:\n\n' + e.message +
      '\n\nThe bot will retry on the next tick. If positions are open, check ' +
      'them at the broker.');
  }
}

/** Run a named job at most once per day. */
function runOnce_(name, fn) {
  var key = 'ONCE_' + name;
  if (props_().getProperty(key) === todayIst_()) return;
  props_().setProperty(key, todayIst_());
  fn();
}

function jobPreOpen() {
  resetKillSwitch_();
  ['ONCE_eodcarry', 'ONCE_eodreport'].forEach(function (k) {
    props_().deleteProperty(k);
  });
  audit_('PREOPEN', 'Daily state reset for ' + todayIst_() +
    (isExpiryToday_() ? ' (EXPIRY DAY)' : ''));

  // One strategic read before the bell, logged for the record.
  if (cfg().ENABLE_AI_SIGNAL) {
    try {
      var snap = buildMarketSnapshot_();
      var sig = claudeSignal_(snap, cfg().MODEL_STRATEGIC);
      logSignal_('PREOPEN', sig, '');
      notify_('Pre-open read: ' + sig.decision,
        'conviction ' + sig.conviction + '/5  horizon ' + sig.horizon +
        '\n\n' + sig.thesis +
        '\n\ninvalidation: ' + sig.invalidation +
        (sig.risk_flags.length ? '\n\nflags: ' + sig.risk_flags.join('; ') : ''));
    } catch (e) {
      audit_('PREOPEN', 'Strategic read failed: ' + e.message);
    }
  }
}

/** Find the best candidate and act on at most one. */
function scanAndEnter_() {
  var c = cfg();
  if (killSwitchState_().tripped) return;
  if (countOpenPositions_() >= c.MAX_CONCURRENT_POSITIONS) return;
  if (countTodayEntries_() >= c.MAX_TRADES_PER_DAY) return;

  var sigs = generateSignals_();
  if (!sigs.length) return;

  var best = sigs[0];
  if (best.decision === 'NO_TRADE') return;

  var r = enterFromCandidate_(best);
  if (!r.ok) {
    audit_('ENTRY_BLOCKED', best.underlying + ' ' + best.decision + ': ' + r.reason);
  }
}

// ---------------------------------------------------------------- monitor

/**
 * Manage every open position. The exchange stop is the real protection; this
 * handles targets, trailing, time stops, and re-arming a stop that failed.
 */
function monitorPositions_() {
  var c = cfg();
  var positions = openPositions_().concat(
    readSheet_(SH.POSITIONS)
      .filter(function (p) { return String(p.status) === 'OPEN_UNPROTECTED'; })
      .map(normalisePosition_));

  positions.forEach(function (pos) {
    var ltp = safeLtp_(pos);
    if (!ltp) return;

    var peak = Math.max(pos.peakPrice || 0, ltp);
    var pnl = (ltp - pos.entryPrice) * pos.qty;
    updateById_(SH.POSITIONS, pos.id, {
      ltp: round2_(ltp), peakPrice: round2_(peak), unrealisedPnl: round2_(pnl)
    });
    pos.peakPrice = peak;

    // An unprotected position gets a stop before anything else happens.
    if (pos.status === 'OPEN_UNPROTECTED' && c.PLACE_EXCHANGE_STOP) {
      try {
        var sl = apiPlaceOrder({
          trading_symbol: pos.tradingSymbol, quantity: pos.qty,
          trigger_price: pos.stopPrice, validity: E.VALIDITY.DAY,
          exchange: E.EXCHANGE.NSE, segment: pos.segment,
          product: pos.horizon === 'OVERNIGHT' ? E.PRODUCT.NRML : c.PRODUCT,
          order_type: E.ORDER_TYPE.SL_M, transaction_type: E.TXN.SELL
        });
        updateById_(SH.POSITIONS, pos.id,
          { stopOrderId: sl.groww_order_id || '', status: 'OPEN' });
        audit_('PROTECT', 'Stop re-armed for ' + pos.tradingSymbol);
      } catch (e) {
        audit_('UNPROTECTED', 'Stop re-arm failed for ' + pos.tradingSymbol +
          ': ' + e.message);
      }
    }

    var n = nowIstMinutes_();

    // Time stops.
    if (pos.horizon === 'INTRADAY' && n >= hhmmToMinutes_(c.INTRADAY_FLAT_BY)) {
      tryExit_(pos, 'TIME_STOP'); return;
    }
    if (pos.horizon === 'OVERNIGHT' && n >= hhmmToMinutes_(c.OVERNIGHT_EXIT_BY) &&
        String(pos.entryDate).slice(0, 10) !== todayIst_()) {
      tryExit_(pos, 'OVERNIGHT_EXIT'); return;
    }

    // Target.
    if (ltp >= pos.targetPrice) { tryExit_(pos, 'TARGET'); return; }

    // Trailing, once armed.
    var armAt = pos.entryPrice * (1 + c.TRAIL_ARM_PCT);
    if (peak >= armAt) {
      var giveback = peak * (1 - c.TRAIL_GIVEBACK_PCT);
      if (ltp <= giveback) { tryExit_(pos, 'TRAIL'); return; }
    }

    // Backstop: the exchange stop should have fired already.
    if (ltp <= pos.stopPrice) { tryExit_(pos, 'STOP_BACKSTOP'); return; }
  });
}

function tryExit_(pos, reason) {
  try {
    var r = exitPosition_(pos, reason);
    if (!r.ok) audit_('EXIT_FAIL', pos.tradingSymbol + ': ' + r.reason);
  } catch (e) {
    audit_('EXIT_FAIL', pos.tradingSymbol + ': ' + e.message);
    notify_('ACTION NEEDED: exit failed', pos.tradingSymbol +
      ' could not be closed (' + reason + '): ' + e.message +
      '\n\nCheck the position at the broker.');
  }
}

function flattenIntraday_(reason) {
  openPositions_().forEach(function (pos) {
    if (pos.horizon === 'INTRADAY') tryExit_(pos, reason);
  });
}

// ---------------------------------------------------------------- reporting

function jobEodReport() {
  var rows = readSheet_(SH.TRADELOG).filter(function (r) {
    return String(r.exitDate || '').slice(0, 10) === todayIst_();
  });
  var pnl = rows.reduce(function (a, r) { return a + Number(r.pnl || 0); }, 0);
  var wins = rows.filter(function (r) { return Number(r.pnl) > 0; }).length;

  var lines = [
    'Date: ' + todayIst_() + (isExpiryToday_() ? ' (expiry)' : ''),
    'Trades closed: ' + rows.length + '   wins: ' + wins +
      '   losses: ' + (rows.length - wins),
    'Realised P&L: ' + inr_(pnl),
    ''
  ];
  rows.forEach(function (r) {
    lines.push('  ' + r.tradingSymbol + '  ' + r.entryPrice + ' -> ' + r.exitPrice +
      '  ' + inr_(Number(r.pnl)) + '  [' + r.exitReason + ']');
  });

  var still = openPositions_();
  if (still.length) {
    lines.push('', 'Still open overnight:');
    still.forEach(function (p) {
      lines.push('  ' + p.tradingSymbol + ' x' + p.qty + ' entry ' + p.entryPrice +
        ' stop ' + p.stopPrice);
    });
  }

  var msg = lines.join('\n');
  audit_('EOD', msg);
  notify_('EOD ' + todayIst_() + ': ' + inr_(pnl), msg);
  return msg;
}

function refreshDashboard_() {
  var sh = sheet_(SH.DASH);
  var c = cfg();
  var open = openPositions_();
  var unreal = open.reduce(function (a, p) {
    return a + (Number(p.ltp || p.entryPrice) - p.entryPrice) * p.qty;
  }, 0);
  var deployed = open.reduce(function (a, p) { return a + p.entryPrice * p.qty; }, 0);
  var ks = killSwitchState_();

  var rows = [
    ['AI Trading Bot',                 ''],
    ['Updated',                        fmtIst_(new Date())],
    ['Mode',                           c.DRY_RUN ? 'DRY RUN (nothing is sent)' : 'LIVE'],
    ['Trading day',                    isTradingDay_() ? 'yes' : 'no'],
    ['Expiry today',                   isExpiryToday_() ? 'YES' : 'no'],
    ['Market open',                    isMarketOpen_() ? 'yes' : 'no'],
    ['Kill switch',                    ks.tripped ? 'ON — ' + ks.reason : 'off'],
    ['', ''],
    ['Capital',                        c.CAPITAL],
    ['Risk per trade',                 c.CAPITAL * c.RISK_PCT_PER_TRADE],
    ['Daily loss limit',               c.CAPITAL * c.DAILY_LOSS_LIMIT_PCT],
    ['', ''],
    ['Open positions',                 open.length + ' / ' + c.MAX_CONCURRENT_POSITIONS],
    ['Entries today',                  countTodayEntries_() + ' / ' + c.MAX_TRADES_PER_DAY],
    ['Premium deployed',               round2_(deployed)],
    ['Unrealised P&L',                 round2_(unreal)],
    ['Realised P&L today',             round2_(dailyRealisedPnl_())],
    ['', ''],
    ['Strategies',                     [c.ENABLE_ORB ? 'ORB' : null,
                                        c.ENABLE_EOD_CARRY ? 'EOD_CARRY' : null,
                                        c.ENABLE_AI_SIGNAL ? 'AI' : null]
                                         .filter(String).join(', ') || 'none'],
    ['AI confirmation required',       c.REQUIRE_AI_CONFIRMATION ? 'yes' : 'no'],
    ['Models',                         c.MODEL_STRATEGIC + ' / ' + c.MODEL_INTRADAY]
  ];

  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold').setFontSize(14);
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 320);
}
