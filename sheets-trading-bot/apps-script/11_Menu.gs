/**
 * 11_Menu.gs — the spreadsheet menu. Everything a human needs is reachable here.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Trading Bot')
      .addSubMenu(SpreadsheetApp.getUi().createMenu('Setup')
        .addItem('1. Build sheets', 'setupWorkbook')
        .addItem('2. Set credentials', 'uiSetCredentials')
        .addItem('3. Install scheduler', 'installTriggers')
        .addSeparator()
        .addItem('Show credential status', 'uiCredentialStatus')
        .addItem('Remove scheduler', 'removeTriggers')
        .addItem('Delete credentials', 'uiClearCredentials'))
      .addSubMenu(SpreadsheetApp.getUi().createMenu('Diagnostics')
        .addItem('Run all self-tests', 'uiRunSelfTests')
        .addItem('Test Groww auth', 'diagTestAuth')
        .addItem('Verify endpoints', 'diagVerifyEndpoints')
        .addItem('Test Claude', 'diagTestClaude')
        .addItem('Show market snapshot', 'uiShowSnapshot'))
      .addSeparator()
      .addItem('Get a signal now (no order)', 'uiSignalNow')
      .addItem('Scan and trade now', 'uiScanAndTrade')
      .addItem('Refresh dashboard', 'refreshDashboard_')
      .addItem('Monitor positions now', 'uiMonitorNow')
      .addSeparator()
      .addItem('Halt trading today', 'uiTripKillSwitch')
      .addItem('Re-enable trading', 'uiResetKillSwitch')
      .addItem('PANIC: flatten everything', 'panicFlatten')
      .addSeparator()
      .addItem('End-of-day report', 'jobEodReport')
    .addToUi();
}

function uiCredentialStatus() {
  var s = credentialStatus();
  SpreadsheetApp.getUi().alert('Credential status',
    'Groww API key:    ' + s.growwKey + '\n' +
    'Groww TOTP seed:  ' + s.growwSecret + '\n' +
    'Claude API key:   ' + s.claudeKey + '\n\n' +
    'Stored in Script Properties, never in a cell.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function uiRunSelfTests() {
  var out = [
    selfTestTOTP(),
    '',
    selfTestIndicators(),
    '',
    selfTestRisk()
  ].join('\n');
  SpreadsheetApp.getUi().alert('Self-tests', out, SpreadsheetApp.getUi().ButtonSet.OK);
  return out;
}

function uiSignalNow() {
  clearCfgCache();
  var ui = SpreadsheetApp.getUi();
  try {
    var sigs = generateSignals_();
    if (!sigs.length) {
      ui.alert('No signal', 'Nothing met the criteria. Check the Signals sheet ' +
        'for what was considered and why it was dropped.', ui.ButtonSet.OK);
      return;
    }
    var s = sigs[0];
    ui.alert('Signal',
      s.decision + '  ' + (s.underlying || '') +
      '\nsource: ' + s.source + '   conviction: ' + s.conviction + '/5' +
      '\nhorizon: ' + s.horizon +
      '\n\n' + s.thesis +
      '\n\ninvalidation: ' + s.invalidation +
      '\n\nNo order was placed.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Signal failed', e.message, ui.ButtonSet.OK);
  }
}

function uiScanAndTrade() {
  clearCfgCache();
  var ui = SpreadsheetApp.getUi();
  var c = cfg();
  var warn = c.DRY_RUN
    ? 'DRY RUN is on — the order will be logged, not sent.'
    : 'LIVE MODE — this can place a real order with real money.';
  var r = ui.alert('Scan and trade now?', warn + '\n\nCapital ' + inr_(c.CAPITAL) +
    ', risk per trade ' + inr_(c.CAPITAL * c.RISK_PCT_PER_TRADE) + '.',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  try {
    scanAndEnter_();
    refreshDashboard_();
    ui.alert('Done', 'See the Signals, Orders and Positions sheets.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Failed', e.message, ui.ButtonSet.OK);
  }
}

function uiMonitorNow() {
  clearCfgCache();
  try {
    monitorPositions_();
    refreshDashboard_();
    SpreadsheetApp.getUi().alert('Monitor run complete.');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Monitor failed', e.message,
      SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function uiShowSnapshot() {
  try {
    var s = buildMarketSnapshot_();
    SpreadsheetApp.getUi().alert('Market snapshot',
      truncate_(JSON.stringify(s, null, 2), 8000),
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Snapshot failed', e.message,
      SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
