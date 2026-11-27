/**
 * 04_Claude.gs — the decision engine.
 *
 * Claude is given a structured market snapshot and must answer with strict
 * JSON. It is NOT allowed to invent instruments or sizes: it chooses a
 * direction and a conviction, and the risk layer (07_Risk.gs) decides whether
 * and how large anything is actually sent. That separation is deliberate —
 * a model that is wrong should cost one stop, never the account.
 */

var TRADER_SYSTEM_PROMPT = [
'You are the trading desk for a single Indian F&O account. You are not an',
'assistant giving options; you are the trader whose own capital is at risk.',
'',
'MANDATE',
'- Commit to one view. If there is no edge, answer NO_TRADE. "No trade" is a',
'  correct and frequently optimal answer. Never manufacture a trade to be useful.',
'- Trade the thesis, not the last five minutes. Do not flip direction on noise.',
'- One idea at a time, expressed in the cleanest instrument.',
'- You buy options only. Never recommend naked writing.',
'',
'WHAT COUNTS AS AN EDGE',
'- A directional move with a named cause (flows, a macro print, a commodity',
'  move that transmits to a sector, a result, an index-level break of a level',
'  that has held).',
'- Relative strength or weakness against the index, which is far more',
'  informative than absolute direction.',
'- Positioning that is lopsided and about to be squeezed (OI, PCR).',
'An edge is NOT: "it is oversold", "it gapped so it will fill", a round number,',
'or an indicator crossing with no cause behind it.',
'',
'EXPIRY DISCIPLINE',
'On expiry day, premium decays to intrinsic by 15:30. Only take an expiry-day',
'option if the move is expected within hours; otherwise choose the next series.',
'',
'OUTPUT',
'Reply with a single JSON object and nothing else — no prose, no code fence:',
'{',
'  "decision": "LONG_CALL" | "LONG_PUT" | "NO_TRADE",',
'  "underlying": "<NIFTY|BANKNIFTY|stock symbol>" | null,',
'  "conviction": 1-5,',
'  "horizon": "INTRADAY" | "OVERNIGHT" | "SWING",',
'  "thesis": "<=200 chars, the cause, not the chart pattern",',
'  "invalidation": "<=120 chars, the observable fact that proves this wrong",',
'  "key_levels": { "support": <number|null>, "resistance": <number|null> },',
'  "risk_flags": ["<any reason this could fail badly>"]',
'}',
'',
'conviction 1-2 means you would not put money on it: use NO_TRADE instead.',
'Only 4 or 5 should ever be sized up. Be honest; your record is tracked.'
].join('\n');

/**
 * Ask Claude for a signal.
 * @param {Object} snapshot market state from buildMarketSnapshot_()
 * @param {string=} model  override; defaults to the strategic model
 * @return {Object} parsed signal, plus _raw and _model
 */
function claudeSignal_(snapshot, model) {
  var c = cfg();
  var key = getSecret_(PROP.CLAUDE_KEY);
  var useModel = model || c.MODEL_STRATEGIC;

  var userMsg = [
    'Market snapshot, ' + fmtIst_(new Date()) + ' IST.',
    'Today is ' + (snapshot.isExpiry ? 'an EXPIRY day.' : 'not an expiry day.'),
    '',
    JSON.stringify(snapshot, null, 2),
    '',
    'Decide. JSON only.'
  ].join('\n');

  var res = UrlFetchApp.fetch(CLAUDE_API.URL, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': CLAUDE_API.VERSION
    },
    payload: JSON.stringify({
      model: useModel,
      max_tokens: c.AI_MAX_TOKENS,
      system: TRADER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Claude API HTTP ' + code + ': ' + truncate_(text, 400));
  }

  var body = JSON.parse(text);
  var out = '';
  (body.content || []).forEach(function (blk) {
    if (blk.type === 'text') out += blk.text;
  });

  var sig = parseSignalJson_(out);
  sig._raw = truncate_(out, 2000);
  sig._model = useModel;
  sig._usage = body.usage || null;
  return sig;
}

/** Pull the JSON object out of the reply, tolerating a stray fence or preamble. */
function parseSignalJson_(s) {
  var t = String(s || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  var obj = null;
  try {
    obj = JSON.parse(t);
  } catch (e) {
    var first = t.indexOf('{'), last = t.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { obj = JSON.parse(t.slice(first, last + 1)); } catch (e2) {}
    }
  }
  if (!obj || typeof obj !== 'object') {
    return { decision: 'NO_TRADE', conviction: 0,
             thesis: 'Unparseable model reply', risk_flags: ['PARSE_ERROR'] };
  }

  // Normalise and validate — never let a malformed field reach the risk layer.
  var dec = String(obj.decision || '').toUpperCase().replace(/[^A-Z_]/g, '');
  if (['LONG_CALL', 'LONG_PUT', 'NO_TRADE'].indexOf(dec) === -1) dec = 'NO_TRADE';

  var conv = Number(obj.conviction);
  if (isNaN(conv)) conv = 0;
  conv = Math.max(0, Math.min(5, Math.round(conv)));

  var hor = String(obj.horizon || 'INTRADAY').toUpperCase();
  if (['INTRADAY', 'OVERNIGHT', 'SWING'].indexOf(hor) === -1) hor = 'INTRADAY';

  return {
    decision: dec,
    underlying: obj.underlying ? String(obj.underlying).toUpperCase() : null,
    conviction: conv,
    horizon: hor,
    thesis: truncate_(obj.thesis || '', 300),
    invalidation: truncate_(obj.invalidation || '', 200),
    key_levels: obj.key_levels || { support: null, resistance: null },
    risk_flags: Array.isArray(obj.risk_flags) ? obj.risk_flags.slice(0, 8) : []
  };
}

/** Diagnostic: confirm the Claude key works and the model answers in JSON. */
function diagTestClaude() {
  var msg;
  try {
    var sig = claudeSignal_({
      note: 'CONNECTIVITY TEST ONLY — no real data. Answer NO_TRADE.',
      nifty: { ltp: 0 }, isExpiry: false
    }, cfg().MODEL_INTRADAY);
    msg = 'Claude OK (' + sig._model + ')\n\ndecision: ' + sig.decision +
          '\nconviction: ' + sig.conviction +
          '\nthesis: ' + sig.thesis +
          (sig._usage ? '\n\ntokens in/out: ' + sig._usage.input_tokens + '/' +
                        sig._usage.output_tokens : '');
  } catch (e) {
    msg = 'CLAUDE FAILED: ' + e.message;
  }
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Claude diagnostic', msg,
        SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}
