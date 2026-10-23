import { Router } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { asyncHandler, authenticate, authorize, httpError } from './middleware.js';
import { Auction, AuctionEvent, Bid, Player, Team } from './models.js';

const router = Router();
const ROLES = ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'];
const CATEGORY_MULT = { Marquee: 1.9, Premium: 1.45, Regular: 1.15, Emerging: 1.05 };
const oid = (v) => { if (!mongoose.isValidObjectId(v)) throw httpError(400, 'Invalid id'); return v; };
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const soldFilter = { auctionState: 'sold', team: { $ne: null } };

export function composition(players, team) {
  const counts = Object.fromEntries(ROLES.map((r) => [r, 0]));
  for (const p of players) counts[p.role] = (counts[p.role] || 0) + 1;
  return { size: players.length, limit: team?.squadLimit, slotsOpen: team ? Math.max(0, team.squadLimit - players.length) : undefined, byRole: counts, wicketkeepers: counts.Wicketkeeper, batters: counts.Batter, bowlers: counts.Bowler, allRounders: counts['All-rounder'] };
}

// Strength: quality (avg rating of best XI-ish), balance (role coverage) and depth, scaled to 100.
export function teamStrength(players) {
  if (!players.length) return { score: 0, quality: 0, balance: 0, depth: 0 };
  const top = [...players].sort((a, b) => b.rating - a.rating).slice(0, 11);
  const quality = (top.reduce((n, p) => n + p.rating, 0) / top.length) * 10;
  const c = composition(players).byRole;
  const need = { Batter: 4, Bowler: 4, 'All-rounder': 2, Wicketkeeper: 1 };
  const balance = (ROLES.reduce((n, r) => n + Math.min(1, (c[r] || 0) / need[r]), 0) / ROLES.length) * 100;
  const depth = Math.min(100, (players.length / 11) * 100);
  return { score: round(quality * 0.6 + balance * 0.25 + depth * 0.15), quality: round(quality), balance: round(balance), depth: round(depth) };
}

async function squads() {
  const [teams, players] = await Promise.all([Team.find().select('name shortName logo color purseStart purseBalance spent squadLimit captain viceCaptain').lean(), Player.find(soldFilter).select('name role rating category soldPrice team stats').lean()]);
  return teams.map((t) => ({ ...t, players: players.filter((p) => String(p.team) === String(t._id)) }));
}

// ---- Statistics & analytics (public, read-only) ----
router.get('/insights/stats', asyncHandler(async (_req, res) => {
  const [players, teams] = await Promise.all([Player.find({ approved: { $ne: false } }).select('name role category soldPrice auctionState team photo').populate('team', 'name shortName').lean(), Team.find().select('name shortName spent').lean()]);
  const sold = players.filter((p) => p.auctionState === 'sold' && p.soldPrice != null);
  const prices = sold.map((p) => p.soldPrice);
  const top = [...sold].sort((a, b) => b.soldPrice - a.soldPrice)[0];
  const topTeam = [...teams].sort((a, b) => b.spent - a.spent)[0];
  res.json({
    totalPlayers: players.length, sold: sold.length, unsold: players.filter((p) => p.auctionState === 'unsold').length,
    pending: players.filter((p) => ['pending', 'skipped'].includes(p.auctionState)).length,
    highestBid: prices.length ? Math.max(...prices) : 0, lowestBid: prices.length ? Math.min(...prices) : 0,
    averagePrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
    totalSpend: teams.reduce((n, t) => n + (t.spent || 0), 0),
    mostExpensive: top ? { _id: top._id, name: top.name, role: top.role, price: top.soldPrice, team: top.team?.name, photo: top.photo } : null,
    highestSpendingTeam: topTeam?.spent ? { _id: topTeam._id, name: topTeam.name, shortName: topTeam.shortName, spent: topTeam.spent } : null,
  });
}));

