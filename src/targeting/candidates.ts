/**
 * Builds the list of tokens a player may pick from when an action needs a target.
 *
 * Everything here is deliberately aligned with the system's own `TargetField`
 * (daggerheart.js:33005) so the candidates we offer are exactly the ones the
 * action workflow will accept once they're targeted.
 */

/**
 * Reach the system's TargetField statics. Available from the system's `init`
 * (daggerheart.js:41348), so always present by the time an action is used.
 * Returns null defensively — a system update that moves this should degrade to
 * an unfiltered list rather than throwing mid-action.
 */
function getTargetField(): DhTargetFieldStatics | null {
  const api = (game.system as AnyObject)["api"] as AnyObject | undefined;
  const fields = api?.["fields"] as AnyObject | undefined;
  const actionFields = fields?.["ActionFields"] as AnyObject | undefined;
  return (actionFields?.["TargetField"] as DhTargetFieldStatics | undefined) ?? null;
}

/** Stand-in for `TargetField.formatTarget` if the system API ever moves. */
function fallbackFormat(token: Token): DhFormattedTarget {
  const system = (token.actor?.["system"] ?? {}) as AnyObject;
  return {
    id: token.id,
    actorId: token.actor?.uuid ?? "",
    name: token.name,
    img: token.actor?.img ?? "",
    difficulty: (system["difficulty"] as number | null | undefined) ?? null,
    evasion: (system["evasion"] as number | null | undefined) ?? null,
  };
}

/**
 * Collect valid, pickable targets in the active scene for a given action.
 *
 * @param action The action being used, whose `target.type` drives disposition filtering.
 * @returns Formatted targets, sorted by name. Empty if nothing valid is present.
 */
export function collectCandidates(action: DhAction): DhFormattedTarget[] {
  const tokens = canvas.tokens?.placeables ?? [];
  const targetField = getTargetField();
  const actor = action.actor ?? null;
  const type = action.target?.type ?? null;

  const candidates = tokens.filter((token) => {
    if (!token.actor) return false;

    // GM-hidden tokens are not fair game.
    if (token.document.hidden) return false;

    // Never offer the acting actor its own token. Comparing uuids covers both
    // linked world actors and unlinked scene actors.
    if (actor && token.actor.uuid === actor.uuid) return false;

    // NOTE: we deliberately do NOT filter on `token.visible`. Core's own
    // `targetObjects()` does, but Theatre of the Mind tokens are routinely
    // off-screen or at 0 opacity — excluding them would defeat the purpose.

    // `any` (and a missing type) means the system applies no disposition filter,
    // so neither do we.
    if (!type || type === "any") return true;
    if (!targetField || !actor) return true;

    return targetField.isTargetFriendly(actor, token, type);
  });

  const formatted = candidates.map((token) =>
    targetField ? targetField.formatTarget(token) : fallbackFormat(token),
  );

  formatted.sort((a, b) => a.name.localeCompare(b.name));
  return formatted;
}
