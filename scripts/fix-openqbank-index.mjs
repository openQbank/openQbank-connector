#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src/content/index.ts');
let s = fs.readFileSync(file, 'utf8');

s = s.replace(
    /import \{\n    CANONICAL_ORGAN_SYSTEMS,\n    buildQuestionDataPayload,/,
    'import {\n    buildQuestionDataPayload,',
);
s = s.replace(/\n    resolveOrganSystem,\n\} from '@extract';/, "\n} from '@extract';");

s = s.replace(
    /type OpenQBankWorkerResponse[\s\S]*?^};\n\n(type GenerateCardsResponse)/m,
    '$1',
);

s = s.replace(
    /\} else if \(response\?\.status === 403 && dataObj\?\.code === 'HYGURU_UPGRADE_REQUIRED'\) \{\s*showHyGuruUpgradeModal\(\);\s*\}/,
    '',
);

const cardFilter = `
type ParsedPreviewCard = { cardType?: string; front?: string; clozeText?: string; isLeadIn?: boolean };

const shouldHideIntegrativeCard = (card: ParsedPreviewCard | null | undefined): boolean => {
    if (!card) return false;
    if (card.isLeadIn) return true;
    const type = (card.cardType || '').trim().toLowerCase();
    return type === 'leadin' || type === 'lead-in' || type === 'lead_in';
};
`;

if (!s.includes('shouldHideIntegrativeCard')) {
    s = s.replace(/(type GenerateCardsResponse = \{)/, `${cardFilter}\n$1`);
}

s = s.replace(/!isLeadInCard\(/g, '!shouldHideIntegrativeCard(');
s = s.replace(/isLeadInCard\(/g, 'shouldHideIntegrativeCard(');

s = s.replace(
    /const currentHyGuruScope[\s\S]*?^};\n\nconst purgeAllLocalGeneratedCards/,
    'const purgeAllLocalGeneratedCards',
);

s = s.replace(
    /const persistGeneratedCardsLocally = \([\s\S]*?^};\n\nconst isOpenQbankCoreUser/,
    `const persistGeneratedCardsLocally = (
    questionId: string,
    cards: string,
    opts?: { lockedCount?: number },
) => {
    const lockedCount = opts?.lockedCount ?? inlineActionState.lockedCount ?? 0;
    questionStateCache.set(questionId, {
        generatedCardsText: cards,
        lockedCount,
        contentScope: null,
        cardsDoneQuestionId: questionId,
        flagDoneQuestionId: questionId,
        showPreview: true,
        activeCardIndex: inlineActionState.questionId === questionId ? inlineActionState.activeCardIndex : 0,
        revealedCardIndices: inlineActionState.questionId === questionId
            ? new Set(inlineActionState.revealedCardIndices)
            : new Set<number>(),
        modalZoomLevel: 0.95,
        userOwnedPreview: inlineActionState.questionId === questionId
            ? inlineActionState.userOwnedPreview
            : false,
        addedCardIndices: inlineActionState.questionId === questionId
            ? new Set(inlineActionState.addedCardIndices)
            : new Set<number>(),
    });
};

const isOpenQbankCoreUser`,
);

s = s.replace(
    /const isOpenQbankCoreUser = \(\): boolean =>\s*isOpenQbankTier\([^)]+\)\s*&& !false;/,
    'const isOpenQbankCoreUser = (): boolean => isOpenQbankTier(inlineActionState.userType, inlineActionState.userTier);',
);

s = s.replace(
    /const applyLocalEnvelope[\s\S]*?^};\n\nconst readGeneratedCardsLocally/,
    'const readGeneratedCardsLocally',
);

s = s.replace(
    /const readGeneratedCardsLocally = async \(questionId: string\): Promise<string \| null> => \{[\s\S]*?^};\nconst updateInlineQuestionState/,
    `const readGeneratedCardsLocally = async (questionId: string): Promise<string | null> => {
    const memory = questionStateCache.get(questionId);
    if (memory?.generatedCardsText) {
        if (inlineActionState.questionId === questionId) {
            inlineActionState.lockedCount = memory.lockedCount || 0;
            inlineActionState.contentScope = memory.contentScope;
            inlineActionState.userOwnedPreview = Boolean(memory.userOwnedPreview);
        }
        return memory.generatedCardsText;
    }
    return null;
};
const updateInlineQuestionState`,
);

s = s.replace(/const getHyGuruLogoUrl[\s\S]*?^};\n\n/m, '');

s = s.replace(/HYGURU_SUPPORT_URL/g, 'OPENQBANK_SUPPORT_URL');
s = s.replace(
    /const HYGURU_SUPPORT_URL = '[^']+';/,
    "const OPENQBANK_SUPPORT_URL = 'https://openqbank.com/support';",
);

s = s.replace(/ocb-button--hyguru-cta/g, 'ocb-button--cards-alt');
s = s.replace(/ocb-hyguru-ring-shift/g, 'ocb-ring-shift');
s = s.replace(/openhyguru/gi, 'openqbank');
s = s.replace(/#openhyguru-inline-actions-root/g, '#openqbank-inline-actions-root');
s = s.replace(/openhyguru-inline-actions-root/g, 'openqbank-inline-actions-root');

s = s.replace(/\s*isHyGuruModalOpen[\s\S]*?;(\n)/g, '$1');
s = s.replace(/isHyGuruModalOpen\??\s*:\s*boolean;?/g, '');
s = s.replace(/inlineActionState\.isHyGuruModalOpen\s*=\s*[^;]+;/g, '');
s = s.replace(/const modalWasOpen[\s\S]*?inlineActionState\.isHyGuruModalOpen = modalWasOpen;\s*/g, '');

s = s.replace(/currentHyGuruScope\(\)/g, "'full'");
s = s.replace(/contentScopeForTier\([^)]*\)/g, 'null');

fs.writeFileSync(file, s);
console.log('Fixed openQbank index.ts');
