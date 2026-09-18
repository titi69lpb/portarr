import type Database from 'better-sqlite3';
import { getSetting, setSetting, deleteSetting } from './settings';
import { generateSecret } from './secrets';
import { secureCompare } from './secure-compare';

const SETUP_TOKEN_KEY = 'SETUP_TOKEN';

export function getOrCreateSetupToken(db: Database.Database): string {
  const existing = getSetting(db, SETUP_TOKEN_KEY);
  if (existing) return existing;
  const token = generateSecret(16);
  setSetting(db, SETUP_TOKEN_KEY, token);
  return token;
}

export function verifySetupToken(db: Database.Database, token: string): boolean {
  const stored = getSetting(db, SETUP_TOKEN_KEY);
  return stored !== null && secureCompare(stored, token);
}

export function invalidateSetupToken(db: Database.Database): void {
  deleteSetting(db, SETUP_TOKEN_KEY);
}
