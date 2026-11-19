import { describe, expect, it } from 'vitest';
import {
    CARD_POLL_CHECK_OFFSETS_MS,
    calculateCardPollProgress,
    isOpenQbankTier,
    isOpenQbankFree,
    isOpenQbankPro,
    isOpenQbankAdmin,
    nextPollDelayMs,
    shouldGiveUpPolling,
    shouldShowOpenQbankGenerateButton,
    shouldApplyOpenQbankCachedPreview,
    isExtensionDarkSurface,
} from './tierAccess';
import { BYOK_SCHEMA, BYOK_SYSTEM_PROMPT } from '../selection/byokPrompt';

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
        const start = 1_000_000;
        expect(nextPollDelayMs(start, start + 1000)).toBe(4000);
        expect(shouldGiveUpPolling(start, start + 70000)).toBe(true);
    });

    it('progress curve reaches ~80% at first poll', () => {
        expect(calculateCardPollProgress(5000)).toBeCloseTo(80, 1);
    });

    it('reads prefers-color-scheme for extension chrome', () => {
        expect(isExtensionDarkSurface()).toBe(false);
    });
});

describe('BYOK cloze prompt and schema', () => {
    it('enforces cloze-only schema with required cloze and notes fields', () => {
        expect(BYOK_SCHEMA.properties).toHaveProperty('cloze');
        expect(BYOK_SCHEMA.properties).toHaveProperty('notes');
        expect(BYOK_SCHEMA.required).toContain('cloze');
        expect(BYOK_SCHEMA.required).toContain('notes');
        expect(BYOK_SCHEMA.additionalProperties).toBe(false);
    });

    it('instructs model for standard Anki cloze syntax in system prompt', () => {
        expect(BYOK_SYSTEM_PROMPT).toContain('CLOZE');
        expect(BYOK_SYSTEM_PROMPT).toContain('{{c1::');
    });
});
