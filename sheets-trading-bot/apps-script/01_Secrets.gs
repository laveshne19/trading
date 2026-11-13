/**
 * 01_Secrets.gs — credential storage.
 *
 * SECRETS NEVER GO IN SHEET CELLS. Anyone you share the spreadsheet with can
 * read a cell; Script Properties are bound to the script and are not visible to
 * viewers or editors of the sheet's data. The Groww secret in particular is a
 * TOTP seed — it mints trading sessions. Treat it like a password.
 *
 * Set them once via the menu: Trading Bot > Setup > Set credentials.
 */

var PROP = {
  GROWW_KEY:    'GROWW_API_KEY',
  GROWW_SECRET: 'GROWW_API_SECRET',   // base32 TOTP seed
  CLAUDE_KEY:   'CLAUDE_API_KEY',
  TOKEN:        'GROWW_ACCESS_TOKEN', // cached daily token
  TOKEN_EXP:    'GROWW_TOKEN_EXPIRY', // epoch ms
  KILLED_ON:    'KILL_SWITCH_DATE'    // yyyy-MM-dd the kill switch tripped
};

function props_() { return PropertiesService.getScriptProperties(); }

function getSecret_(name) {
  var v = props_().getProperty(name);
  if (!v) {
    throw new Error('Missing credential "' + name + '". Set it via ' +
      'Trading Bot > Setup > Set credentials.');
  }
  return v;
}

function setSecret_(name, value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    props_().deleteProperty(name);
  } else {
    props_().setProperty(name, String(value).trim());
  }
}

/** Interactive credential entry. Values are never written to a cell. */
function uiSetCredentials() {
  var ui = SpreadsheetApp.getUi();
  var ask = function (label, prop, help) {
    var r = ui.prompt('Set ' + label,
      help + '\n\nLeave blank to keep the current value.', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return false;
    var v = r.getResponseText().trim();
    if (v) setSecret_(prop, v);
    return true;
  };

  if (!ask('Groww API key', PROP.GROWW_KEY,
      'From Groww > Trade API. Sent as the Bearer token.')) return;
  if (!ask('Groww API secret (TOTP seed)', PROP.GROWW_SECRET,
      'The base32 seed string, e.g. JBSWY3DPEHPK3PXP.\n' +
      'This is NOT your password and NOT a 6-digit code.')) return;
  if (!ask('Claude API key', PROP.CLAUDE_KEY,
      'From console.anthropic.com. Starts with sk-ant-.')) return;

  // Any stored token was minted from the old key — drop it.
  props_().deleteProperty(PROP.TOKEN);
  props_().deleteProperty(PROP.TOKEN_EXP);

  ui.alert('Credentials saved',
    'Stored in Script Properties, not in the sheet.\n\n' +
    'Next: Trading Bot > Diagnostics > Test Groww auth.', ui.ButtonSet.OK);
}

/** Which credentials are present — never returns the values themselves. */
function credentialStatus() {
  var p = props_();
  var mask = function (name) {
    var v = p.getProperty(name);
    if (!v) return 'NOT SET';
    return 'set (' + v.length + ' chars, ends ' + v.slice(-4) + ')';
  };
  return {
    growwKey:    mask(PROP.GROWW_KEY),
    growwSecret: p.getProperty(PROP.GROWW_SECRET) ? 'set (hidden)' : 'NOT SET',
    claudeKey:   mask(PROP.CLAUDE_KEY)
  };
}

function uiClearCredentials() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Delete all stored credentials?',
    'This removes the Groww key, Groww TOTP seed, Claude key and the cached ' +
    'access token from Script Properties. Trading will stop working until you ' +
    'set them again.', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  [PROP.GROWW_KEY, PROP.GROWW_SECRET, PROP.CLAUDE_KEY,
   PROP.TOKEN, PROP.TOKEN_EXP].forEach(function (k) { props_().deleteProperty(k); });
  ui.alert('Credentials deleted.');
}
