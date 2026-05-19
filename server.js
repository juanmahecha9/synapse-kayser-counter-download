import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://kayser-fawn.vercel.app';
const API_SECRET = process.env.API_SECRET || 'kayser-downloads-secret-2024';

app.use(cors());
app.use(express.json());

// ── Storage ───────────────────────────────────────────────────────────────────
// Uses Upstash Redis in production (via UPSTASH_REDIS_REST_URL / _TOKEN env vars
// set automatically by Vercel's Upstash integration).
// Falls back to in-memory Map for local dev when those vars are absent.
const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
let _store = null;

async function storage() {
  if (_store) return _store;

  if (hasRedis) {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    _store = {
      get: (k) => redis.get(k),
      incr: (k) => redis.incr(k),
      set: (k, v) => redis.set(k, v),
    };
    console.log('✅ Usando Upstash Redis');
  } else {
    console.warn('⚠ UPSTASH_REDIS_REST_URL/TOKEN no definidos — usando almacenamiento en memoria (los datos se pierden al reiniciar)');
    const mem = new Map();
    _store = {
      get: async (k) => mem.get(k) ?? 0,
      incr: async (k) => {
        const v = (mem.get(k) ?? 0) + 1;
        mem.set(k, v);
        return v;
      },
      set: async (k, v) => { mem.set(k, v); },
    };
  }

  return _store;
}

// ── Auth middleware ────────────────────────────────────────────────────────────
function verifyAuth(req, res, next) {
  if (req.method === 'GET') return next();

  const origin = req.headers['origin'];
  const apiKey = req.headers['x-api-key'];

  console.log(`[AUTH] ${req.method} ${req.path} | origin=${origin}`);

  if (origin !== ALLOWED_ORIGIN) {
    console.warn(`[BLOCKED] origin no permitido: ${origin}`);
    return res.status(403).json({ error: 'Origin no permitido', received: origin });
  }
  if (!apiKey || apiKey !== API_SECRET) {
    console.warn('[BLOCKED] API key inválida');
    return res.status(401).json({ error: 'API key inválida' });
  }

  next();
}

app.use(verifyAuth);

// ── Endpoints ─────────────────────────────────────────────────────────────────

// GET /health  — public
app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', storage: hasRedis ? 'upstash-redis' : 'in-memory' });
});

// GET /downloads  — public, devuelve total acumulado
app.get('/downloads', async (req, res) => {
  try {
    const store = await storage();
    const total = (await store.get('downloads:total')) ?? 0;
    res.json({ total: Number(total) });
  } catch (err) {
    console.error('[GET /downloads]', err);
    res.status(500).json({ error: 'Error de almacenamiento' });
  }
});

// GET /downloads/stats  — public, desglose por SO
app.get('/downloads/stats', async (req, res) => {
  try {
    const store = await storage();
    const [total, win, mac, linux] = await Promise.all([
      store.get('downloads:total'),
      store.get('downloads:os:Windows'),
      store.get('downloads:os:macOS'),
      store.get('downloads:os:Linux'),
    ]);
    res.json({
      total: Number(total ?? 0),
      windows: Number(win ?? 0),
      macos: Number(mac ?? 0),
      linux: Number(linux ?? 0),
    });
  } catch (err) {
    console.error('[GET /downloads/stats]', err);
    res.status(500).json({ error: 'Error de almacenamiento' });
  }
});

// POST /downloads/increment  — protegido, se llama al hacer click en descargar
app.post('/downloads/increment', async (req, res) => {
  const { os } = req.body || {};
  try {
    const store = await storage();
    const total = await store.incr('downloads:total');
    if (os) await store.incr(`downloads:os:${os}`);
    console.log(`[INCREMENT] os=${os ?? 'unknown'} → total=${total}`);
    res.json({ total, os: os || null });
  } catch (err) {
    console.error('[POST /downloads/increment]', err);
    res.status(500).json({ error: 'Error de almacenamiento' });
  }
});

// POST /downloads/set  — protegido, permite ajustar el total inicial (migración)
app.post('/downloads/set', async (req, res) => {
  const { total } = req.body || {};
  if (typeof total !== 'number' || total < 0) {
    return res.status(400).json({ error: 'total debe ser un número >= 0' });
  }
  try {
    const store = await storage();
    await store.set('downloads:total', total);
    console.log(`[SET] total ajustado a ${total}`);
    res.json({ total });
  } catch (err) {
    console.error('[POST /downloads/set]', err);
    res.status(500).json({ error: 'Error de almacenamiento' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT} | storage: ${hasRedis ? 'Upstash Redis' : 'in-memory'}`);
});
