export type ProviderId = 'plex' | 'jellyfin';

const PROVIDER_IDS: readonly string[] = ['plex', 'jellyfin'];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDER_IDS.includes(value);
}

/** Identity of one account on one media server. Two accounts on two
 * providers are two distinct members — there is deliberately no merging. */
export interface MemberRef {
  provider: ProviderId;
  userId: string;
}

export interface MediaMember extends MemberRef {
  email: string;
  username: string;
}
