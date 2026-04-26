# ⚡ Guía Rápida: files.apps.json

## 🎯 En 30 segundos

**Antiguo:** `app.json` → Descargar instalador → Ejecutar → Esperar 20 minutos ❌

**Nuevo:** `files.apps.json` → Descargar .zip → Descomprimir → Listo ✅

---

## 📋 Estructura Básica

```json
{
  "id": "nombre-unico-app",
  "name": "Nombre bonito para el usuario",
  "files": ["archivo.zip"],
  "merge": false,
  "extractPath": "C:\\ruta\\instalacion",
  "checksumFile": "archivo.txt",
  "checksumUrl": "https://servidor.com/checksums/archivo.txt",
  "downloadUrl": "https://servidor.com/descargas/"
}
```

---

## 🔀 Casos de Uso

### Caso A: .zip simple (5-500MB)
```json
{
  "id": "app-pequeña",
  "files": ["app.zip"],
  "merge": false,
  "extractPath": "C:\\Apps\\Pequeña",
  "downloadUrl": "https://cdn.ejemplo.com/descargas/"
}
```

### Caso B: .zip.001, .zip.002, .zip.003 (>500MB)
```json
{
  "id": "juego-grande",
  "files": [
    "juego.zip.001",
    "juego.zip.002",
    "juego.zip.003"
  ],
  "merge": true,
  "mergedName": "juego.zip",
  "extractPath": "D:\\Juegos\\GrandeJuego",
  "downloadUrl": "https://cdn.ejemplo.com/descargas/"
}
```

---

## 🔧 Pasos para Agregar un Nuevo App

### 1. Crear el .zip
```bash
# Si es un archivo simple
zip -r app.zip carpeta/
```

### 2. Dividir si es grande (>1GB recomendado)
```bash
# Dividir en partes de 500MB
zip -r -s 500m app.zip carpeta/
```

### 3. Generar checksum
```powershell
# Windows PowerShell
certUtil -hashfile app.zip SHA256 > app.txt
# Resultado: abc123def456...
```

### 4. Subir a servidor
```
https://tu-servidor.com/descargas/
  └─ app.zip (o app.zip.001, app.zip.002, ...)

https://tu-servidor.com/checksums/
  └─ app.txt
```

### 5. Agregar a files.apps.json
```json
{
  "id": "mi-app",
  "name": "Mi Aplicación",
  "files": ["app.zip"],
  "merge": false,
  "extractPath": "C:\\MiApp",
  "checksumFile": "app.txt",
  "checksumUrl": "https://tu-servidor.com/checksums/app.txt",
  "downloadUrl": "https://tu-servidor.com/descargas/"
}
```

### 6. Asegurate que apps.json tiene el mismo id
```json
{
  "id": "mi-app",  ← DEBE SER IGUAL
  "name": "Mi Aplicación",
  "download": "...",
  ...
}
```

---

## 📊 Qué Pasa Cuando El Usuario Hace Clic en "Instalar"

```
┌─ Usuario hace clic en INSTALAR
│
├─ StormStore busca el app en files.apps.json usando el ID
│
├─ Si lo encuentra:
│  ├─ Descarga archivos.zip (o .zip.001, .zip.002, ...)
│  ├─ Descarga verificación (checksum)
│  ├─ Combina si es necesario
│  ├─ Descomprime en extractPath
│  ├─ Verifica integridad
│  ├─ Limpia temporales
│  └─ ✅ ¡Completado!
│
└─ Si NO lo encuentra:
   └─ Usa método antiguo (busca "download" en apps.json)
```

---

## 🎨 Campos Explicados

