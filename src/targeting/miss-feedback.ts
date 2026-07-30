/**
 * Miss handling for targeted attacks.
 *
 * When an attack is rolled against one or more targets and hits *none* of them,
 * the system still offers a "Roll Damage" button (it always does). Here we:
 *   - strip that button from the chat card, so a whiff doesn't invite damage, and
 *   - flash a shield-deflect on each missed target's portrait, then let the
 *     normal short linger drop it.
 *
 * This keys off `renderChatMessageHTML`, which fires on every client and on every
 * re-render — so each client plays its own flash (no socket needed) and the work
 * is made idempotent (button removal) or deduped (the flash) accordingly.
 *
 * A *no-target* action (terrain, an object) has an empty `targets` list, so it
 * never matches here and keeps its damage button — which is the intended split.
 */
import {
  DAMAGE_ROLL_BUTTON_SELECTOR,
  LOG_PREFIX,
  MODULE_ID,
  PRE_DAMAGE_ACTION_HOOK,
  RENDER_CHAT_MESSAGE_HOOK,
  SETTINGS,
} from "../constants.js";
import { worldActorIdFromUuid } from "../services/actor-ids.js";
import { armLinger } from "../services/portrait-bridge.js";
import { playFx } from "../services/portrait-fx.js";

interface MessageTarget {
  actorId: string;
  hit?: boolean;
}

interface AttackMessageSystem {
  hasRoll?: boolean;
  hasTarget?: boolean;
  hasDamage?: boolean;
  hasHealing?: boolean;
  hasHitTarget?: boolean;
  targets?: MessageTarget[];
}

interface ChatMessageLike {
  id?: string;
  system?: AttackMessageSystem;
}

/** Messages whose block flash has already fired, so re-renders don't repeat it. */
const flashed = new Set<string>();

/**
 * A missed target's portrait lingers a touch longer than the normal (hit) case,
 * so the block/deflect reads before it drops. Deliberately fixed rather than the
 * configurable linger — this is the "nothing landed" beat, not the post-damage one.
 */
const MISS_LINGER_MS = 3000;

export function registerMissFeedback(): void {
  Hooks.on(RENDER_CHAT_MESSAGE_HOOK, onRenderChatMessage);
  Hooks.on(PRE_DAMAGE_ACTION_HOOK, onPreDamageAction);
}

/**
 * Skip the inline (automation-driven) damage roll when an attack hit nothing.
 * Runs on the acting client, before the damage workflow part. Returning `false`
 * aborts the remaining workflow — correct on a miss, where there is nothing to
 * damage — while the attack roll (already done) and its chat card are untouched.
 *
 * Scoped to damaging attacks with targets that all missed. A no-target attack
 * (empty `targets`) is deliberately let through so it can still roll damage.
 */
function onPreDamageAction(_action: DhAction, config: DhActionConfig): boolean | void {
  try {
    if (game.settings.get(MODULE_ID, SETTINGS.missFeedback) !== true) return;
    if (config.hasHealing) return;
    const targets = config.targets ?? [];
    if (targets.length === 0) return;
    if (targets.some((t) => t.hit)) return;
    return false;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Miss damage-skip failed.`, error);
    return;
  }
}

/** True when this is a damaging attack that was rolled and hit nothing. */
function isTargetedMiss(system: AttackMessageSystem | undefined): system is AttackMessageSystem {
  return Boolean(
    system?.hasRoll &&
      system.hasTarget &&
      system.hasDamage &&
      !system.hasHealing &&
      (system.targets?.length ?? 0) > 0 &&
      !system.hasHitTarget,
  );
}

function onRenderChatMessage(message: ChatMessageLike, element: HTMLElement): void {
  try {
    if (game.settings.get(MODULE_ID, SETTINGS.missFeedback) !== true) return;
    if (!isTargetedMiss(message.system)) return;

    // Idempotent: the system re-adds the button on each render, so strip it each
    // time rather than trusting a one-shot removal.
    element
      .querySelectorAll(DAMAGE_ROLL_BUTTON_SELECTOR)
      .forEach((button) => button.remove());

    // Flash once per message, even though render fires repeatedly.
    const id = message.id;
    if (!id || flashed.has(id)) return;
    flashed.add(id);

    const isGM = game.user?.isGM === true;
    for (const target of message.system?.targets ?? []) {
      if (target.hit) continue;
      const actorId = worldActorIdFromUuid(target.actorId);
      if (!actorId) continue;
      void playFx(actorId, "blocked");
      // The 45s safety window was armed at targeting; now that the exchange is
      // over, hand it to the miss linger. GM-only (the raise is GM-authoritative).
      if (isGM) armLinger(actorId, MISS_LINGER_MS);
    }
  } catch (error) {
    // Cosmetic — never let this disrupt the chat log.
    console.warn(`${LOG_PREFIX} Miss feedback failed.`, error);
  }
}
