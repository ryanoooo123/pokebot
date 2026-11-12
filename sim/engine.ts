// Heads-up no-limit hold'em engine.
import { evaluate, Rng } from "./cards";

export type Decision =
    | { kind: "fold" }
    | { kind: "check" }
    | { kind: "call" }
    | { kind: "raiseTo"; amount: number };

export type Street = 0 | 1 | 2 | 3;

export interface TableView {
    hole: readonly number[];
    board: readonly number[];
    street: Street;
    /** Total pot including bets on the current street (what PokerNow shows as "total"). */
    pot: number;
    /** Pot from previous streets only. */
    prevStreetPot: number;
    toCall: number;
    myBet: number;
    currentBet: number;
    minRaiseTo: number;
    /** Chips behind (not yet in the pot). */
    stack: number;
    bigBlind: number;
    isButton: boolean;
}

export interface Player {
    readonly name: string;
    decide(view: TableView, rng: Rng): Decision;
}

export interface HandConfig {
    bigBlind: number;
    startStack: number;
}

const MAX_ACTIONS_PER_STREET = 40;
const BOARD_SIZE_BY_STREET = [0, 3, 4, 5];

interface HandState {
    stacks: number[];
    bets: number[];
    folded: [boolean, boolean];
    prevPot: number;
    lastRaiseSize: number;
}

function runStreet(
    players: readonly Player[], st: HandState, holes: number[][], board: number[],
    street: Street, firstToAct: number, button: number, cfg: HandConfig, rng: Rng,
): void {
    const acted = [false, false];
    let idx = firstToAct;

    for (let n = 0; n < MAX_ACTIONS_PER_STREET; n++) {
        if (st.folded[0] || st.folded[1]) return;

        const currentBet = Math.max(st.bets[0], st.bets[1]);
        const settled = (i: number) => st.bets[i] === currentBet || st.stacks[i] === 0;
        if (acted[0] && acted[1] && settled(0) && settled(1)) return;
        if (st.stacks[idx] === 0 || (acted[idx] && settled(idx) && st.stacks[1 - idx] === 0)) {
            acted[idx] = true;
            idx = 1 - idx;
            continue;
        }

        const toCall = currentBet - st.bets[idx];
        const view: TableView = {
            hole: holes[idx], board, street,
            pot: st.prevPot + st.bets[0] + st.bets[1],
            prevStreetPot: st.prevPot,
            toCall, myBet: st.bets[idx], currentBet,
            minRaiseTo: currentBet + Math.max(st.lastRaiseSize, cfg.bigBlind),
            stack: st.stacks[idx], bigBlind: cfg.bigBlind, isButton: idx === button,
        };
        applyDecision(st, idx, players[idx].decide(view, rng), view, acted);
        acted[idx] = true;
        idx = 1 - idx;
    }
}

function applyDecision(st: HandState, idx: number, d: Decision, v: TableView, acted: boolean[]): void {
    const put = (amount: number) => {
        const chips = Math.min(amount, st.stacks[idx]);
        st.stacks[idx] -= chips;
        st.bets[idx] += chips;
    };

    if (d.kind === "fold" || (d.kind === "check" && v.toCall > 0)) {
        st.folded[idx] = true;
        return;
    }
    if (d.kind === "check") return;
    if (d.kind === "call" || v.stack <= v.toCall || st.stacks[1 - idx] === 0) {
        put(v.toCall);
        return;
    }

    const maxTo = v.myBet + v.stack;
    const target = Math.min(Math.max(Math.round(d.amount), v.minRaiseTo), maxTo);
    const raiseSize = target - v.currentBet;
    if (raiseSize >= st.lastRaiseSize) st.lastRaiseSize = raiseSize;
    put(target - v.myBet);
    acted[1 - idx] = false;
}

/**
 * Plays one hand. Returns each seat's net chip result.
 * The button posts the small blind and acts first preflop.
 */
export function playHand(players: readonly Player[], button: number, deck: readonly number[], cfg: HandConfig, rng: Rng): [number, number] {
    const bb = 1 - button;
    const holes = [[deck[0], deck[2]], [deck[1], deck[3]]];
    const fullBoard = deck.slice(4, 9);
    const st: HandState = {
        stacks: [cfg.startStack, cfg.startStack],
        bets: [0, 0],
        folded: [false, false],
        prevPot: 0,
        lastRaiseSize: cfg.bigBlind,
    };

    const post = (i: number, amt: number) => { st.stacks[i] -= amt; st.bets[i] += amt; };
    post(button, cfg.bigBlind / 2);
    post(bb, cfg.bigBlind);

    for (let street = 0 as Street; street <= 3; street = (street + 1) as Street) {
        const board = fullBoard.slice(0, BOARD_SIZE_BY_STREET[street]);
        const bothHaveChips = st.stacks[0] > 0 && st.stacks[1] > 0;
        if (street === 0 || bothHaveChips) {
            runStreet(players, st, holes, board, street, street === 0 ? button : bb, button, cfg, rng);
        }
        st.prevPot += st.bets[0] + st.bets[1];
        st.bets = [0, 0];
        st.lastRaiseSize = cfg.bigBlind;
        if (st.folded[0] || st.folded[1]) break;
    }

    // Return any uncalled chips is implicit: callers can only match, so pots are equal
    // except when a short stack is all-in; refund the difference.
    const invested = [cfg.startStack - st.stacks[0], cfg.startStack - st.stacks[1]];
    const matched = Math.min(invested[0], invested[1]);
    const pot = matched * 2;
    const refund = invested.map(x => x - matched);

    let share: [number, number];
    if (st.folded[0]) share = [0, pot];
    else if (st.folded[1]) share = [pot, 0];
    else {
        const s0 = evaluate([...holes[0], ...fullBoard]);
        const s1 = evaluate([...holes[1], ...fullBoard]);
        share = s0 > s1 ? [pot, 0] : s1 > s0 ? [0, pot] : [pot / 2, pot / 2];
    }
    return [share[0] + refund[0] - invested[0], share[1] + refund[1] - invested[1]];
}
