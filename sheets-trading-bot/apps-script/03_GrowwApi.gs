/**
 * 03_GrowwApi.gs — thin, retrying wrappers over Groww's REST API.
 *
 * Every call goes through growwCall_ so that auth refresh, rate-limit backoff
 * and audit logging happen in exactly one place.
 *
 * Rate limits (per Groww's published figures — confirm against your plan):
 *   orders       10/s, 250/min
 *   live data    10/s, 300/min
 *   everything else 20/s, 500/min
 */

function growwCall_(ep, opts) {
  opts = opts || {};
  var c = cfg();
  var url = GROWW.BASE + ep.p;
  if (opts.query) url += '?' + toQuery_(opts.query);

  var attempts = Math.max(1, c.API_RETRY);
  var lastErr = null;

  for (var i = 0; i < attempts; i++) {
    var token = getAccessToken_(i > 0 && lastErr === 'AUTH');
    var req = {
      method: ep.m,
      headers: {
        'Authorization': 'Bearer ' + token,
        'X-API-VERSION': GROWW.API_VERSION,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    };
    if (opts.body !== undefined) {
      req.contentType = 'application/json';
      req.payload = JSON.stringify(opts.body);
    }

    var res, code, text;
    try {
      res = UrlFetchApp.fetch(url, req);
      code = res.getResponseCode();
      text = res.getContentText();
    } catch (e) {
      lastErr = 'NET';
      Utilities.sleep(c.API_BACKOFF_MS * Math.pow(2, i));
      continue;
    }

    if (code >= 200 && code < 300) {
      if (!text) return null;
      var json;
      try { json = JSON.parse(text); }
      catch (e) { throw new Error(ep.p + ' returned non-JSON: ' + truncate_(text, 200)); }
      return (json && (json.payload !== undefined)) ? json.payload : json;
    }

    if (code === 401 || code === 403) {
      // Token may simply have aged out — refresh once, then give up.
      lastErr = 'AUTH';
      if (i < attempts - 1) continue;
      throw new Error(ep.p + ' unauthorised (HTTP ' + code + '): ' +
        truncate_(text, 200));
    }

    if (code === 429 || code >= 500) {
      lastErr = 'RETRY';
      Utilities.sleep(c.API_BACKOFF_MS * Math.pow(2, i));
      continue;
    }

    // 400/404/422 — a real request error. Retrying will not help.
    throw new Error(ep.p + ' failed (HTTP ' + code + '): ' + truncate_(text, 400));
  }

  throw new Error(ep.p + ' failed after ' + attempts + ' attempts (' + lastErr + ').');
}

function toQuery_(o) {
  return Object.keys(o).filter(function (k) {
    return o[k] !== undefined && o[k] !== null && o[k] !== '';
  }).map(function (k) {
    var v = Array.isArray(o[k]) ? o[k].join(',') : o[k];
    return encodeURIComponent(k) + '=' + encodeURIComponent(v);
  }).join('&');
}

// ---------------------------------------------------------------- read

/** Margins. Returns the FNO block most callers want plus the raw payload. */
function apiUserMargin() {
  var r = growwCall_(GROWW.MARGIN_USER);
  return {
    optionBuyAvailable: pick_(r, ['fno_margin_details.option_buy_balance_available',
                                  'option_buy_balance_available']),
    fnoMarginUsed:      pick_(r, ['fno_margin_details.net_fno_margin_used',
                                  'net_fno_margin_used']),
    cashAvailable:      pick_(r, ['equity_margin_details.cnc_balance_available',
                                  'cnc_balance_available']),
    clearCash:          pick_(r, ['clear_cash', 'net_margin_available']),
    raw: r
  };
}

function apiRequiredMargin(orders) {
  return growwCall_(GROWW.MARGIN_ORDERS, { body: { orders: orders } });
}

/** LTP for one or many `EXCHANGE_SYMBOL` strings, e.g. NSE_NIFTY24OCT22700CE. */
function apiLtp(segment, exchangeSymbols) {
  var r = growwCall_(GROWW.LTP, {
    query: { segment: segment, exchange_symbols: exchangeSymbols }
  });
  return r || {};
}

function apiOhlc(segment, exchangeSymbols) {
  return growwCall_(GROWW.OHLC, {
    query: { segment: segment, exchange_symbols: exchangeSymbols }
  }) || {};
}

function apiQuote(exchange, segment, tradingSymbol) {
  return growwCall_(GROWW.QUOTE, {
    query: { exchange: exchange, segment: segment, trading_symbol: tradingSymbol }
  });
}

function apiOptionChain(exchange, underlying, expiryDate) {
  return growwCall_(GROWW.OPTION_CHAIN, {
    query: { exchange: exchange, underlying: underlying, expiry_date: expiryDate }
  });
}

function apiGreeks(exchange, underlying, tradingSymbol, expiry) {
  return growwCall_(GROWW.GREEKS, {
    query: { exchange: exchange, underlying: underlying,
             trading_symbol: tradingSymbol, expiry: expiry }
  });
}

/**
 * Historical candles. `interval` in minutes; 1440 = daily.
 * Dates as "yyyy-MM-dd HH:mm:ss" IST.
 */
function apiCandles(exchange, segment, tradingSymbol, startIso, endIso, interval) {
  var r = growwCall_(GROWW.CANDLES, {
    query: {
      exchange: exchange, segment: segment, trading_symbol: tradingSymbol,
      start_time: startIso, end_time: endIso, interval_in_minutes: interval
    }
  });
  var raw = (r && (r.candles || r)) || [];
  // Groww returns arrays [ts, o, h, l, c, v]; normalise to objects.
  return raw.map(function (k) {
    if (Array.isArray(k)) {
      return { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +(k[5] || 0) };
    }
    return { t: k.timestamp || k.t, o: +k.open, h: +k.high,
             l: +k.low, c: +k.close, v: +(k.volume || 0) };
  }).filter(function (k) { return !isNaN(k.c); });
}

function apiPositions(segment) {
  var r = growwCall_(GROWW.POSITIONS_USER, { query: { segment: segment } });
  return (r && (r.positions || r)) || [];
}

function apiOrderList(segment, page, pageSize) {
  var r = growwCall_(GROWW.ORDER_LIST, {
    query: { segment: segment, page: page || 0, page_size: pageSize || 50 }
  });
  return (r && (r.order_list || r.orders || r)) || [];
}

function apiOrderStatus(segment, growwOrderId, orderReferenceId) {
  var q = { segment: segment };
  if (growwOrderId) q.groww_order_id = growwOrderId;
  else q.order_reference_id = orderReferenceId;
  return growwCall_(GROWW.ORDER_STATUS, { query: q });
}

// ---------------------------------------------------------------- write

/**
 * Place an order. `o` uses Groww's own snake_case field names so that what you
 * read here is exactly what goes on the wire.
 *
 * Required: trading_symbol, quantity, validity, exchange, segment, product,
 *           order_type, transaction_type
 * Optional: price (LIMIT), trigger_price (SL/SL_M), order_reference_id
 */
function apiPlaceOrder(o) {
  requireFields_(o, ['trading_symbol', 'quantity', 'exchange', 'segment',
                     'product', 'order_type', 'transaction_type']);
  if (!o.validity) o.validity = E.VALIDITY.DAY;
  if (!o.order_reference_id) o.order_reference_id = newOrderRef_();

  if (o.order_type === E.ORDER_TYPE.LIMIT && !(o.price > 0)) {
    throw new Error('LIMIT order needs a price.');
  }
  if ((o.order_type === E.ORDER_TYPE.SL || o.order_type === E.ORDER_TYPE.SL_M) &&
      !(o.trigger_price > 0)) {
    throw new Error(o.order_type + ' order needs a trigger_price.');
  }

  if (cfg().DRY_RUN) {
    audit_('DRY_RUN', 'Would place: ' + JSON.stringify(o));
    return { groww_order_id: 'DRYRUN-' + o.order_reference_id,
             order_status: 'DRY_RUN', order_reference_id: o.order_reference_id,
             dry_run: true };
  }

  var r = growwCall_(GROWW.ORDER_CREATE, { body: o });
  audit_('ORDER', 'Placed ' + o.transaction_type + ' ' + o.quantity + ' ' +
    o.trading_symbol + ' -> ' + JSON.stringify(r));
  return r;
}

function apiModifyOrder(o) {
  requireFields_(o, ['groww_order_id', 'segment']);
  if (cfg().DRY_RUN) {
    audit_('DRY_RUN', 'Would modify: ' + JSON.stringify(o));
    return { order_status: 'DRY_RUN', dry_run: true };
  }
  var r = growwCall_(GROWW.ORDER_MODIFY, { body: o });
  audit_('ORDER', 'Modified ' + o.groww_order_id + ' -> ' + JSON.stringify(r));
  return r;
}

function apiCancelOrder(growwOrderId, segment) {
  if (cfg().DRY_RUN) {
    audit_('DRY_RUN', 'Would cancel: ' + growwOrderId);
    return { order_status: 'DRY_RUN', dry_run: true };
  }
  var r = growwCall_(GROWW.ORDER_CANCEL, {
    body: { groww_order_id: growwOrderId, segment: segment }
  });
  audit_('ORDER', 'Cancelled ' + growwOrderId + ' -> ' + JSON.stringify(r));
  return r;
}

/** Idempotency key so a retry never double-fills. Max 20 chars, alphanumeric. */
function newOrderRef_() {
  var s = 'B' + Utilities.formatDate(new Date(), cfgTz_(), 'yyMMddHHmmss') +
          Math.floor(Math.random() * 1000);
  return s.slice(0, 20);
}

function requireFields_(o, fields) {
  var missing = fields.filter(function (f) {
    return o[f] === undefined || o[f] === null || o[f] === '';
  });
  if (missing.length) {
    throw new Error('Order missing required field(s): ' + missing.join(', '));
  }
}

// ---------------------------------------------------------------- diagnostics

/**
 * Probe every endpoint and report which respond. Groww documents only some
 * paths publicly, so this tells you precisely which entries in GROWW (in
 * 00_Config.gs) need correcting for your account, instead of failing at 09:16
 * with a position open.
 */
function diagVerifyEndpoints() {
  var probes = [
    ['MARGIN_USER',    function () { return apiUserMargin(); }],
    ['POSITIONS_USER', function () { return apiPositions(E.SEGMENT.FNO); }],
    ['ORDER_LIST',     function () { return apiOrderList(E.SEGMENT.FNO); }],
    ['LTP',            function () { return apiLtp(E.SEGMENT.CASH, ['NSE_RELIANCE']); }],
    ['OHLC',           function () { return apiOhlc(E.SEGMENT.CASH, ['NSE_RELIANCE']); }],
    ['CANDLES',        function () {
        var end = new Date(), start = new Date(end.getTime() - 7 * 864e5);
        return apiCandles(E.EXCHANGE.NSE, E.SEGMENT.CASH, 'RELIANCE',
          fmtApi_(start), fmtApi_(end), 1440);
      }]
  ];

  var lines = ['Endpoint probe — ' + fmtIst_(new Date()), ''];
  probes.forEach(function (p) {
    try {
      var r = p[1]();
      var n = Array.isArray(r) ? r.length + ' rows' : 'ok';
      lines.push('  OK      ' + p[0] + '  (' + n + ')');
    } catch (e) {
      lines.push('  FAILED  ' + p[0] + '  ' + truncate_(e.message, 160));
    }
  });
  lines.push('');
  lines.push('Any FAILED line that says HTTP 404 means the path in GROWW');
  lines.push('(00_Config.gs) is wrong — correct it from your Groww API docs.');
  lines.push('HTTP 401/403 on live-data rows usually means the Live Data');
  lines.push('add-on is not on your plan (it is paid, separate from the API).');

  var msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Endpoint verification', msg,
        SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}
