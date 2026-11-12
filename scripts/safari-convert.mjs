#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found. Run npm run build:web first.');
  process.exit(1);
}

const result = spawnSync(
  'xcrun',
  [
    'safari-web-extension-converter',
    distDir,
    '--project-location',
    'safari-build',
    '--app-name',
    'openQbank Connector',
    '--bundle-identifier',
    'com.openMedEd.openqbank',
    '--swift',
    '--macos-only',
    '--copy-resources',
    '--no-open',
    '--no-prompt',
    '--force',
  ],
  { cwd: root, stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('Safari project written to:', path.join(root, 'safari-build'));
