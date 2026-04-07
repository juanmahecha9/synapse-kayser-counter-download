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

// Initialize tables
function initializeDB() {
  // Tabla de totales
  db.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total INTEGER NOT NULL DEFAULT 0
    );
  `, (err) => {
    if (err) console.error('❌ Error creando tabla downloads:', err);
  });

  // Tabla de estadísticas por SO (con offset para historial)
  db.run(`
    CREATE TABLE IF NOT EXISTS downloads_by_os (
      os TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      offset INTEGER NOT NULL DEFAULT 0
    );
  `, (err) => {
    if (err) console.error('❌ Error creando tabla downloads_by_os:', err);
  });

  // Ensure we have one row en downloads
  db.get('SELECT * FROM downloads WHERE id = 1', (err, row) => {
    if (!row) {
      db.run('INSERT INTO downloads (id, total) VALUES (1, 0)', (err) => {
        if (err) console.error('❌ Error insertando fila inicial:', err);
      });
    }
  });

  // Inicializar SO si no existen
  const systems = ['Windows', 'macOS', 'Linux'];
  systems.forEach((os) => {
    db.get('SELECT * FROM downloads_by_os WHERE os = ?', [os], (err, row) => {
      if (!row) {
        db.run('INSERT INTO downloads_by_os (os, count) VALUES (?, 0)', [os], (err) => {
          if (err) console.error(`❌ Error insertando ${os}:`, err);
        });
      }
    });
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

// GET /downloads/stats - obtener desglose por SO (con offset)
app.get('/downloads/stats', (req, res) => {
  db.all('SELECT os, count, offset FROM downloads_by_os ORDER BY (count + offset) DESC', (err, rows) => {
    if (err) {
      console.error('❌ Error en GET /downloads/stats:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    db.get('SELECT total FROM downloads WHERE id = 1', (err, totalRow) => {
      if (err) return res.status(500).json({ error: 'Database error' });

      const stats = {};
      let totalFromStats = 0;
      (rows || []).forEach((row) => {
        const total = row.count + row.offset;
        stats[row.os.toLowerCase()] = total;
        totalFromStats += total;
      });

      res.json({
        total: totalRow?.total || 0,
        windows: stats.windows || 0,
        macos: stats.macos || 0,
        linux: stats.linux || 0,
        totalByOS: totalFromStats,
        stats: stats,
      });
    });
  });
});

// POST /downloads/stats/init - inicializar offsets por SO
app.post('/downloads/stats/init', verifyAuth, (req, res) => {
  const { windows = 0, macos = 0, linux = 0 } = req.body;

  console.log(`[INIT STATS] Windows: ${windows}, macOS: ${macos}, Linux: ${linux}`);

  // Actualizar offsets (se guardan permanentemente en SQLite)
  db.run('UPDATE downloads_by_os SET offset = ? WHERE os = ?', [windows, 'Windows'], (err) => {
    if (err) {
      console.error('❌ Error actualizando Windows offset:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    db.run('UPDATE downloads_by_os SET offset = ? WHERE os = ?', [macos, 'macOS'], (err) => {
      if (err) {
        console.error('❌ Error actualizando macOS offset:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      db.run('UPDATE downloads_by_os SET offset = ? WHERE os = ?', [linux, 'Linux'], (err) => {
        if (err) {
          console.error('❌ Error actualizando Linux offset:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        console.log(`✅ Offsets inicializados: Windows=${windows}, macOS=${macos}, Linux=${linux}`);
        res.json({
          message: 'Offsets initialized',
          windows,
          macos,
          linux,
        });
      });
    });
  });
});

// POST /downloads/increment - sumar 1 (con estadísticas por SO)
app.post('/downloads/increment', verifyAuth, (req, res) => {
  const { os } = req.body;
  const osLabel = os || 'Unknown';

  // Actualizar total global
  db.run('UPDATE downloads SET total = total + 1 WHERE id = 1', (err) => {
    if (err) {
      console.error('❌ Error en POST /downloads/increment:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    // Actualizar conteo por SO
    db.run('UPDATE downloads_by_os SET count = count + 1 WHERE os = ?', [osLabel], (err) => {
      if (err) {
        console.error('❌ Error actualizando SO:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Obtener totales actualizados
      db.get('SELECT total FROM downloads WHERE id = 1', (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        console.log(`✅ Incrementado: ${row.total} (${osLabel}) desde ${req.headers['origin']}`);
        res.json({ total: row.total, os: osLabel });
      });
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
