// Brute-force search over EquityParams against a pool of opponent styles.
// Stage 1: every config, short matches. Stage 2: top configs re-run with long matches.
// Usage: node sim-build/sim/sweep.js [coarseDeals=1500] [fineDeals=10000]
import { cpus } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { callingStation, EquityParams, equityPlayer, maniac, pokerNowBot, randomPlayer, rock } from "./players";
import { runMatch, silenceBotLogs } from "./match";

const POOL = [callingStation, rock, maniac, randomPlayer, pokerNowBot];
const TOP_N = 8;
const SAMPLES = 60;

const GRID = {
    raiseEq: [0.6, 0.65, 0.7, 0.75, 0.8],
    callMargin: [-0.05, 0, 0.05, 0.1],
    bluffFreq: [0, 0.1, 0.2, 0.35],
    betFrac: [0.5, 0.75, 1],
};

interface Job { id: number; params: EquityParams; deals: number }
interface JobResult { id: number; params: EquityParams; avg: number; perOpponent: number[] }

function evaluateConfig(job: Job): JobResult {
    const hero = equityPlayer(job.params);
    const perOpponent = POOL.map((v, i) => runMatch(hero, v, job.deals, 1000 + i).bbPer100);
    const avg = perOpponent.reduce((a, b) => a + b, 0) / perOpponent.length;
    return { id: job.id, params: job.params, avg, perOpponent };
}

function allConfigs(): EquityParams[] {
    const out: EquityParams[] = [];
    for (const raiseEq of GRID.raiseEq)
        for (const callMargin of GRID.callMargin)
            for (const bluffFreq of GRID.bluffFreq)
                for (const betFrac of GRID.betFrac)
                    out.push({ raiseEq, callMargin, bluffFreq, betFrac, samples: SAMPLES });
    return out;
}

function runPool(jobs: Job[]): Promise<JobResult[]> {
    const workers = Math.max(1, Math.min(cpus().length - 1, jobs.length));
    const queue = [...jobs];
    const results: JobResult[] = [];
    return new Promise((resolve, reject) => {
        let alive = workers;
        for (let w = 0; w < workers; w++) {
            const worker = new Worker(__filename, { workerData: { worker: true } });
            const feed = () => {
                const job = queue.shift();
                if (job) worker.postMessage(job);
                else void worker.terminate();
            };
            worker.on("message", (r: JobResult) => {
                results.push(r);
                if (results.length % 20 === 0) process.stderr.write(`  ${results.length}/${jobs.length}\n`);
                feed();
            });
            worker.on("error", reject);
            worker.on("exit", () => { if (--alive === 0) resolve(results); });
            feed();
        }
    });
}

const fmt = (p: EquityParams) =>
    `raise≥${p.raiseEq.toFixed(2)} callMargin=${p.callMargin.toFixed(2)} bluff=${p.bluffFreq.toFixed(2)} bet=${p.betFrac.toFixed(2)}pot`;

async function main() {
    const print = console.info.bind(console);
    const coarse = Number(process.argv[2] ?? 1500);
    const fine = Number(process.argv[3] ?? 10000);
    const configs = allConfigs();

    print(`Stage 1: ${configs.length} configs × ${POOL.length} opponents × ${coarse * 2} hands`);
    const t0 = Date.now();
    const stage1 = await runPool(configs.map((params, id) => ({ id, params, deals: coarse })));
    const top = stage1.sort((a, b) => b.avg - a.avg).slice(0, TOP_N);
    print(`  done in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

    print(`Stage 2: top ${TOP_N} re-run with ${fine * 2} hands per opponent`);
    const stage2 = (await runPool(top.map(r => ({ id: r.id, params: r.params, deals: fine })))).sort((a, b) => b.avg - a.avg);

    print(`\nOpponents: ${POOL.map(p => p.name).join(", ")}  (bb/100 each)\n`);
    stage2.forEach((r, i) => {
        print(`#${i + 1}  avg ${r.avg.toFixed(1).padStart(7)} bb/100   ${fmt(r.params)}`);
        print(`     ${r.perOpponent.map(x => x.toFixed(0).padStart(6)).join(" ")}`);
    });
}

if (isMainThread) {
    main().catch(err => { console.error(err); process.exit(1); });
} else if (workerData?.worker) {
    silenceBotLogs();
    parentPort!.on("message", (job: Job) => parentPort!.postMessage(evaluateConfig(job)));
}
