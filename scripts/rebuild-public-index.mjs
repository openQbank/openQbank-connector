#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(root, '..', 'src/content/index.ts');
const bak = path.join(root, '..', 'src/content/index.ts.bak');
const lines = fs.readFileSync(bak, 'utf8').split('\n');

const del = (start, end) => lines.splice(start - 1, end - start + 1);

// Reverse order (1-based line numbers in .bak)
del(5077, 5091); // openHyGuruModal + closeHyGuruModal start — keep finishCountdown: find closeHyGuruModal end
// Re-read - closeHyGuru at 5092, renderHyGuru ends before keydown listener

// Find line with `const finishCountdownProgressBar` after splices - use grep on lines array
const finishIdx = lines.findIndex((l) => l.startsWith('const finishCountdownProgressBar'));
const hyguruStart = lines.findIndex((l) => l.startsWith('const HYGURU_MODAL_ID'));
if (hyguruStart >= 0 && finishIdx > hyguruStart) {
  // Remove HYGURU constants (2 lines before splitStoredCardTags)
  const splitIdx = lines.findIndex((l) => l.startsWith('const splitStoredCardTags'));
  if (splitIdx > hyguruStart) {
    lines.splice(hyguruStart, splitIdx - hyguruStart);
  }
  const newFinish = lines.findIndex((l) => l.startsWith('const finishCountdownProgressBar'));
  const openModal = lines.findIndex((l) => l.startsWith('const openHyGuruModal'));
  if (openModal >= 0 && newFinish > openModal) {
    lines.splice(openModal, newFinish - openModal);
  }
}

const sendStart = lines.findIndex((l) => l.startsWith('const sendOpenQBankRequest'));
const genStart = lines.findIndex((l) => l.startsWith('type GenerateCardsResponse'));
if (sendStart >= 0 && genStart > sendStart) {
  lines.splice(sendStart, genStart - sendStart);
}

const showUpdate = lines.findIndex((l) => l.startsWith('const showUpdateRequiredModal'));
const showHyguru = lines.findIndex((l) => l.startsWith('const showHyGuruUpgradeModal'));
if (showUpdate >= 0 && showHyguru > showUpdate) {
  lines.splice(showUpdate, showHyguru - showUpdate);
}
if (showHyguru >= 0) {
  const send2 = lines.findIndex((l) => l.startsWith('const sendOpenQBankRequest'));
  const hyEnd = lines.findIndex((l, i) => i > showHyguru && l.startsWith('const sendOpenQBankRequest'));
  const hyguruEnd = lines.findIndex((l) => l.startsWith('const sendOpenQBankRequest'));
  const hyguruModalFn = lines.findIndex((l) => l.startsWith('const showHyGuruUpgradeModal'));
  if (hyguruModalFn >= 0) {
    const afterHyguru = lines.findIndex((l, i) => i > hyguruModalFn && l.startsWith('type OpenQBankWorkerResponse'));
    const typeWorker = lines.findIndex((l) => l.startsWith('type OpenQBankWorkerResponse'));
    // remove showHyGuru block until type OpenQBankWorkerResponse is gone - already removed send
    const hyg2 = lines.findIndex((l) => l.startsWith('const showHyGuruUpgradeModal'));
    const gen2 = lines.findIndex((l) => l.startsWith('type GenerateCardsResponse'));
    if (hyg2 >= 0 && gen2 > hyg2) lines.splice(hyg2, gen2 - hyg2);
  }
}

// Remove OpenQBankWorkerResponse type block
const workerType = lines.findIndex((l) => l.startsWith('type OpenQBankWorkerResponse'));
const learning = lines.findIndex((l) => l.startsWith('type LearningFlagResponse'));
if (workerType >= 0 && learning > workerType) {
  lines.splice(workerType, learning - workerType);
}

const canonical = lines.findIndex((l) => l.startsWith('const CANONICAL_ORGAN_SYSTEMS'));
const afterPayload = lines.findIndex((l) => l.trim() === '};' && lines[lines.indexOf(l) - 1]?.includes('educational_objective'));
// find buildQuestionDataPayload end
const buildEnd = lines.findIndex((l, i) => {
  if (i < 100) return false;
  return l === '};' && lines[i - 1]?.includes('references:');
});
if (canonical >= 0 && buildEnd > canonical) {
  lines.splice(canonical, buildEnd - canonical + 1);
}

let s = lines.join('\n');

const imports = `import {
    CARD_POLL_CHECK_OFFSETS_MS,
    calculateCardPollProgress,
    isOpenQbankTier,
    isOpenQbankFree,
    isOpenQbankPro,
    isOpenQbankAdmin,
    isLeadInCard,
    shouldShowOpenQbankGenerateButton,
    shouldApplyOpenQbankCachedPreview,
    isExtensionDarkSurface,
} from './tierAccess';
import { sendOpenQBankRequest } from '../shared/request';
import { CANONICAL_ORGAN_SYSTEMS, resolveOrganSystem } from '../shared/organSystems';
import {
    updateCustomCardFabVisibility,
    removeCustomCardFab,
} from './customCardFab';
import { OPENQBANK_INJECTED_TOKEN_CSS } from './openqbankTokens';
import { DISCLAIMER_TEXT } from '../disclaimer';

import type { Platform, QuestionData, QuestionFingerprint } from '@extract';
import {
    buildQuestionDataPayload,
    getQuestionContent,
    getQuestionFingerprint,
    getPlatformFromLocation,
} from '@extract';
`;

s = s.replace(/import \{[\s\S]*?\} from '\.\/hyguruAccess';[\s\S]*?from '\.\/customCardFab';[\s\S]*?from '\.\.\/disclaimer';\n\n/, `${imports}\n`);

s = s.replace(/isHyGuruTier\([^)]*\)/g, 'false');
s = s.replace(/isPaidHyGuruTier\([^)]*\)/g, 'false');
s = s.replace(/HyGuruContentScope/g, "'full' | 'partial'");
s = s.replace(/LocalCardsEnvelope/g, 'never');
s = s.replace(/buildCacheIdentity|encodeLocalCardsEnvelope|decideLocalCacheRead|contentScopeForTier/g, 'undefined as never');
s = s.replace(/\n\s*renderHyGuruModal\(\);/g, '');
s = s.replace(/\n\s*closeHyGuruModal\(\);/g, '');
s = s.replace(/\n\s*openHyGuruModal\(\);/g, '');
s = s.replace(/getHyGuruLogoUrl\(\)/g, "getSafeExtensionUrl('logo.png')");

fs.writeFileSync(file, s);
console.log('Rebuilt', file, 'lines:', s.split('\n').length);
