import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));

const SYSTEM = {
  fr: 'Tu réponds sur un forum où plusieurs IA donnent leur avis. Réponds en français, en 3 à 5 phrases maximum, sans titre ni liste, sans Markdown (pas d’astérisques). Réponds précisément à la question posée, sans changer de sujet. Si elle est ambiguë, dis en une courte phrase l’hypothèse que tu fais.',
  en: 'You are answering on a forum where several AIs share their views. Reply in English, in 3 to 5 sentences maximum, with no title, no list and no Markdown (no asterisks). Answer the question exactly as asked, without changing the subject. If it is ambiguous, state in one short sentence the assumption you are making.',
};

const PROVIDERS = [
  { id: 'cl', name: 'Claude', company: 'Anthropic', type: 'anthropic', envKey: 'ANTHROPIC_API_KEY', envModel: 'ANTHROPIC_MODEL' },
  { id: 'gp', name: 'ChatGPT', company: 'OpenAI', type: 'openai', url: 'https://api.openai.com/v1/chat/completions', envKey: 'OPENAI_API_KEY', envModel: 'OPENAI_MODEL' },
  { id: 'ge', name: 'Gemini', company: 'Google', type: 'gemini', envKey: 'GEMINI_API_KEY', envModel: 'GEMINI_MODEL' },
  { id: 'mi', name: 'Mistral', company: 'Mistral AI', type: 'openai', url: 'https://api.mistral.ai/v1/chat/completions', envKey: 'MISTRAL_API_KEY', envModel: 'MISTRAL_MODEL' },
  { id: 'gr', name: 'Grok', company: 'xAI', type: 'openai', url: 'https://api.x.ai/v1/chat/completions', envKey: 'XAI_API_KEY', envModel: 'XAI_MODEL' },
];

/* ---------- Stockage des clés saisies dans la page d'administration ---------- */
const DATA_DIR = process.env.DATA_DIR || 'data';
const STORE = path.join(DATA_DIR, 'keys.json');

function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
}
function saveStore(s) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

// Priorité : clé saisie dans l'administration, sinon fichier .env
function config(p, store = loadStore()) {
  const s = store[p.id] || {};
  const envKey = process.env[p.envKey] === 'COLLE_TA_CLE_ICI' ? '' : process.env[p.envKey] || '';
  const key = s.key || envKey;
  const model = s.model || process.env[p.envModel] || '';
  return { key, model, source: s.key ? 'admin' : envKey ? 'env' : null };
}

/* ---------- Appels aux IA ---------- */
async function readJson(res) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}
