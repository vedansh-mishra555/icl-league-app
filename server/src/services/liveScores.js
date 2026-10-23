import { Match } from '../models.js';
import { emitAuction } from '../socket.js';
import { syncRecord } from './cricheroes.js';

const INTERVAL_MS = 30_000;
const MAX_FAILS = 5;       // after this many failures in a row, back off
const BACKOFF_MS = 5 * 60_000;
const state = new Map();   // matchId -> { fails, nextTryAt }
let running = false;
let handle;

// Polls every match that has "live updates" switched on and a CricHeroes scorecard link.
export async function pollLiveMatches() {
  if (running) return { skipped: true };
  running = true;
  const result = { polled: 0, ok: 0, failed: 0 };
  try {
    const matches = await Match.find({ liveSync: true, cricheroesUrl: { $type: 'string', $ne: '' }, status: { $ne: 'completed' } });
    for (const match of matches) {
      const s = state.get(String(match._id)) || { fails: 0, nextTryAt: 0 };
      if (Date.now() < s.nextTryAt) continue;
      result.polled++;
      const r = await syncRecord('match', match);
      if (r.ok) {
        state.set(String(match._id), { fails: 0, nextTryAt: 0 }); result.ok++;
        emitAuction('league', 'match:update', { matchId: match._id });
      } else {
        const fails = s.fails + 1;
        state.set(String(match._id), { fails, nextTryAt: fails >= MAX_FAILS ? Date.now() + BACKOFF_MS : 0 });
        result.failed++;
      }
    }
  } finally { running = false; }
  return result;
}

export function startLiveScoreWorker() {
  if (handle) return;
  handle = setInterval(() => pollLiveMatches().catch((e) => console.error('Live scores:', e.message)), INTERVAL_MS);
  handle.unref?.();
}
