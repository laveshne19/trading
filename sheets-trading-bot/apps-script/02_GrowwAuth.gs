/**
 * 02_GrowwAuth.gs — TOTP generation and the daily access token.
 *
 * Groww's flow: build a 6-digit TOTP from the base32 seed, POST it to
 * /v1/token/api/access with the API key as the Bearer token, get back a token
 * and an expiry. The token is cached in Script Properties and re-minted only
 * when it is within TOKEN_SKEW_MS of expiring, so a session that fires several
 * calls does not mint several tokens.
 */

var TOKEN_SKEW_MS = 5 * 60 * 1000;   // re-mint 5 minutes before expiry

// ---------------------------------------------------------------- base32

/** Decode a base32 (RFC 4648) string to an array of unsigned bytes. */
function base32Decode_(s) {
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = String(s).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  if (!s) throw new Error('TOTP secret is empty.');

  var bits = 0, value = 0, out = [];
  for (var i = 0; i < s.length; i++) {
    var idx = A.indexOf(s.charAt(i));
    if (idx === -1) {
      throw new Error('TOTP secret contains a non-base32 character at ' +
        'position ' + (i + 1) + '. Expected only A-Z and 2-7.');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  if (!out.length) throw new Error('TOTP secret decoded to zero bytes.');
  return out;
}

/** Apps Script's HMAC wants Java signed bytes (-128..127). */
function toSigned_(b) { return b > 127 ? b - 256 : b; }

// ---------------------------------------------------------------- TOTP

/**
 * RFC 6238 TOTP. SHA-1, 30-second step, 6 digits — Groww's parameters.
 * @param {string} secretB32 base32 seed
 * @param {number=} atMs override the clock (for tests)
 */
function generateTOTP_(secretB32, atMs) {
  var key = base32Decode_(secretB32).map(toSigned_);
  var counter = Math.floor((atMs || Date.now()) / 1000 / 30);

  // 8-byte big-endian counter. Division, not >>>, because the counter exceeds
  // 32 bits in the year 2242 and bit ops in JS are 32-bit.
  var msg = new Array(8);
  for (var i = 7; i >= 0; i--) {
    msg[i] = toSigned_(counter % 256);
    counter = Math.floor(counter / 256);
  }

  var sig = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1, msg, key);

  var h = [];
  for (var j = 0; j < sig.length; j++) h.push(sig[j] & 0xff);

  var off = h[h.length - 1] & 0x0f;
  var bin = ((h[off] & 0x7f) << 24) |
            ((h[off + 1] & 0xff) << 16) |
            ((h[off + 2] & 0xff) << 8) |
             (h[off + 3] & 0xff);

  var code = String(bin % 1000000);
  while (code.length < 6) code = '0' + code;
  return code;
}

/**
 * Self-test against RFC 6238's published SHA-1 vectors. The seed below is the
 * RFC's ASCII key "12345678901234567890" in base32. If this fails, the TOTP
 * maths is broken and nothing else is worth debugging.
 */
function selfTestTOTP() {
  var seed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  var cases = [
    { t: 59,          want: '287082' },
    { t: 1111111109,  want: '081804' },
    { t: 1111111111,  want: '050471' },
    { t: 1234567890,  want: '005924' },
    { t: 2000000000,  want: '279037' }
  ];
  var fails = [];
  cases.forEach(function (c) {
    var got = generateTOTP_(seed, c.t * 1000);
    if (got !== c.want) fails.push('t=' + c.t + ' want ' + c.want + ' got ' + got);
  });
  var msg = fails.length
    ? 'TOTP SELF-TEST FAILED:\n' + fails.join('\n')
    : 'TOTP self-test passed (5/5 RFC 6238 vectors).';
  Logger.log(msg);
  return msg;
}

// ---------------------------------------------------------------- token

/**
 * The cached access token, minting a new one if absent or near expiry.
 * Serialised behind a script lock so two concurrent triggers mint once.
 */
function getAccessToken_(forceRefresh) {
  var p = props_();
  if (!forceRefresh) {
    var tok = p.getProperty(PROP.TOKEN);
    var exp = Number(p.getProperty(PROP.TOKEN_EXP) || 0);
    if (tok && exp - TOKEN_SKEW_MS > Date.now()) return tok;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Another execution may have minted one while we waited.
    if (!forceRefresh) {
      var tok2 = p.getProperty(PROP.TOKEN);
      var exp2 = Number(p.getProperty(PROP.TOKEN_EXP) || 0);
      if (tok2 && exp2 - TOKEN_SKEW_MS > Date.now()) return tok2;
    }
    return mintAccessToken_();
  } finally {
    lock.releaseLock();
  }
}

/**
 * POST the TOTP and store the resulting token.
 *
 * The request body shape is the one piece of this flow Groww documents only in
 * their portal. If auth fails with a 4xx, run
 * `Trading Bot > Diagnostics > Test Groww auth` — it prints the raw server
 * response, which names the field it wanted. Then adjust AUTH_BODY_VARIANTS.
 */
var AUTH_BODY_VARIANTS = [
  function (totp) { return { key_type: 'totp', totp: totp }; },
  function (totp) { return { totp: totp }; },
  function (totp) { return { key_type: 'approval', totp: totp }; }
];

function mintAccessToken_() {
  var apiKey = getSecret_(PROP.GROWW_KEY);
  var totp = generateTOTP_(getSecret_(PROP.GROWW_SECRET));
  var url = GROWW.BASE + GROWW.TOKEN.p;
  var lastErr = null;

  for (var i = 0; i < AUTH_BODY_VARIANTS.length; i++) {
    var body = AUTH_BODY_VARIANTS[i](totp);
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'X-API-VERSION': GROWW.API_VERSION,
        'Accept': 'application/json'
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    var text = res.getContentText();

    if (code >= 200 && code < 300) {
      var json;
      try { json = JSON.parse(text); }
      catch (e) { throw new Error('Auth returned non-JSON: ' + truncate_(text, 300)); }

      // Groww nests the payload under `payload` on some endpoints.
      var data = json.payload || json.data || json;
      var token = data.token || data.access_token;
      if (!token) {
        throw new Error('Auth succeeded but no token in response: ' +
          truncate_(text, 300));
      }

      // `expiry` has been seen as epoch seconds and as epoch millis. Normalise,
      // and fall back to end-of-day if it is missing or implausible.
      var expMs = normaliseExpiry_(data.expiry || data.expires_at || data.expiry_time);
      props_().setProperty(PROP.TOKEN, token);
      props_().setProperty(PROP.TOKEN_EXP, String(expMs));
      audit_('AUTH', 'Token minted, expires ' + fmtIst_(new Date(expMs)));
      return token;
    }

    lastErr = 'HTTP ' + code + ' with body variant ' +
      JSON.stringify(Object.keys(AUTH_BODY_VARIANTS[i](totp))) + ': ' +
      truncate_(text, 300);

    // 401/403 means the key or TOTP is wrong, not the body shape — stop.
    if (code === 401 || code === 403) break;
  }

  throw new Error('Groww auth failed. ' + lastErr +
    '\n\nCheck: (1) API key correct and Trade API enabled on the account, ' +
    '(2) the secret is the base32 TOTP seed not a password, ' +
    '(3) run selfTestTOTP() to confirm the TOTP maths.');
}

function normaliseExpiry_(raw) {
  var n = Number(raw);
  var now = Date.now();
  if (!isNaN(n) && n > 0) {
    if (n < 1e12) n = n * 1000;                 // epoch seconds -> millis
    if (n > now && n < now + 7 * 864e5) return n; // plausible: within a week
  }
  if (raw) {
    var d = new Date(raw);
    if (!isNaN(d.getTime()) && d.getTime() > now) return d.getTime();
  }
  // Groww tokens are daily. Default to 15:40 IST today, or +12h if past that.
  var eod = istDateAt_('15:40');
  return eod.getTime() > now ? eod.getTime() : now + 12 * 3600 * 1000;
}

/** Diagnostic: exercise auth and report what came back, without leaking keys. */
function diagTestAuth() {
  var out = [selfTestTOTP(), ''];
  try {
    var code = generateTOTP_(getSecret_(PROP.GROWW_SECRET));
    out.push('TOTP generated now: ' + code.slice(0, 2) + '**** (6 digits)');
    var tok = getAccessToken_(true);
    out.push('Auth OK. Token length ' + tok.length + ', ends ' + tok.slice(-4));
    out.push('Expires ' + fmtIst_(new Date(Number(props_().getProperty(PROP.TOKEN_EXP)))));
  } catch (e) {
    out.push('AUTH FAILED: ' + e.message);
  }
  var msg = out.join('\n');
  try { SpreadsheetApp.getUi().alert('Groww auth diagnostic', msg,
        SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  Logger.log(msg);
  return msg;
}
