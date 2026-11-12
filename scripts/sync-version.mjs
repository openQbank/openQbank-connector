#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

const readDotenv = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator < 0) return [line, ''];
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')];
      }),
  );
};

const env = { ...readDotenv(envPath), ...process.env };
const version = String(env.VERSION || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('VERSION must be set in .env as a semantic version, for example 13.3.1.');
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
