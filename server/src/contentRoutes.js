import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler, httpError } from './middleware.js';
import { Gallery, Media, Setting } from './models.js';
import { config } from './config.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 4 * 1024 * 1024;
export const SITE_DEFAULTS = {
  seasonLabel: 'Season 03 · 2026', heroTitle: 'THE PITCH IS OURS.',
  heroSubtitle: 'Follow the IEM Cricket League live — from the first bid to the final six.',
  heroImage: '', logo: '', announcement: '', announcementLink: '',
  scoreStripEnabled: true, scoreStripText: '', about: '', contactEmail: '', instagram: '', youtube: '', sponsors: [],
};
const SITE_KEYS = Object.keys(SITE_DEFAULTS);
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function getSite() {
  const row = await Setting.findOne({ key: 'siteContent' }).lean();
  return { ...SITE_DEFAULTS, ...(row?.value || {}) };
}

// Public: media bytes and site content
export const publicContent = Router();
publicContent.get('/media/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Not found');
  const media = await Media.findById(req.params.id).lean();
  if (!media) throw httpError(404, 'Not found');
  res.set({ 'Content-Type': media.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.send(media.data.buffer ? Buffer.from(media.data.buffer) : media.data);
}));
publicContent.get('/site', asyncHandler(async (_req, res) => res.json(await getSite())));

// Admin (mounted behind authenticate + authorize('admin'))
export const adminContent = Router();
const publicBase = (req) => (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const mediaUrl = (req, id) => `${publicBase(req)}/api/media/${id}`;

adminContent.post('/media', asyncHandler(async (req, res) => {
  const { name = 'image', dataUrl, addToGallery = false, title } = req.body || {};
  const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ''));
  if (!match || !ALLOWED.includes(match[1].toLowerCase())) throw httpError(400, 'Upload a JPEG, PNG, WebP or GIF image');
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_BYTES) throw httpError(400, 'Image must be under 4 MB');
  const media = await Media.create({ name: str(name, 120), contentType: match[1].toLowerCase(), size: data.length, data, uploadedBy: req.user._id });
  const url = mediaUrl(req, media._id);
  const gallery = addToGallery ? await Gallery.create({ title: str(title, 120) || str(name, 120).replace(/\.[a-z0-9]+$/i, ''), imageUrl: url, takenAt: new Date() }) : null;
  res.status(201).json({ _id: media._id, name: media.name, size: media.size, contentType: media.contentType, url, gallery });
}));
adminContent.get('/media', asyncHandler(async (req, res) => {
  const rows = await Media.find().select('-data').sort({ createdAt: -1 }).limit(200).lean();
  res.json(rows.map((m) => ({ ...m, url: mediaUrl(req, m._id) })));
}));
adminContent.delete('/media/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid id');
  const media = await Media.findByIdAndDelete(req.params.id);
  if (!media) throw httpError(404, 'Media not found');
  res.json({ deleted: true, id: req.params.id });
}));
adminContent.put('/site', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const next = { ...(await getSite()) };
  for (const key of SITE_KEYS) {
    if (!(key in body)) continue;
    if (key === 'scoreStripEnabled') next[key] = Boolean(body[key]);
    else if (key === 'sponsors') next[key] = (Array.isArray(body[key]) ? body[key] : []).slice(0, 20).map((s) => ({ name: str(s?.name, 80), logo: str(s?.logo, 2000), url: str(s?.url, 2000) })).filter((s) => s.name);
    else next[key] = str(body[key], key === 'about' ? 4000 : 2000);
  }
  for (const key of ['heroImage', 'logo', 'announcementLink']) if (next[key] && !/^https?:\/\//i.test(next[key])) throw httpError(400, `${key} must be an http(s) URL`);
  await Setting.findOneAndUpdate({ key: 'siteContent' }, { value: next }, { upsert: true });
  res.json(next);
}));
void config;
