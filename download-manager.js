const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { exec } = require("child_process");
const { promisify } = require("util");

const execPromise = promisify(exec);

class DownloadManager {
  constructor(mainWindow, ipcMain) {
    this.mainWindow = mainWindow;
    this.ipcMain = ipcMain;
    this.downloads = new Map();
    this.sevenZrPath = path.join(__dirname, "assets/extraFiles/7zr.exe");
  }

  /**
   * Inicia la descarga de un archivo o conjunto de archivos
   */
  async startDownload(id, downloadConfig, tempDir) {
    try {
      const download = {
        id,
        config: downloadConfig,
        tempDir,
        status: "downloading",
        downloadedFiles: [],
        progress: 0,
        downloaded: 0,
        total: 0,
        speed: 0,
        timeRemaining: 0,
        startTime: Date.now(),
        lastByteCount: 0,
        lastProgressUpdate: Date.now(),
      };

      this.downloads.set(id, download);

      // Enviar evento de inicio
      this.mainWindow.webContents.send("download-start", id, downloadConfig.name);

      // Paso 0: Verificar versión antes de descargar
      const localVersion = await this._getLocalVersion(downloadConfig);
      const remoteVersion = await this._getRemoteVersion(downloadConfig);

      console.log(`Versión local: ${localVersion}, Versión remota: ${remoteVersion}`);

      if (localVersion === remoteVersion && localVersion !== null) {
        // Las versiones coinciden, no descargar
        console.log(`Las versiones coinciden (${localVersion}). Saltando descarga.`);
        this.mainWindow.webContents.send("download-complete", id);
        return { success: true, message: "Ya está actualizado" };
      }

      // Versiones diferentes, descargar todo
      console.log("Las versiones son diferentes. Descargando...");

      // Paso 1: Descargar los archivos (SECUENCIAL, 1 por 1)
      await this._downloadFilesSequential(download);

      // Paso 2: Combinar archivos si es necesario (Implementado dentro de _downloadFilesSequential o después)
      
      // Paso 3: Limpiar directorio destino ANTES de descomprimir
      this.mainWindow.webContents.send("cleaning-start", id);
      await this._cleanExtractPath(download);

      // Paso 4: Descomprimir
      this.mainWindow.webContents.send("extracting-start", id);
      await this._extractFiles(download);

      // Paso 5: Descargar y guardar archivo de versión
      this.mainWindow.webContents.send("verifying-start", id);
      await this._downloadAndSaveVersion(download, remoteVersion);

      // Paso 6: Limpiar archivos temporales
      await this._cleanup(download);

      // Enviar evento de completación
      this.mainWindow.webContents.send("download-complete", id);

      return { success: true, message: "Descarga y actualización completada" };
    } catch (error) {
      console.error(`Error en descarga ${id}:`, error);
      this.mainWindow.webContents.send("download-error", id, error.message);

      // Intentar limpiar
      try {
        await this._cleanup(this.downloads.get(id));
      } catch (e) {
        console.error("Error durante cleanup:", e);
      }

      return { success: false, error: error.message };
    }
  }

  async _getLocalVersion(config) {
    try {
      const versionDir = config.checksumPath || config.extractPath;
      const versionPath = path.join(versionDir, config.checksumFile);
      return await fsPromises.readFile(versionPath, "utf8");
    } catch (e) {
      return null;
    }
  }

  async _getRemoteVersion(config) {
    try {
      return await this._downloadChecksum(config.checksumUrl);
    } catch (e) {
      return "unknown";
    }
  }

  async _downloadFilesSequential(download) {
    const { config, tempDir } = download;
    
    let totalSize = 0;
    const filesWithSizes = [];

    for (const filename of config.files) {
      const url = config.downloadUrl + filename;
      const size = await this._getFileSize(url);
      filesWithSizes.push({ filename, url, size });
      totalSize += size;
    }

    download.total = totalSize;

    for (const fileInfo of filesWithSizes) {
      const filepath = path.join(tempDir, fileInfo.filename);
      await this._downloadFile(download, fileInfo.url, filepath, fileInfo.filename, fileInfo.size);
    }

    // Si merge es true, combinar después de descargar todos
    if (config.merge) {
      this.mainWindow.webContents.send("merging-start", download.id);
      await this._mergeFiles(download);
    }
  }

