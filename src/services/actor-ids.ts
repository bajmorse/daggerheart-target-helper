/**
 * Ginzzzu keys portraits by *world* actor id, but the system hands us actor
 * UUIDs. These resolve one to the other and drop anything with no world actor
 * (an unlinked token actor has no dock entry, so there is nothing to show).
 */

export function worldActorId(id: string | undefined): string | null {
  if (!id) return null;
  const actors = game.actors as { get?: (id: string) => unknown } | undefined;
  return actors?.get?.(id) ? id : null;
}

export function worldActorIdFromUuid(uuid: string): string | null {
  const doc = fromUuidSync(uuid) as { id?: string } | null;
  return worldActorId(doc?.id);
}
