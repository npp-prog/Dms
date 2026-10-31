import test from 'node:test';
import assert from 'node:assert/strict';
import { takeQuestion, manilaDay } from '../../netlify/lib/askLimit.mjs';

test('Ask DMS daily limit: counts per person per day, refuses past the limit', async () => {
  const m = new Map();
  const store = { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } };
  for (let i = 1; i <= 3; i++) assert.deepEqual(await takeQuestion(store, 'a', { limit: 3, day: '2026-10-31' }), { ok: true, used: i, limit: 3 });
  assert.equal((await takeQuestion(store, 'a', { limit: 3, day: '2026-10-31' })).ok, false);
  assert.equal((await takeQuestion(store, 'b', { limit: 3, day: '2026-10-31' })).ok, true); // someone else
  assert.equal((await takeQuestion(store, 'a', { limit: 3, day: '2026-11-01' })).ok, true); // the next day
  assert.equal(manilaDay(new Date('2026-10-31T17:00:00Z')), '2026-11-01'); // 1 AM in Manila
});