| Campo | Qué es | Ejemplo |
|-------|--------|---------|
| `id` | Identificador único | `"minecraft"` |
| `name` | Nombre bonito | `"Minecraft"` |
| `files` | Qué descargar | `["minecraft.zip"]` |
| `merge` | ¿Combinar archivos? | `true` o `false` |
| `mergedName` | Nombre después de combinar | `"minecraft.zip"` |
| `extractPath` | Dónde descomprimir | `"C:\\Games\\Minecraft"` |
| `checksumFile` | Nombre del hash | `"minecraft.txt"` |
| `checksumUrl` | URL del hash | `"https://cdn.../minecraft.txt"` |
| `downloadUrl` | URL base | `"https://cdn.../descargas/"` |

---

## ❌ Errores Comunes

### ❌ ID no coincide
```json
// apps.json
{"id": "juego1"}

// files.apps.json  
{"id": "juego_1"}  ← DIFERENTE = Error
```
✅ **Solución:** Usar exactamente el mismo id

### ❌ URL mal formada
```json
"downloadUrl": "https://cdn.ejemplo.com/descargas"  ← Sin /
"downloadUrl": "https://cdn.ejemplo.com/descargas/"  ← ✅ Bien
```

### ❌ Checksum mal generado
```bash
# Mal
certUtil -hashfile app.zip SHA256
# Resultado: "app.zip" "abc123..."

# Bien (redireccionar a archivo)
certUtil -hashfile app.zip SHA256 > app.txt
# Resultado: solo "abc123..."
```

---

## 🚀 Migrar un App del Sistema Antiguo

### Antes (apps.json solo)
```json
{
  "id": "old-game",
  "download": "https://servidor.com/old-game.exe",
  "paths": ["C:\\Games\\OldGame\\game.exe"]
}
```

### Después (apps.json + files.apps.json)
```json
// apps.json
{
  "id": "old-game",
  "paths": ["C:\\Games\\OldGame\\game.exe"]
  // NO necesita "download" si existe en files.apps.json
}

// files.apps.json
{
  "id": "old-game",
  "name": "Old Game",
  "files": ["old-game.zip"],
  "merge": false,
  "extractPath": "C:\\Games\\OldGame",
  "checksumFile": "old-game.txt",
  "checksumUrl": "https://servidor.com/checksums/old-game.txt",
  "downloadUrl": "https://servidor.com/descargas/"
}
```

---

## 🔐 Verificación de Integridad

### El checksum SHA-256 es como una "huella digital"

```
Archivo: minecraft.zip
Tamaño: 2.5GB
Contenido: [datos...]
Fecha: 2024-01-15

     ↓ (procesar SHA-256)
     
Hash: abc123def456ghi789jkl012mno345pqr...

Si alguien modifica 1 byte:
  Contenido: [datos... ← 1 byte cambió]
  
     ↓ (procesar SHA-256)
     
Hash: xyz999abc111def222ghi333jkl444... ← DIFERENTE
```

Así si un archivo se corrompe durante descarga, ¡lo detectamos inmediatamente!

---

## 📈 Velocidades Típicas

| Acción | Velocidad | Ejemplo (10GB) |
|--------|-----------|---|
| Descargar 50Mbps | 50 Mbps | 27 minutos |
| Descargar 500Mbps | 500 Mbps | 2.7 minutos |
| Descomprimir SSD | 1 GB/s | 10 segundos |
| Descomprimir HDD | 200 MB/s | 50 segundos |

---

## ✅ Resumen del Flujo

```
1. USER CLICKS INSTALL
        ↓
2. STORMSTORE SEARCHES ID IN files.apps.json
        ↓
3. IF FOUND:
   - Download files
   - Merge if needed
   - Extract to path
   - Verify checksum
   - Cleanup
   - ✅ DONE
        ↓
4. IF NOT FOUND:
   - Use legacy system
   - Download .exe
   - Run installer
   - Cleanup
   - ✅ DONE
```

---

## 🎓 Recursos

- 📖 [Guía Completa](FILES_APPS_EXPLAINED.md)
- 📋 [Documentación Técnica](DOWNLOAD_SYSTEM.md)
- 🚀 [Guía de Instalación](SETUP_GUIDE.md)

---

**¿Preguntas?** Lee FILES_APPS_EXPLAINED.md para más detalles 📖
