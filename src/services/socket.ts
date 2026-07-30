/**
 * Cross-client channel for the portrait integration.
 *
 * Raising a Ginzzzu portrait writes an actor flag, which only a GM may do — so a
 * player who attacks an adversary has to ask the GM to raise it. The animations
 * themselves are pure DOM and run on every client independently.
 *
 * Foundry sockets do not loop back to the sender, so every emit here also
 * dispatches locally. Handlers therefore run exactly once per client.
 */
import { SOCKET_EVENT } from "../constants.js";

export type PortraitFxKind = "targeted" | "damage" | "heal";

export interface TargetsEngagedPayload {
  /** Targets whose portraits should be raised, then lowered once they settle. */
  actorIds: string[];
  /** Targets that are the acting actor itself: animate, but never raise or lower. */
  selfActorIds: string[];
  /**
   * Whether this action deals damage or healing. When true the portrait holds on
   * a longer safety window instead of the short linger, because the effect lands
   * in a separate chat-card step that may be seconds away — the short linger
   * takes over once the damage/heal actually applies.
   */
  expectsEffect: boolean;
}

type SocketMessage =
  | ({ type: "targetsEngaged" } & TargetsEngagedPayload)
  | { type: "portraitFx"; actorId: string; kind: PortraitFxKind }
  | { type: "portraitDead"; actorId: string; dead: boolean };

export interface SocketHandlers {
  /** Runs on every client. GM-only work is branched inside the handler. */
  onTargetsEngaged: (payload: TargetsEngagedPayload) => void;
  /** Runs on every client. */
  onPortraitFx: (actorId: string, kind: PortraitFxKind) => void;
  /** Runs on every client: a target was killed (or revived). */
  onPortraitDead: (actorId: string, dead: boolean) => void;
}

let handlers: SocketHandlers | null = null;

function dispatch(message: SocketMessage): void {
  if (!handlers) return;
  switch (message.type) {
    case "targetsEngaged":
      handlers.onTargetsEngaged({
        actorIds: message.actorIds,
        selfActorIds: message.selfActorIds,
        expectsEffect: message.expectsEffect,
      });
      return;
    case "portraitFx":
      handlers.onPortraitFx(message.actorId, message.kind);
      return;
    case "portraitDead":
      handlers.onPortraitDead(message.actorId, message.dead);
      return;
  }
}

export function registerSocket(deps: SocketHandlers): void {
  handlers = deps;
  game.socket?.on(SOCKET_EVENT, (message: SocketMessage) => dispatch(message));
}

/** Send to every other client, then run locally — sockets do not echo back. */
function broadcast(message: SocketMessage): void {
  game.socket?.emit(SOCKET_EVENT, message);
  dispatch(message);
}

export function emitTargetsEngaged(payload: TargetsEngagedPayload): void {
  broadcast({ type: "targetsEngaged", ...payload });
}

export function emitPortraitFx(actorId: string, kind: PortraitFxKind): void {
  broadcast({ type: "portraitFx", actorId, kind });
}

export function emitPortraitDead(actorId: string, dead: boolean): void {
  broadcast({ type: "portraitDead", actorId, dead });
}
