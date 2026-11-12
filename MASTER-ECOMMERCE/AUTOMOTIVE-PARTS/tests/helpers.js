'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
const { load } = require('../frontend/lib/config');
const { loadCatalog } = require('../frontend/lib/catalog');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ap-test-'));
const cfgFor = (over = {}) => ({ ...load(), dataDir: tmp(), ...over });
const catalogFor = (over = {}) => loadCatalog(cfgFor(over));
module.exports = { tmp, cfgFor, catalogFor };
