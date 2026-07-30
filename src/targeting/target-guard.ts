/**
 * The Theatre of the Mind targeting guard.
 *
 * When a player uses an action that needs a target but has none selected, this
 * cancels the action *before any dice are rolled or resources spent*, shows a
 * picker of valid scene targets, applies the choice, and replays the action.
 *
 * Why `daggerheart.preUseAction` and not `preCreateChatMessage`: hooks are
 * synchronous and their return is tested with `=== false`, so an async handler
 * returns a truthy Promise and cancels nothing. And by the time a chat message
 * is created the workflow has already run — Hope/Fear and Stress are spent.
 * `preUseAction` fires ahead of all of it (daggerheart.js:16884).
 */
import { LOG_PREFIX, MODULE_ID, PRE_USE_ACTION_HOOK, SETTINGS } from "../constants.js";
import { TargetPickerApp } from "../ui/target-picker-app.js";
import { collectCandidates } from "./candidates.js";

/**
 * Actions currently being replayed by the guard. An entry means "let the next
 * `preUseAction` for this action through untouched" — so a replay can never
 * re-enter the picker and loop.
 */
const replaying = new Set<string>();

function actionKey(action: DhAction): string {
  return `${action.item?.uuid ?? "?"}:${action._id}`;
}

/** The action's declared target cap; `Infinity` when it declares none. */
function targetCap(action: DhAction): number {
  const amount = action.target?.amount;
  return typeof amount === "number" && amount > 0 ? amount : Number.POSITIVE_INFINITY;
}

export function registerTargetGuard(): void {
  Hooks.on(PRE_USE_ACTION_HOOK, onPreUseAction);
}

/**
 * Synchronous hook handler. Returning `false` aborts the action; the picker is
 * driven from a deliberately un-awaited async continuation.
 *
 * No `userId` check is needed here (unlike a chat-message hook): `use()` only
 * ever runs on the client that triggered it.
 */
function onPreUseAction(action: DhAction, config: DhActionConfig): boolean | void {
  const key = actionKey(action);

  // Our own replay — consume the pass and let the action run.
  if (replaying.has(key)) {
    replaying.delete(key);
    return;
  }

  if (game.settings.get(MODULE_ID, SETTINGS.enabled) !== true) return;

  // Not a targeted action.
  if (!config.hasTarget) return;

  // The action forces its own target and ignores user targets.
  if (config.targetUuid) return;

  // Self-targeted actions resolve to the caster; there is nothing to pick.
  const type = action.target?.type ?? null;
  if (!type || type === "self") return;

  // Already targeted — the normal path.
  if ((config.targets?.length ?? 0) > 0) return;

  const candidates = collectCandidates(action);
  if (candidates.length === 0) {
    ui.notifications?.warn(game.i18n.localize("DHTH.Notify.NoCandidates"));
    return false;
  }

  void promptAndReplay(action, config, candidates, key);
  return false;
}

/** Show the picker, apply the selection, and replay the action. */
async function promptAndReplay(
  action: DhAction,
  config: DhActionConfig,
  candidates: DhFormattedTarget[],
  key: string,
): Promise<void> {
  const picked = await TargetPickerApp.prompt(candidates, {
    max: targetCap(action),
    title: config.title ?? action.name,
  });

  // Cancelled or dismissed: the action stays aborted, with nothing spent.
  if (picked === null) return;

  if (picked === "none") {
    // "Attack Without a Target": proceed untargeted (terrain, an object, …).
    // Leave user targets alone — the guard only fires when there are none.
  } else if (picked.length === 0) {
    return;
  } else {
    // Synchronous, and broadcasts to other clients so the GM sees the reticle.
    // (`game.user.updateTokenTargets()` does not exist in v14; the only
    // `User`-level equivalent is @internal and does not broadcast.)
    canvas.tokens?.setTargets(picked, { mode: "replace" });
  }

  replaying.add(key);
  try {
    // Replayed with the original event only. Any `configOptions` from the first
    // call aren't exposed on the hook, which is correct for the normal
    // sheet-button path since that passes none.
    await action.use(config.event ?? null);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to replay action after targeting.`, error);
    ui.notifications?.warn(game.i18n.localize("DHTH.Notify.ReplayFailed"));
  } finally {
    // Clear in case `use()` bailed before reaching the hook (e.g. prepareConfig
    // returned false), so the guard is always re-armed for the next attempt.
    replaying.delete(key);
  }
}
