#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SAFARI_DIST_DIR = path.join(ROOT_DIR, "safari", "dist");

if (process.platform !== "darwin") {
  console.log("[safari-dmg] Not running on macOS; skipping Safari DMG packaging.");
  process.exit(0);
}

let appBundle = path.join(SAFARI_DIST_DIR, "openQbank Connector.app");
if (!fs.existsSync(appBundle)) {
  const fallback = path.join(SAFARI_DIST_DIR, "openQbank Connector-connector.app");
  if (fs.existsSync(fallback)) {
    appBundle = fallback;
  } else {
    console.warn(
      `[safari-dmg] Safari app bundle not found at ${appBundle}; skipping DMG. Run 'npm run build:safari' after installing Xcode.`,
    );
    if (process.env.REQUIRE_SAFARI === "true") {
      process.exit(1);
    }
    process.exit(0);
  }
}

function resolveDeveloperId() {
  if (process.env.APPLE_SIGNING_IDENTITY) {
    return process.env.APPLE_SIGNING_IDENTITY.trim();
  }
  try {
    const output = execSync("security find-identity -v -p codesigning", { encoding: "utf-8" });
    const match = output.match(/"(Developer ID Application: [^"]+)"/);
    if (match) {
      return match[1];
    }
  } catch (err) {
    console.warn(`[safari-dmg] Warning: Could not detect signing identity: ${err.message}`);
  }
  return null;
}

const signingIdentity = resolveDeveloperId();
const appEntitlements = path.join(ROOT_DIR, "safari", "openQbank.entitlements");
const extEntitlements = path.join(ROOT_DIR, "safari", "openQbank-Extension.entitlements");
const appexPath = path.join(appBundle, "Contents", "PlugIns", "openQbank Connector Extension.appex");

if (signingIdentity) {
  console.log(`[safari-dmg] Signing with '${signingIdentity}' (Hardened Runtime + timestamp)...`);
  if (fs.existsSync(appexPath)) {
    execSync(
      `codesign --force --timestamp --options runtime --sign ${JSON.stringify(signingIdentity)} --entitlements ${JSON.stringify(extEntitlements)} ${JSON.stringify(appexPath)}`,
      { stdio: "inherit" }
    );
  }
  execSync(
    `codesign --force --timestamp --options runtime --sign ${JSON.stringify(signingIdentity)} --entitlements ${JSON.stringify(appEntitlements)} ${JSON.stringify(appBundle)}`,
    { stdio: "inherit" }
  );
  execSync(`codesign --verify --deep --strict ${JSON.stringify(appBundle)}`, { stdio: "inherit" });
  console.log(`[safari-dmg] Code signature verified successfully.`);
} else {
  console.warn("[safari-dmg] Warning: No Developer ID Application identity found. App may fail Apple Notarization.");
}

const outDir = path.join(os.homedir(), "Downloads");
const outPath = path.join(outDir, "openQbank-connector.dmg");
fs.mkdirSync(outDir, { recursive: true });

const stagingDir = path.join(ROOT_DIR, "safari", "dist_dmg");
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

console.log(`[safari-dmg] Staging ${appBundle} into ${stagingDir}...`);
execSync(`cp -R ${JSON.stringify(appBundle)} ${JSON.stringify(path.join(stagingDir, "openQbank Connector.app"))}`);

// Create Applications symlink for drag-and-drop installer UX
try {
  fs.symlinkSync("/Applications", path.join(stagingDir, "Applications"));
} catch (err) {
  console.warn(`[safari-dmg] Warning: Could not create Applications symlink: ${err.message}`);
}

console.log(`[safari-dmg] Creating DMG at ${outPath}...`);
if (fs.existsSync(outPath)) {
  fs.unlinkSync(outPath);
}

try {
  execSync(
    `hdiutil create -volname "openQbank-connector" -srcfolder ${JSON.stringify(stagingDir)} -ov -format UDZO ${JSON.stringify(outPath)}`,
    { stdio: "inherit" }
  );
} finally {
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

if (signingIdentity) {
  console.log(`[safari-dmg] Signing DMG with '${signingIdentity}'...`);
  execSync(`codesign --force --timestamp --sign ${JSON.stringify(signingIdentity)} ${JSON.stringify(outPath)}`, { stdio: "inherit" });
}

console.log(`[safari-dmg] DMG created: ${outPath}`);

// Notarization & Stapling
const keychainProfile = (process.env.APPLE_KEYCHAIN_PROFILE || "AC_PASSWORD").trim();
const apiKeyId = (process.env.APPLE_API_KEY_ID || "").trim();
const apiIssuerId = (process.env.APPLE_API_ISSUER_ID || "").trim();
const apiKeyPath = (process.env.APPLE_API_KEY_PATH || "").trim();

let hasKeychainProfile = false;
try {
  execSync(`xcrun notarytool history --keychain-profile ${JSON.stringify(keychainProfile)}`, { stdio: "ignore" });
  hasKeychainProfile = true;
} catch {
  hasKeychainProfile = false;
}

const hasApiKey = Boolean(apiKeyId && apiIssuerId && apiKeyPath && fs.existsSync(apiKeyPath));

if (hasKeychainProfile || hasApiKey) {
  console.log(`[safari-dmg] Submitting DMG to Apple Notary Service...`);
  const notaryArgs = hasKeychainProfile
    ? ["--keychain-profile", JSON.stringify(keychainProfile)]
    : ["--key", JSON.stringify(apiKeyPath), "--key-id", JSON.stringify(apiKeyId), "--issuer", JSON.stringify(apiIssuerId)];

  const notaryCmd = `xcrun notarytool submit ${JSON.stringify(outPath)} ${notaryArgs.join(" ")} --wait`;
  try {
    const stdout = execSync(notaryCmd, { encoding: "utf-8" });
    console.log(stdout);

    if (stdout.includes("status: Accepted")) {
      console.log("[safari-dmg] Notarization Accepted! Stapling ticket to DMG...");
      execSync(`xcrun stapler staple ${JSON.stringify(outPath)}`, { stdio: "inherit" });
      console.log("[safari-dmg] Staple complete! DMG is ready for distribution.");
    } else {
      console.error("[safari-dmg] Error: Notarization did not return 'status: Accepted'.");
      const idMatch = stdout.match(/id:\s*([a-f0-9\-]+)/i);
      if (idMatch) {
        try {
          const logCmd = `xcrun notarytool log ${idMatch[1]} ${notaryArgs.join(" ")}`;
          const logOut = execSync(logCmd, { encoding: "utf-8" });
          console.error("[safari-dmg] Notary log:\n" + logOut);
        } catch {}
      }
      if (process.env.REQUIRE_NOTARIZATION === "true") {
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`[safari-dmg] Notarization submission failed: ${err.message}`);
    if (process.env.REQUIRE_NOTARIZATION === "true") {
      process.exit(1);
    }
  }
} else {
  console.log(
    `[safari-dmg] Notarization skipped: Keychain profile '${keychainProfile}' is not configured on this machine.\n` +
    `  To configure Apple notarization, run once in your terminal:\n` +
    `    xcrun notarytool store-credentials "${keychainProfile}" \\\n` +
    `      --apple-id "your-apple-id@email.com" \\\n` +
    `      --team-id "${process.env.APPLE_TEAM_ID || 'YOUR_TEAM_ID'}" \\\n` +
    `      --password "xxxx-xxxx-xxxx-xxxx"\n` +
    `  Then rerun npm run build.`
  );
}
