import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://kayser-fawn.vercel.app';
const API_SECRET = process.env.API_SECRET || 'kayser-downloads-secret-2024';
const OFFSET = 79; // descargas históricas acumuladas

// ── Supabase / PostgreSQL ─────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.SUPABASE_URl,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool:', err.message);
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

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

// GET /health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', storage: 'supabase-postgres' });
});

// GET /downloads — devuelve total: windows + linux + macos + offset
app.get('/downloads', async (_req, res) => {
  try {
    const result = await query(`
      SELECT COALESCE(SUM(count), 0)::int AS total
      FROM downloads
    `);
    const total = Number(result.rows[0].total) + OFFSET;
    res.json({ total });
  } catch (err) {
    console.error('[GET /downloads]', err.message);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// GET /downloads/stats — desglose por plataforma
app.get('/downloads/stats', async (_req, res) => {
  try {
    const result = await query(`
      SELECT platform, count
      FROM downloads
      WHERE platform IN ('windows', 'linux', 'macos')
    `);
    const rows = result.rows;
    const get = (p) => Number(rows.find((r) => r.platform === p)?.count ?? 0);
    const windows = get('windows');
    const linux   = get('linux');
    const macos   = get('macos');
    const total   = windows + linux + macos + OFFSET;
    res.json({ total, windows, linux, macos });
  } catch (err) {
    console.error('[GET /downloads/stats]', err.message);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// POST /downloads/increment — upsert: crea con count=1 o suma 1
app.post('/downloads/increment', async (req, res) => {
  const { os } = req.body || {};
  const platform = normalizePlatform(os);

  try {
    if (platform) {
      await query(`
        INSERT INTO downloads (platform, count)
        VALUES ($1, 1)
        ON CONFLICT (platform)
        DO UPDATE SET count = downloads.count + 1
      `, [platform]);
    }

    const result = await query(`
      SELECT COALESCE(SUM(count), 0)::int AS total FROM downloads
    `);
    const total = Number(result.rows[0].total) + OFFSET;

    console.log(`[INCREMENT] platform=${platform ?? 'unknown'} → total=${total}`);
    res.json({ total, platform: platform || null });
  } catch (err) {
    console.error('[POST /downloads/increment]', err.message);
    res.status(500).json({ error: 'Error de base de datos' });
  }
});

// ── Helper: normaliza el nombre del SO al formato de la tabla ─────────────────
function normalizePlatform(os) {
  if (!os) return null;
  const s = String(os).toLowerCase();
  if (s.includes('win'))   return 'windows';
  if (s.includes('mac') || s.includes('osx') || s.includes('darwin')) return 'macos';
  if (s.includes('lin'))   return 'linux';
  return null;
}

// ── Arrancar ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT} | Supabase PostgreSQL`);
});
