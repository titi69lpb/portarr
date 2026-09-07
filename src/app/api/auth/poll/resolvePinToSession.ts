import { pollPin, getPlexIdentity, getSharedUsers, type PlexSharedUser } from '@/lib/plex';

export type PollResult =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'ok'; user: PlexSharedUser; isOwner: boolean };

export interface PollDeps {
  pollPin: typeof pollPin;
  getPlexIdentity: typeof getPlexIdentity;
  getSharedUsers: typeof getSharedUsers;
}

export const defaultDeps: PollDeps = { pollPin, getPlexIdentity, getSharedUsers };

export async function resolvePinToSession(
  pinId: number,
  deps: PollDeps,
  ctx: { clientIdentifier: string; serverToken: string; serverName: string }
): Promise<PollResult> {
  const userToken = await deps.pollPin(pinId, ctx.clientIdentifier);
  if (!userToken) {
    return { status: 'pending' };
  }

  const identity = await deps.getPlexIdentity(userToken, ctx.clientIdentifier);

  const ownerIdentity = await deps.getPlexIdentity(ctx.serverToken, ctx.clientIdentifier);
  if (ownerIdentity.plexId === identity.plexId) {
    return { status: 'ok', user: ownerIdentity, isOwner: true };
  }

  const sharedUsers = await deps.getSharedUsers(ctx.serverToken, ctx.serverName);
  const match = sharedUsers.find((u) => u.plexId === identity.plexId);

  if (!match) {
    return { status: 'denied' };
  }
  return { status: 'ok', user: match, isOwner: false };
}
