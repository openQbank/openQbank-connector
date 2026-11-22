const CARD_GENERATION_TIMEOUT_MS = 70000;
const CARD_POLL_INTERVAL_MS = 5000;
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
