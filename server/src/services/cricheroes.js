import cron from 'node-cron';
import { config } from '../config.js';
import { Match, Player, Setting, SyncCache, Team, Tournament } from '../models.js';
import { alternateUrl, canonicalUrl, cricHeroesKind, idFromUrl, parsePage } from './cricheroesParse.js';

export const syncModels = { tournament: Tournament, team: Team, player: Player, match: Match };
const SYNC_ORDER = ['tournament', 'team', 'player', 'match']; // standings first so team records line up
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function mergeSource(record) { return { ...record.syncedData, ...record.toObject?.(), ...record.manualOverrides }; }

export function isPublicCricHeroesUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['cricheroes.com', 'www.cricheroes.com'].includes(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch { return false; }
}

// Public pages only: no API key, login or private endpoint is involved.
export async function fetchCricHeroes(rawUrl) {
  if (!isPublicCricHeroesUrl(rawUrl)) throw new Error('URL must use https://cricheroes.com or https://www.cricheroes.com');
  let url = canonicalUrl(rawUrl);
  let triedAlt = false;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ICL-league-sync/1.0)', Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      const next = new URL(response.headers.get('location'), url).toString();
      if (!isPublicCricHeroesUrl(next)) throw new Error('CricHeroes redirected somewhere unexpected');
      url = next; continue;
    }
    if (response.status === 404) throw new Error('Page not found on CricHeroes. Check the link.');
    if (!response.ok) throw new Error(`CricHeroes returned HTTP ${response.status}`);
    let parsed = parsePage(await response.text(), url);
    if (parsed.empty && parsed.kind === 'match' && alternateUrl(url) && !triedAlt) { triedAlt = true; url = alternateUrl(url); hop--; continue; }
    if (parsed.empty || !parsed.kind) throw new Error('No public data on this page. The profile may be private, or the link is not a player, team, tournament or scorecard page.');
    return { ...parsed, url, fetchedAt: new Date() };
  }
  throw new Error('Too many redirects');
}

const hasManual = (record, path) => {
  const [a, b] = path.split('.');
  const m = record.manualOverrides || {};
  return b ? m[a]?.[b] !== undefined : m[a] !== undefined;
};
const plain = (v) => v?.toObject?.() || v || {};

// ---- applying parsed data to our records (manual overrides always win) ----
// Player statistics are paywalled on CricHeroes, so they are entered manually in Admin → Players.
// Sync only fills the free public profile bits (photo, batting/bowling style).
function applyPlayer(record, data) {
  const p = data.profile;
  if (p.photo && !record.photo && !hasManual(record, 'photo')) record.photo = p.photo;
  if (p.battingStyle && !record.battingStyle) record.battingStyle = p.battingStyle;
  if (p.bowlingStyle && !record.bowlingStyle) record.bowlingStyle = p.bowlingStyle;
  record.syncedData = { profile: p, url: data.url, fetchedAt: data.fetchedAt };
  return { name: p.name };
}
function applyTeam(record, data) {
  const p = data.profile;
  if (p.logo && !record.logo && !hasManual(record, 'logo')) record.logo = p.logo;
  record.syncedData = { profile: p, url: data.url, fetchedAt: data.fetchedAt };
  return { name: p.name };
}
async function applyTournament(record, data) {
  record.syncedData = { profile: data.profile, standings: data.standings, url: data.url, fetchedAt: data.fetchedAt };
  const teams = await Team.find();
  let matched = 0;
  for (const row of data.standings) {
    const team = teams.find((t) => t.cricheroesId === row.teamId) || teams.find((t) => t.name.trim().toLowerCase() === String(row.teamName || '').trim().toLowerCase());
    if (!team) continue;
    const stats = { ...plain(team.stats) };
    for (const k of ['played', 'won', 'lost', 'points', 'nrr']) if (row[k] !== undefined && !hasManual(team, `stats.${k}`)) stats[k] = row[k];
    team.stats = stats;
    if (!team.cricheroesId) team.cricheroesId = row.teamId;
    await team.save(); matched++;
  }
  return { standings: data.standings.length, teamsUpdated: matched };
}
async function applyMatch(record, data) {
  await record.populate('teamA teamB');
  const sides = [data.teamA, data.teamB];
  const ours = [record.teamA, record.teamB];
  const pick = (mine) => sides.find((s) => mine?.cricheroesId && s.id === mine.cricheroesId) || sides.find((s) => mine && s.name?.trim().toLowerCase() === mine.name.trim().toLowerCase());
  let mapped = ours.map(pick);
  if (!mapped[0] || !mapped[1] || mapped[0] === mapped[1]) mapped = sides; // fall back to listed order
  if (!hasManual(record, 'innings')) record.innings = ours.map((t, i) => ({ team: t?._id, runs: mapped[i].runs, wickets: mapped[i].wickets, overs: mapped[i].overs }));
  if (data.profile.result && !hasManual(record, 'result')) record.result = data.profile.result;
  if (!hasManual(record, 'status')) record.status = data.status;
  if (data.profile.venue && !record.venue) record.venue = data.profile.venue;
  if (!hasManual(record, 'liveMessage')) record.liveMessage = data.status === 'live' ? data.profile.result : '';
  record.currentOver = data.status === 'live' ? data.profile.currentOver : record.currentOver;
  record.live = data.status === 'live' ? data.live : null;
  record.liveUpdatedAt = new Date();
  if (data.status === 'completed') record.liveSync = false; // final score captured; stop polling
  record.markModified('live');
  if (data.profile.startsAt && !record.startsAt) record.startsAt = new Date(data.profile.startsAt);
  record.syncedData = { profile: data.profile, teams: sides, url: data.url, fetchedAt: data.fetchedAt };
  return { result: data.profile.result };
}

