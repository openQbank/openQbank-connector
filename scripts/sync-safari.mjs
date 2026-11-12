#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SAFARI_PROJ_DIR = path.join(ROOT_DIR, 'safari', 'openQbank');
const XCODEPROJ_NAME = fs.existsSync(SAFARI_PROJ_DIR)
  ? (fs.readdirSync(SAFARI_PROJ_DIR).find((f) => f.endsWith('.xcodeproj')) || 'openQbank Connector.xcodeproj')
  : 'openQbank Connector.xcodeproj';
const XCODEPROJ_PATH = path.join(SAFARI_PROJ_DIR, XCODEPROJ_NAME);
const PBXPROJ_PATH = path.join(XCODEPROJ_PATH, 'project.pbxproj');
const SCHEME_NAME = XCODEPROJ_NAME.replace(/\.xcodeproj$/, '');
const APPICON_DIR = path.join(SAFARI_PROJ_DIR, 'openQbank', 'Assets.xcassets', 'AppIcon.appiconset');
const DESKTOP_ICONSET_DIR = path.resolve(ROOT_DIR, '..', 'openQbank', 'desktop', 'openQbank.iconset');
const SAFARI_DIST_DIR = path.join(ROOT_DIR, 'safari', 'dist');

// 1. Sync version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.0.0').trim();

console.log(`[safari-sync] Synchronizing version v${version}...`);

for (const manifestRel of ['public/manifest.json', 'dist/manifest.json']) {
  const mPath = path.join(ROOT_DIR, manifestRel);
  if (fs.existsSync(mPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
      if (manifest.version !== version) {
        manifest.version = version;
        fs.writeFileSync(mPath, JSON.stringify(manifest, null, 4) + '\n');
        console.log(`[safari-sync] Updated ${manifestRel} version to ${version}`);
      }
    } catch (err) {
      console.warn(`[safari-sync] Failed to parse ${manifestRel}:`, err.message);
    }
  }
}

// 2. Sync Xcode project version
if (fs.existsSync(PBXPROJ_PATH)) {
  let pbx = fs.readFileSync(PBXPROJ_PATH, 'utf8');
  pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${version};`);
  fs.writeFileSync(PBXPROJ_PATH, pbx);
  console.log(`[safari-sync] Updated Xcode project MARKETING_VERSION and CURRENT_PROJECT_VERSION to ${version}`);
}

// 3. Sync flat white icons from desktop iconset if available
if (fs.existsSync(DESKTOP_ICONSET_DIR) && fs.existsSync(APPICON_DIR)) {
  const iconMap = [
    ['icon_16x16.png', 'mac-icon-16@1x.png'],
    ['icon_16x16@2x.png', 'mac-icon-16@2x.png'],
    ['icon_32x32.png', 'mac-icon-32@1x.png'],
    ['icon_32x32@2x.png', 'mac-icon-32@2x.png'],
    ['icon_128x128.png', 'mac-icon-128@1x.png'],
    ['icon_128x128@2x.png', 'mac-icon-128@2x.png'],
    ['icon_256x256.png', 'mac-icon-256@1x.png'],
    ['icon_256x256@2x.png', 'mac-icon-256@2x.png'],
    ['icon_512x512.png', 'mac-icon-512@1x.png'],
    ['icon_512x512@2x.png', 'mac-icon-512@2x.png'],
  ];

  for (const [srcName, destName] of iconMap) {
    const src = path.join(DESKTOP_ICONSET_DIR, srcName);
    const dest = path.join(APPICON_DIR, destName);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }

  const icon512 = path.join(DESKTOP_ICONSET_DIR, 'icon_256x256@2x.png');
  const mainHtmlIcon = path.join(SAFARI_PROJ_DIR, 'openQbank', 'Resources', 'Icon.png');
  if (fs.existsSync(icon512)) {
    fs.copyFileSync(icon512, mainHtmlIcon);
  }
  console.log(`[safari-sync] Synced flat white icons from desktop iconset.`);
}

// 4. Build Safari extension app via xcodebuild on macOS
if (process.platform === 'darwin') {
  try {
    execSync('which xcodebuild', { stdio: 'ignore' });
  } catch {
    console.log('[safari-sync] xcodebuild not found; skipping Safari compilation.');
    process.exit(0);
  }

  console.log('[safari-sync] Compiling Safari extension with xcodebuild...');
  fs.rmSync(SAFARI_DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(SAFARI_DIST_DIR, { recursive: true });

  const buildCmd = [
    'xcodebuild',
    '-project', JSON.stringify(XCODEPROJ_PATH),
    '-scheme', JSON.stringify(SCHEME_NAME),
    '-configuration', 'Release',
    `CONFIGURATION_BUILD_DIR=${JSON.stringify(SAFARI_DIST_DIR)}`,
    'build',
  ].join(' ');

  try {
    execSync(buildCmd, { cwd: SAFARI_PROJ_DIR, stdio: 'inherit' });
    const targetAppName = 'openQbank Connector.app';
    let builtApp = path.join(SAFARI_DIST_DIR, targetAppName);
    const legacyApp = path.join(SAFARI_DIST_DIR, 'openQbank Connector-connector.app');
    if (!fs.existsSync(builtApp) && fs.existsSync(legacyApp)) {
      try {
        fs.renameSync(legacyApp, builtApp);
      } catch {
        builtApp = legacyApp;
      }
    }
    if (fs.existsSync(builtApp)) {
      // Register with LaunchServices
      try {
        const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
        if (fs.existsSync(lsregister)) {
          execSync(`${lsregister} -f -R -trusted ${JSON.stringify(builtApp)}`, { stdio: 'ignore' });
          console.log(`[safari-sync] Registered ${builtApp} with macOS LaunchServices.`);
        }
      } catch (err) {
        console.warn(`[safari-sync] Could not register with lsregister:`, err.message);
      }
      console.log(`[safari-sync] Successfully built Safari app: ${builtApp}`);
    }
  } catch (err) {
    console.error(`[safari-sync] xcodebuild failed:`, err.message);
    process.exit(1);
  }
} else {
  console.log('[safari-sync] Not on macOS; skipping xcodebuild.');
}
