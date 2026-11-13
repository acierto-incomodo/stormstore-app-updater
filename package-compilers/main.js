const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const resolutions = [256, 512, 1024, 2048, 4096];

function createWindow() {
    const win = new BrowserWindow({
        height: 900,
        width: 1100,
        minHeight: 700,
        minWidth: 850,
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'Package Compilers'
    });

    win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('select-image', async (_event, resolution) => {
    if (!resolutions.includes(resolution)) {
        throw new Error('Resolución de imagen no válida.');
    }

    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const imagePath = result.filePaths[0];
    const image = nativeImage.createFromPath(imagePath);
    const size = image.getSize();
    if (size.width !== resolution || size.height !== resolution) {
        throw new Error(`La imagen elegida debe medir ${resolution} × ${resolution} píxeles.`);
    }

    return {
        path: imagePath,
        name: path.basename(imagePath),
        preview: image.resize({ width: 72, height: 72 }).toDataURL()
    };
});

ipcMain.handle('create-package', async (_event, payload) => {
    const appData = payload && payload.app;
    const imagePaths = payload && payload.images;
    if (!appData || !imagePaths || !imagePaths['512']) {
        throw new Error('Selecciona la imagen obligatoria de 512 × 512 píxeles.');
    }

    const saveResult = await dialog.showSaveDialog({
        title: 'Guardar paquete de aplicación',
        defaultPath: `${appData.id || 'app'}.zip`,
        filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }]
    });
    if (saveResult.canceled || !saveResult.filePath) return null;

    const stagingDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'package-compilers-'));
    try {
        const imagesDirectory = path.join(stagingDirectory, 'images');
        await fs.promises.mkdir(imagesDirectory);

        for (const resolution of resolutions) {
            const sourcePath = imagePaths[String(resolution)];
            if (!sourcePath) continue;

            const size = nativeImage.createFromPath(sourcePath).getSize();
            if (size.width !== resolution || size.height !== resolution) {
                throw new Error(`La imagen de ${resolution} × ${resolution} ya no tiene la resolución esperada.`);
            }

            const resolutionDirectory = path.join(imagesDirectory, `${resolution}x${resolution}`);
            await fs.promises.mkdir(resolutionDirectory);
            await fs.promises.copyFile(sourcePath, path.join(resolutionDirectory, path.basename(sourcePath)));
        }

        await fs.promises.writeFile(
            path.join(stagingDirectory, 'app.json'),
            `${JSON.stringify(appData, null, 2)}\n`,
            'utf8'
        );

        const quotePowerShell = value => `'${value.replace(/'/g, "''")}'`;
        const command = `Compress-Archive -Path ${quotePowerShell(path.join(stagingDirectory, 'app.json'))},${quotePowerShell(imagesDirectory)} -DestinationPath ${quotePowerShell(saveResult.filePath)} -Force`;
        await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]);

        return saveResult.filePath;
    } finally {
        await fs.promises.rm(stagingDirectory, { recursive: true, force: true });
    }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
