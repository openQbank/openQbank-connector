#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = String(process.env.VERSION || pkg.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('The package or release VERSION must be a semantic version, for example 13.3.1.');
  process.exit(1);
}

const updateJson = (relativePath, update) => {
  const filePath = path.join(rootDir, relativePath);
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  update(value);
  const indentation = relativePath === 'public/manifest.json' ? 4 : 2;
  fs.writeFileSync(filePath, JSON.stringify(value, null, indentation) + '\n');
};

updateJson('package.json', (pkg) => {
  pkg.version = version;
});

updateJson('package-lock.json', (lockfile) => {
  lockfile.version = version;
  if (lockfile.packages?.['']) lockfile.packages[''].version = version;
});

updateJson('public/manifest.json', (manifest) => {
  manifest.version = version;
});

console.log(`Synchronized package and manifest versions to ${version}.`);
