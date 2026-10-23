import cron from 'node-cron';
import { config } from '../config.js';
import { Match, Player, Setting, SyncCache, Team, Tournament } from '../models.js';

const models = { tournament: Tournament, team: Team, player: Player, match: Match };
const imageField = { team: 'logo', player: 'photo' };
export function mergeSource(record) { return { ...record.syncedData, ...record.toObject?.(), ...record.manualOverrides }; }

export function isPublicCricHeroesUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['cricheroes.com', 'www.cricheroes.com'].includes(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch { return false; }
}

const meta = (html, name) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i');
  const m = html.match(re);
  return (m?.[1] || m?.[2] || '').trim() || undefined;
};
const decode = (v) => v?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Site-wide share images are not a team or player photo.
const genericImage = (url) => (url && !/cricheroes_fb_cover|cricheroes_website_new/i.test(url) ? url : undefined);

// CricHeroes publishes no official public API. We read only what the public page exposes:
// Open Graph tags, JSON-LD and the embedded Next.js payload when present.
export function extractPage(html, url) {
  const out = { url, fetchedAt: new Date(), pageTitle: decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()), description: decode(meta(html, 'og:description') || meta(html, 'description')), image: genericImage(meta(html, 'og:image')) };
  for (const [, body] of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.jsonLd = [...(out.jsonLd || []), JSON.parse(body)].slice(0, 5); } catch { /* ignore malformed block */ }
  }
  const next = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (next && next.length < 500_000) {
    try { out.pageProps = JSON.parse(next)?.props?.pageProps; } catch { /* ignore */ }
  }
  return out;
}

// Pull numeric stats from whichever shape the page exposes; ignore anything non-numeric.
function numbersFrom(props, kind) {
  if (!props || typeof props !== 'object') return {};
  const flat = {};
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 6) return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))) flat[k.toLowerCase()] ??= Number(v);
      else walk(v, d + 1);
    }
  };
  walk(props);
  const pick = (...keys) => keys.map((k) => flat[k]).find((v) => Number.isFinite(v));
  if (kind === 'player') return { matches: pick('matches', 'total_match', 'total_matches'), runs: pick('runs', 'total_runs'), wickets: pick('wickets', 'total_wickets'), strikeRate: pick('strike_rate', 'strikerate', 'sr'), economy: pick('economy', 'economy_rate') };
  if (kind === 'team') return { played: pick('played', 'total_match'), won: pick('won', 'wins', 'total_win'), lost: pick('lost', 'losses', 'total_loss'), points: pick('points', 'pts'), nrr: pick('nrr', 'net_run_rate') };
  return {};
}
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => Number.isFinite(v)));

export async function fetchCricHeroes(url) {
  if (!isPublicCricHeroesUrl(url)) throw new Error('URL must use https://cricheroes.com or https://www.cricheroes.com');
  const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ICL-public-sync/1.0)', Accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`CricHeroes returned HTTP ${response.status}`);
  return extractPage(await response.text(), url);
}

export async function previewCricHeroes(url, kind = 'player') {
  const page = await fetchCricHeroes(url);
  const stats = clean(numbersFrom(page.pageProps, kind));
  return {
    title: page.pageTitle, description: page.description, image: page.image, stats,
    foundStructuredData: Boolean(page.pageProps),
    note: Object.keys(stats).length ? 'Stats detected and will be applied on sync.' : 'Link works. No stats were exposed in the public page; enter them manually. The link still powers the CricHeroes button on the site.',
  };
}

export async function syncRecord(kind, record) {
  const key = `cricheroes:${kind}:${record._id}`;
  try {
    const page = await fetchCricHeroes(record.cricheroesUrl);
    const stats = clean(numbersFrom(page.pageProps, kind));
    const { pageProps: _drop, ...payload } = page;
    payload.stats = stats;
    record.syncedData = { ...(record.syncedData || {}), ...payload };
    record.lastSyncedAt = new Date();
    const manual = record.manualOverrides || {};
    if (Object.keys(stats).length && (kind === 'player' || kind === 'team')) {
      const current = record.stats?.toObject?.() || record.stats || {};
      const merged = { ...current };
      for (const [k, v] of Object.entries(stats)) if (!(k in (manual.stats || {}))) merged[k] = v;
      record.stats = merged;
    }
    const field = imageField[kind];
    if (field && page.image && !record[field] && !manual[field]) record[field] = page.image;
    await record.save();
    await SyncCache.findOneAndUpdate({ key }, { source: 'cricheroes', status: 'ok', payload, error: null, lastUpdatedAt: new Date() }, { upsert: true });
    return { ok: true, stats };
  } catch (error) {
    await SyncCache.findOneAndUpdate({ key }, { source: 'cricheroes', status: 'stale', error: error.message }, { upsert: true });
    return { ok: false, error: error.message };
  }
}

export async function runCricHeroesSync({ force = false } = {}) {
  const setting = await Setting.findOne({ key: 'cricheroesSyncEnabled' }).lean();
  if (!force && (setting ? !setting.value : !config.syncEnabled)) return { skipped: true, reason: 'disabled' };
  const result = { updated: 0, failed: 0 };
  for (const [kind, Model] of Object.entries(models)) {
    for (const record of await Model.find({ cricheroesUrl: { $type: 'string', $ne: '' } })) {
      const r = await syncRecord(kind, record);
      if (r.ok) result.updated++; else result.failed++;
    }
  }
  return result;
}

export function startSyncCron() {
  if (!cron.validate(config.syncCron)) return console.error('Invalid CRICHEROES_SYNC_CRON');
  cron.schedule(config.syncCron, () => runCricHeroesSync().catch((e) => console.error('CricHeroes sync:', e.message)));
}
export { models as syncModels };
