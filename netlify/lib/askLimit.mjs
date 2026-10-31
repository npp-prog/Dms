// Ask DMS: questions per person per day (Philippine time), so no one account can run up the
// Anthropic bill. ASK_DAILY_LIMIT in Netlify changes it (default 50).
export const DEFAULT_DAILY_LIMIT = 50;

export const dailyLimit = () => {
  const n = Number(process.env.ASK_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
};
export const manilaDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// store: { get(key), set(key, value) } (Netlify Blobs; a Map-like object in tests).
// Counts this question if there is room today: { ok, used, limit }.
export async function takeQuestion(store, uid, { limit = dailyLimit(), day = manilaDay() } = {}) {
  const key = `${day}/${uid}`;
  const used = Number(await store.get(key)) || 0;
  if (used >= limit) return { ok: false, used, limit };
  await store.set(key, String(used + 1));
  return { ok: true, used: used + 1, limit };
}
