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

// Retire le Markdown (**gras**, *italique*, # titres, `code`) si une IA en met malgré la consigne
function stripMd(t) {
  return String(t)
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`\n]+)`/g, '$1');
}
async function ask(...args) {
  const text = await askRaw(...args);
  return text ? stripMd(text) : text;
}

// Ligne ajoutée à tous les prompts : les IA ne connaissent pas la date du jour
function dateLine(lang) {
  const d = new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Paris' });
  return lang === 'fr'
    ? `Date du jour : ${d}. Tes connaissances peuvent dater : si une information (modèles récents, prix, actualité) a pu changer depuis, dis-le plutôt que d’affirmer qu’elle est à jour.`
    : `Today's date: ${d}. Your knowledge may be outdated: if some information (recent models, prices, news) may have changed since, say so instead of claiming it is up to date.`;
}

async function askRaw(p, cfg, question, lang, signal, sys) {
  const system = (sys ?? SYSTEM[lang]) + '\n\n' + dateLine(lang);

  if (p.type === 'anthropic') {
    const d = await readJson(await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 400, system, messages: [{ role: 'user', content: question }] }),
    }));
    return d.content?.find((b) => b.type === 'text')?.text;
  }

  if (p.type === 'gemini') {
    const d = await readJson(await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: question }] }] }),
    }));
    return d.candidates?.[0]?.content?.parts?.map((x) => x.text).join('');
  }

  const d = await readJson(await fetch(p.url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: question }] }),
  }));
  return d.choices?.[0]?.message?.content;
}

