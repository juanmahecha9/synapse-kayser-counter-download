# Kayser Downloads Backend

Backend para contador **acumulativo** de descargas. Usa SQLite para guardar un número que **NUNCA baja**, sin importar qué pase con los releases de GitHub.

⚠️ **PROTEGIDO** — Solo `https://kayser-fawn.vercel.app/` puede modificar el contador.

## 🚀 Uso Rápido

### Instalar y ejecutar

```bash
npm install
npm start
```

Servidor en `http://localhost:3001`

## 🔐 Seguridad

**GET (lectura):** ✅ Público — cualquiera puede ver el contador
**POST (escritura):** 🔒 Privado — solo la app web puede modificar

### Headers requeridos para POST

```
Origin: https://kayser-fawn.vercel.app
X-API-Key: kayser-downloads-secret-2024
```

Si intentas desde Postman o cualquier otro cliente, obtendrás `403 Forbidden`.

## 📡 Endpoints

### `GET /downloads` ✅ PÚBLICO
Obtiene el contador actual. Funciona desde cualquier lugar.

```bash
curl http://localhost:3001/downloads
# → { "total": 31 }
```

### `POST /downloads/increment` 🔒 PRIVADO
Suma 1 al contador. **Solo desde la app web con headers de auth.**

```bash
curl -X POST http://localhost:3001/downloads/increment \
  -H "Origin: https://kayser-fawn.vercel.app" \
  -H "X-API-Key: kayser-downloads-secret-2024"
# → { "total": 32 }
```

### `POST /downloads/set` 🔒 PRIVADO
Establece un valor específico (para inicializar con historial).

```bash
curl -X POST http://localhost:3001/downloads/set \
  -H "Origin: https://kayser-fawn.vercel.app" \
  -H "X-API-Key: kayser-downloads-secret-2024" \
  -H "Content-Type: application/json" \
  -d '{"total": 31}'
# → { "total": 31 }
```

### `POST /downloads/add` 🔒 PRIVADO
Suma N descargas. **Solo desde la app web con headers de auth.**

```bash
curl -X POST http://localhost:3001/downloads/add \
  -H "Origin: https://kayser-fawn.vercel.app" \
  -H "X-API-Key: kayser-downloads-secret-2024" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5}'
# → { "total": 36 }
```

### `GET /downloads/stats` ✅ PÚBLICO
Obtiene desglose de descargas por SO (Sistema Operativo).

```bash
curl http://localhost:3001/downloads/stats
# → {
#   "total": 31,
#   "windows": 15,
#   "macos": 10,
#   "linux": 0,
#   "totalByOS": 25
# }
```

El `total` es el contador global. `totalByOS` es la suma por SO (count + offset).

### `POST /downloads/stats/init` 🔒 PRIVADO
Inicializa los offsets por SO (historial perdido). **Solo desde la app web con auth.**

```bash
curl -X POST http://localhost:3001/downloads/stats/init \
  -H "Origin: https://kayser-fawn.vercel.app" \
  -H "X-API-Key: kayser-downloads-secret-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "windows": 13,
    "macos": 7,
    "linux": 0
  }'
# → {
#   "message": "Offsets initialized",
#   "windows": 13,
#   "macos": 7,
#   "linux": 0
# }
```

**Importante:** Los offsets se guardan en SQLite y **PERSISTEN** aunque reinicies el servidor.

### `GET /health` ✅ PÚBLICO
Verifica que el servidor está vivo.

```bash
curl http://localhost:3001/health
# → { "status": "ok" }
```

## 🗄️ Base de Datos

SQLite con una sola tabla `downloads`:

```sql
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total INTEGER NOT NULL DEFAULT 0
);
```

Una sola fila (`id=1`) que se va actualizando. Los datos se guardan en `downloads.db`.

## 📝 Cómo integrar en el frontend (Astro)

### Leer el contador (GET - sin autenticación)

En `src/scripts/main.js`, reemplaza la función `fetchDownloadCount()`:

