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
