#!/usr/bin/env node
// ==============================================================================
// publish-cws.mjs: Pure Node.js Chrome Web Store API Publisher
//
// Zero Python dependencies. Zero external npm dependencies.
// Uses native Node.js fetch and fs APIs.
//
// Usage:
//   node scripts/publish-cws.mjs [path_to_zip]
// ==============================================================================

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// ANSI formatting
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...vals] = trimmed.split("=");
    const val = vals.join("=").trim().replace(/^["']|["']$/g, "");
    env[key.trim()] = val;
  }
  return env;
}

function resolveConfig() {
  const envFromFile = loadEnvFile(path.join(ROOT_DIR, ".env"));
  const get = (key, altKey) =>
    process.env[key] || process.env[altKey] || envFromFile[key] || envFromFile[altKey] || "";

  return {
    extensionId: get("CHROME_EXTENSION_ID", "EXTENSION_ID"),
    clientId: get("CHROME_CLIENT_ID", "CLIENT_ID"),
    clientSecret: get("CHROME_CLIENT_SECRET", "CLIENT_SECRET"),
    refreshToken: get("CHROME_REFRESH_TOKEN", "REFRESH_TOKEN"),
  };
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
  console.log(`${BLUE}==> Refreshing Google OAuth2 access token...${RESET}`);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(
      `Failed to obtain access token (${response.status}): ${data.error_description || data.error || JSON.stringify(data)}`
    );
  }
  console.log(`${GREEN}✓ Access token obtained.${RESET}`);
  return data.access_token;
}

async function uploadZip(accessToken, extensionId, zipPath) {
  const stats = fs.statSync(zipPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
  console.log(
    `${BLUE}==> Uploading zip (${sizeMb} MB) to Chrome Web Store API...${RESET}`
  );
  console.log(`    Target Extension ID: ${BOLD}${extensionId}${RESET}`);
  console.log(`    File: ${zipPath}`);

  const zipBuffer = fs.readFileSync(zipPath);
  const response = await fetch(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-goog-api-version": "2",
      },
      body: zipBuffer,
    }
  );

  const data = await response.json();
  if (!response.ok || data.uploadState !== "SUCCESS") {
    const errDetails = data.itemError
      ? JSON.stringify(data.itemError, null, 2)
      : JSON.stringify(data, null, 2);
    throw new Error(
      `Upload failed (${response.status}): ${data.uploadState || "ERROR"}\n${errDetails}`
    );
  }

  console.log(`${GREEN}✓ Package uploaded successfully (uploadState: SUCCESS).${RESET}`);
  return data;
}

async function publishItem(accessToken, extensionId) {
  console.log(`${BLUE}==> Submitting uploaded package for review (publish)...${RESET}`);
  const response = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-goog-api-version": "2",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target: "default" }),
    }
  );

  const data = await response.json();
  if (!response.ok || (data.status && data.status.includes("ITEM_NOT_UP_TO_DATE"))) {
    throw new Error(`Publish failed (${response.status}): ${JSON.stringify(data, null, 2)}`);
  }

  return data;
}

async function main() {
  console.log(`${BOLD}=====================================================${RESET}`);
  console.log(`${BOLD}  openChromeBank: Chrome Web Store CLI Publisher     ${RESET}`);
  console.log(`${BOLD}=====================================================${RESET}`);

  const args = process.argv.slice(2);
  const uploadOnly = args.includes("--upload-only");
  const zipArgument = args.find((arg) => !arg.startsWith("--"));
  const config = resolveConfig();

  // Find target zip
  let zipPath = zipArgument;
  if (!zipPath) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
    const version = pkg.version || "latest";
    const userDownloads = path.join(os.homedir(), "Downloads", `openQbank-connector-v${version}.zip`);
    const userDownloadsLegacy = path.join(os.homedir(), "Downloads", `openChromeBank-v${version}.zip`);
    const rootZip = path.join(ROOT_DIR, "openChromeBank.zip");
    if (fs.existsSync(userDownloads)) {
      zipPath = userDownloads;
    } else if (fs.existsSync(userDownloadsLegacy)) {
      zipPath = userDownloadsLegacy;
    } else if (fs.existsSync(rootZip)) {
      zipPath = rootZip;
    } else {
      console.error(
        `${RED}[ERROR] No zip path provided and default zip was not found.${RESET}`
      );
      console.error(`Run 'npm run publish:release' first or specify: node scripts/publish-cws.mjs <path-to-zip>`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(zipPath)) {
    console.error(`${RED}[ERROR] Specified zip file does not exist: ${zipPath}${RESET}`);
    process.exit(1);
  }

  // Validate credentials
  const missing = [];
  if (!config.extensionId) missing.push("CHROME_EXTENSION_ID");
  if (!config.clientId) missing.push("CHROME_CLIENT_ID");
  if (!config.clientSecret) missing.push("CHROME_CLIENT_SECRET");
  if (!config.refreshToken) missing.push("CHROME_REFRESH_TOKEN");

  if (missing.length > 0) {
    console.error(
      `${RED}[ERROR] Missing required Chrome Web Store environment variables:${RESET}`
    );
    for (const m of missing) {
      console.error(`  - ${m}`);
    }
    console.error(`\nPlease provide these via environment variables or pass them before the command.`);
    process.exit(1);
  }

  try {
    const accessToken = await getAccessToken(
      config.clientId,
      config.clientSecret,
      config.refreshToken
    );

    await uploadZip(accessToken, config.extensionId, zipPath);
    if (uploadOnly) {
      console.log(`${GREEN}✓ Upload complete; review submission was not requested.${RESET}`);
      return;
    }

    const publishRes = await publishItem(accessToken, config.extensionId);

    console.log("");
    console.log(`${BOLD}${GREEN}=====================================================${RESET}`);
    console.log(`${BOLD}${GREEN}✓ Extension successfully submitted for review!       ${RESET}`);
    console.log(`${BOLD}${GREEN}=====================================================${RESET}`);
    if (publishRes.statusDetail) {
      console.log(`Details: ${publishRes.statusDetail.join(", ")}`);
    }
  } catch (error) {
    console.error("");
    console.error(`${BOLD}${RED}[FAILURE] ${error.message}${RESET}`);
    process.exit(1);
  }
}

main();
