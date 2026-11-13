/**
 * 14_Util.gs — time, formatting, logging, small helpers.
 *
 * All market logic runs on IST regardless of the spreadsheet's own timezone,
 * so every time helper here is explicit about it.
 */

function cfgTz_() { return 'Asia/Kolkata'; }

function fmtIst_(d) {
  return Utilities.formatDate(d || new Date(), cfgTz_(), 'yyyy-MM-dd HH:mm:ss');
}

function fmtApi_(d) {
  return Utilities.formatDate(d || new Date(), cfgTz_(), 'yyyy-MM-dd HH:mm:ss');
}

function todayIst_() {
  return Utilities.formatDate(new Date(), cfgTz_(), 'yyyy-MM-dd');
}

/** Minutes since midnight IST, right now. */
function nowIstMinutes_() {
  var s = Utilities.formatDate(new Date(), cfgTz_(), 'HH:mm').split(':');
  return (+s[0]) * 60 + (+s[1]);
}

function hhmmToMinutes_(hhmm) {
  var s = String(hhmm).split(':');
  return (+s[0]) * 60 + (+s[1]);
}

/** A Date for today at the given IST "HH:MM". */
function istDateAt_(hhmm) {
  var ymd = todayIst_().split('-');
  var hm = String(hhmm).split(':');
  // Build via the IST offset (+05:30) so the result is correct wherever the
  // script happens to execute.
  return new Date(Date.UTC(+ymd[0], +ymd[1] - 1, +ymd[2],
                           +hm[0] - 5, +hm[1] - 30, 0));
}

function isWeekendIst_() {
  var d = Utilities.formatDate(new Date(), cfgTz_(), 'u'); // 1=Mon .. 7=Sun
  return d === '6' || d === '7';
}

/** Is the cash/F&O market open right now (ignoring exchange holidays)? */
function isMarketOpen_() {
  if (isWeekendIst_()) return false;
  var n = nowIstMinutes_();
  return n >= hhmmToMinutes_(cfg().MARKET_OPEN) &&
         n <= hhmmToMinutes_(cfg().MARKET_CLOSE);
}

/**
 * NSE trading holidays. Keep this current — the bot will otherwise try to trade
 * on a closed exchange and log confusing failures. Dates are IST yyyy-MM-dd.
 */
var NSE_HOLIDAYS = [
  // 2026 — VERIFY against the NSE circular each January.
  '2026-01-26', '2026-03-04', '2026-03-20', '2026-04-01', '2026-04-03',
  '2026-04-14', '2026-05-01', '2026-08-15', '2026-08-26', '2026-10-02',
  '2026-11-10', '2026-11-24', '2026-12-25'
];

function isTradingHoliday_(ymd) {
  return NSE_HOLIDAYS.indexOf(ymd || todayIst_()) !== -1;
}

function isTradingDay_() {
  return !isWeekendIst_() && !isTradingHoliday_();
}

// ---------------------------------------------------------------- numbers

function round2_(n) { return Math.round(n * 100) / 100; }

/** Round to the nearest valid tick (NSE equity/F&O tick is 0.05). */
function roundTick_(n, tick) {
  tick = tick || 0.05;
  return Math.round(n / tick) * tick;
}

function roundToStep_(n, step) { return Math.round(n / step) * step; }

function truncate_(s, n) {
  s = String(s === null || s === undefined ? '' : s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function inr_(n) {
  var neg = n < 0;
  var s = Math.round(Math.abs(n)).toString();
  // Indian grouping: last 3, then 2s.
  var head = s.length > 3 ? s.slice(0, s.length - 3) : '';
  var tail = s.slice(-3);
  if (head) head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',';
  return (neg ? '-₹' : '₹') + head + tail;
}

/** Safe nested lookup: pick_(obj, ['a.b.c', 'fallback']) */
function pick_(obj, paths) {
  for (var i = 0; i < paths.length; i++) {
    var cur = obj, parts = paths[i].split('.'), ok = true;
    for (var j = 0; j < parts.length; j++) {
      if (cur === null || cur === undefined || !(parts[j] in cur)) { ok = false; break; }
      cur = cur[parts[j]];
    }
    if (ok && cur !== null && cur !== undefined) return cur;
  }
  return null;
}

// ---------------------------------------------------------------- logging

/**
 * Append to the AuditLog sheet. Every order, every auth, every block decision
 * lands here — it is the record you reconstruct a bad day from.
 */
function audit_(kind, message) {
  try {
    var sh = sheet_(SH.AUDIT);
    sh.appendRow([new Date(), kind, truncate_(message, 1000)]);
    var max = cfg().LOG_RETENTION_ROWS;
    var n = sh.getLastRow();
    if (n > max + 500) sh.deleteRows(2, n - max);
  } catch (e) {
    Logger.log('[' + kind + '] ' + message);
  }
}
