#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src/content/index.ts');
const lines = fs.readFileSync(file, 'utf8').split('\n');

const deleteRanges = [
    [101, 152],
    [2468, 2471],
    [2480, 3110],
];
for (const [start, end] of deleteRanges.sort((a, b) => b[0] - a[0])) {
    lines.splice(start - 1, end - start + 1);
}

let s = lines.join('\n');

const importBlock = `import {
    CARD_POLL_CHECK_OFFSETS_MS,
    calculateCardPollProgress,
    isOpenQbankTier,
    isOpenQbankFree,
    isOpenQbankPro,
    isOpenQbankAdmin,
    shouldShowOpenQbankGenerateButton,
    shouldApplyOpenQbankCachedPreview,
    isExtensionDarkSurface,
} from './tierAccess';
import { sendOpenQBankRequest } from '../shared/request';
import { CANONICAL_ORGAN_SYSTEMS, resolveOrganSystem } from '../shared/organSystems';`;

s = s.replace(/import \{[\s\S]*?\} from '\.\/hyguruAccess';/, importBlock);

s = s.replace(
    /type OpenQBankWorkerResponse[\s\S]*?^};\n\nconst sendOpenQBankRequest[\s\S]*?^};\n\n/,
    '',
);

s = s.replace(/isHyGuruTier\([^)]*\)/g, 'false');
s = s.replace(/isPaidHyGuruTier\([^)]*\)/g, 'false');
s = s.replace(/shouldApplyHyGuruCachedPreview/g, 'shouldApplyOpenQbankCachedPreview');
s = s.replace(/\n\s*renderHyGuruModal\(\);/g, '');
s = s.replace(/\n\s*closeHyGuruModal\(\);/g, '');
s = s.replace(/\n\s*openHyGuruModal\(\);/g, '');
s = s.replace(/HyGuruContentScope/g, "'full' | 'partial'");
s = s.replace(/,\s*type LocalCardsEnvelope,\s*/g, ',\n');
s = s.replace(/\s*buildCacheIdentity,\s*/g, '');
s = s.replace(/\s*contentScopeForTier,\s*/g, '');
s = s.replace(/\s*decideLocalCacheRead,\s*/g, '');
s = s.replace(/\s*encodeLocalCardsEnvelope,\s*/g, '');
s = s.replace(/\s*isLeadInCard,\s*/g, '');

fs.writeFileSync(file, s);
console.log('Stripped HyGuru blocks from src/content/index.ts');
