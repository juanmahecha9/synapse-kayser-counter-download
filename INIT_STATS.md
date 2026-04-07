# Inicializar Estadísticas por SO

## 🎯 Objetivo

Establecer valores iniciales (offsets) para Windows, macOS y Linux. Estos valores:
- ✅ Se guardan **permanentemente** en SQLite
- ✅ **Persisten** aunque reinicies el servidor
- ✅ Se suman automáticamente a los conteos

## 📊 Valores actuales

```
Windows: 2 (actuales)
macOS: 0 (actuales)
Linux: 0 (actuales)
```

## 🔧 Configuración deseada

```
Windows: 2 (actual) + 13 (offset) = 15 total
macOS: 0 (actual) + 7 (offset) = 7 total
Linux: 0 (actual) + 0 (offset) = 0 total
```

## ⚡ Cómo hacerlo

### Opción 1: CLI (línea de comandos)

```bash
curl -X POST https://synapse-kayser-counter-download.vercel.app/downloads/stats/init \
  -H "Origin: https://kayser-fawn.vercel.app" \
  -H "X-API-Key: a7f3d9e2c1b8f5a9d4e7c2b1f8a9d3e6c1b7f4a9d2e5c8b1f4a7d0e3c6f9b2a" \
  -H "Content-Type: application/json" \
  -d '{
    "windows": 13,
    "macos": 7,
    "linux": 0
  }'
```

### Opción 2: Con PowerShell (Windows)

```powershell
$body = @{
    windows = 13
    macos = 7
    linux = 0
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri "https://synapse-kayser-counter-download.vercel.app/downloads/stats/init" `
  -Method POST `
  -Headers @{
    "Origin" = "https://kayser-fawn.vercel.app"
    "X-API-Key" = "a7f3d9e2c1b8f5a9d4e7c2b1f8a9d3e6c1b7f4a9d2e5c8b1f4a7d0e3c6f9b2a"
    "Content-Type" = "application/json"
  } `
  -Body $body
```

### Opción 3: Con Postman

1. **Método:** POST
2. **URL:** `https://synapse-kayser-counter-download.vercel.app/downloads/stats/init`
3. **Headers:**
   ```
   Origin: https://kayser-fawn.vercel.app
   X-API-Key: a7f3d9e2c1b8f5a9d4e7c2b1f8a9d3e6c1b7f4a9d2e5c8b1f4a7d0e3c6f9b2a
   Content-Type: application/json
   ```
4. **Body (raw JSON):**
   ```json
   {
     "windows": 13,
     "macos": 7,
     "linux": 0
   }
   ```

## ✅ Verificar que funcionó

```bash
curl https://synapse-kayser-counter-download.vercel.app/downloads/stats
```

Deberías ver:
```json
{
  "total": 31,
  "windows": 15,
  "macos": 7,
  "linux": 0,
  "totalByOS": 22
}
```

## 📝 Notas importantes

- ✅ Los offsets se guardan en la base de datos SQLite
- ✅ Aunque reinicies el servidor, los valores persisten
- ✅ Cuando haces deploy a Vercel, SQLite se mantiene
- ✅ Solo funciona con las credenciales correctas (Origin + API Key)

## 🔄 Cómo funciona el cálculo

```
Total mostrado por SO = count (descargas nuevas) + offset (historial)

Ejemplo:
- Windows count (desde que inicializaste) = 2
- Windows offset (historial perdido) = 13
- Windows total = 2 + 13 = 15 ✓

- macOS count = 0
- macOS offset = 7
- macOS total = 0 + 7 = 7 ✓

- Linux count = 0
- Linux offset = 0
- Linux total = 0 + 0 = 0 ✓
```

## 🚀 Una sola vez

Solo necesitas ejecutar esto **una vez**. Después, los valores están guardados permanentemente.

Para cambiar los valores en el futuro:
- Vuelve a ejecutar el endpoint con los nuevos offsets
- O edita directamente en la base de datos SQLite si tienes acceso

## ❌ Troubleshooting

**Error: "Acceso denegado"**
- Verificar que Origin = `https://kayser-fawn.vercel.app`
- Verificar que X-API-Key es correcta

**Error: "Database error"**
- Asegúrate que el servidor está corriendo
- Revisar logs de Vercel
