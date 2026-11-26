/**
 * 23_Score.gs — ranking candidates, and alerting.
 *
 * A SCORE IS NOT A PROBABILITY OF MAKING MONEY. It is a ranking device for
 * choosing between candidates that have ALREADY passed every mandatory gate.
 * It can never promote a candidate past a failed check — scoreCandidate()
 * refuses to produce a score at all when 17_Gate has failed, precisely so
 * nobody can trade an 87/100 whose intrinsic ratio was zero.
 *
 * The weights below are a starting guess. They are NOT calibrated, because
 * calibrating them needs out-of-sample results this account does not yet
 * have. Until the paper run produces 30+ trades, treat the score as "which of
 * these equally-legal trades looks cleanest", nothing more.
 */

var SCORE_WEIGHTS = {
  trend: 0.20,       // ADX and DI
  structure: 0.15,   // weekly highs/lows agreeing with the side
  momentum: 0.10,    // relative volume and the day's move
  value: 0.20,       // intrinsic ratio and headroom
  liquidity: 0.10,   // spread and depth
  riskReward: 0.15,  // SDs to breakeven, reward:risk
  agreement: 0.10    // how many independent strategies agree
};

/**
 * @returns {{score:number|null, parts:object, reason:string}}
 *          score is 0..100, or null when the gate failed.
 */
function scoreCandidate(gateResult, strategyResult, c) {
  if (!gateResult || !gateResult.pass) {
    return { score: null, parts: {},
      reason: 'gate failed — a score would only invite overriding it: ' +
        ((gateResult && gateResult.failures) || []).join(' | ') };
  }

  var m = gateResult.metrics || {};
  var isCall = String(c.right).toUpperCase() === 'CE';

  // --- trend: ADX scaled to 80, DI ratio scaled to 6 -------------------
  var adxPart = Math.min(1, (c.adx || 0) / 80);
  var di = isCall
    ? (c.minusDI > 0 ? c.plusDI / c.minusDI : 6)
    : (c.plusDI  > 0 ? c.minusDI / c.plusDI : 6);
  var diPart = Math.min(1, di / 6);
  var trend = adxPart * 0.5 + diPart * 0.5;

  // --- structure: did the weekly sequence agree, and by how much? -----
  var structure = 0;
  var seq = isCall ? (c.weeklyHighs || []) : (c.weeklyLows || []);
  if (seq.length >= 3) {
    var a = seq[seq.length - 3], z = seq[seq.length - 1];
    var move = a > 0 ? (isCall ? (z - a) / a : (a - z) / a) : 0;
    structure = Math.max(0, Math.min(1, move / 0.10));   // 10% = full marks
  }

  // --- momentum --------------------------------------------------------
  var relVol = (c.avgVolume > 0) ? (c.volume || 0) / c.avgVolume : 1;
  var momentum = Math.min(1, relVol / 3);

  // --- value: intrinsic ratio and headroom in ATRs ---------------------
  var intrinsicPart = Math.min(1, (m.intrinsicPct || 0) / 0.7);
  var headroomAtr = (c.atr > 0) ? (m.headroom || 0) / c.atr : 0;
  var headroomPart = Math.max(0, Math.min(1, headroomAtr / 3));
  var value = intrinsicPart * 0.6 + headroomPart * 0.4;

  // --- liquidity -------------------------------------------------------
  var sp = m.spreadPct;
  var spreadPart = (sp === null || sp === undefined)
    ? 0 : Math.max(0, 1 - sp / 0.02);
  var depthPart = Math.min(1, (c.depthLots || 0) / 5);
  var liquidity = spreadPart * 0.7 + depthPart * 0.3;

  // --- risk/reward: fewer SDs needed is better -------------------------
  var sds = m.sdsToBreakeven;
  var riskReward = (sds === null || sds === undefined || !isFinite(sds))
    ? 0 : Math.max(0, Math.min(1, 1 - sds / 0.6));

  // --- agreement -------------------------------------------------------
  var agreementN = (strategyResult && strategyResult.agreement) || 0;
  var agreement = Math.min(1, agreementN / 3);

  var parts = {
    trend: round4_(trend), structure: round4_(structure),
    momentum: round4_(momentum), value: round4_(value),
    liquidity: round4_(liquidity), riskReward: round4_(riskReward),
    agreement: round4_(agreement)
  };

  var total = 0;
  for (var k in SCORE_WEIGHTS) total += (parts[k] || 0) * SCORE_WEIGHTS[k];

  return {
    score: Math.round(total * 100),
    parts: parts,
    reason: 'ranking only — every mandatory check already passed. ' +
            'This is not a probability of profit.'
  };
}