const appliers = { player: applyPlayer, team: applyTeam, tournament: applyTournament, match: applyMatch };

export async function previewCricHeroes(url, expectedKind) {
  const data = await fetchCricHeroes(url);
  const mismatch = expectedKind && expectedKind !== data.kind ? `This looks like a ${data.kind} link, but this form is for a ${expectedKind}.` : null;
  const stats = data.kind === 'player' ? {} : data.stats || {};
  const summary = {
    kind: data.kind, name: data.profile?.name || data.teamA?.name && `${data.teamA.name} vs ${data.teamB.name}`, image: data.profile?.photo || data.profile?.logo,
    stats, standings: data.standings?.length, result: data.profile?.result, city: data.profile?.city,
  };
  const found = Object.keys(stats).length ? `${Object.keys(stats).length} stats found` : data.standings?.length ? `${data.standings.length} teams in the points table` : data.kind === 'match' ? `${data.status} scorecard found` : data.kind === 'player' ? 'photo and playing style found; stats are entered manually' : 'profile found';
  return { ...summary, status: data.status, live: data.live, title: summary.name || `CricHeroes ${data.kind}`, foundStructuredData: true, mismatch, note: mismatch || `Public ${data.kind} data detected (${found}). It will be applied on sync; anything you enter manually is kept.` };
}

export async function syncRecord(kind, record) {
  const key = `cricheroes:${kind}:${record._id}`;
  try {
    const data = await fetchCricHeroes(record.cricheroesUrl);
    if (data.kind !== kind) throw new Error(`Link is a ${data.kind} page but this record is a ${kind}`);
    if (!record.cricheroesId) record.cricheroesId = idFromUrl(record.cricheroesUrl);
    const result = await appliers[kind](record, data);
    record.lastSyncedAt = new Date();
    record.markModified('syncedData');
    await record.save();
    await SyncCache.findOneAndUpdate({ key }, { source: 'cricheroes', status: 'ok', payload: { url: data.url, ...result }, error: null, lastUpdatedAt: new Date() }, { upsert: true });
    return { ok: true, ...result };
  } catch (error) {
    await SyncCache.findOneAndUpdate({ key }, { source: 'cricheroes', status: 'stale', error: error.message }, { upsert: true });
    return { ok: false, error: error.message };
  }
}

export async function runCricHeroesSync({ force = false } = {}) {
  const setting = await Setting.findOne({ key: 'cricheroesSyncEnabled' }).lean();
  if (!force && (setting ? !setting.value : !config.syncEnabled)) return { skipped: true, reason: 'disabled' };
  const result = { updated: 0, failed: 0, errors: [] };
  for (const kind of SYNC_ORDER) {
    for (const record of await syncModels[kind].find({ cricheroesUrl: { $type: 'string', $ne: '' } })) {
      const r = await syncRecord(kind, record);
      if (r.ok) result.updated++; else { result.failed++; result.errors.push(`${kind} ${record.name || record._id}: ${r.error}`); }
      await sleep(600); // be gentle with a public site
    }
  }
  return result;
}

export function startSyncCron() {
  if (!cron.validate(config.syncCron)) return console.error('Invalid CRICHEROES_SYNC_CRON');
  cron.schedule(config.syncCron, () => runCricHeroesSync().catch((e) => console.error('CricHeroes sync:', e.message)));
}
export { cricHeroesKind };
