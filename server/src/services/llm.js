import crypto from 'node:crypto';
import { config } from '../config.js';
import { Setting } from '../models.js';

// Every provider below speaks the OpenAI chat-completions dialect, so one code path serves them all.
// Gemini is reached through Google's OpenAI-compatible endpoint.
export const PROVIDERS = {
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', env: ['GROQ_API_KEY'] },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', env: ['OPENAI_API_KEY'] },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  xai: { label: 'xAI Grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini', env: ['XAI_API_KEY', 'GROK_API_KEY'] },
  custom: { label: 'Custom OpenAI-compatible', baseUrl: '', model: '', env: ['LLM_API_KEY'] },
};

// Stored keys are encrypted at rest with a key derived from JWT_SECRET.
const secret = () => crypto.createHash('sha256').update(`icl-llm:${config.jwtSecret}`).digest();
export function encryptKey(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decryptKey(blob) {
  try {
    const [iv, tag, enc] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', secret(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return ''; }
}

const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');
function fromEnv() {
  const explicit = (process.env.LLM_PROVIDER || '').toLowerCase();
  const order = explicit && PROVIDERS[explicit] ? [explicit] : ['groq', 'openai', 'gemini', 'xai', 'custom'];
  for (const id of order) {
    const key = process.env.LLM_API_KEY && (explicit === id || id === 'custom' && !explicit) ? process.env.LLM_API_KEY : PROVIDERS[id].env.map((n) => process.env[n]).find(Boolean);
    if (key) {
      const p = PROVIDERS[id];
      const model = process.env.LLM_MODEL || (id === 'groq' ? config.groqModel : '') || p.model;
      return { provider: id, apiKey: key, baseUrl: trimUrl(process.env.LLM_BASE_URL || p.baseUrl), model, source: 'env' };
    }
  }
  return null;
}

// An environment key is only ever sent to the endpoint it belongs to.
function envKeyFor(provider, baseUrl) {
  const env = fromEnv();
  return env && env.provider === provider && trimUrl(baseUrl) === env.baseUrl ? env.apiKey : '';
}

// Settings saved from the admin panel override environment variables.
export async function getLlmConfig() {
  const row = await Setting.findOne({ key: 'llmConfig' }).lean();
  const v = row?.value;
  if (v?.provider && v.provider !== 'off') {
    const p = PROVIDERS[v.provider];
    const baseUrl = trimUrl(v.baseUrl || p?.baseUrl);
    const apiKey = v.apiKeyEnc ? decryptKey(v.apiKeyEnc) : envKeyFor(v.provider, baseUrl);
    if (p && apiKey) return { provider: v.provider, apiKey, baseUrl, model: v.model || p.model, source: 'admin' };
  }
  if (v?.provider === 'off') return null;
  return fromEnv();
}

export async function llmStatus() {
  const row = await Setting.findOne({ key: 'llmConfig' }).lean();
  const active = await getLlmConfig();
  const mask = (k) => (k ? `${k.slice(0, 3)}…${k.slice(-4)}` : '');
  return {
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, baseUrl: p.baseUrl, model: p.model })),
    saved: row?.value ? { provider: row.value.provider, baseUrl: row.value.baseUrl || '', model: row.value.model || '', hasKey: Boolean(row.value.apiKeyEnc) } : null,
    active: active ? { provider: active.provider, label: PROVIDERS[active.provider].label, model: active.model, baseUrl: active.baseUrl, source: active.source, key: mask(active.apiKey) } : null,
  };
}

export async function saveLlmConfig({ provider, apiKey, baseUrl, model }) {
  const prev = (await Setting.findOne({ key: 'llmConfig' }).lean())?.value || {};
  if (provider !== 'off' && !PROVIDERS[provider]) throw Object.assign(new Error('Unknown provider'), { status: 400, expose: true });
  if (baseUrl) { try { if (!/^https?:$/.test(new URL(baseUrl).protocol)) throw new Error(); } catch { throw Object.assign(new Error('Base URL must be http(s)'), { status: 400, expose: true }); } }
  if (provider === 'custom' && !baseUrl) throw Object.assign(new Error('Custom provider needs a base URL'), { status: 400, expose: true });
  const value = { provider, baseUrl: trimUrl(baseUrl), model: String(model || '').trim(), apiKeyEnc: apiKey ? encryptKey(String(apiKey).trim()) : prev.apiKeyEnc };
  await Setting.findOneAndUpdate({ key: 'llmConfig' }, { value }, { upsert: true });
  return llmStatus();
}

// One chat completion. Throws on any failure so callers can fall back.
export async function chatCompletion({ system, user, maxTokens = 350, timeoutMs = 10000, cfg }) {
  const c = cfg || await getLlmConfig();
  if (!c) throw new Error('No AI provider configured');
  const body = { model: c.model, temperature: 0.2, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  const response = await fetch(`${c.baseUrl}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    let detail = ''; try { detail = (await response.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new Error(`${PROVIDERS[c.provider]?.label || 'AI provider'} returned ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }
  const text = (await response.json()).choices?.[0]?.message?.content;
  if (!text) throw new Error('AI provider returned an empty answer');
  return text.trim();
}

// Admin "Test connection": uses the supplied values without saving them.
export async function testLlm({ provider, apiKey, baseUrl, model }) {
  const saved = await getLlmConfig();
  const p = PROVIDERS[provider];
  if (!p) throw Object.assign(new Error('Unknown provider'), { status: 400, expose: true });
  const target = trimUrl(baseUrl || p.baseUrl);
  const key = apiKey || (saved?.provider === provider && saved.baseUrl === target ? saved.apiKey : '') || envKeyFor(provider, target);
  if (!key) throw Object.assign(new Error('Enter an API key first'), { status: 400, expose: true });
  const cfg = { provider, apiKey: key, baseUrl: target, model: model || p.model };
  if (!cfg.baseUrl) throw Object.assign(new Error('Base URL is required'), { status: 400, expose: true });
  const started = Date.now();
  const text = await chatCompletion({ system: 'Reply with the single word OK.', user: 'ping', maxTokens: 20, timeoutMs: 15000, cfg });
  return { ok: true, ms: Date.now() - started, reply: text.slice(0, 40) };
}
