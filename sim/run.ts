// Round robin: how does each strategy do against each opponent style?
// Usage: node sim-build/sim/run.js [deals=3000]
import { callingStation, DEFAULT_EQUITY, equityPlayer, maniac, pokerNowBot, randomPlayer, rock } from "./players";
import { runMatch, silenceBotLogs } from "./match";

const print = console.info.bind(console);
silenceBotLogs();

const deals = Number(process.argv[2] ?? 3000);
const heroes = [pokerNowBot, equityPlayer(DEFAULT_EQUITY)];
const villains = [callingStation, rock, maniac, randomPlayer, pokerNowBot, equityPlayer(DEFAULT_EQUITY)];

print(`Heads-up, 100bb, ${deals * 2} hands per matchup (duplicate). Result = hero bb/100 ± 95% CI\n`);
for (const hero of heroes) {
    for (const villain of villains) {
        const t0 = Date.now();
        const r = runMatch(hero, villain, deals, 1234);
        const sign = r.bbPer100 >= 0 ? "+" : "";
        print(`${r.hero.padEnd(12)} vs ${r.villain.padEnd(15)} ${sign}${r.bbPer100.toFixed(1).padStart(7)} ± ${r.ci95.toFixed(1).padStart(5)}   (${Date.now() - t0}ms)`);
    }
    print("");
}
