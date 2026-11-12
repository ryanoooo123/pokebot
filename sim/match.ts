import { makeRng, shuffledDeck } from "./cards";
import { HandConfig, Player, playHand } from "./engine";

export const CONFIG: HandConfig = { bigBlind: 20, startStack: 2000 }; // 100 big blinds, reset every hand

export interface MatchResult {
    hero: string;
    villain: string;
    hands: number;
    bbPer100: number;
    /** 95% confidence half-width, in bb/100. */
    ci95: number;
}

/**
 * Duplicate match: every deck is played twice with seats swapped, which cancels most card luck.
 */
export function runMatch(hero: Player, villain: Player, deals: number, seed: number): MatchResult {
    const dealRng = makeRng(seed);
    const playRng = makeRng(seed ^ 0x9E3779B9);
    let sum = 0, sumSq = 0;

    for (let i = 0; i < deals; i++) {
        const deck = shuffledDeck(dealRng);
        const button = i & 1;
        const a = playHand([hero, villain], button, deck, CONFIG, playRng)[0];
        const b = playHand([villain, hero], button, deck, CONFIG, playRng)[1];
        const pairBb = (a + b) / CONFIG.bigBlind;
        sum += pairBb;
        sumSq += pairBb * pairBb;
    }

    const mean = sum / deals;                          // bb per 2 hands
    const variance = Math.max(sumSq / deals - mean * mean, 0);
    const se = Math.sqrt(variance / deals);
    return { hero: hero.name, villain: villain.name, hands: deals * 2, bbPer100: mean * 50, ci95: 1.96 * se * 50 };
}

export function silenceBotLogs(): void {
    console.log = () => undefined;
}
