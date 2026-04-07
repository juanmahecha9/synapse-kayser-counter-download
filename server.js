import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Configuración de seguridad
const ALLOWED_ORIGIN = 'https://kayser-fawn.vercel.app';
const API_SECRET = process.env.API_SECRET || 'kayser-downloads-secret-2024';

// CORS básico (EXPRESS lo maneja, pero la autenticación real es en el middleware)
app.use(cors());
app.use(express.json());

// Middleware de autenticación para operaciones de escritura
function verifyAuth(req, res, next) {
  // GET es público (solo lectura)
  if (req.method === 'GET') {
    return next();
  }

  // POST requiere validación ESTRICTA
  const authHeader = req.headers['x-api-key'];
  const origin = req.headers['origin'];

  console.log(`[AUTH] ${req.method} ${req.path} | Origin: ${origin} | API-Key: ${authHeader ? '***' : 'MISSING'}`);

  // Verificar que venga de la app web (ESTRICTO)
  if (origin !== ALLOWED_ORIGIN) {
    console.log(`[BLOCKED] ❌ Origin inválido: ${origin}`);
    return res.status(403).json({
      error: 'Acceso denegado: origen no permitido',
      received: origin,
      expected: ALLOWED_ORIGIN
    });
  }

  // Verificar API key (ESTRICTO)
  if (!authHeader || authHeader !== API_SECRET) {
    console.log(`[BLOCKED] ❌ API key inválida o missing`);
    return res.status(401).json({ error: 'API key inválida' });
  }

  console.log(`[ALLOWED] ✅ Autenticado desde ${origin}`);
  next();
}

// Database setup
const dbPath = path.join(__dirname, 'downloads.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error abriendo base de datos:', err);
  } else {
    console.log('✅ Base de datos conectada');
    initializeDB();
  }
});

// Initialize table
function initializeDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total INTEGER NOT NULL DEFAULT 0
    );
  `, (err) => {
    if (err) console.error('❌ Error creando tabla:', err);
  });

  // Ensure we have one row
  db.get('SELECT * FROM downloads WHERE id = 1', (err, row) => {
    if (!row) {
      db.run('INSERT INTO downloads (id, total) VALUES (1, 0)', (err) => {
        if (err) console.error('❌ Error insertando fila inicial:', err);
      });
    }
  });
}

// GET /downloads - obtener contador actual
app.get('/downloads', (req, res) => {
  db.get('SELECT total FROM downloads WHERE id = 1', (err, row) => {
    if (err) {
      console.error('❌ Error en GET /downloads:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ total: row?.total || 0 });
  });
});

// POST /downloads/increment - sumar 1
app.post('/downloads/increment', verifyAuth, (req, res) => {
  db.run('UPDATE downloads SET total = total + 1 WHERE id = 1', (err) => {
    if (err) {
      console.error('❌ Error en POST /downloads/increment:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    db.get('SELECT total FROM downloads WHERE id = 1', (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      console.log(`✅ Incrementado: ${row.total} (desde ${req.headers['origin']})`);
      res.json({ total: row.total });
    });
  });
});

// POST /downloads/set - establecer valor (para inicializar con historial)
app.post('/downloads/set', verifyAuth, (req, res) => {
  const { total } = req.body;
  if (typeof total !== 'number' || total < 0) {
    return res.status(400).json({ error: 'Total debe ser un número >= 0' });
  }
  db.run('UPDATE downloads SET total = ? WHERE id = 1', [total], (err) => {
    if (err) {
      console.error('❌ Error en POST /downloads/set:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    console.log(`✅ Establecido a: ${total} (desde ${req.headers['origin']})`);
    res.json({ total });
  });
});

// POST /downloads/add - sumar N descargas
app.post('/downloads/add', verifyAuth, (req, res) => {
  const { amount } = req.body;
  if (typeof amount !== 'number' || amount < 0) {
    return res.status(400).json({ error: 'Amount debe ser un número >= 0' });
  }
  db.run('UPDATE downloads SET total = total + ? WHERE id = 1', [amount], (err) => {
    if (err) {
      console.error('❌ Error en POST /downloads/add:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    db.get('SELECT total FROM downloads WHERE id = 1', (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      console.log(`✅ Añadidos ${amount}: total = ${row.total} (desde ${req.headers['origin']})`);
      res.json({ total: row.total });
    });
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Server
app.listen(PORT, () => {
  console.log(`
╔═════════════════════════════════════════════════════╗
║  Kayser Downloads Backend - PROTEGIDO              ║
╠═════════════════════════════════════════════════════╣
║  🚀 Servidor en http://localhost:${PORT}                ║
║                                                     ║
║  ✅ GET   /downloads          → PÚBLICO (solo lectura) ║
║  🔒 POST  /downloads/increment → PRIVADO (requiere auth) ║
║  🔒 POST  /downloads/set      → PRIVADO (requiere auth) ║
║  🔒 POST  /downloads/add      → PRIVADO (requiere auth) ║
║  ✅ GET   /health             → PÚBLICO             ║
║                                                     ║
║  🔐 Seguridad:                                      ║
║  • CORS: ${ALLOWED_ORIGIN}              ║
║  • API Key: ${API_SECRET.substring(0, 15)}...        ║
║                                                     ║
║  POST requiere headers:                             ║
║  - Origin: ${ALLOWED_ORIGIN}              ║
║  - X-API-Key: [API_SECRET]                          ║
╚═════════════════════════════════════════════════════╝
  `);
});
