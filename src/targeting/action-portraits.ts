/**
 * Wires targeted actions to the Ginzzzu portrait integration.
 *
 * Hooks used:
 * - `daggerheart.preUseAction` — `config.targets` is already resolved here, so a
 *   single hook covers targets chosen by our picker *and* targets the player
 *   clicked manually. Registered *after* the target guard, so a guarded action
 *   with no targets is cancelled before we ever see it (`Hooks.call` stops at
 *   the first handler returning `false`); the guard's replay then reaches us
 *   with targets in hand.
 * - `daggerheart.postTakeDamage` / `postTakeHealing` — fire on the affected
 *   actor, which is all the correlation the flashes need. Damage also checks
 *   whether the blow was lethal (HP fully marked) to grey out the portrait.
 *
 * Every handler is wrapped: this is cosmetic, and must never break an action.
 */
import {
  LOG_PREFIX,
  MODULE_ID,
  POST_TAKE_DAMAGE_HOOK,
  POST_TAKE_HEALING_HOOK,
  POST_USE_ACTION_HOOK,
  PRE_USE_ACTION_HOOK,
  SETTINGS,
} from "../constants.js";
import { worldActorId, worldActorIdFromUuid } from "../services/actor-ids.js";
import { armLinger, raiseTargets } from "../services/portrait-bridge.js";
import { playFx, setDead } from "../services/portrait-fx.js";
import {
  emitPortraitDead,
  emitPortraitFx,
  emitTargetsEngaged,
  registerSocket,
  type PortraitFxKind,
  type TargetsEngagedPayload,
} from "../services/socket.js";

/** A blow is lethal when hit points are fully marked (value ≥ max, max > 0). */
function isActorDead(actor: AnyObject): boolean {
  const hp = actor?.["system"]?.resources?.hitPoints as
    | { value?: number; max?: number }
    | undefined;
  return Boolean(hp && (hp.max ?? 0) > 0 && (hp.value ?? 0) >= (hp.max ?? 0));
}

export function registerActionPortraits(): void {
  registerSocket({
    onTargetsEngaged: handleTargetsEngaged,
    onPortraitFx: handlePortraitFx,
    onPortraitDead: (actorId, dead) => void setDead(actorId, dead),
  });

  Hooks.on(PRE_USE_ACTION_HOOK, onPreUseAction);
  Hooks.on(POST_USE_ACTION_HOOK, onPostUseAction);
  Hooks.on(POST_TAKE_DAMAGE_HOOK, (actor: AnyObject) => onEffectApplied(actor, "damage"));
  Hooks.on(POST_TAKE_HEALING_HOOK, (actor: AnyObject) => onEffectApplied(actor, "heal"));
}

/** Announce who is being targeted. Returns nothing, so the action proceeds. */
function onPreUseAction(action: DhAction, config: DhActionConfig): void {
  try {
    const targets = config.targets ?? [];
    if (targets.length === 0) return;

    const actingUuid = action.actor?.uuid ?? null;
    const actorIds: string[] = [];
    const selfActorIds: string[] = [];

    for (const target of targets) {
      const id = worldActorIdFromUuid(target.actorId);
      if (!id) continue;
      // Self-targets animate but are never raised or lowered — the acting
      // actor's portrait belongs to the spotlight system.
      if (actingUuid && target.actorId === actingUuid) selfActorIds.push(id);
      else actorIds.push(id);
    }

    if (actorIds.length === 0 && selfActorIds.length === 0) return;
    const expectsEffect = Boolean(config.hasDamage || config.hasHealing);
    emitTargetsEngaged({ actorIds, selfActorIds, expectsEffect });
  } catch (error) {
    console.warn(`${LOG_PREFIX} Could not announce targets for portraits.`, error);
  }
}

/**
 * Release the acting user's targets once the action's `use()` completes. Runs on
 * the acting client (targets are per-user). Damage is unaffected: the chat card
 * captured its targets at roll time (`hitTargets`) and never reads live targets.
 */
function onPostUseAction(_action: DhAction, config: DhActionConfig): void {
  try {
    if (game.settings.get(MODULE_ID, SETTINGS.clearTargetsAfterAction) !== true) return;
    if ((config.targets?.length ?? 0) === 0) return;
    if (!game.user?.targets?.size) return;
    canvas.tokens?.setTargets([], { mode: "replace" });
  } catch (error) {
    console.warn(`${LOG_PREFIX} Could not clear targets after action.`, error);
  }
}

function onEffectApplied(actor: AnyObject, kind: PortraitFxKind): void {
  try {
    const id = worldActorId(actor?.["id"] as string | undefined);
    if (!id) return;
    emitPortraitFx(id, kind);

    // Grey out a killed target after the damage flash; clear the veil on a heal
    // that brings them back. HP is already updated by the time this hook fires.
    if (kind === "damage") {
      if (isActorDead(actor)) emitPortraitDead(id, true);
    } else if (!isActorDead(actor)) {
      emitPortraitDead(id, false);
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Could not announce a portrait effect.`, error);
  }
}

/** Runs on every client; the raise is GM-only and no-ops elsewhere. */
function handleTargetsEngaged(payload: TargetsEngagedPayload): void {
  for (const actorId of [...payload.actorIds, ...payload.selfActorIds]) {
    void playFx(actorId, "targeted");
  }
  void raiseTargets(payload.actorIds, payload.expectsEffect);
}

function handlePortraitFx(actorId: string, kind: PortraitFxKind): void {
  void playFx(actorId, kind);
  // Keep the portrait up a little longer now that something has landed on it.
  armLinger(actorId);
}