  async _cleanExtractPath(download) {
    const { config } = download;
    try {
      // Asegurarse de que la carpeta de extracción exista
      if (!fs.existsSync(config.extractPath)) {
        await fsPromises.mkdir(config.extractPath, { recursive: true });
      }
    } catch (e) { console.error("Error asegurando carpeta de extracción:", e); }
  }

  async _downloadAndSaveVersion(download, remoteVersion) {
    const { config } = download;
    const versionDir = config.checksumPath || config.extractPath;
    const versionPath = path.join(versionDir, config.checksumFile);
    
    await fsPromises.mkdir(versionDir, { recursive: true });
    await fsPromises.writeFile(versionPath, remoteVersion);
  }

  /**
   * Descarga todos los archivos necesarios
   */
  async _downloadFiles(download) {
    const { config, tempDir } = download;
    
    // Primero, hacer HEAD requests para obtener los tamaños
    let totalSize = 0;
    const fileSizes = [];

    for (const filename of config.files) {
      const url = config.downloadUrl + filename;
      const size = await this._getFileSize(url);
      fileSizes.push(size);
      totalSize += size;
    }

    download.total = totalSize;

    const downloadPromises = [];

    for (let i = 0; i < config.files.length; i++) {
      const filename = config.files[i];
      const url = config.downloadUrl + filename;
      const filepath = path.join(tempDir, filename);

      downloadPromises.push(
        this._downloadFile(download, url, filepath, filename, fileSizes[i])
      );
    }

    await Promise.all(downloadPromises);
  }

