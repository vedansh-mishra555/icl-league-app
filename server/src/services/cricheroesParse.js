// CricHeroes serves public pages as Next.js app-router output. The page data is embedded in
// `self.__next_f.push([1,"..."])` flight chunks. No API key is involved: we only read what the
// public HTML already contains.

export function flightText(html) {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { out += JSON.parse(m[1]); } catch { /* skip undecodable chunk */ }
  }
  return out;
}

// Parse the balanced JSON value (object or array) starting at text[start].
export function parseBalanced(text, start) {
  const open = text[start];
  if (open !== '{' && open !== '[') return undefined;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return undefined; } } }
  }
  return undefined;
}

// Value of the first `"key":{...}` / `"key":[...]` in the flight text.
export function valueAfter(text, key, from = 0) {
  const marker = `"${key}":`;
  let i = text.indexOf(marker, from);
  while (i !== -1) {
    const v = parseBalanced(text, i + marker.length);
    if (v !== undefined) return v;
    i = text.indexOf(marker, i + marker.length);
  }
  return undefined;
}

export function cricHeroesKind(url) {
  const path = new URL(url).pathname;
  if (/^\/player-profile\//.test(path)) return 'player';
  if (/^\/team-profile\//.test(path)) return 'team';
  if (/^\/tournament\//.test(path)) return 'tournament';
  if (/^\/scorecard\//.test(path)) return 'match';
  return null;
}

// Numeric id embedded in a CricHeroes URL (player id, team id, tournament id, match id).
export function idFromUrl(url) {
  try { return new URL(url).pathname.match(/^\/(?:player-profile|team-profile|tournament|scorecard)\/(\d+)/)?.[1]; } catch { return undefined; }
}

// Player pages carry their stats on the /stats tab; make sure we fetch that one.
export function canonicalUrl(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/player-profile\/(\d+)\/([^/]+)/);
  if (m) u.pathname = `/player-profile/${m[1]}/${m[2]}/stats`;
  const t = u.pathname.match(/^\/team-profile\/(\d+)\/([^/]+)/);
  if (t) u.pathname = `/team-profile/${t[1]}/${t[2]}/profile`;
  const tr = u.pathname.match(/^\/tournament\/(\d+)\/([^/]+)/);
  if (tr) u.pathname = `/tournament/${tr[1]}/${tr[2]}/point-table`;
  const s = u.pathname.match(/^\/scorecard\/(\d+)\/([^/]+)\/([^/]+)(?:\/([^/]+))?/);
  if (s) {
    const tail = ['live', 'summary'].includes(s[4]) ? s[4] : 'live';
    u.pathname = s[3] === 'live' || s[3] === 'summary' ? `/scorecard/${s[1]}/${s[2]}/${s[3]}` : `/scorecard/${s[1]}/${s[2]}/${s[3]}/${tail}`;
  }
  u.search = ''; u.hash = '';
  return u.toString();
}

const num = (v) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : undefined; };
const byTitle = (rows = []) => Object.fromEntries(rows.map((r) => [String(r.title).toLowerCase(), r.value]));
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

export function parsePlayer(text) {
  const stats = valueAfter(text, 'initialStats')?.statistics;
  const startProfile = text.indexOf('{"player_id":');
  const profile = startProfile >= 0 ? parseBalanced(text, startProfile) : undefined;
  if (!profile?.name && !(stats?.batting?.length || stats?.bowling?.length)) return null; // unknown id or private profile
  const bat = byTitle(stats?.batting), bowl = byTitle(stats?.bowling);
  return {
    profile: profile ? clean({ name: profile.name, photo: profile.profile_photo, city: profile.city_name, battingStyle: profile.batting_hand, bowlingStyle: profile.bowling_style, role: profile.playing_role }) : {},
    stats: clean({
      matches: Math.max(num(bat.matches) || 0, num(bowl.matches) || 0, num(profile?.total_matches) || 0) || undefined,
      runs: num(bat.runs) ?? num(profile?.total_runs),
      wickets: num(bowl.wickets) ?? num(profile?.total_wickets),
      strikeRate: num(bat.sr), economy: num(bowl.economy),
      innings: num(bat.innings), notOuts: num(bat['not out']), highestScore: num(bat['highest runs']), average: num(bat.avg),
      fifties: num(bat['50s']), hundreds: num(bat['100s']), fours: num(bat['4s']), sixes: num(bat['6s']),
      bestBowling: bowl['best bowling'], bowlingAverage: num(bowl.avg), oversBowled: num(bowl.overs),
    }),
    raw: stats,
  };
}

export function parseTeam(text) {
  const v = valueAfter(text, 'teamDetails');
  const d = v?.data ?? v;
  if (!d?.team_id) return null;
  return { profile: clean({ id: String(d.team_id), name: d.team_name, logo: d.logo, city: d.city_name }) };
}

export function parseTournament(text) {
  const v = valueAfter(text, 'tournamentDetails');
  const d = v?.data ?? v;
  const at = text.indexOf('[{"more":');
  const rows = at >= 0 ? parseBalanced(text, at) : undefined;
  if (!d && !rows) return null;
  return {
    profile: d ? clean({ id: String(d.tournament_id), name: d.tournament_name, logo: d.tournament_logo, city: d.city_name, matches: d.match_count }) : {},
    standings: (rows || []).filter((r) => r && r.TeamID != null).map((r) => ({
      teamId: String(r.TeamID), teamName: r['Team Name'], group: r.Group, played: num(r.Matches), won: num(r.Won), lost: num(r.Lost), tied: num(r.Tied),
      points: num(r.Points), nrr: num(String(r['Net RR']).replace(/[^\d.+-]/g, '')),
    })),
  };
}

export function parseMatch(text) {
  const mini = valueAfter(text, 'miniScorecard');
  const sd = valueAfter(text, 'summaryData');
  const summary = mini?.data ?? sd?.data ?? (mini?.team_a ? mini : sd?.team_a ? sd : undefined);
  const a = summary?.team_a, b = summary?.team_b;
  if (!a || !b) return null;
  const currentInning = Number(summary.current_inning) || undefined;
  const side = (t) => {
    const innings = t.innings || [];
    const total = innings.reduce((acc, i) => ({ runs: (acc.runs || 0) + (i.total_run || 0), wickets: i.total_wicket, overs: i.overs_played }), {});
    const last = innings[innings.length - 1];
    return clean({ id: String(t.id), name: t.name, logo: t.logo, ...total, runRate: num(last?.summary?.rr), batting: innings.some((i) => i.inning === currentInning) || undefined });
  };
  const ms = summary.match_summary || {};
  const result = ms.summary || (summary.win_by ? `${summary.winning_team} won by ${summary.win_by}` : '');
  const sides = [side(a), side(b)];
  const scored = sides.some((x) => x.runs > 0 || x.overs);
  const rawStatus = String(summary.status || '').toLowerCase();
  let status = 'upcoming';
  if (summary.win_by || /resulted|abandon|tie|draw|no result/i.test(summary.match_result || '') || /complete|result|past/.test(rawStatus)) status = 'completed';
  else if (rawStatus.includes('live') || scored) status = 'live';
  const battingSide = sides.find((x) => x.batting) || sides[0];
  const bat = summary.batsmen || {}, bowl = summary.bowlers || {};
  const batter = (x, strike) => x && clean({ name: x.name, runs: x.runs, balls: x.balls, fours: x['4s'], sixes: x['6s'], strikeRate: num(x.strike_rate), onStrike: strike });
  const bowler = bowl.sb || bowl.nsb;
  const live = status === 'live' ? clean({
    batters: [batter(bat.sb, true), batter(bat.nsb, false)].filter(Boolean),
    bowler: bowler && clean({ name: bowler.name, overs: `${bowler.overs}${bowler.balls ? `.${bowler.balls}` : ''}`, maidens: bowler.maidens, runs: bowler.runs, wickets: bowler.wickets, economy: num(bowler.economy_rate) }),
    recentOver: summary.recent_over, partnership: summary.current_partnership, lastWicket: summary.last_wicket !== '-' ? summary.last_wicket : undefined, fallOfWicket: summary.fall_of_wicket,
    runRate: battingSide.runRate, projectedScore: num(summary.projected_score),
    target: ms.target && ms.target !== '-' ? ms.target : undefined, requiredRate: num(ms.rrr) ? num(ms.rrr) : undefined, toss: summary.toss_details || undefined, oversLimit: summary.overs, inning: currentInning,
  }) : undefined;
  return { profile: clean({ id: String(summary.match_id), venue: summary.ground_name, city: summary.city_name, startsAt: summary.start_datetime, result, tournament: summary.tournament_name, currentOver: status === 'live' ? battingSide.overs : undefined }), teamA: sides[0], teamB: sides[1], status, live };
}

export function parsePage(html, url) {
  const kind = cricHeroesKind(url);
  const text = flightText(html);
  const parsed = { player: parsePlayer, team: parseTeam, tournament: parseTournament, match: parseMatch }[kind]?.(text);
  return parsed ? { kind, ...parsed } : { kind, empty: true };
}

// Scorecard pages come in /live and /summary flavours; swap if the first has no data.
export function alternateUrl(url) {
  const u = new URL(url);
  if (/\/live$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/live$/, '/summary');
  else if (/\/summary$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/summary$/, '/live');
  else return null;
  return u.toString();
}
