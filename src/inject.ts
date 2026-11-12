// Test harness: same decision loop as main.ts, but without chrome.* APIs,
// so it can be injected straight into a PokerNow tab and start on its own.
import { getAction } from "./ai/ai";
import { getState, isMyTurn, showHandIfPossible } from "./ui";
import { performAction, sanitizeAction } from "./action";

const LOOP_MS = 500;

type BotLogEntry = { at: number; state?: unknown; action?: unknown; error?: string };

declare global {
    interface Window { pokerBotLog: BotLogEntry[]; pokerBotStop: () => void; }
}

window.pokerBotLog = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;

function record(entry: BotLogEntry) {
    window.pokerBotLog = [...window.pokerBotLog, entry];
}

function loop() {
    if (stopped) return;

    if (!isMyTurn()) {
        showHandIfPossible();
        timer = setTimeout(loop, LOOP_MS);
        return;
    }

    try {
        const state = getState();
        const action = sanitizeAction(getAction(state), state);
        record({ at: Date.now(), state, action });
        performAction(action, () => { timer = setTimeout(loop, LOOP_MS * 2); });
    }
    catch (err) {
        record({ at: Date.now(), error: String(err) });
        timer = setTimeout(loop, LOOP_MS * 2);
    }
}

window.pokerBotStop = () => { stopped = true; clearTimeout(timer); };
loop();
