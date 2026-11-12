// Equity strategy found by the simulator sweep (sim/sweep.ts, 2026-11-12):
// raise when equity vs a random hand >= 60%, call when equity covers pot odds,
// never bluff, size raises at one pot.
import { equityVsRandom } from "./handEval";

export const EQUITY_PARAMS = {
    raiseEq: 0.6,
    callMargin: 0,
    bluffFreq: 0,
    /** In the browser we can afford many more samples than in the sweep. */
    samples: 3000,
} as const;

const SUIT_INDEX: Record<CardSuit, number> = { c: 0, d: 1, h: 2, s: 3 };

/** Bot Card -> evaluator integer (rank index 0..12 for 2..A, times 4, plus suit). */
function toInt(card: Card): number {
    return (card.value.code - 2) * 4 + SUIT_INDEX[card.suit];
}

export function equityAction(state: State, rng: () => number = Math.random): Action {
    const equity = equityVsRandom(state.hand.map(toInt), state.board.map(toInt), EQUITY_PARAMS.samples, rng);

    if (equity >= EQUITY_PARAMS.raiseEq) return { type: "raise", raiseAmount: "pot" };

    if (state.toCall === 0) {
        return rng() < EQUITY_PARAMS.bluffFreq ? { type: "raise", raiseAmount: "pot" } : { type: "check_or_fold" };
    }

    const potOdds = state.toCall / (state.pot + state.toCall);
    return equity >= potOdds + EQUITY_PARAMS.callMargin ? { type: "call" } : { type: "check_or_fold" };
}