  /**
   * Obtiene el tamaño de un archivo usando HEAD request
   */
  _getFileSize(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith("https") ? https : http;

      const req = protocol.request(
        url,
        { method: "HEAD" },
        (res) => {
          const size = parseInt(res.headers["content-length"], 10) || 0;
          resolve(size);
        }
      );

      req.on("error", (error) => {
        console.warn(`Error obteniendo tamaño de ${url}:`, error);
        resolve(0); // Asumir tamaño 0 si hay error
      });

      req.end();
    });
  }

  /**
   * Descarga un archivo individual
   */
  _downloadFile(download, url, filepath, filename, fileSize) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith("https") ? https : http;

      const req = protocol.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          return;
        }

        const totalFileSize = parseInt(res.headers["content-length"], 10) || fileSize || 0;
        let downloadedFromThisFile = 0;
        let lastUpdateTime = Date.now();
        
        const file = fs.createWriteStream(filepath);

        res.on("data", (chunk) => {
          downloadedFromThisFile += chunk.length;
          download.downloaded += chunk.length;

          // Actualizar progreso cada 500ms máximo
          const now = Date.now();
          if (now - lastUpdateTime > 500) {
            const elapsedSeconds = (now - download.startTime) / 1000;
            const speed = download.downloaded / Math.max(elapsedSeconds, 0.1);
            const timeRemaining = Math.max(0, (download.total - download.downloaded) / Math.max(speed, 1));
            const percent = Math.round((download.downloaded / Math.max(download.total, 1)) * 100);

            this.mainWindow.webContents.send("download-progress", download.id, {
              percent,
              speed,
              timeRemaining,
              downloadedSize: download.downloaded,
              totalSize: download.total,
            });

            lastUpdateTime = now;
          }
        });
        
        // Asegurarse de que el directorio temporal existe
        if (!fs.existsSync(path.dirname(filepath))) fs.mkdirSync(path.dirname(filepath), { recursive: true });

        file.on("finish", () => {
          file.close();
          download.downloadedFiles.push({ filename, size: totalFileSize, filepath });
          resolve();
        });

        res.pipe(file);
      });

      req.on("error", (error) => {
        fs.unlink(filepath, () => {});
        reject(error);
      });
    });
  }

  /**
   * Combina múltiples archivos .zip.001, .zip.002, etc en un único .zip
   */
  async _mergeFiles(download) {
    const { config, tempDir } = download;
    const mergedPath = path.join(tempDir, config.mergedName);

    // Obtener archivos ordenados
    const files = [...config.files].sort();

    // Leer y combinar
    const fileHandle = await fsPromises.open(mergedPath, "w");

    for (const filename of files) {
      const filepath = path.join(tempDir, filename);
      const data = await fsPromises.readFile(filepath);
      await fsPromises.writeFile(fileHandle, data);
    }

    await fileHandle.close();

    // Eliminar archivos parciales
    for (const filename of files) {
      const filepath = path.join(tempDir, filename);
      await fs.unlink(filepath);
    }

    download.downloadedFiles = [{ filename: config.mergedName, filepath: mergedPath }];
  }

  /**
   * Descomprime los archivos usando 7zr.exe
   */
  async _extractFiles(download) {
    const { config, tempDir } = download;
    const zipPath = download.downloadedFiles[0].filepath;
    const extractPath = config.extractPath;

    // Asegurarse de que la ruta destino existe (reforzado)
    if (!fs.existsSync(extractPath)) {
      await fsPromises.mkdir(extractPath, { recursive: true });
    }

    // Ejecutar 7zr para descomprimir
    return new Promise((resolve, reject) => {
      const command = `"${this.sevenZrPath}" x "${zipPath}" -o"${extractPath}" -y`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Error al descomprimir: ${error.message}`));
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Descarga y verifica el archivo checksum
   */
  async _verifyChecksum(download) {
    const { config } = download;

    try {
      const checksum = await this._downloadChecksum(
        config.checksumUrl,
        config.checksumFile
      );

      // Calcular checksum del contenido descargado
      const expectedChecksum = await this._calculateChecksum(
        config.extractPath
      );

      if (checksum.trim() !== expectedChecksum.trim()) {
        throw new Error(
          `Verificación fallida: checksums no coinciden\nEsperado: ${checksum}\nObtenido: ${expectedChecksum}`
        );
      }

      // Guardar checksum localmente
      const checksumDestDir = config.checksumPath || config.extractPath;
      const checksumDest = path.join(checksumDestDir, config.checksumFile);

      // Asegurarse de que el directorio del checksum existe
      await fsPromises.mkdir(checksumDestDir, { recursive: true });

      await fsPromises.writeFile(checksumDest, checksum);
    } catch (error) {
      console.warn(`Advertencia en verificación de checksum: ${error.message}`);
      // No rechazar, solo advertencia
    }
  }

  /**
   * Descarga el archivo de checksum
   */
  _downloadChecksum(url, filename) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith("https") ? https : http;

      protocol.get(url, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          resolve(data);
        });
      });
    });
  }

  /**
   * Calcula el hash SHA-256 de un directorio o archivo
   */
  async _calculateChecksum(filepath) {
    const hash = crypto.createHash("sha256");

    try {
      const stats = await fsPromises.stat(filepath);

      if (stats.isFile()) {
        const data = await fsPromises.readFile(filepath);
        hash.update(data);
      } else if (stats.isDirectory()) {
        // Calcular hash de todos los archivos en el directorio
        const files = await this._getAllFiles(filepath);
        files.sort();

        for (const file of files) {
          const data = await fsPromises.readFile(file);
          hash.update(data);
        }
      }
    } catch (error) {
      throw new Error(`Error calculando checksum: ${error.message}`);
    }

    return hash.digest("hex");
  }

  /**
   * Obtiene todos los archivos en un directorio recursivamente
   */
  async _getAllFiles(dir) {
    const files = [];
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this._getAllFiles(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Limpia archivos temporales
   */
  async _cleanup(download) {
    if (!download || !download.tempDir) return;

    try {
      const files = await fsPromises.readdir(download.tempDir);
      for (const file of files) {
        const filepath = path.join(download.tempDir, file);
        await fsPromises.unlink(filepath);
      }
      // Eliminar directorio temporal
      await fsPromises.rmdir(download.tempDir);
    } catch (error) {
      console.warn(`Error durante cleanup: ${error.message}`);
    }
  }

  /**
   * Pausa una descarga
   */
  pauseDownload(id) {
    const download = this.downloads.get(id);
    if (download) {
      download.status = "paused";
    }
  }

  /**
   * Cancela una descarga
   */
  async cancelDownload(id) {
    const download = this.downloads.get(id);
    if (download) {
      download.status = "cancelled";
      await this._cleanup(download);
      this.downloads.delete(id);
    }
  }

  /**
   * Obtiene el estado de una descarga
   */
  getDownloadStatus(id) {
    return this.downloads.get(id) || null;
  }

  /**
   * Obtiene todas las descargas
   */
  getAllDownloads() {
    return Array.from(this.downloads.values());
  }
}

module.exports = DownloadManager;
