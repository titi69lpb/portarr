const PROVIDER_IDS = ['plex', 'jellyfin'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
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

export interface RecentlyAddedItem {
  title: string;
  thumbPath: string;
  addedAt: string;
  type: 'movie' | 'episode';
  /** Deep link into this server's own web UI, or null if it could not be
   * built — callers must treat that as "not clickable" rather than link to
   * a broken URL. */
  webUrl: string | null;
}

export interface RecentlyAddedSplit {
  movies: RecentlyAddedItem[];
  episodes: RecentlyAddedItem[];
}

export interface SearchResultItem {
  title: string;
  year: number | null;
  type: 'movie' | 'show';
  thumbPath: string | null;
  /** Same contract as RecentlyAddedItem.webUrl. */
  webUrl: string | null;
}

export type PinResolution =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'ok'; user: MediaMember; isOwner: boolean };

export interface PinAuth {
  kind: 'pin';
  createPin(): Promise<{ pinId: number; authUrl: string }>;
  resolvePin(pinId: number): Promise<PinResolution>;
}

// Sub-project 2 widens this to `PinAuth | PasswordAuth`.
export type ProviderAuth = PinAuth;

export interface MediaServer {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly auth: ProviderAuth;
  listMembers(): Promise<MediaMember[]>;
  /** Fails open (returns true) on an upstream error, so a hiccup never locks everyone out. */
  isMember(userId: string): Promise<boolean>;
  recentlyAdded(count: number): Promise<RecentlyAddedItem[]>;
  recentlyAddedSplit(countPerType: number): Promise<RecentlyAddedSplit>;
  search(query: string): Promise<SearchResultItem[]>;
}