router.get('/insights/analytics', asyncHandler(async (_req, res) => {
  const data = await squads();
  const sold = data.flatMap((t) => t.players.map((p) => ({ ...p, teamName: t.shortName })));
  const teamSpending = data.map((t) => ({ team: t.shortName, name: t.name, color: t.color, spent: t.spent || 0, purseStart: t.purseStart, utilization: t.purseStart ? round(((t.spent || 0) / t.purseStart) * 100) : 0 }));
  const roleSpend = ROLES.map((role) => ({ role, spend: sold.filter((p) => p.role === role).reduce((n, p) => n + p.soldPrice, 0), count: sold.filter((p) => p.role === role).length }));
  const edges = [0, 5000, 10000, 25000, 50000, 100000, Infinity];
  const distribution = edges.slice(0, -1).map((lo, i) => ({ range: edges[i + 1] === Infinity ? `${lo / 1000}k+` : `${lo / 1000}-${edges[i + 1] / 1000}k`, players: sold.filter((p) => p.soldPrice >= lo && p.soldPrice < edges[i + 1]).length }));
  const sum = (roles) => sold.filter((p) => roles.includes(p.role)).reduce((n, p) => n + p.soldPrice, 0);
  const perTeamRole = data.map((t) => ({ team: t.shortName, ...Object.fromEntries(ROLES.map((r) => [r, t.players.filter((p) => p.role === r).reduce((n, p) => n + p.soldPrice, 0)])) }));
  res.json({ teamSpending, roleSpend, distribution, perTeamRole, batsmanVsBowler: [{ name: 'Batters + WK', value: sum(['Batter', 'Wicketkeeper']) }, { name: 'Bowlers', value: sum(['Bowler']) }, { name: 'All-rounders', value: sum(['All-rounder']) }] });
}));

// ---- Post-auction: comparison, leaderboard, strength ----
router.get('/insights/teams/:id/composition', asyncHandler(async (req, res) => {
  const team = await Team.findById(oid(req.params.id)).lean(); if (!team) throw httpError(404, 'Team not found');
  const players = await Player.find({ team: team._id, auctionState: 'sold' }).select('name role rating soldPrice category photo stats').sort({ soldPrice: -1 }).lean();
  res.json({ team, players, composition: composition(players, team), strength: teamStrength(players), spent: team.spent, purseBalance: team.purseBalance });
}));

router.get('/insights/compare', asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 6).map(oid);
  if (ids.length < 2) throw httpError(400, 'Pick at least two teams');
  const data = (await squads()).filter((t) => ids.includes(String(t._id)));
  res.json(data.map((t) => ({ _id: t._id, name: t.name, shortName: t.shortName, color: t.color, logo: t.logo, spent: t.spent, purseBalance: t.purseBalance, squadSize: t.players.length, avgRating: t.players.length ? round(t.players.reduce((n, p) => n + p.rating, 0) / t.players.length, 2) : 0, composition: composition(t.players, t), strength: teamStrength(t.players), mostExpensive: [...t.players].sort((a, b) => b.soldPrice - a.soldPrice)[0] || null })));
}));

router.get('/insights/leaderboard', asyncHandler(async (_req, res) => {
  const data = await squads();
  const teams = data.map((t) => ({ _id: t._id, name: t.name, shortName: t.shortName, color: t.color, spent: t.spent, squadSize: t.players.length, strength: teamStrength(t.players) })).sort((a, b) => b.strength.score - a.strength.score).map((t, i) => ({ ...t, rank: i + 1 }));
  const players = await Player.find(soldFilter).select('name role soldPrice rating team').populate('team', 'name shortName').sort({ soldPrice: -1 }).limit(10).lean();
  res.json({ teams, topBuys: players });
}));

// ---- AI (heuristic models; clearly labelled and optional) ----
async function marketBenchmarks() {
  const sold = await Player.find({ auctionState: 'sold', soldPrice: { $gt: 0 } }).select('category role soldPrice basePrice rating').lean();
  const ratios = sold.filter((p) => p.basePrice > 0).map((p) => p.soldPrice / p.basePrice).sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
  return { sold, medianMultiple: median };
}
function predictPrice(player, bench) {
  const rating = player.rating ?? 5;
  const s = player.stats || {};
  const form = Math.min(1.3, 0.8 + ((s.runs || 0) / 300 + (s.wickets || 0) / 15) * 0.25);
  let multiple = (CATEGORY_MULT[player.category] || 1.15) * (0.6 + rating / 12.5) * form;
  const comps = bench.sold.filter((p) => p.category === player.category && p.role === player.role && p.basePrice > 0);
  if (comps.length >= 2) multiple = multiple * 0.5 + (comps.reduce((n, p) => n + p.soldPrice / p.basePrice, 0) / comps.length) * 0.5;
  else if (bench.medianMultiple) multiple = multiple * 0.7 + bench.medianMultiple * 0.3;
  const predicted = Math.round((player.basePrice * multiple) / 500) * 500;
  return { predicted: Math.max(player.basePrice, predicted), low: Math.max(player.basePrice, Math.round((predicted * 0.85) / 500) * 500), high: Math.round((predicted * 1.2) / 500) * 500, confidence: comps.length >= 3 ? 'medium' : 'low', basis: comps.length >= 2 ? `${comps.length} comparable sales` : 'rating, category and form' };
}
const aiMeta = { model: 'icl-heuristic-v1', optional: true, note: 'Estimate from ratings, stats and past sales — a guide, not a guarantee.' };

