import { describe, expect, it } from 'vitest';
import {
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
import { BYOK_PROMPTS, toPrefill } from '../selection/byokPrompt';

describe('tierAccess', () => {
    it('identifies admin users with isOpenQbankAdmin', () => {
        expect(isOpenQbankAdmin(null, 'admin')).toBe(true);
        expect(isOpenQbankAdmin('admin', null)).toBe(true);
        expect(isOpenQbankAdmin(null, 'free')).toBe(false);
    });

    it('identifies openQbank tiers', () => {
        expect(isOpenQbankTier(null, 'free')).toBe(true);
        expect(isOpenQbankTier(null, 'pro')).toBe(true);
        expect(isOpenQbankFree(null, 'free')).toBe(true);
        expect(isOpenQbankFree(null, 'pro')).toBe(false);
        expect(isOpenQbankPro(null, 'pro')).toBe(true);
    });

    it('gates Generate button for openQbank inline preview', () => {
        expect(shouldShowOpenQbankGenerateButton(true, false)).toBe(true);
        expect(shouldShowOpenQbankGenerateButton(true, true)).toBe(false);
    });

    it('applies cached preview when server reports already_cached', () => {
        const payload = '{"cards":[{"cardType":"Basic","front":"Q","back":"A"}]}';
        expect(shouldApplyOpenQbankCachedPreview(true, payload)).toBe(true);
        expect(shouldApplyOpenQbankCachedPreview(false, payload)).toBe(false);
    });

    it('poll timing matches generation timeout window', () => {
        expect(CARD_POLL_CHECK_OFFSETS_MS[0]).toBe(5000);
        expect(CARD_POLL_CHECK_OFFSETS_MS.at(-1)).toBe(70000);
    });

    it('progress curve reaches ~80% at first poll', () => {
        expect(calculateCardPollProgress(5000)).toBeCloseTo(80, 1);
    });

    it('reads prefers-color-scheme for extension chrome', () => {
        expect(isExtensionDarkSurface()).toBe(false);
    });
});

describe('BYOK draft types', () => {
    it('uses a generic prompt for each type', () => {
        expect(BYOK_PROMPTS.default).toContain('{{c1::');
        expect(BYOK_PROMPTS.default).toContain('one or two');
        expect(BYOK_PROMPTS.vignette).toContain('ordered steps');
    });

    it('preserves sequential steps and cloze text during prefill', () => {
        const steps = [{ label: 'Diagnosis', value: 'Asthma' }, { label: 'Test', value: 'Spirometry' }];
        expect(toPrefill({ card_type: 'sequential', front: 'A case', steps })).toMatchObject({ cardType: 'sequential', steps });
        expect(toPrefill({ card_type: 'cloze', front: '{{c1::Asthma}}' })).toMatchObject({ cardType: 'cloze', front: '{{c1::Asthma}}' });
    });
});
