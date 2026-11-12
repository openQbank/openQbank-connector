export const CARD_GENERATION_TIMEOUT_MS = 70000;
export const CARD_POLL_INTERVAL_MS = 5000;
export const CARD_POLL_CHECK_OFFSETS_MS = Array.from(
    { length: Math.ceil(CARD_GENERATION_TIMEOUT_MS / CARD_POLL_INTERVAL_MS) },
    (_, index) => (index + 1) * CARD_POLL_INTERVAL_MS,
) as readonly number[];

export const calculateCardPollProgress = (elapsedMs: number): number => {
    if (elapsedMs <= 0) return 0;
    const tFirst = CARD_POLL_INTERVAL_MS;
    if (elapsedMs <= tFirst) {
        const u = elapsedMs / tFirst;
        const sig = (x: number) => 1 / (1 + Math.exp(-6 * (x - 0.5)));
        const s0 = sig(0);
        const s1 = sig(1);
        const norm = (sig(u) - s0) / (s1 - s0);
        return Math.min(80, Math.max(0, norm * 80));
    }
    const extraMs = elapsedMs - tFirst;
    const trickle = 80 + 15 * (1 - Math.exp(-extraMs / 10000));
    return Math.min(95, trickle);
};

export const isOpenQbankTier = (userType: string | null | undefined, userTier: string | null | undefined): boolean => {
    const tier = (userTier || '').trim().toLowerCase();
    return tier === 'free' || tier === 'pro' || tier === 'pro_6mo' || tier === 'admin'
        || (userType || '').trim().toLowerCase() === 'admin';
};

export const isOpenQbankFree = (_userType: string | null | undefined, userTier: string | null | undefined): boolean => {
    const tier = (userTier || '').trim().toLowerCase();
    return tier === 'free';
};

export const isOpenQbankPro = (userType: string | null | undefined, userTier: string | null | undefined): boolean => {
    const tier = (userTier || '').trim().toLowerCase();
    return tier === 'pro' || tier === 'pro_6mo' || tier === 'admin'
        || (userType || '').trim().toLowerCase() === 'admin';
};

export const isOpenQbankAdmin = (userType: string | null | undefined, userTier: string | null | undefined): boolean => {
    const tier = (userTier || '').trim().toLowerCase();
    const type = (userType || '').trim().toLowerCase();
    return tier === 'admin' || type === 'admin';
};

export const shouldShowOpenQbankGenerateButton = (
    customAnkiEnabled: boolean,
    hasCardsDisplayed: boolean,
    aiFlashcardsEnabled: boolean = true,
): boolean => Boolean(customAnkiEnabled && aiFlashcardsEnabled) && !hasCardsDisplayed;

export const isLeadInCard = (card: {
    cardType?: string;
    front?: string;
    clozeText?: string;
    isLeadIn?: boolean;
} | null | undefined): boolean => {
    if (!card) return false;
    if (card.isLeadIn) return true;
    const type = (card.cardType || '').trim().toLowerCase();
    if (type === 'leadin' || type === 'lead-in' || type === 'lead_in') return true;
    const front = card.front || '';
    return front.includes('leadin-vignette') || front.includes('leadin-question');
};

export const shouldApplyOpenQbankCachedPreview = (
    alreadyCached: boolean,
    cards: string | null | undefined,
): boolean => Boolean(alreadyCached && cards && cards.trim());

export const isExtensionDarkSurface = (): boolean => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
};

export const isHyGuruAccount = (userType: string | null | undefined, userTier: string | null | undefined): boolean => {
    const type = (userType || '').trim().toLowerCase();
    const tier = (userTier || '').trim().toLowerCase();
    return type === 'hyguru' || tier.startsWith('hyguru-');
};

export const nextPollDelayMs = (pollStartedAt: number, now: number = Date.now()): number | null => {
    for (const offset of CARD_POLL_CHECK_OFFSETS_MS) {
        const target = pollStartedAt + offset;
        if (now < target) return target - now;
    }
    return null;
};

export const shouldGiveUpPolling = (pollStartedAt: number, now: number = Date.now()): boolean =>
    now >= pollStartedAt + CARD_GENERATION_TIMEOUT_MS;