router.get('/ai/players/:id/price', asyncHandler(async (req, res) => {
  const player = await Player.findById(oid(req.params.id)).lean(); if (!player) throw httpError(404, 'Player not found');
  res.json({ ...aiMeta, player: { _id: player._id, name: player.name, basePrice: player.basePrice, soldPrice: player.soldPrice }, ...predictPrice(player, await marketBenchmarks()) });
}));

router.get('/ai/players/:id/performance', asyncHandler(async (req, res) => {
  const p = await Player.findById(oid(req.params.id)).lean(); if (!p) throw httpError(404, 'Player not found');
  const s = p.stats || {}; const m = Math.max(1, s.matches || 1);
  const batting = Math.min(10, (s.runs / m) / 6 + (s.strikeRate || 0) / 40);
  const bowling = Math.min(10, (s.wickets / m) * 4 + (s.economy ? Math.max(0, (10 - s.economy)) / 2 : 0));
  const rolePerf = { Batter: batting, Wicketkeeper: batting * 0.95, Bowler: bowling, 'All-rounder': (batting + bowling) / 2 }[p.role];
  const projected = round(Math.min(10, rolePerf * 0.6 + p.rating * 0.4));
  res.json({ ...aiMeta, player: { _id: p._id, name: p.name, role: p.role }, projectedRating: projected, battingImpact: round(batting), bowlingImpact: round(bowling), expectedPerMatch: { runs: round((s.runs || 0) / m), wickets: round((s.wickets || 0) / m, 2) }, outlook: projected >= 8 ? 'Match-winner' : projected >= 6.5 ? 'Reliable contributor' : 'Developing' });
}));

router.get('/ai/players/:id/rating', asyncHandler(async (req, res) => {
  const p = await Player.findById(oid(req.params.id)).lean(); if (!p) throw httpError(404, 'Player not found');
  const s = p.stats || {}; const m = Math.max(1, s.matches || 1);
  const bat = Math.min(10, ((s.runs || 0) / m / 40) * 5 + ((s.strikeRate || 0) / 150) * 5);
  const bowl = Math.min(10, ((s.wickets || 0) / m / 2) * 6 + (s.economy ? Math.max(0, 10 - s.economy) / 10 * 4 : 0));
  const value = p.role === 'Bowler' ? bowl : p.role === 'All-rounder' ? (bat + bowl) / 2 + 0.5 : bat;
  res.json({ ...aiMeta, player: { _id: p._id, name: p.name }, currentRating: p.rating, suggestedRating: round(Math.min(10, Math.max(0, value))) });
}));

async function needs(teamId) {
  const team = await Team.findById(oid(teamId)).lean(); if (!team) throw httpError(404, 'Team not found');
  const players = await Player.find({ team: team._id, auctionState: 'sold' }).lean();
  const comp = composition(players, team);
  const target = { Batter: 4, Bowler: 4, 'All-rounder': 2, Wicketkeeper: 1 };
  const gaps = ROLES.map((r) => ({ role: r, have: comp.byRole[r] || 0, target: target[r], short: Math.max(0, target[r] - (comp.byRole[r] || 0)) }));
  const slots = comp.slotsOpen;
  const open = Math.max(1, slots);
  return { team, players, comp, gaps, slots, perSlotBudget: Math.floor(team.purseBalance / open) };
}

router.get('/ai/teams/:id/needs', asyncHandler(async (req, res) => {
  const n = await needs(req.params.id);
  const priority = n.gaps.filter((g) => g.short > 0).map((g) => `${g.short} more ${g.role}${g.short > 1 ? 's' : ''}`);
  res.json({ ...aiMeta, team: { _id: n.team._id, name: n.team.name }, squad: n.comp, gaps: n.gaps, purseBalance: n.team.purseBalance, slotsOpen: n.slots, averageBudgetPerSlot: n.perSlotBudget, summary: priority.length ? `Priority: ${priority.join(', ')}. About ${n.perSlotBudget} per remaining slot.` : 'Squad balance looks complete. Spend on quality upgrades.' });
}));

