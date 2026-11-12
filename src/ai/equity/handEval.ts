// Card = integer 0..51. rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.
// Shared by the extension (equityAi.ts) and the simulator (sim/).

export type Rng = () => number;

export const HAND_CATEGORY = {
    HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
    FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
} as const;

const CATEGORY_SHIFT = 20;

export function rankOf(card: number): number { return card >> 2; }
export function suitOf(card: number): number { return card & 3; }

/** Seeded PRNG (mulberry32) so deals are reproducible. */
export function makeRng(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function shuffledDeck(rng: Rng): number[] {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

/** Highest straight in a 13-bit rank mask, as a rank index (3 = five-high wheel), or -1. */
function straightHigh(mask: number): number {
    const withLowAce = (mask << 1) | ((mask >> 12) & 1);
    for (let hi = 13; hi >= 4; hi--) {
        if (((withLowAce >> (hi - 4)) & 31) === 31) return hi - 1;
    }
    return -1;
}

function topRanks(mask: number, count: number): number[] {
    const out: number[] = [];
    for (let r = 12; r >= 0 && out.length < count; r--) {
        if (mask & (1 << r)) out.push(r);
    }
    return out;
}

function score(category: number, kickers: number[]): number {
    let s = 0;
    for (let i = 0; i < 5; i++) s = (s << 4) | (kickers[i] ?? 0);
    return (category << CATEGORY_SHIFT) | s;
}

export function categoryOf(handScore: number): number {
    return handScore >> CATEGORY_SHIFT;
}

/** Scores the best 5-card hand out of 5..7 cards. Higher is better. */
export function evaluate(cards: readonly number[]): number {
    const rankCount = new Array<number>(13).fill(0);
    const suitMask = [0, 0, 0, 0];
    const suitCount = [0, 0, 0, 0];
    let rankMask = 0;

    for (const c of cards) {
        const r = rankOf(c), s = suitOf(c);
        rankCount[r]++;
        suitMask[s] |= 1 << r;
        suitCount[s]++;
        rankMask |= 1 << r;
    }

    const flushSuit = suitCount.findIndex(n => n >= 5);
    if (flushSuit >= 0) {
        const sf = straightHigh(suitMask[flushSuit]);
        if (sf >= 0) return score(HAND_CATEGORY.STRAIGHT_FLUSH, [sf]);
    }

    const quads: number[] = [], trips: number[] = [], pairs: number[] = [];
    for (let r = 12; r >= 0; r--) {
        if (rankCount[r] === 4) quads.push(r);
        else if (rankCount[r] === 3) trips.push(r);
        else if (rankCount[r] === 2) pairs.push(r);
    }

    if (quads.length > 0) {
        return score(HAND_CATEGORY.QUADS, [quads[0], ...topRanks(rankMask & ~(1 << quads[0]), 1)]);
    }
    if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
        const pairRank = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
        return score(HAND_CATEGORY.FULL_HOUSE, [trips[0], pairRank]);
    }
    if (flushSuit >= 0) return score(HAND_CATEGORY.FLUSH, topRanks(suitMask[flushSuit], 5));

    const straight = straightHigh(rankMask);
    if (straight >= 0) return score(HAND_CATEGORY.STRAIGHT, [straight]);

    if (trips.length > 0) {
        return score(HAND_CATEGORY.TRIPS, [trips[0], ...topRanks(rankMask & ~(1 << trips[0]), 2)]);
    }
    if (pairs.length >= 2) {
        const rest = rankMask & ~(1 << pairs[0]) & ~(1 << pairs[1]);
        return score(HAND_CATEGORY.TWO_PAIR, [pairs[0], pairs[1], ...topRanks(rest, 1)]);
    }
    if (pairs.length === 1) {
        return score(HAND_CATEGORY.PAIR, [pairs[0], ...topRanks(rankMask & ~(1 << pairs[0]), 3)]);
    }
    return score(HAND_CATEGORY.HIGH, topRanks(rankMask, 5));
}

/**
 * Monte Carlo equity of `hole` vs one uniformly random opponent hand.
 * Ties count as half a win.
 */
export function equityVsRandom(hole: readonly number[], board: readonly number[], samples: number, rng: Rng): number {
    const used = new Set<number>([...hole, ...board]);
    const remaining: number[] = [];
    for (let c = 0; c < 52; c++) if (!used.has(c)) remaining.push(c);

    const need = 2 + (5 - board.length);
    let wins = 0;
    const pick = remaining.slice();

    for (let i = 0; i < samples; i++) {
        // Partial Fisher-Yates: draw `need` cards without replacement.
        for (let k = 0; k < need; k++) {
            const j = k + Math.floor(rng() * (pick.length - k));
            [pick[k], pick[j]] = [pick[j], pick[k]];
        }
        const fullBoard = [...board, ...pick.slice(2, need)];
        const mine = evaluate([...hole, ...fullBoard]);
        const theirs = evaluate([pick[0], pick[1], ...fullBoard]);
        wins += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
    }
    return wins / samples;
}
