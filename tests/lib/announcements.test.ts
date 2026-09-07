import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../../src/lib/db';
import {
  listAnnouncements,
  getActiveAnnouncement,
  createAnnouncement,
  updateAnnouncementContent,
  setAnnouncementActive,
  deactivateAnnouncement,
  deleteAnnouncement,
} from '../../src/lib/announcements';

describe('announcements', () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it('returns null when there is no active announcement', () => {
    const db = getDb(':memory:');
    expect(getActiveAnnouncement(db)).toBeNull();
  });

  it('creates an announcement as active', () => {
    const db = getDb(':memory:');
    const created = createAnnouncement(db, 'Hello **world**');
    expect(created.active).toBe(true);
    expect(created.contentMarkdown).toBe('Hello **world**');
    expect(getActiveAnnouncement(db)?.id).toBe(created.id);
  });

  it('creating a new announcement deactivates the previous active one', () => {
    const db = getDb(':memory:');
    const first = createAnnouncement(db, 'First');
    const second = createAnnouncement(db, 'Second');
    const all = listAnnouncements(db);
    expect(all.find((a) => a.id === first.id)?.active).toBe(false);
    expect(all.find((a) => a.id === second.id)?.active).toBe(true);
    expect(getActiveAnnouncement(db)?.id).toBe(second.id);
  });

  it('lists announcements newest first', () => {
    const db = getDb(':memory:');
    const first = createAnnouncement(db, 'First');
    const second = createAnnouncement(db, 'Second');
    expect(listAnnouncements(db).map((a) => a.id)).toEqual([second.id, first.id]);
  });

  it('updates the content of an existing announcement', () => {
    const db = getDb(':memory:');
    const created = createAnnouncement(db, 'Original');
    const updated = updateAnnouncementContent(db, created.id, 'Updated');
    expect(updated?.contentMarkdown).toBe('Updated');
  });

  it('returns null when updating a non-existent announcement', () => {
    const db = getDb(':memory:');
    expect(updateAnnouncementContent(db, 999, 'x')).toBeNull();
  });

  it('reactivating a past announcement deactivates the currently active one', () => {
    const db = getDb(':memory:');
    const first = createAnnouncement(db, 'First');
    createAnnouncement(db, 'Second');
    const reactivated = setAnnouncementActive(db, first.id);
    expect(reactivated?.active).toBe(true);
    expect(getActiveAnnouncement(db)?.id).toBe(first.id);
  });

  it('returns null when activating a non-existent announcement', () => {
    const db = getDb(':memory:');
    expect(setAnnouncementActive(db, 999)).toBeNull();
  });

  it('deactivates an announcement, leaving none active', () => {
    const db = getDb(':memory:');
    const created = createAnnouncement(db, 'First');
    const deactivated = deactivateAnnouncement(db, created.id);
    expect(deactivated?.active).toBe(false);
    expect(getActiveAnnouncement(db)).toBeNull();
  });

  it('returns null when deactivating a non-existent announcement', () => {
    const db = getDb(':memory:');
    expect(deactivateAnnouncement(db, 999)).toBeNull();
  });

  it('deletes an announcement', () => {
    const db = getDb(':memory:');
    const created = createAnnouncement(db, 'First');
    expect(deleteAnnouncement(db, created.id)).toBe(true);
    expect(listAnnouncements(db)).toEqual([]);
  });

  it('returns false when deleting a non-existent announcement', () => {
    const db = getDb(':memory:');
    expect(deleteAnnouncement(db, 999)).toBe(false);
  });
});