router.get('/ai/teams/:id/recommendations', asyncHandler(async (req, res) => {
  const n = await needs(req.params.id);
  const bench = await marketBenchmarks();
  const pool = await Player.find({ auctionState: { $in: ['pending', 'unsold', 'skipped'] }, approved: { $ne: false } }).select('-syncedData -manualOverrides').lean();
  const shortRoles = new Set(n.gaps.filter((g) => g.short > 0).map((g) => g.role));
  const scored = pool.map((p) => {
    const est = predictPrice(p, bench);
    const affordable = est.predicted <= n.team.purseBalance;
    const fit = shortRoles.has(p.role) ? 1.5 : 1;
    const value = (p.rating * fit) / Math.max(1, est.predicted / Math.max(1, p.basePrice));
    return { player: { _id: p._id, name: p.name, role: p.role, category: p.category, rating: p.rating, basePrice: p.basePrice, photo: p.photo }, expectedPrice: est.predicted, affordable, fillsNeed: shortRoles.has(p.role), score: round(value * (affordable ? 1 : 0.2), 2) };
  }).sort((a, b) => b.score - a.score).slice(0, 8);
  res.json({ ...aiMeta, team: { _id: n.team._id, name: n.team.name }, recommendations: scored });
}));

// ---- Auction extras ----
router.get('/auction/:id/history/players/:playerId', asyncHandler(async (req, res) => {
  const [bids, events] = await Promise.all([Bid.find({ auction: oid(req.params.id), player: oid(req.params.playerId) }).sort({ createdAt: 1 }).populate('team', 'name shortName').lean(), AuctionEvent.find({ auction: req.params.id, player: req.params.playerId }).sort({ createdAt: 1 }).lean()]);
  res.json({ bids, events });
}));
router.get('/auction/:id/history/teams/:teamId', asyncHandler(async (req, res) => {
  const players = await Player.find({ team: oid(req.params.teamId), auctionState: 'sold' }).select('name role category soldPrice updatedAt').sort({ soldPrice: -1 }).lean();
  res.json(players);
}));

router.get('/auction/:id/receipt/player/:playerId.pdf', authenticate, authorize('admin', 'auctioneer', 'manager'), asyncHandler(async (req, res) => {
  const [auction, player] = await Promise.all([Auction.findById(oid(req.params.id)).lean(), Player.findById(oid(req.params.playerId)).populate('team', 'name shortName').lean()]);
  if (!auction || !player) throw httpError(404, 'Not found');
  if (player.auctionState !== 'sold' || !player.team) throw httpError(409, 'Player has not been sold');
  if (req.user.role === 'manager' && String(req.user.team) !== String(player.team._id)) throw httpError(403, 'Managers may only download their own receipts');
  const sale = await AuctionEvent.findOne({ auction: auction._id, player: player._id, type: 'sold' }).sort({ createdAt: -1 }).lean();
  const receiptNo = `ICL-${String(auction._id).slice(-6).toUpperCase()}-${String(player._id).slice(-6).toUpperCase()}`;
  res.type('application/pdf').attachment(`${receiptNo}.pdf`);
  const doc = new PDFDocument({ margin: 56 }); doc.pipe(res);
  doc.fontSize(24).fillColor('#c99b2e').text('ICL PURCHASE RECEIPT').moveDown(0.3).fontSize(10).fillColor('#666').text(auction.name).moveDown(1.2);
  const row = (k, v) => doc.fontSize(10).fillColor('#888').text(k.toUpperCase(), { continued: false }).fontSize(14).fillColor('#111').text(String(v)).moveDown(0.6);
  row('Receipt no.', receiptNo); row('Auction ID', auction._id); row('Player', `${player.name} (${player.role})`); row('Purchased by', player.team.name);
  row('Final bid', `INR ${Number(player.soldPrice).toLocaleString('en-IN')}`); row('Timestamp', new Date(sale?.createdAt || player.updatedAt).toLocaleString('en-IN'));
  doc.moveDown().fontSize(9).fillColor('#999').text('System-generated receipt. Valid without signature.'); doc.end();
}));

// ---- Player registration (any signed-in user; admin approves) ----
router.post('/players/register', authenticate, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) throw httpError(400, 'Name is required');
  if (!ROLES.includes(b.role)) throw httpError(400, 'Choose a valid role');
  const exists = await Player.exists({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (exists) throw httpError(409, 'A player with this name is already registered');
  const photo = String(b.photo || '').trim();
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const player = await Player.create({
    name, role: b.role, photo: photo || undefined, battingStyle: String(b.battingStyle || '').slice(0, 60), bowlingStyle: String(b.bowlingStyle || '').slice(0, 60),
    category: 'Emerging', basePrice: 2500, rating: 5, approved: false, registeredBy: req.user._id,
    stats: { matches: num(b.matches), runs: num(b.runs), wickets: num(b.wickets) }, cricheroesUrl: String(b.cricheroesUrl || '').trim() || undefined,
  });
  res.status(201).json({ _id: player._id, name: player.name, approved: false, message: 'Registration received. An admin will review it before the auction.' });
}));

export default router;
