/**
 * 08_Orders.gs — order lifecycle.
 *
 * Entry sequence, in this order and no other:
 *   1. resolve the instrument and its live premium
 *   2. risk gate (decides lots, or refuses)
 *   3. LIMIT buy
 *   4. confirm the fill
 *   5. IMMEDIATELY place the protective SL-M at the broker
 *   6. record the position
 *
 * If step 5 fails, step 6 does not happen quietly — the position is flagged
 * UNPROTECTED and an alert goes out, because an unprotected naked option is
 * the one state this system must never sit in silently.
 */

function enterFromCandidate_(cand) {
  var c = cfg();

  if (!cand.underlying) {
    return { ok: false, reason: 'Candidate has no underlying.' };
  }
  var optionType = cand.decision === 'LONG_CALL' ? 'CE' : 'PE';

  // Spot for strike selection.
  var idx = null;
  try { idx = indexRead_(cand.underlying); }
  catch (e) { return { ok: false, reason: 'No spot for ' + cand.underlying + ': ' + e.message }; }
  var spot = idx.ltp || idx.lastClose;
  if (!spot) return { ok: false, reason: 'No usable spot price for ' + cand.underlying + '.' };

  // Which series? An intraday trade on expiry day may use today's expiry; a
  // carry must not.
  var expiryDate = chooseExpiry_(cand.horizon);
  var moneyness = cand.moneyness || c.OPTION_MONEYNESS;

  var inst;
  try {
    inst = resolveOption_(cand.underlying, optionType, spot, expiryDate, moneyness);
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  if (!inst.lotSize) {
    return { ok: false, reason: 'No lot size configured for ' + cand.underlying +
      '. Set LOT_SIZE in Config.' };
  }

  var verdict = riskGate_({
    underlying: cand.underlying,
    tradingSymbol: inst.tradingSymbol,
    premium: inst.premium,
    lotSize: inst.lotSize,
    horizon: cand.horizon,
    conviction: cand.conviction,
    segment: E.SEGMENT.FNO
  });
  if (!verdict.pass) {
    return { ok: false, reason: verdict.reasons.join(' | '), verdict: verdict };
  }

  // ---- entry ------------------------------------------------------------
  var limitPrice = roundTick_(inst.premium * (1 + c.LIMIT_SLIPPAGE_PCT));
  var entry;
  try {
    entry = apiPlaceOrder({
      trading_symbol: inst.tradingSymbol,
      quantity: verdict.qty,
      price: limitPrice,
      validity: E.VALIDITY.DAY,
      exchange: E.EXCHANGE.NSE,
      segment: E.SEGMENT.FNO,
      product: cand.horizon === 'OVERNIGHT' ? E.PRODUCT.NRML : c.PRODUCT,
      order_type: E.ORDER_TYPE.LIMIT,
      transaction_type: E.TXN.BUY
    });
  } catch (e) {
    return { ok: false, reason: 'Entry order rejected: ' + e.message };
  }

  logOrder_('ENTRY', inst, E.TXN.BUY, E.ORDER_TYPE.LIMIT,
            verdict.qty, limitPrice, null, entry);

  var fill = c.DRY_RUN
    ? { filled: true, avgPrice: inst.premium, qty: verdict.qty }
    : waitForFill_(entry.groww_order_id, E.SEGMENT.FNO, verdict.qty);

  if (!fill.filled) {
    // Unfilled limit: pull it rather than leaving it to fill on a later spike.
    if (!c.DRY_RUN) {
      try { apiCancelOrder(entry.groww_order_id, E.SEGMENT.FNO); } catch (e) {}
    }
    return { ok: false, reason: 'Entry did not fill within the window; order cancelled.' };
  }

  var entryPrice = fill.avgPrice || inst.premium;
  var stopPrice   = roundTick_(entryPrice * (1 - c.STOP_PCT));
  var targetPrice = roundTick_(entryPrice * (1 + c.TARGET_PCT));
  var posId = 'P' + Utilities.formatDate(new Date(), cfgTz_(), 'yyMMddHHmmss');

  // ---- protective stop, at the broker -----------------------------------
  var stopOrderId = '';
  var protectionError = null;
  if (c.PLACE_EXCHANGE_STOP) {
    try {
      var sl = apiPlaceOrder({
        trading_symbol: inst.tradingSymbol,
        quantity: fill.qty,
        trigger_price: stopPrice,
        validity: E.VALIDITY.DAY,
        exchange: E.EXCHANGE.NSE,
        segment: E.SEGMENT.FNO,
        product: cand.horizon === 'OVERNIGHT' ? E.PRODUCT.NRML : c.PRODUCT,
        order_type: E.ORDER_TYPE.SL_M,
        transaction_type: E.TXN.SELL
      });
      stopOrderId = sl.groww_order_id || '';
      logOrder_('STOP', inst, E.TXN.SELL, E.ORDER_TYPE.SL_M,
                fill.qty, null, stopPrice, sl);
    } catch (e) {
      protectionError = e.message;
    }
  }

  appendObj_(SH.POSITIONS, {
    id: posId,
    entryDate: fmtIst_(new Date()),
    underlying: cand.underlying,
    tradingSymbol: inst.tradingSymbol,
    exchangeSymbol: inst.exchangeSymbol,
    segment: E.SEGMENT.FNO,
    optionType: optionType,
    strike: inst.strike,
    expiry: inst.expiry,
    lots: verdict.lots,
    qty: fill.qty,
    entryPrice: entryPrice,
    stopPrice: stopPrice,
    targetPrice: targetPrice,
    peakPrice: entryPrice,
    ltp: entryPrice,
    unrealisedPnl: 0,
    stopOrderId: stopOrderId,
    entryOrderId: entry.groww_order_id || '',
    horizon: cand.horizon,
    status: protectionError ? 'OPEN_UNPROTECTED' : 'OPEN',
    maxLossRupees: verdict.maxLossRupees,
    thesis: truncate_(cand.thesis, 500)
  });

  if (protectionError) {
    var warn = 'ENTERED BUT THE STOP DID NOT PLACE.\n\n' +
      inst.tradingSymbol + ' x' + fill.qty + ' at ' + entryPrice + '\n' +
      'Stop order error: ' + protectionError + '\n\n' +
      'This position has NO protection at the broker. Place a stop manually ' +
      'now, or use Trading Bot > Panic flatten.';
    audit_('UNPROTECTED', warn);
    notify_('ACTION NEEDED: unprotected position', warn);
    return { ok: true, warning: warn, posId: posId, entryPrice: entryPrice };
  }

  var msg = 'Entered ' + inst.tradingSymbol + ' x' + fill.qty + ' (' +
    verdict.lots + ' lot' + (verdict.lots > 1 ? 's' : '') + ') at ' + entryPrice +
    '\nstop ' + stopPrice + '  target ' + targetPrice +
    '\nmax loss ' + inr_(verdict.maxLossRupees) +
    '\n\n' + cand.thesis;
  audit_('ENTRY', msg);
  notify_('Trade entered: ' + inst.tradingSymbol, msg);
  return { ok: true, posId: posId, entryPrice: entryPrice, verdict: verdict };
}

/** Which expiry to trade. Never carry an expiring contract overnight. */
function chooseExpiry_(horizon) {
  var today = todayIst_();
  var next = nextExpiryDate_();
  if (horizon === 'INTRADAY') return next;         // today's, if today is expiry
  if (next === today) return nextExpiryDate_(1);   // skip to the following one
  return next;
}

/** The next expiry on or after today, as yyyy-MM-dd. `skip` moves forward. */
function nextExpiryDate_(skip) {
  skip = skip || 0;
  var d = new Date();
  var found = 0;
  for (var i = 0; i < 60; i++) {
    var cur = new Date(d.getTime() + i * 864e5);
    var ymd = Utilities.formatDate(cur, cfgTz_(), 'yyyy-MM-dd');
    var dow = Number(Utilities.formatDate(cur, cfgTz_(), 'u'));
    if (dow === EXPIRY_WEEKDAY && !isTradingHoliday_(ymd)) {
      if (found === skip) return ymd;
      found++;
    }
  }
  throw new Error('Could not find an expiry date in the next 60 days.');
}

/** Poll order status briefly. Apps Script has no callbacks. */
function waitForFill_(growwOrderId, segment, wantQty) {
  var deadline = Date.now() + 45000;
  var last = null;
  while (Date.now() < deadline) {
    Utilities.sleep(3000);
    try {
      var st = apiOrderStatus(segment, growwOrderId, null);
      last = st;
      var s = String(st.order_status || '').toUpperCase();
      var filled = Number(st.filled_quantity || 0);
      if (s === 'COMPLETED' || s === 'EXECUTED' || s === 'FILLED' ||
          (filled > 0 && filled >= wantQty)) {
        return { filled: true, qty: filled || wantQty,
                 avgPrice: Number(st.average_fill_price) || null };
      }
      if (['REJECTED', 'CANCELLED', 'FAILED', 'LAPSED'].indexOf(s) !== -1) {
        return { filled: false, status: s, qty: 0 };
      }
    } catch (e) {
      audit_('FILL_POLL', 'Status check failed: ' + e.message);
    }
  }
  // Partial fills are a real outcome; treat any quantity as a live position.
  var pf = Number((last && last.filled_quantity) || 0);
  if (pf > 0) {
    return { filled: true, qty: pf,
             avgPrice: Number(last.average_fill_price) || null, partial: true };
  }
  return { filled: false, status: 'TIMEOUT', qty: 0 };
}

// ---------------------------------------------------------------- exits

/**
 * Close a position. Cancels the protective stop FIRST — selling while an SL-M
 * sell is still live would leave a resting order that could later execute and
 * open a naked short.
 */
function exitPosition_(pos, reason) {
  var c = cfg();

  if (pos.stopOrderId && !c.DRY_RUN) {
    try {
      apiCancelOrder(pos.stopOrderId, pos.segment || E.SEGMENT.FNO);
    } catch (e) {
      // If it cannot be cancelled it has probably already triggered, which
      // means the position is already flat. Verify before selling again.
      audit_('EXIT', 'Stop cancel failed for ' + pos.tradingSymbol + ': ' + e.message);
      var st = null;
      try { st = apiOrderStatus(pos.segment || E.SEGMENT.FNO, pos.stopOrderId, null); }
      catch (e2) {}
      var ss = st ? String(st.order_status || '').toUpperCase() : '';
      if (['COMPLETED', 'EXECUTED', 'FILLED'].indexOf(ss) !== -1) {
        closePositionRow_(pos, Number(st.average_fill_price) || pos.stopPrice,
                          'STOP_HIT_AT_BROKER');
        return { ok: true, note: 'Stop had already filled at the broker.' };
      }
      throw new Error('Refusing to sell: could not cancel the stop and cannot ' +
        'confirm it filled. Check the broker manually. (' + e.message + ')');
    }
  }

  var ltp = safeLtp_(pos) || pos.entryPrice;
  var limitPrice = roundTick_(ltp * (1 - c.LIMIT_SLIPPAGE_PCT));

  var ord = apiPlaceOrder({
    trading_symbol: pos.tradingSymbol,
    quantity: pos.qty,
    price: limitPrice,
    validity: E.VALIDITY.DAY,
    exchange: E.EXCHANGE.NSE,
    segment: pos.segment || E.SEGMENT.FNO,
    product: pos.horizon === 'OVERNIGHT' ? E.PRODUCT.NRML : c.PRODUCT,
    order_type: E.ORDER_TYPE.LIMIT,
    transaction_type: E.TXN.SELL
  });
  logOrder_('EXIT', pos, E.TXN.SELL, E.ORDER_TYPE.LIMIT,
            pos.qty, limitPrice, null, ord);

  var fill = c.DRY_RUN
    ? { filled: true, avgPrice: ltp, qty: pos.qty }
    : waitForFill_(ord.groww_order_id, pos.segment || E.SEGMENT.FNO, pos.qty);

  if (!fill.filled) {
    // Do not leave the position both unsold and unprotected.
    if (!c.DRY_RUN) {
      try { apiCancelOrder(ord.groww_order_id, pos.segment || E.SEGMENT.FNO); } catch (e) {}
      try {
        var sl = apiPlaceOrder({
          trading_symbol: pos.tradingSymbol, quantity: pos.qty,
          trigger_price: pos.stopPrice, validity: E.VALIDITY.DAY,
          exchange: E.EXCHANGE.NSE, segment: pos.segment || E.SEGMENT.FNO,
          product: pos.horizon === 'OVERNIGHT' ? E.PRODUCT.NRML : c.PRODUCT,
          order_type: E.ORDER_TYPE.SL_M, transaction_type: E.TXN.SELL
        });
        updateById_(SH.POSITIONS, pos.id, { stopOrderId: sl.groww_order_id || '' });
      } catch (e) {
        notify_('ACTION NEEDED: exit failed, position unprotected',
          pos.tradingSymbol + ' did not sell and the stop could not be ' +
          're-placed. Handle this manually now. ' + e.message);
      }
    }
    return { ok: false, reason: 'Exit did not fill; stop re-placed.' };
  }

  closePositionRow_(pos, fill.avgPrice || ltp, reason);
  return { ok: true, exitPrice: fill.avgPrice || ltp };
}

function closePositionRow_(pos, exitPrice, reason) {
  var pnl = (exitPrice - pos.entryPrice) * pos.qty;
  var pnlPct = pos.entryPrice ? (exitPrice / pos.entryPrice - 1) * 100 : 0;

  appendObj_(SH.TRADELOG, {
    id: pos.id,
    entryDate: pos.entryDate,
    exitDate: fmtIst_(new Date()),
    underlying: pos.underlying,
    tradingSymbol: pos.tradingSymbol,
    optionType: pos.optionType,
    lots: pos.lots,
    qty: pos.qty,
    entryPrice: round2_(pos.entryPrice),
    exitPrice: round2_(exitPrice),
    pnl: round2_(pnl),
    pnlPct: round2_(pnlPct),
    exitReason: reason,
    horizon: pos.horizon,
    model: '',
    thesis: pos.thesis
  });

  updateById_(SH.POSITIONS, pos.id, {
    status: 'CLOSED', ltp: round2_(exitPrice), unrealisedPnl: round2_(pnl)
  });

  var msg = (pnl >= 0 ? 'WIN  ' : 'LOSS ') + pos.tradingSymbol +
    '  ' + inr_(pnl) + '  (' + round2_(pnlPct) + '%)  [' + reason + ']';
  audit_('EXIT', msg);
  notify_('Trade closed: ' + (pnl >= 0 ? '+' : '') + inr_(pnl), msg +
    '\n\nentry ' + pos.entryPrice + ' -> exit ' + round2_(exitPrice) +
    '\nday realised: ' + inr_(dailyRealisedPnl_()));
}

function safeLtp_(pos) {
  try {
    var m = apiLtp(pos.segment || E.SEGMENT.FNO, [pos.exchangeSymbol]);
    var keys = Object.keys(m || {});
    for (var i = 0; i < keys.length; i++) {
      var v = Number(m[keys[i]]);
      if (v > 0) return v;
    }
  } catch (e) {
    audit_('LTP', 'Could not fetch LTP for ' + pos.tradingSymbol + ': ' + e.message);
  }
  return null;
}

function logOrder_(kind, inst, txn, type, qty, price, trigger, res) {
  appendObj_(SH.ORDERS, {
    ts: new Date(),
    id: (res && res.order_reference_id) || '',
    kind: kind,
    tradingSymbol: inst.tradingSymbol,
    transactionType: txn,
    orderType: type,
    qty: qty,
    price: price === null || price === undefined ? '' : price,
    triggerPrice: trigger === null || trigger === undefined ? '' : trigger,
    growwOrderId: (res && res.groww_order_id) || '',
    orderReferenceId: (res && res.order_reference_id) || '',
    status: (res && res.order_status) || '',
    detail: truncate_(JSON.stringify(res || {}), 500)
  });
}
