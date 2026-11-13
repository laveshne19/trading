/**
 * 12_Setup.gs — one-click workbook build.
 *
 * Creates every sheet with its headers, seeds the Config tab from
 * CFG_DEFAULTS with a human note per row, and seeds a crude-transmission
 * watchlist. Safe to re-run: existing sheets keep their data, only missing
 * headers and missing Config keys are added.
 */

var CONFIG_NOTES = {
  CAPITAL: 'Total trading capital in rupees.',
  RISK_PCT_PER_TRADE: '0.02 = risk 2% of capital on one trade.',
  DAILY_LOSS_LIMIT_PCT: '0.04 = stop trading for the day after -4% realised.',
  MAX_DEPLOYED_PCT: 'Cap on premium outstanding as a fraction of capital.',
  MAX_CONCURRENT_POSITIONS: 'How many positions may be open at once.',
  MAX_TRADES_PER_DAY: 'Hard cap on entries per day. Stops overtrading.',
  MIN_PREMIUM: 'Skip options cheaper than this; the spread eats the edge.',
  MAX_PREMIUM: 'Skip options dearer than this; one lot breaks the budget.',
  STOP_PCT: '0.35 = exit at -35% of the premium paid.',
  TARGET_PCT: '0.60 = book at +60%.',
  TRAIL_ARM_PCT: 'Start trailing once the position is up this much.',
  TRAIL_GIVEBACK_PCT: 'Once trailing, exit after giving back this much of the peak.',
  NO_ENTRY_BEFORE: 'No entries before this IST time. Lets the open settle.',
  NO_ENTRY_AFTER: 'No new entries after this time.',
  EXPIRY_NO_ENTRY_AFTER: 'Tighter cutoff on expiry day — theta accelerates.',
  INTRADAY_FLAT_BY: 'All intraday positions squared off by this time.',
  EOD_CARRY_AT: 'When the overnight-carry decision is taken.',
  OVERNIGHT_EXIT_BY: 'Next morning, exit carried positions by this time.',
  INDEX_UNDERLYINGS: 'Comma-separated, e.g. NIFTY,BANKNIFTY',
  OPTION_MONEYNESS: 'ATM, ITM1 or OTM1.',
  STRIKE_STEP: 'JSON. Strike interval per underlying.',
  LOT_SIZE: 'JSON. VERIFY against the current NSE contract specs.',
  ENABLE_ORB: 'Opening-range breakout strategy.',
  ENABLE_EOD_CARRY: 'Overnight carry. Leave FALSE until you have paper-run it.',
  ENABLE_AI_SIGNAL: 'Let Claude read the snapshot and vote.',
  REQUIRE_AI_CONFIRMATION: 'TRUE = a rule signal only fires if Claude agrees.',
  ORB_RANGE_MINUTES: 'Opening range length in minutes.',
  ORB_MIN_BREAK_PCT: '0.0015 = the break must clear the range by 0.15%.',
  MODEL_STRATEGIC: 'Model for the few high-value calls (pre-open, origination).',
  MODEL_INTRADAY: 'Model for frequent intraday confirmation. Cheaper.',
  AI_MAX_TOKENS: 'Response cap.',
  DRY_RUN: 'TRUE = log orders, send nothing. KEEP TRUE UNTIL YOU TRUST IT.',
  PRODUCT: 'MIS for intraday, NRML for carry.',
  ORDER_TYPE: 'Entry order type.',
  LIMIT_SLIPPAGE_PCT: 'How far through the LTP to price the limit, to get filled.',
  PLACE_EXCHANGE_STOP: 'MUST be TRUE live. Puts the stop at the broker.',
  NOTIFY_EMAIL: 'Blank = the sheet owner.',
  LOG_RETENTION_ROWS: 'AuditLog rows kept before trimming.',
  API_RETRY: 'Retries per API call.',
  API_BACKOFF_MS: 'Base backoff in ms; doubles each retry.'
};

