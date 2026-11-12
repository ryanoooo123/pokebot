import { categoryOf, equityVsRandom, evaluate, HAND_CATEGORY, rankOf, Rng, suitOf } from "./cards";
import { Decision, Player, TableView } from "./engine";
import { getAction } from "../src/ai/ai";
import { FlopPhase, PreflopPhase, RiverPhase, TurnPhase } from "../src/state";
import {
    FlushRank, FourOfKindRank, FullHouseRank, HighCardRank, PairRank, RoyalFlushRank,
    StraightFlushRank, StraightRank, ThreeOfKindRank, TwoPairRank,
} from "../src/rank";

const check = (v: TableView): Decision => (v.toCall > 0 ? { kind: "fold" } : { kind: "check" });
const potRaise = (v: TableView, fraction: number): Decision =>
    ({ kind: "raiseTo", amount: v.currentBet + fraction * (v.pot + v.toCall) });

// ---------- Adapter: the real PokerNow bot (src/ai/ai.ts getAction) ----------

const PHASES = [PreflopPhase, FlopPhase, TurnPhase, RiverPhase];
const SUITS: CardSuit[] = ["c", "d", "h", "s"];

function toBotCard(card: number): Card {
    const code = (rankOf(card) + 2) as CardValueCode;
    const names: Record<number, CardValueName> = { 14: "A", 13: "K", 12: "Q", 11: "J" };
    return { value: { name: names[code] ?? (String(code) as CardValueName), code }, suit: SUITS[suitOf(card)] };
}

function toBotRank(cards: readonly number[]): HandRank {
    const s = evaluate(cards.length >= 5 ? cards : [...cards]);
    switch (categoryOf(s)) {
        case HAND_CATEGORY.PAIR: return PairRank;
        case HAND_CATEGORY.TWO_PAIR: return TwoPairRank;
        case HAND_CATEGORY.TRIPS: return ThreeOfKindRank;
        case HAND_CATEGORY.STRAIGHT: return StraightRank;
        case HAND_CATEGORY.FLUSH: return FlushRank;
        case HAND_CATEGORY.FULL_HOUSE: return FullHouseRank;
        case HAND_CATEGORY.QUADS: return FourOfKindRank;
        case HAND_CATEGORY.STRAIGHT_FLUSH: return (s & 0xF0000) >> 16 === 12 ? RoyalFlushRank : StraightFlushRank;
        default: return HighCardRank;
    }
}

/** Maps the bot's coarse actions to concrete bets, mimicking PokerNow's raise buttons. */
export const pokerNowBot: Player = {
    name: "PokerNowBot",
    decide(v) {
        const hand = v.hole.map(toBotCard);
        const board = v.board.map(toBotCard);
        const state: State = {
            phase: PHASES[v.street],
            handRank: toBotRank([...v.hole, ...v.board]),
            hand, board, handPlusBoard: [...hand, ...board],
            bigBlind: v.bigBlind, stack: v.stack, pot: v.pot,
            prevPhasePot: v.prevStreetPot, toCall: v.toCall,
        };
        let action: Action;
        try { action = getAction(state); } catch { action = { type: "check_or_fold" }; }

        if (action.type === "check_or_fold") return check(v);
        if (action.type === "call") return { kind: "call" };
        switch (action.raiseAmount) {
            case "1/2_pot": return potRaise(v, 0.5);
            case "pot": return potRaise(v, 1);
            case "all_in": return { kind: "raiseTo", amount: v.myBet + v.stack };
            default: return { kind: "raiseTo", amount: v.minRaiseTo };
        }
    },
};

// ---------- Simple fixed opponents ----------

export const callingStation: Player = {
    name: "CallingStation",
    decide: v => (v.toCall > 0 ? { kind: "call" } : { kind: "check" }),
};

export const maniac: Player = {
    name: "Maniac",
    decide: (v, rng) => (rng() < 0.6 ? potRaise(v, 1) : v.toCall > 0 ? { kind: "call" } : { kind: "check" }),
};

export const randomPlayer: Player = {
    name: "Random",
    decide: (v, rng) => {
        const r = rng();
        if (r < 0.25) return check(v);
        if (r < 0.7) return v.toCall > 0 ? { kind: "call" } : { kind: "check" };
        return potRaise(v, 0.5 + rng());
    },
};

/** Tight-passive: only continues with strong equity, rarely raises. */
export const rock: Player = {
    name: "Rock",
    decide: (v, rng) => {
        const eq = equityVsRandom(v.hole, v.board, 60, rng);
        if (eq > 0.8) return potRaise(v, 0.75);
        if (eq > 0.6) return v.toCall > 0 ? { kind: "call" } : { kind: "check" };
        return check(v);
    },
};

// ---------- Tunable equity strategy (the thing we brute-force) ----------

export interface EquityParams {
    /** Raise when equity vs a random hand is at least this. */
    raiseEq: number;
    /** Call when equity >= pot odds + this margin. */
    callMargin: number;
    /** Chance to bet as a bluff when checked to. */
    bluffFreq: number;
    /** Bet size as a fraction of the pot. */
    betFrac: number;
    /** Monte Carlo samples per decision. */
    samples: number;
}

export const DEFAULT_EQUITY: EquityParams = { raiseEq: 0.7, callMargin: 0.05, bluffFreq: 0.1, betFrac: 0.75, samples: 80 };

export function equityPlayer(p: EquityParams, name = "Equity"): Player {
    return {
        name,
        decide(v, rng) {
            const eq = equityVsRandom(v.hole, v.board, p.samples, rng);
            if (eq >= p.raiseEq) return potRaise(v, p.betFrac);
            if (v.toCall === 0) return rng() < p.bluffFreq ? potRaise(v, p.betFrac) : { kind: "check" };
            const potOdds = v.toCall / (v.pot + v.toCall);
            return eq >= potOdds + p.callMargin ? { kind: "call" } : { kind: "fold" };
        },
    };
}
