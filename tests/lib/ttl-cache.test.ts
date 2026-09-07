import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTtlCache, resetTtlCacheForTests } from '../../src/lib/ttl-cache';

beforeEach(() => {
  resetTtlCacheForTests();
});

describe('withTtlCache', () => {
  it('calls fn once and returns its value on a fresh key', async () => {
    const fn = vi.fn().mockResolvedValue('value');
    const result = await withTtlCache('key1', 1000, fn);
    expect(result).toBe('value');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns the cached value without calling fn again within the TTL', async () => {
    const fn = vi.fn().mockResolvedValue('first');
    await withTtlCache('key2', 10_000, fn);
    fn.mockResolvedValue('second');
    const result = await withTtlCache('key2', 10_000, fn);
    expect(result).toBe('first');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls fn again once the TTL has expired', async () => {
    const fn = vi.fn().mockResolvedValue('first');
    await withTtlCache('key3', 10, fn);
    await new Promise((r) => setTimeout(r, 20));
    fn.mockResolvedValue('second');
    const result = await withTtlCache('key3', 10, fn);
    expect(result).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('different keys are cached independently', async () => {
    const fnA = vi.fn().mockResolvedValue('a');
    const fnB = vi.fn().mockResolvedValue('b');
    expect(await withTtlCache('key-a', 10_000, fnA)).toBe('a');
    expect(await withTtlCache('key-b', 10_000, fnB)).toBe('b');
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it('does not cache a rejected fn — the next call retries', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('recovered');
    await expect(withTtlCache('key4', 10_000, fn)).rejects.toThrow('boom');
    const result = await withTtlCache('key4', 10_000, fn);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('concurrent callers during a miss share one in-flight call instead of each firing fn', async () => {
    let resolveFn!: (value: string) => void;
    const fn = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveFn = resolve;
        })
    );

    const call1 = withTtlCache('key5', 10_000, fn);
    const call2 = withTtlCache('key5', 10_000, fn);
    resolveFn('shared');

    expect(await call1).toBe('shared');
    expect(await call2).toBe('shared');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resetTtlCacheForTests clears both the value cache and in-flight tracking', async () => {
    const fn = vi.fn().mockResolvedValue('first');
    await withTtlCache('key6', 10_000, fn);
    resetTtlCacheForTests();
    fn.mockResolvedValue('second');
    const result = await withTtlCache('key6', 10_000, fn);
    expect(result).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