```javascript
async function fetchDownloadCount() {
  try {
    // Obtener del backend propio
    const response = await fetch('https://tu-backend.com/downloads');
    const data = await response.json();
    
    // Actualizar elemento en la página
    const dlCounterElement = document.getElementById("dl-github-downloads");
    if (dlCounterElement) {
      dlCounterElement.textContent = String(data.total);
    }
  } catch (err) {
    console.error("[Downloads] Error:", err);
  }
}
```

### Incrementar el contador (POST - requiere autenticación)

Cuando el usuario descargue, llama desde la app web:

```javascript
async function recordDownload() {
  try {
    const response = await fetch('https://tu-backend.com/downloads/increment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'kayser-downloads-secret-2024',
        'Origin': 'https://kayser-fawn.vercel.app'
      }
    });
    const data = await response.json();
    console.log('Descarga registrada:', data.total);
  } catch (err) {
    console.error("[Downloads] Error registrando:", err);
  }
}
```

**⚠️ Importante:** El header `Origin` se envía automáticamente desde el navegador. Solo funciona si:
- La petición viene de `https://kayser-fawn.vercel.app`
- El header `X-API-Key` es correcto
- Son headers POST

## 🔄 Flujo de trabajo para releases

1. **Cuando liberas v2.0.1:**
   - Crea un tag nuevo en GitHub (v2.0.1)
   - Sube los binarios
   - GitHub contará las descargas automáticamente

2. **Cuando quieras ver el total histórico:**
   - Los descargas de v2.0.0, v1.1.0, v1.0.0 se suman automáticamente desde GitHub
   - O establece manualmente: `POST /downloads/set { "total": 23 }`
   - A partir de ahí, el contador sigue subiendo sin nunca bajar

## ⚙️ Variables de entorno

- `PORT` — puerto del servidor (default: 3001)
- `API_SECRET` — API key para autenticación (default: `kayser-downloads-secret-2024`)

```bash
# Cambiar puerto
PORT=5000 npm start

# Cambiar API secret (IMPORTANTE en producción)
API_SECRET=mi-clave-super-segura npm start

# Ambas
PORT=5000 API_SECRET=mi-clave-super-segura npm start
```

**⚠️ En Vercel (producción):**
1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega `API_SECRET` con una clave segura y aleatoria
4. Redeploy

## 🛠️ Tech Stack

- **Express.js** — servidor HTTP
- **SQLite3** — base de datos
- **CORS** — para peticiones desde otros dominios

## 🚫 Intentos de acceso no autorizado

### Desde Postman (SIN Origin correcto)
```
POST /downloads/increment
→ 403 Forbidden
{ "error": "Acceso denegado: origen no permitido", "received": null, "expected": "https://kayser-fawn.vercel.app" }
```

### Desde otra página web (wrong origin)
```
POST /downloads/increment
Origin: https://otro-sitio.com
→ 403 Forbidden
{ "error": "Acceso denegado: origen no permitido", "received": "https://otro-sitio.com", "expected": "https://kayser-fawn.vercel.app" }
```

### Sin API key
```
POST /downloads/increment
Origin: https://kayser-fawn.vercel.app
(sin X-API-Key)
→ 401 Unauthorized
{ "error": "API key inválida" }
```

### API key incorrecta
```
POST /downloads/increment
X-API-Key: wrong-key
→ 401 Unauthorized
{ "error": "API key inválida" }
```

**Solo** la app en `https://kayser-fawn.vercel.app` con el `X-API-Key` correcto puede escribir datos.

## 🔗 Integración con Frontend (Synapse)

El frontend de Synapse está configurado para llamar a este backend:

```javascript
// src/scripts/main.js
const BACKEND_URL = window.__DOWNLOADS_BACKEND_URL__; // http://localhost:3001
const apiKey = window.__DOWNLOADS_API_KEY__;

// GET /downloads (solo lectura, públic)
const response = await fetch(`${BACKEND_URL}/downloads`);
const { total } = await response.json();

// Mostrar en página
document.getElementById("dl-github-downloads").textContent = total;
```

**Variables de entorno:**
- `src/release/releases.ts`: define `downloadsBackendUrl` y `downloadsBackendApiKey`
- `.env.local`: overrides para desarrollo (localhost:3001)
- `Vercel`: Environment Variables para producción

## 📄 Licencia

Gamma & Omega