/* ---------- Limitation du nombre de requêtes ---------- */
function rateHit(map, ip, max) {
  const now = Date.now();
  const recent = (map.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  map.set(ip, recent);
  return recent.length > max;
}
const askHits = new Map();
const adminHits = new Map();

/* ---------- Route publique : poser une question ---------- */
app.post('/api/ask', async (req, res) => {
  if (rateHit(askHits, req.ip, 10)) return res.status(429).json({ error: 'rate_limit' });

  const question = String(req.body?.question ?? '').trim();
  const lang = SYSTEM[req.body?.lang] ? req.body.lang : 'fr';
  if (question.length < 3 || question.length > 500) return res.status(400).json({ error: 'bad_question' });

  const store = loadStore();
  const results = await Promise.all(PROVIDERS.map(async (p) => {
    const base = { id: p.id, name: p.name, company: p.company };
    const cfg = config(p, store);
    if (!cfg.key || !cfg.model) return { ...base, error: 'not_configured' };
    const start = Date.now();
    try {
      // Délai allongé à 60 secondes au lieu de 25
      const text = await ask(p, cfg, question, lang, AbortSignal.timeout(60_000));
      if (!text) throw new Error('empty answer');
      return { ...base, text: text.trim(), ms: Date.now() - start };
    } catch (e) {
      console.error(`[${p.name}]`, e.message);
      return { ...base, error: 'unavailable' };
    }
  }));

  res.json({ question, lang, results });
});

/* ---------- Débat entre IA et synthèse ---------- */
const DEBATE_SYSTEM = {
  fr: (me) => `Tu es ${me}, une IA qui participe à un débat sur un forum avec d’autres IA. Parle toujours à la première personne (« je ») et ne parle jamais de toi à la troisième personne. Adresse-toi aux autres IA par leur nom. Défends ta position : si tu n’es pas d’accord, dis précisément sur quel point et pourquoi ; n’approuve que si l’argument te convainc vraiment. Réponds en français, en 2 à 3 phrases maximum, sans titre ni liste, sans Markdown (pas d’astérisques).`,
  en: (me) => `You are ${me}, an AI taking part in a forum debate with other AIs. Always speak in the first person ("I") and never refer to yourself in the third person. Address the other AIs by name. Defend your position: if you disagree, say precisely on what point and why; only agree if the argument truly convinces you. Reply in English, in 2 to 3 sentences maximum, with no title, no list and no Markdown (no asterisks).`,
};
const SUMMARY_SYSTEM = {
  fr: 'Tu rédiges une synthèse neutre et courte, en français, sans titre ni liste, sans Markdown (pas d’astérisques).',
  en: 'You write a short, neutral summary in English, with no title, no list and no Markdown (no asterisks).',
};
const clean = (v, n) => String(v ?? '').slice(0, n);
function readAnswers(body) {
  const arr = Array.isArray(body?.answers) ? body.answers.slice(0, 5) : [];
  return arr.map((a) => ({ id: clean(a?.id, 4), name: clean(a?.name, 20), text: clean(a?.text, 1200) })).filter((a) => a.text);
}
const debateHits = new Map();
const summaryHits = new Map();

app.post('/api/debate', async (req, res) => {
  if (rateHit(debateHits, req.ip, 5)) return res.status(429).json({ error: 'rate_limit' });
  const question = clean(req.body?.question, 500).trim();
  const lang = SYSTEM[req.body?.lang] ? req.body.lang : 'fr';
  const answers = readAnswers(req.body);
  if (question.length < 3 || answers.length < 2) return res.status(400).json({ error: 'bad_request' });

  const store = loadStore();
  const results = await Promise.all(PROVIDERS.map(async (p) => {
    const base = { id: p.id, name: p.name };
    const cfg = config(p, store);
    const mine = answers.find((a) => a.id === p.id);
    const others = answers.filter((a) => a.id !== p.id);
    if (!cfg.key || !cfg.model || !mine || others.length === 0) return { ...base, error: 'skipped' };

    // Chaque IA reçoit sa propre réponse (étiquetée) et celles des AUTRES seulement
    const board = others.map((a) => `${a.name} : ${a.text}`).join('\n\n');
    const prompt = lang === 'fr'
      ? `Question du forum : « ${question} »\n\nTa réponse précédente :\n${mine.text}\n\nRéponses des autres IA :\n\n${board}\n\nRéagis à leurs réponses.`
      : `Forum question: "${question}"\n\nYour previous answer:\n${mine.text}\n\nThe other AIs' answers:\n\n${board}\n\nReact to their answers.`;

    try {
      const text = await ask(p, cfg, prompt, lang, AbortSignal.timeout(60_000), DEBATE_SYSTEM[lang](p.name));
      if (!text) throw new Error('empty answer');
      return { ...base, text: text.trim() };
    } catch (e) {
      console.error(`[${p.name} débat]`, e.message);
      return { ...base, error: 'unavailable' };
    }
  }));
  res.json({ results });
});

app.post('/api/summary', async (req, res) => {
  if (rateHit(summaryHits, req.ip, 10)) return res.status(429).json({ error: 'rate_limit' });
  const question = clean(req.body?.question, 500).trim();
  const lang = SYSTEM[req.body?.lang] ? req.body.lang : 'fr';
  const answers = readAnswers(req.body);
  if (question.length < 3 || answers.length < 2) return res.status(400).json({ error: 'bad_request' });

  const board = answers.map((a) => `${a.name} : ${a.text}`).join('\n\n');
  const prompt = lang === 'fr'
    ? `Question : « ${question} »\n\nRéponses des IA :\n\n${board}\n\nRésume en 2 phrases maximum ce sur quoi ces IA s’accordent, et signale un désaccord important s’il y en a un.`
    : `Question: "${question}"\n\nAIs' answers:\n\n${board}\n\nSummarize in 2 sentences maximum what these AIs agree on, and point out any important disagreement.`;

  const out = await askFirstAvailable(ARBITER_ORDER, loadStore(), prompt, lang, SUMMARY_SYSTEM[lang], 'synthèse');
  if (!out) return res.status(502).json({ error: 'unavailable' });
  res.json({ text: out.text });
});

/* ---------- Arbitre impartial : conclusion du débat ---------- */
const listNames = (arr, and) => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' ' + and + ' ' + arr[arr.length - 1];
const VERDICT_SYSTEM = {
  fr: (names) => `Tu es l’arbitre d’un débat sur un forum entre ${listNames(names, 'et')}. Tu joues uniquement le rôle d’arbitre extérieur et impartial : même si tu es le même modèle que l’un des participants, tu ne parles jamais en son nom, tu ne le défends pas et tu ne prends parti pour personne. Tu t’adresses directement à la personne qui a posé la question, en la tutoyant. N’attribue une position à une IA que si elle l’a réellement écrite ; en cas de doute, ne l’attribue pas. Réponds en français, en 4 phrases maximum, en un seul paragraphe, sans titre, sans liste et sans Markdown (pas d’astérisques).`,
  en: (names) => `You are the referee of a forum debate between ${listNames(names, 'and')}. You act only as an outside, impartial referee: even if you are the same model as one of the participants, you never speak on its behalf, never defend it and take no side. You address the person who asked the question directly. Only attribute a position to an AI if it actually wrote it; when unsure, do not attribute it. Reply in English, in 4 sentences maximum, in a single paragraph, with no title, no list and no Markdown (no asterisks).`,
};
const verdictHits = new Map();

// Ordre des arbitres possibles. On peut forcer le premier avec ARBITER_PROVIDER (ex : mi).
const ARBITER_ORDER = [...new Set([...(process.env.ARBITER_PROVIDER ? [process.env.ARBITER_PROVIDER] : []), 'cl', 'gp', 'mi', 'gr', 'ge'])]
  .map((id) => PROVIDERS.find((p) => p.id === id)).filter(Boolean);

// Essaie les IA dans l'ordre : si l'une échoue (crédit, quota, panne), la suivante prend le relais
async function askFirstAvailable(order, store, prompt, lang, system, label) {
  for (const p of order) {
    const cfg = config(p, store);
    if (!cfg.key || !cfg.model) continue;
    try {
      const text = await ask(p, cfg, prompt, lang, AbortSignal.timeout(60_000), system);
      if (text) return { text: text.trim(), by: p.name };
    } catch (e) {
      console.error(`[${label} ${p.name}]`, e.message);
    }
  }
  return null;
}

app.post('/api/verdict', async (req, res) => {
  if (rateHit(verdictHits, req.ip, 10)) return res.status(429).json({ error: 'rate_limit' });
  const question = clean(req.body?.question, 500).trim();
  const lang = SYSTEM[req.body?.lang] ? req.body.lang : 'fr';
  const answers = readAnswers(req.body);
  const debate = readAnswers({ answers: req.body?.debate });
  if (question.length < 3 || answers.length < 2 || debate.length < 1) return res.status(400).json({ error: 'bad_request' });

  const first = answers.map((a) => `${a.name} : ${a.text}`).join('\n\n');
  const react = debate.map((a) => `${a.name} : ${a.text}`).join('\n\n');
  const prompt = lang === 'fr'
    ? `Question du forum : « ${question} »\n\nRéponses initiales des IA :\n\n${first}\n\nÉchanges du débat :\n\n${react}\n\nDonne ta conclusion : ce sur quoi elles s’accordent, le désaccord qui reste, puis un conseil utile pour toi qui as posé la question. Ne désigne un gagnant que si les arguments le justifient clairement.`
    : `Forum question: "${question}"\n\nThe AIs' initial answers:\n\n${first}\n\nDebate exchanges:\n\n${react}\n\nGive your conclusion: what they agree on, the disagreement that remains, then a useful conclusion for the person who asked. Only name a winner if the arguments clearly justify it.`;

  // On essaie les arbitres dans l'ordre : si l'un échoue (crédit, quota…), le suivant prend le relais
  const store = loadStore();
  for (const p of ARBITER_ORDER) {
    const cfg = config(p, store);
    if (!cfg.key || !cfg.model) continue;
    try {
      const text = await ask(p, cfg, prompt, lang, AbortSignal.timeout(60_000), VERDICT_SYSTEM[lang]([...new Set(answers.map((a) => a.name))]));
      if (text) return res.json({ text: text.trim(), by: p.name });
    } catch (e) {
      console.error(`[arbitre ${p.name}]`, e.message);
    }
  }
  res.status(502).json({ error: 'unavailable' });
});

/* ---------- Administration (protégée par ADMIN_PASSWORD) ---------- */
function adminAuth(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw === 'CHOISIS_UN_MOT_DE_PASSE_LONG') return res.status(503).json({ error: 'admin_disabled' });
  if (rateHit(adminHits, req.ip, 30)) return res.status(429).json({ error: 'rate_limit' });
  const given = crypto.createHash('sha256').update(String(req.get('x-admin-password') || '')).digest();
  const real = crypto.createHash('sha256').update(pw).digest();
  if (!crypto.timingSafeEqual(given, real)) return res.status(401).json({ error: 'bad_password' });
  next();
}

