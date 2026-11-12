// Run: node sim-build/sim/sim.test.js
import assert from "node:assert/strict";
import { categoryOf, equityVsRandom, evaluate, HAND_CATEGORY, makeRng, shuffledDeck } from "./cards";
import { playHand } from "./engine";
import { callingStation, maniac, pokerNowBot, randomPlayer, rock } from "./players";
import { CONFIG, silenceBotLogs } from "./match";

const RANKS = "23456789TJQKA", SUITS = "cdhs";
const c = (s: string) => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]);
const hand = (s: string) => s.split(" ").map(c);
const cat = (s: string) => categoryOf(evaluate(hand(s)));
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.info(`ok - ${name}`); };

test("detects every hand category", () => {
    assert.equal(cat("Ah Kd 9c 7s 2h 3d 4c"), HAND_CATEGORY.HIGH);
    assert.equal(cat("Ah Ad 9c 7s 2h 3d Jc"), HAND_CATEGORY.PAIR);
    assert.equal(cat("Ah Ad 9c 9s 2h 3d Jc"), HAND_CATEGORY.TWO_PAIR);
    assert.equal(cat("Ah Ad Ac 9s 2h 3d Jc"), HAND_CATEGORY.TRIPS);
    assert.equal(cat("Ah 2d 3c 4s 5h Kd Jc"), HAND_CATEGORY.STRAIGHT);
    assert.equal(cat("Ah Kh 3h 4h 9h Kd Jc"), HAND_CATEGORY.FLUSH);
    assert.equal(cat("Ah Ad Ac 9s 9h 3d Jc"), HAND_CATEGORY.FULL_HOUSE);
    assert.equal(cat("Ah Ad Ac As 9h 3d Jc"), HAND_CATEGORY.QUADS);
    assert.equal(cat("5h 6h 7h 8h 9h Ad Ac"), HAND_CATEGORY.STRAIGHT_FLUSH);
});

test("orders hands correctly", () => {
    assert.ok(evaluate(hand("Ah Ad Kc 7s 2h")) > evaluate(hand("Ah Ad Qc 7s 2h")), "kicker");
    assert.ok(evaluate(hand("6h 2d 3c 4s 5h")) > evaluate(hand("Ah 2d 3c 4s 5h")), "wheel is lowest straight");
    assert.ok(evaluate(hand("Kh Kd Kc 2s 2h 2d 3c")) > evaluate(hand("Qh Qd Qc As Ah 2d 3c")), "full house by trips");
    assert.equal(evaluate(hand("Ah Kd Qc Js 9h 2d 3c")), evaluate(hand("As Kh Qd Jc 9s 4d 5c")), "split pot");
});

test("equity is sane", () => {
    const rng = makeRng(7);
    const aces = equityVsRandom(hand("Ah Ad"), [], 4000, rng);
    const trash = equityVsRandom(hand("7h 2d"), [], 4000, rng);
    assert.ok(aces > 0.82 && aces < 0.88, `AA ~85%, got ${aces}`);
    assert.ok(trash > 0.30 && trash < 0.38, `72o ~34%, got ${trash}`);
});

test("chips are conserved and stacks never go negative", () => {
    silenceBotLogs();
    const rng = makeRng(99);
    const pool = [pokerNowBot, callingStation, maniac, randomPlayer, rock];
    for (let i = 0; i < 4000; i++) {
        const a = pool[i % pool.length], b = pool[(i * 7 + 3) % pool.length];
        const [x, y] = playHand([a, b], i & 1, shuffledDeck(rng), CONFIG, rng);
        assert.equal(x + y, 0, "zero-sum");
        assert.ok(Math.abs(x) <= CONFIG.startStack, "cannot win/lose more than a stack");
    }
});

test("folding to a raise loses only the blind", () => {
    const folder = { name: "F", decide: () => ({ kind: "fold" as const }) };
    const raiser = { name: "R", decide: () => ({ kind: "raiseTo" as const, amount: 60 }) };
    const [r, f] = playHand([raiser, folder], 0, shuffledDeck(makeRng(1)), CONFIG, makeRng(2));
    assert.equal(f, -CONFIG.bigBlind);
    assert.equal(r, CONFIG.bigBlind);
});

console.info(`\n${passed} tests passed`);
