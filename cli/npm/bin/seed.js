#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const platform = process.platform;
const binary = platform === 'win32' ? 'seed.exe' : 'seed';
const binDir = path.join(__dirname, '..', 'bin');
const binaryPath = path.join(binDir, binary);

if (!fs.existsSync(binaryPath)) {
  console.error('Binary not found. Run `npm run postinstall` first.');
  process.exit(1);
}

const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status);