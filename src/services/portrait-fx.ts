/**
 * Transient portrait animations. Runs on every client and touches nothing but
 * the DOM — no actor writes, no permissions, and no interference with an emotion
 * the GM set by hand.
 */
import { LOG_PREFIX, PORTRAIT_WRAPPER_SELECTOR } from "../constants.js";
import type { PortraitFxKind } from "./socket.js";

/**
 * All animations we can play. `"blocked"` is render-local (fired from the chat
 * card on a miss) and never travels over the socket, so it lives here rather
 * than in the socket's `PortraitFxKind`.
 */
export type FxKind = PortraitFxKind | "blocked";

const FX_CLASS: Record<FxKind, string> = {
  targeted: "dhth-fx-targeted",
  damage: "dhth-fx-damage",
  heal: "dhth-fx-heal",
  blocked: "dhth-fx-blocked",
};

/** Persistent (non-animated) class marking a killed target's portrait. */
const DEAD_CLASS = "dhth-dead";

/** Hold the greyscale until just past the damage flash, so it reads as "then". */
const DEAD_DELAY_MS = 700;

/** Backstop in case `animationend` never arrives, so a class can't stick. */
const FX_TIMEOUT_MS = 2500;

/** How long to wait for a portrait that is still on its way up. */
const WAIT_TIMEOUT_MS = 1500;
const WAIT_INTERVAL_MS = 100;

function findWrapper(actorId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `${PORTRAIT_WRAPPER_SELECTOR}[data-actor-id="${CSS.escape(actorId)}"]`,
  );
}

/**
 * A targeting animation usually arrives before the portrait exists: the GM's
 * flag write has to replicate before Ginzzzu builds the node. Poll briefly
 * rather than dropping the effect.
 */
async function waitForWrapper(actorId: string): Promise<HTMLElement | null> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const found = findWrapper(actorId);
    if (found) return found;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
}

/** Play one animation on a portrait. Silently does nothing if it never appears. */
export async function playFx(actorId: string, kind: FxKind): Promise<void> {
  try {
    const wrapper = await waitForWrapper(actorId);
    if (!wrapper) return;

    const cls = FX_CLASS[kind];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clear = (): void => {
      wrapper.classList.remove(cls);
      wrapper.removeEventListener("animationend", onEnd);
      if (timer !== undefined) clearTimeout(timer);
    };

    const onEnd = (event: Event): void => {
      // Ignore animations bubbling up from Ginzzzu's own inner elements.
      if (event.target === wrapper) clear();
    };

    // Re-applying the same class mid-animation is a no-op unless the class is
    // dropped and layout is flushed first, so a second hit restarts the effect.
    wrapper.classList.remove(cls);
    void wrapper.offsetWidth;
    wrapper.classList.add(cls);

    wrapper.addEventListener("animationend", onEnd);
    timer = setTimeout(clear, FX_TIMEOUT_MS);
  } catch (error) {
    // Cosmetic only — never let this surface to the player.
    console.warn(`${LOG_PREFIX} Portrait effect failed.`, error);
  }
}

/**
 * Mark a portrait as killed (persistent greyscale) or revived (clear it).
 *
 * Setting dead waits for the portrait — it may still be rising when the killing
 * blow lands — and delays the greyscale so it settles just after the damage
 * flash. Clearing is immediate and never waits: if there's no portrait, there's
 * nothing to clear.
 */
export async function setDead(actorId: string, dead: boolean): Promise<void> {
  try {
    if (!dead) {
      findWrapper(actorId)?.classList.remove(DEAD_CLASS);
      return;
    }
    const wrapper = await waitForWrapper(actorId);
    if (!wrapper) return;
    setTimeout(() => wrapper.classList.add(DEAD_CLASS), DEAD_DELAY_MS);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Portrait death state failed.`, error);
  }
}