/**
 * Rank a list of scored candidates. Ties break toward the higher intrinsic
 * ratio: when two trades look equally good, the one carrying less time value
 * is the one that survives a flat day.
 */
function rankCandidates(scored) {
  return (scored || [])
    .filter(function (x) { return x.score !== null && x.score !== undefined; })
    .sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var ai = (a.gate && a.gate.metrics && a.gate.metrics.intrinsicPct) || 0;
      var bi = (b.gate && b.gate.metrics && b.gate.metrics.intrinsicPct) || 0;
      return bi - ai;
    });
}

// =====================================================================
// ALERTS
// =====================================================================

/**
 * Telegram. Credentials live in Script Properties, never in a cell.
 * Returns {sent:boolean, reason:string} and never throws — a failed alert
 * must not take down a trading tick.
 */
function notifyTelegram(text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chat  = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) return { sent: false, reason: 'Telegram not configured' };

  try {
    var res = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post', muteHttpExceptions: true,
        contentType: 'application/json',
        payload: JSON.stringify({
          chat_id: chat, text: String(text).slice(0, 4000),
          disable_web_page_preview: true
        })
      });
    var code = res.getResponseCode();
    return (code >= 200 && code < 300)
      ? { sent: true, reason: 'ok' }
      : { sent: false, reason: 'telegram ' + code + ': ' +
          String(res.getContentText()).slice(0, 200) };
  } catch (e) {
    return { sent: false, reason: 'telegram threw: ' + e.message };
  }
}

/**
 * One alert function for the whole bot, so the format is consistent and
 * every event can be routed by severity.
 *
 * @param {string} level  INFO | TRADE | WARN | CRITICAL
 */
function notify(level, title, body) {
  var line = '[' + level + '] ' + title + (body ? '\n' + body : '');
  try { paperLogRow_('NOTIFY', level, title + ' ' + (body || '')); } catch (e) {}

  var r = notifyTelegram(line);
  if (!r.sent && (level === 'CRITICAL' || level === 'WARN')) {
    // Fall back to email so a critical event is not lost to a missing token.
    try {
      var to = (cfg().NOTIFY_EMAIL) ||
               Session.getEffectiveUser().getEmail();
      if (to) MailApp.sendEmail(to, 'Trading bot: ' + title, line);
    } catch (e) {}
  }
  return r;
}

/** The events worth waking someone for. Everything else goes to the sheet. */
function notifyTrade(action, symbol, detail) {
  return notify('TRADE', action + ' ' + symbol, detail);
}
function notifyRiskBlock(blocks) {
  return notify('WARN', 'Trading blocked',
    blocks.join('\n') + '\n\nNo new entries until this clears.');
}
function notifyKill(reason) {
  return notify('CRITICAL', 'KILL SWITCH', reason);
}

/**
 * The end-of-day summary. Deliberately includes the refusals: the trades the
 * bot did NOT take are half of what it did.
 */
function notifyDailySummary(book, riskState) {
  var rep = paperReport(book);
  var body =
    'Equity        Rs ' + rep.equity + '\n' +
    'Open          ' + rep.openPositions + '  (unrealised Rs ' +
      rep.openUnrealised + ')\n' +
    'Closed today  ' + rep.trades + '\n' +
    'Net P&L       Rs ' + rep.netPnl + '  after Rs ' + rep.totalCosts +
      ' of costs\n' +
    'Win rate      ' + (rep.winRate === null ? '-' :
      (rep.winRate * 100).toFixed(1) + '%') + '\n' +
    'Refused       ' + rep.refusals + ' candidate(s)\n' +
    (riskState ? 'Consecutive losses ' + riskState.consecutiveLosses + '\n' : '') +
    '\n' + rep.verdict;
  return notify('INFO', 'Daily summary', body);
}