/** Crude-transmission basket: one shock, opposite effects. */
var SEED_WATCHLIST = [
  ['RELIANCE',   'CASH', 'NSE',  250, 'crude: refining margin',        true,  'Integrated — GRM gains, petchem hurts'],
  ['ONGC',       'CASH', 'NSE', 3850, 'crude: UPSTREAM BENEFITS',      true,  'Realisations rise with Brent'],
  ['OIL',        'CASH', 'NSE', 2300, 'crude: UPSTREAM BENEFITS',      true,  'Same chain as ONGC, thinner'],
  ['BPCL',       'CASH', 'NSE', 1800, 'crude: OMC margin squeeze',     true,  'Marketing margin compressed'],
  ['HINDPETRO',  'CASH', 'NSE', 2700, 'crude: OMC margin squeeze',     true,  'Highest beta of the three OMCs'],
  ['IOC',        'CASH', 'NSE', 6500, 'crude: OMC margin squeeze',     true,  ''],
  ['INDIGO',     'CASH', 'NSE',  300, 'crude: ATF is ~40% of opex',    true,  'Cleanest crude short-proxy'],
  ['ASIANPAINT', 'CASH', 'NSE',  200, 'crude: input cost',             true,  'Crude derivatives in resins'],
  ['APOLLOTYRE', 'CASH', 'NSE', 2500, 'crude: input cost',             true,  'Synthetic rubber, carbon black'],
  ['PIDILITIND', 'CASH', 'NSE',  250, 'crude: input cost (VAM)',       true,  ''],
  ['NIFTY',      'CASH', 'NSE',   75, 'index',                         true,  'VERIFY lot size'],
  ['BANKNIFTY',  'CASH', 'NSE',   35, 'index',                         true,  'VERIFY lot size']
];

function setupWorkbook() {
  var ss = ss_();

  // 1. Every sheet, with headers.
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var want = SCHEMA[name];
    var haveCols = sh.getLastColumn();
    var have = haveCols
      ? sh.getRange(1, 1, 1, haveCols).getValues()[0].map(function (h) {
          return String(h).trim();
        })
      : [];
    // Add any header the sheet is missing, without disturbing existing columns.
    var merged = have.slice();
    want.forEach(function (h) { if (merged.indexOf(h) === -1) merged.push(h); });
    sh.getRange(1, 1, 1, merged.length).setValues([merged]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, merged.length).setFontWeight('bold')
      .setBackground('#f1f3f4');
    sh.autoResizeColumns(1, Math.min(merged.length, 12));
  });

  // 2. Dashboard first, Config second.
  [SH.DASH, SH.CONFIG].forEach(function (name, i) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });

  // 3. Seed Config with any key it does not already have.
  var cfgSh = sheet_(SH.CONFIG);
  var existing = {};
  readSheet_(SH.CONFIG).forEach(function (r) { existing[String(r.key).trim()] = true; });

  var toAdd = [];
  Object.keys(CFG_DEFAULTS).forEach(function (k) {
    if (existing[k]) return;
    var v = CFG_DEFAULTS[k];
    if (Array.isArray(v)) v = v.join(',');
    else if (v && typeof v === 'object') v = JSON.stringify(v);
    toAdd.push([k, v, CONFIG_NOTES[k] || '']);
  });
  if (toAdd.length) {
    cfgSh.getRange(cfgSh.getLastRow() + 1, 1, toAdd.length, 3).setValues(toAdd);
  }
  cfgSh.setColumnWidth(1, 220);
  cfgSh.setColumnWidth(2, 180);
  cfgSh.setColumnWidth(3, 460);

  // 4. Seed the watchlist only if empty.
  var wl = sheet_(SH.WATCHLIST);
  if (wl.getLastRow() < 2) {
    wl.getRange(2, 1, SEED_WATCHLIST.length, SEED_WATCHLIST[0].length)
      .setValues(SEED_WATCHLIST);
    wl.setColumnWidth(5, 240);
    wl.setColumnWidth(7, 320);
  }

  // 5. Formatting that makes the numbers readable.
  try {
    var pos = sheet_(SH.POSITIONS);
    pos.getRange('L:Q').setNumberFormat('0.00');
    var tl = sheet_(SH.TRADELOG);
    tl.getRange('I:L').setNumberFormat('0.00');
    sheet_(SH.DASH).getRange('B9:B17').setNumberFormat('₹#,##0.00');
  } catch (e) {}

  refreshDashboard_();

  SpreadsheetApp.getUi().alert('Workbook ready',
    'Sheets built and Config seeded.\n\n' +
    'DRY_RUN is TRUE — nothing will be sent to the exchange.\n\n' +
    'Next:\n' +
    '  1. Trading Bot > Setup > Set credentials\n' +
    '  2. Trading Bot > Diagnostics > Run all self-tests\n' +
    '  3. Trading Bot > Diagnostics > Test Groww auth\n' +
    '  4. Trading Bot > Diagnostics > Verify endpoints\n' +
    '  5. Check LOT_SIZE in Config against the current NSE contract specs\n' +
    '  6. Trading Bot > Setup > Install scheduler\n\n' +
    'Run a full week in DRY_RUN before you even consider going live.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}
