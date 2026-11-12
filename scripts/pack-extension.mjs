#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
const version = String(pkg.version || "0.0.0").trim();
const outPath = path.join(os.homedir(), "Downloads", `openQbank-connector-v${version}.zip`);

if (!fs.existsSync(DIST_DIR)) {
  console.error("dist/ is missing. Run `npm run build:web` first.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
if (fs.existsSync(outPath)) {
  fs.unlinkSync(outPath);
}

execSync(`zip -rq ${JSON.stringify(outPath)} .`, { cwd: DIST_DIR, stdio: "inherit" });

console.log(`Extension zip: ${outPath}`);
