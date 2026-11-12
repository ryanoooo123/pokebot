import { equityAction } from "./equity/equityAi";
import { ifThenElseAction } from "./ifThenElse/ifThenElseAi";

/**
 * "equity"     = simulator sweep winner (default)
 * "ifThenElse" = the original hand-by-hand rules
 */
const STRATEGY: "equity" | "ifThenElse" = "equity";

export function getAction(state: State): Action {
    return STRATEGY === "equity" ? equityAction(state) : ifThenElseAction(state);
}
