export { CARD_POLL_CHECK_OFFSETS_MS, calculateCardPollProgress } from '../shared/cardPolling';

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
