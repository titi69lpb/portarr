import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import { insertMailLog, listMailLog } from '../../src/lib/mail-log';

describe('mail-log', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('inserts and lists a log entry', () => {
    const db = getDb(':memory:');
    const entry = insertMailLog(db, {
      templateId: 1,
      templateName: 'Panne planifiee',
      recipientEmail: 'a@b.com',
      recipientUsername: 'alice',
      status: 'sent',
    });
    expect(entry.status).toBe('sent');
    expect(entry.recipientEmail).toBe('a@b.com');

    const all = listMailLog(db);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(entry.id);
  });

  it('lists entries newest first', () => {
    const db = getDb(':memory:');
    const first = insertMailLog(db, {
      templateId: 1,
      templateName: 'A',
      recipientEmail: 'a@b.com',
      recipientUsername: 'a',
      status: 'sent',
    });
    const second = insertMailLog(db, {
      templateId: 1,
      templateName: 'A',
      recipientEmail: 'c@d.com',
      recipientUsername: 'c',
      status: 'failed',
    });
    expect(listMailLog(db).map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it('accepts a null templateId and recipientUsername (deleted template, unmatched user)', () => {
    const db = getDb(':memory:');
    const entry = insertMailLog(db, {
      templateId: null,
      templateName: 'Modele supprime',
      recipientEmail: 'x@y.com',
      recipientUsername: null,
      status: 'sent',
    });
    expect(entry.templateId).toBeNull();
    expect(entry.recipientUsername).toBeNull();
  });
});
