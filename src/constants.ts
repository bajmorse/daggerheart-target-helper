/** Shared, immutable identifiers for the module. */

export const MODULE_ID = "daggerheart-target-helper" as const;
export const MODULE_TITLE = "Eryndor: Target Helper" as const;

/** Prefix used for all console logging so output is easy to filter. */
export const LOG_PREFIX = `${MODULE_TITLE} |` as const;

/** Setting keys, kept in one place to avoid typos across the codebase. */
export const SETTINGS = {
  /** Whether the module's helpers are active for this client. */
  enabled: "enabled",
  /** Whether targeted actions raise the target's Ginzzzu portrait. */
  portraitIntegration: "portraitIntegration",
  /** Seconds a raised portrait lingers after the last thing that happened to it. */
  portraitLingerSeconds: "portraitLingerSeconds",
  /** Whether to release the acting user's targets once an action completes. */
  clearTargetsAfterAction: "clearTargetsAfterAction",
  /** On a full miss: hide the damage prompt and flash a block on the target. */
  missFeedback: "missFeedback",
} as const;

/** Foundry template paths (served from the module root at runtime). */
export const TEMPLATES = {
  targetPanel: `modules/${MODULE_ID}/templates/target-panel.hbs`,
  targetPicker: `modules/${MODULE_ID}/templates/target-picker.hbs`,
} as const;

/** The system this module's targeting guard hooks into. */
export const DAGGERHEART_ID = "daggerheart" as const;

/**
 * Fired by `DHBaseAction#use()` before the roll dialog, the action workflow,
 * the resource spend, and the chat card. Returning `false` aborts cleanly with
 * nothing spent. See systems/daggerheart/build/daggerheart.js:16884.
 */
export const PRE_USE_ACTION_HOOK = `${DAGGERHEART_ID}.preUseAction` as const;

/**
 * Fired at the end of `use()`, after the to-hit roll but *before* any chat-card
 * damage step (damage/apply run as separate forced workflow parts). This is the
 * point at which the acting user's live targets are no longer needed.
 */
export const POST_USE_ACTION_HOOK = `${DAGGERHEART_ID}.postUseAction` as const;

/**
 * Fired before the damage part of an action's workflow runs (order 10 roll →
 * order 20 damage), so `config.targets[].hit` is already set. Returning `false`
 * skips the inline (automation-driven) damage roll — the manual chat-card button
 * takes a different path and is handled separately.
 */
export const PRE_DAMAGE_ACTION_HOOK = `${DAGGERHEART_ID}.preDamageAction` as const;

/** Fired on the affected actor once damage/healing has been applied. */
export const POST_TAKE_DAMAGE_HOOK = `${DAGGERHEART_ID}.postTakeDamage` as const;
export const POST_TAKE_HEALING_HOOK = `${DAGGERHEART_ID}.postTakeHealing` as const;

/** Ginzzzu's Portraits & NPC Dock — an optional enhancement, never a dependency. */
export const PORTRAITS_MODULE_ID = "ginzzzu-portraits" as const;

/** Actor flag Ginzzzu uses to track which portraits are on screen. */
export const PORTRAIT_SHOWN_FLAG = `flags.${PORTRAITS_MODULE_ID}.portraitShown` as const;

/** DOM node Ginzzzu renders per on-screen portrait, keyed by world actor id. */
export const PORTRAIT_WRAPPER_SELECTOR = ".ginzzzu-portrait-wrapper" as const;

/** v14 chat render hook (passes the message document and its root element). */
export const RENDER_CHAT_MESSAGE_HOOK = "renderChatMessageHTML" as const;

/** The system's "Roll Damage" button on an attack chat card. */
export const DAMAGE_ROLL_BUTTON_SELECTOR = ".duality-action-damage" as const;

/** Our cross-client channel. Requires `"socket": true` in module.json. */
export const SOCKET_EVENT = `module.${MODULE_ID}` as const;
