'use strict';
process.env.PH_SKIP_DOTENV = '1';
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { Store } = require('../../frontend/lib/store');
const tmpStore = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'ph-')));
module.exports = { tmpStore };