app.get('/api/admin/status', adminAuth, (req, res) => {
  const store = loadStore();
  res.json(PROVIDERS.map((p) => {
    const c = config(p, store);
    return { id: p.id, name: p.name, company: p.company, hasKey: !!c.key, hint: c.key ? '••••' + c.key.slice(-4) : '', model: c.model, source: c.source };
  }));
});

app.post('/api/admin/keys', adminAuth, (req, res) => {
  const p = PROVIDERS.find((x) => x.id === req.body?.id);
  if (!p) return res.status(400).json({ error: 'bad_provider' });
  const store = loadStore();

  if (req.body.remove) {
    delete store[p.id];
  } else {
    const key = String(req.body.key ?? '').trim();
    const model = String(req.body.model ?? '').trim();
    if (key && (key.length < 8 || key.length > 300 || /\s/.test(key))) return res.status(400).json({ error: 'bad_key' });
    if (model && !/^[\w.\-:]{1,100}$/.test(model)) return res.status(400).json({ error: 'bad_model' });
    const cur = store[p.id] || {};
    store[p.id] = { key: key || cur.key, model: model || cur.model };
    if (!store[p.id].key && !store[p.id].model) delete store[p.id];
  }
  saveStore(store);
  res.json({ ok: true });
});

app.post('/api/admin/test', adminAuth, async (req, res) => {
  const p = PROVIDERS.find((x) => x.id === req.body?.id);
  if (!p) return res.status(400).json({ error: 'bad_provider' });
  const cfg = config(p);
  if (!cfg.key || !cfg.model) return res.json({ ok: false, error: 'not_configured' });
  try {
    // Délai allongé à 60 secondes au lieu de 20
    const text = await ask(p, cfg, 'Dis bonjour en une phrase.', 'fr', AbortSignal.timeout(60_000));
    res.json({ ok: !!text, sample: (text || '').slice(0, 120) });
  } catch (e) {
    res.json({ ok: false, error: e.message.slice(0, 200) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Agora tourne sur http://localhost:${port}  (administration : /admin.html)`));
