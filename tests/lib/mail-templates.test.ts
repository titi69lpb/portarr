import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import {
  listMailTemplates,
  getMailTemplate,
  createMailTemplate,
  updateMailTemplate,
  deleteMailTemplate,
} from '../../src/lib/mail-templates';

describe('mail-templates', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('creates a template with type manual', () => {
    const db = getDb(':memory:');
    const created = createMailTemplate(db, 'Panne planifiee', 'Maintenance ce soir', 'Le serveur sera **hors ligne** ce soir.');
    expect(created.type).toBe('manual');
    expect(created.name).toBe('Panne planifiee');
    expect(created.subject).toBe('Maintenance ce soir');
    expect(created.bodyMarkdown).toBe('Le serveur sera **hors ligne** ce soir.');
  });

  it('gets a template by id', () => {
    const db = getDb(':memory:');
    const created = createMailTemplate(db, 'A', 'Sujet A', 'Corps A');
    expect(getMailTemplate(db, created.id)?.name).toBe('A');
  });

  it('returns null for a non-existent template', () => {
    const db = getDb(':memory:');
    expect(getMailTemplate(db, 999)).toBeNull();
  });

  it('lists templates newest first', () => {
    const db = getDb(':memory:');
    const first = createMailTemplate(db, 'First', 'S1', 'B1');
    const second = createMailTemplate(db, 'Second', 'S2', 'B2');
    expect(listMailTemplates(db).map((t) => t.id)).toEqual([second.id, first.id]);
  });

  it('updates only the provided fields', () => {
    const db = getDb(':memory:');
    const created = createMailTemplate(db, 'Original', 'Sujet original', 'Corps original');
    const updated = updateMailTemplate(db, created.id, { subject: 'Sujet modifie' });
    expect(updated?.subject).toBe('Sujet modifie');
    expect(updated?.name).toBe('Original');
    expect(updated?.bodyMarkdown).toBe('Corps original');
  });

  it('returns null when updating a non-existent template', () => {
    const db = getDb(':memory:');
    expect(updateMailTemplate(db, 999, { name: 'x' })).toBeNull();
  });

  it('deletes a template', () => {
    const db = getDb(':memory:');
    const created = createMailTemplate(db, 'A', 'S', 'B');
    expect(deleteMailTemplate(db, created.id)).toBe(true);
    expect(listMailTemplates(db)).toEqual([]);
  });

  it('returns false when deleting a non-existent template', () => {
    const db = getDb(':memory:');
    expect(deleteMailTemplate(db, 999)).toBe(false);
  });
});
