import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getSetting, setSetting } from './settings';

export function generateSecret(byteLength: number = 32): string {
  return randomBytes(byteLength).toString('hex');
}

// Idempotent across restarts: env wins if set (never touches the DB in that
// case, so unsetting the env var later would fall through to a freshly
// generated secret, not a stale DB-cached one from a prior env-set run).
// Otherwise reuses whatever was already generated, or generates once and
// persists.
export function ensureAutoSecret(
  db: Database.Database,
  key: string,
  envValue: string | undefined,
  byteLength: number = 32
): string {
  if (envValue) return envValue;
  const existing = getSetting(db, key);
  if (existing) return existing;
  const generated = generateSecret(byteLength);
  setSetting(db, key, generated);
  return generated;
}
