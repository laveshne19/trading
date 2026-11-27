/**
 * 10_SheetIO.gs — all spreadsheet reads and writes.
 *
 * Row 1 of every data sheet holds camelCase keys; readSheet_ turns rows into
 * objects keyed by those headers, so adding a column never breaks the code.
 */

function ss_() { return SpreadsheetApp.getActive(); }

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    var schema = SCHEMA[name];
    if (schema) {
      sh.getRange(1, 1, 1, schema.length).setValues([schema]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, schema.length).setFontWeight('bold');
    }
  }
  return sh;
}

/** Every row as an object. Blank rows are skipped. */
function readSheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var o = { _row: i + 1 };
    for (var j = 0; j < head.length; j++) if (head[j]) o[head[j]] = row[j];
    out.push(o);
  }
  return out;
}

/** Append an object using the sheet's own header order. */
function appendObj_(name, obj) {
  var sh = sheet_(name);
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
               .map(function (h) { return String(h).trim(); });
  var row = head.map(function (h) {
    var v = obj[h];
    return (v === undefined || v === null) ? '' : v;
  });
  sh.appendRow(row);
  return sh.getLastRow();
}

/** Write specific fields back to one row, found by its `id` column. */
function updateById_(name, id, patch) {
  var sh = sheet_(name);
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
               .map(function (h) { return String(h).trim(); });
  var idCol = head.indexOf('id') + 1;
  if (!idCol) throw new Error(name + ' has no "id" column.');
  if (sh.getLastRow() < 2) return false;

  var ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(id)) continue;
    var r = i + 2;
    Object.keys(patch).forEach(function (k) {
      var col = head.indexOf(k) + 1;
      if (col) sh.getRange(r, col).setValue(patch[k]);
    });
    return true;
  }
  return false;
}

function deleteById_(name, id) {
  var sh = sheet_(name);
  var rows = readSheet_(name);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].id) === String(id)) { sh.deleteRow(rows[i]._row); return true; }
  }
  return false;
}

// ---------------------------------------------------------------- positions

function openPositions_() {
  return readSheet_(SH.POSITIONS).filter(function (p) {
    return String(p.status || '').toUpperCase() === 'OPEN';
  }).map(normalisePosition_);
}

function countOpenPositions_() { return openPositions_().length; }

function normalisePosition_(p) {
  return {
    id: p.id,
    _row: p._row,
    entryDate: p.entryDate,
    underlying: p.underlying,
    tradingSymbol: p.tradingSymbol,
    exchangeSymbol: p.exchangeSymbol,
    segment: p.segment || E.SEGMENT.FNO,
    optionType: p.optionType,
    strike: Number(p.strike) || null,
    expiry: p.expiry,
    lots: Number(p.lots) || 0,
    qty: Number(p.qty) || 0,
    entryPrice: Number(p.entryPrice) || 0,
    stopPrice: Number(p.stopPrice) || 0,
    targetPrice: Number(p.targetPrice) || 0,
    peakPrice: Number(p.peakPrice) || Number(p.entryPrice) || 0,
    stopOrderId: p.stopOrderId || '',
    entryOrderId: p.entryOrderId || '',
    horizon: p.horizon || 'INTRADAY',
    status: p.status,
    thesis: p.thesis || '',
    maxLossRupees: Number(p.maxLossRupees) || 0
  };
}

// ---------------------------------------------------------------- schema

var SCHEMA = {};
SCHEMA[SH.CONFIG]    = ['key', 'value', 'note'];
SCHEMA[SH.WATCHLIST] = ['symbol', 'segment', 'exchange', 'lotSize', 'theme',
                        'enabled', 'note'];
SCHEMA[SH.SIGNALS]   = ['ts', 'source', 'model', 'underlying', 'decision',
                        'conviction', 'horizon', 'thesis', 'invalidation',
                        'riskFlags', 'acted', 'blockReason'];
SCHEMA[SH.ORDERS]    = ['ts', 'id', 'kind', 'tradingSymbol', 'transactionType',
                        'orderType', 'qty', 'price', 'triggerPrice',
                        'growwOrderId', 'orderReferenceId', 'status', 'detail'];
SCHEMA[SH.POSITIONS] = ['id', 'entryDate', 'underlying', 'tradingSymbol',
                        'exchangeSymbol', 'segment', 'optionType', 'strike',
                        'expiry', 'lots', 'qty', 'entryPrice', 'stopPrice',
                        'targetPrice', 'peakPrice', 'ltp', 'unrealisedPnl',
                        'stopOrderId', 'entryOrderId', 'horizon', 'status',
                        'maxLossRupees', 'thesis'];
SCHEMA[SH.TRADELOG]  = ['id', 'entryDate', 'exitDate', 'underlying',
                        'tradingSymbol', 'optionType', 'lots', 'qty',
                        'entryPrice', 'exitPrice', 'pnl', 'pnlPct',
                        'exitReason', 'horizon', 'model', 'thesis'];
SCHEMA[SH.MARKET]    = ['ts', 'symbol', 'ltp', 'open', 'high', 'low',
                        'prevClose', 'changePct', 'note'];
SCHEMA[SH.AUDIT]     = ['ts', 'kind', 'message'];
