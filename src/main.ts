import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import started from 'electron-squirrel-startup';
import type { PngSequenceExportProgress, PngSequenceExportRequest, PngSequenceExportState } from './types';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const isDev = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
if (isDev) {
  // Keep local file loading behavior while hiding noisy Electron dev warnings.
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

const configureChromiumGpuFlags = (): void => {
  // Apply before app ready so Chromium picks them up for all packaged builds.
  // Raise V8 old-space for heavier model loading and multi-character scenes.
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('force_high_performance_gpu');
  if (process.platform === 'linux' && !isDev) {
    // Temporary workaround for packaged Linux zip builds lacking a working chrome-sandbox setup.
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-setuid-sandbox');
  }
};

configureChromiumGpuFlags();

const MAIN_WINDOW_ASPECT_RATIO = 16 / 9;
const MAIN_WINDOW_DEFAULT_WIDTH = 1440;
const MAIN_WINDOW_DEFAULT_HEIGHT = Math.round(MAIN_WINDOW_DEFAULT_WIDTH / MAIN_WINDOW_ASPECT_RATIO);
const MAIN_WINDOW_MIN_WIDTH = 1120;
const MAIN_WINDOW_MIN_HEIGHT = Math.round(MAIN_WINDOW_MIN_WIDTH / MAIN_WINDOW_ASPECT_RATIO);
const ALLOWED_PRODUCTION_PROTOCOLS = new Set(['file:', 'data:', 'blob:', 'devtools:']);

type PngSequenceExportLaunchResult = {
  jobId: string;
};

const pngSequenceExportJobMap = new Map<string, PngSequenceExportRequest>();
const pngSequenceExportActiveCountByOwner = new Map<number, number>();
const pngSequenceExportOwnerByJobId = new Map<string, number>();
const ensuredDirectoryPathSet = new Set<string>();

const ensureDirectoryExists = async (directoryPath: string): Promise<void> => {
  if (ensuredDirectoryPathSet.has(directoryPath)) return;
  await fs.promises.mkdir(directoryPath, { recursive: true });
  ensuredDirectoryPathSet.add(directoryPath);
};

const sendPngSequenceExportState = (
  ownerWindow: BrowserWindow | undefined,
  state: PngSequenceExportState,
): void => {
  if (!ownerWindow || ownerWindow.isDestroyed()) return;
  ownerWindow.webContents.send('export:pngSequenceState', state);
};

const sendPngSequenceExportProgressToOwner = (
  jobId: string,
  progress: PngSequenceExportProgress,
): void => {
  const ownerId = pngSequenceExportOwnerByJobId.get(jobId);
  if (!ownerId) return;
  const ownerContents = BrowserWindow.getAllWindows()
    .map((window) => window.webContents)
    .find((contents) => contents.id === ownerId);
  if (!ownerContents || ownerContents.isDestroyed()) return;
  ownerContents.send('export:pngSequenceProgress', progress);
};

const retainPngSequenceExportOwner = (ownerWindow: BrowserWindow | undefined): (() => void) => {
  if (!ownerWindow || ownerWindow.isDestroyed()) return () => undefined;
  const ownerId = ownerWindow.webContents.id;
  const nextCount = (pngSequenceExportActiveCountByOwner.get(ownerId) ?? 0) + 1;
  pngSequenceExportActiveCountByOwner.set(ownerId, nextCount);
  sendPngSequenceExportState(ownerWindow, { active: true, activeCount: nextCount });

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const prevCount = pngSequenceExportActiveCountByOwner.get(ownerId) ?? 0;
    const updatedCount = Math.max(0, prevCount - 1);
    if (updatedCount === 0) pngSequenceExportActiveCountByOwner.delete(ownerId);
    else pngSequenceExportActiveCountByOwner.set(ownerId, updatedCount);

    sendPngSequenceExportState(ownerWindow, { active: updatedCount > 0, activeCount: updatedCount });
  };
};

const sanitizePngSequenceExportRequest = (request: PngSequenceExportRequest): PngSequenceExportRequest | null => {
  if (!request || typeof request !== 'object') return null;
  if (!request.project || typeof request.project !== 'object') return null;
  if (request.project.format !== 'mmd_modoki_project' || request.project.version !== 1) return null;
  if (!request.outputDirectoryPath || typeof request.outputDirectoryPath !== 'string') return null;

  const startFrame = Number.isFinite(request.startFrame) ? Math.max(0, Math.floor(request.startFrame)) : 0;
  const endFrame = Number.isFinite(request.endFrame) ? Math.max(startFrame, Math.floor(request.endFrame)) : startFrame;
  const step = Number.isFinite(request.step) ? Math.max(1, Math.floor(request.step)) : 1;
  const fps = Number.isFinite(request.fps) ? Math.max(1, Math.floor(request.fps)) : 30;
  const precision = Number.isFinite(request.precision) ? Math.max(0.25, Math.min(4, request.precision)) : 1;
  const outputWidth = Number.isFinite(request.outputWidth) ? Math.max(320, Math.floor(request.outputWidth)) : 1920;
  const outputHeight = Number.isFinite(request.outputHeight) ? Math.max(180, Math.floor(request.outputHeight)) : 1080;
  const prefix = typeof request.prefix === 'string' && request.prefix.trim().length > 0
    ? request.prefix.trim()
    : 'mmd_seq';

  return {
    project: request.project,
    outputDirectoryPath: request.outputDirectoryPath,
    startFrame,
    endFrame,
    step,
    prefix,
    fps,
    precision,
    outputWidth,
    outputHeight,
  };
};

const loadEditorWindow = async (
  targetWindow: BrowserWindow,
  query?: Record<string, string>,
): Promise<void> => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    await targetWindow.loadURL(url.toString());
    return;
  }

  await targetWindow.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    query ? { query } : undefined,
  );
};

const fitContentSizeToAspect = (
  targetWidth: number,
  targetHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } => {
  const ratio = targetWidth / targetHeight;
  let width = Math.min(targetWidth, maxWidth);
  let height = Math.round(width / ratio);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * ratio);
  }
  return {
    width: Math.max(640, width),
    height: Math.max(360, height),
  };
};

const isAllowedAppUrl = (targetUrl: string): boolean => {
  try {
    const parsed = new URL(targetUrl);
    if (isDev && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const devOrigin = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
      if (parsed.origin === devOrigin) return true;
    }
    return ALLOWED_PRODUCTION_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
};

const configureSessionSecurity = (): void => {
  if (isDev) return;

  const requestFilter = {
    urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'],
  };

  session.defaultSession.webRequest.onBeforeRequest(requestFilter, (details, callback) => {
    callback({ cancel: true });
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));

    contents.on('will-navigate', (event, navigationUrl) => {
      if (isAllowedAppUrl(navigationUrl)) return;
      event.preventDefault();
    });
  });
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_DEFAULT_WIDTH,
    height: MAIN_WINDOW_DEFAULT_HEIGHT,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    autoHideMenuBar: true,
    title: 'MMD modoki',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow file:// protocol for local PMX/texture loading
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAspectRatio(MAIN_WINDOW_ASPECT_RATIO);

  // Load the app
  void loadEditorWindow(mainWindow);

  // Open DevTools in dev mode
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (event) => {
    const ownerId = mainWindow.webContents.id;
    const activeExports = pngSequenceExportActiveCountByOwner.get(ownerId) ?? 0;
    if (activeExports <= 0) return;

    event.preventDefault();
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      title: 'Export In Progress',
      message: 'PNG sequence export is running in the background.',
      detail: 'Please wait until export finishes before closing the main window.',
      noLink: true,
    });
  });
};

app.on('ready', () => {
  configureSessionSecurity();
  createWindow();
});

// IPC Handlers
ipcMain.handle('dialog:openFile', async (_event, filters: { name: string; extensions: string[] }[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('file:readBinary', async (_event, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer;
  } catch (err) {
    console.error('Failed to read file:', err);
    return null;
  }
});

ipcMain.handle('file:getInfo', async (_event, filePath: string) => {
  try {
    const stat = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      extension: path.extname(filePath).toLowerCase(),
    };
  } catch (err) {
    console.error('Failed to get file info:', err);
    return null;
  }
});

ipcMain.handle('file:readText', async (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Failed to read text file:', err);
    return null;
  }
});

ipcMain.handle('file:listBundledWgslFiles', async (): Promise<{ name: string; path: string }[]> => {
  try {
    const candidateDirs: string[] = [];
    const seenDirs = new Set<string>();
    const baseDirs = [process.cwd(), app.getAppPath(), __dirname];

    for (const base of baseDirs) {
      let current = path.resolve(base);
      for (let depth = 0; depth < 8; depth += 1) {
        const wgslDir = path.join(current, 'wgsl');
        if (!seenDirs.has(wgslDir)) {
          seenDirs.add(wgslDir);
          candidateDirs.push(wgslDir);
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }

    const uniqueByPath = new Map<string, { name: string; path: string }>();

    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (path.extname(entry.name).toLowerCase() !== '.wgsl') continue;
        const filePath = path.join(dir, entry.name);
        if (uniqueByPath.has(filePath)) continue;
        uniqueByPath.set(filePath, { name: entry.name, path: filePath });
      }
    }

    return Array.from(uniqueByPath.values()).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('Failed to list bundled WGSL files:', err);
    return [];
  }
});

ipcMain.handle(
  'file:saveText',
  async (
    _event,
    content: string,
    defaultFileName?: string,
    filters?: { name: string; extensions: string[] }[],
  ) => {
    try {
      const safeName = defaultFileName?.trim() ? defaultFileName : 'project.modoki.json';
      const result = await dialog.showSaveDialog({
        title: 'Save Project',
        defaultPath: path.join(app.getPath('documents'), safeName),
        filters: filters && filters.length > 0
          ? filters
          : [
            { name: 'MMD Modoki Project', extensions: ['mmdproj', 'json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      fs.writeFileSync(result.filePath, content, 'utf-8');
      return result.filePath;
    } catch (err) {
      console.error('Failed to save text file:', err);
      return null;
    }
  },
);

ipcMain.handle('file:writeTextToPath', async (_event, filePath: string, content: string): Promise<boolean> => {
  try {
    if (!filePath || typeof filePath !== 'string') return false;
    const targetDir = path.dirname(filePath);
    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to write text file to path:', err);
    return false;
  }
});

ipcMain.handle('file:savePng', async (_event, dataUrl: string, defaultFileName?: string) => {
  try {
    const safeName = (defaultFileName && defaultFileName.toLowerCase().endsWith('.png'))
      ? defaultFileName
      : `${defaultFileName ?? 'mmd_capture'}.png`;

    const result = await dialog.showSaveDialog({
      title: 'PNG画像を保存',
      defaultPath: path.join(app.getPath('pictures'), safeName),
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const prefix = 'data:image/png;base64,';
    const base64 = dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : dataUrl;
    fs.writeFileSync(result.filePath, base64, 'base64');
    return result.filePath;
  } catch (err) {
    console.error('Failed to save PNG:', err);
    return null;
  }
});

ipcMain.handle('file:savePngToPath', async (_event, dataUrl: string, directoryPath: string, fileName: string) => {
  try {
    if (!directoryPath || !fileName) return null;
    const safeFileName = path.basename(fileName);
    if (!safeFileName.toLowerCase().endsWith('.png')) return null;

    await ensureDirectoryExists(directoryPath);
    const filePath = path.join(directoryPath, safeFileName);

    const prefix = 'data:image/png;base64,';
    const base64 = dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : dataUrl;
    await fs.promises.writeFile(filePath, base64, 'base64');
    return filePath;
  } catch (err) {
    console.error('Failed to save PNG to path:', err);
    return null;
  }
});

ipcMain.handle(
  'file:savePngRgbaToPath',
  async (
    _event,
    rgbaData: Uint8Array,
    width: number,
    height: number,
    directoryPath: string,
    fileName: string,
  ) => {
    try {
      if (!directoryPath || !fileName) return null;
      const safeFileName = path.basename(fileName);
      if (!safeFileName.toLowerCase().endsWith('.png')) return null;
      if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

      const pngWidth = Math.max(1, Math.floor(width));
      const pngHeight = Math.max(1, Math.floor(height));
      const expectedByteLength = pngWidth * pngHeight * 4;
      if (!(rgbaData instanceof Uint8Array) || rgbaData.byteLength !== expectedByteLength) {
        return null;
      }

      await ensureDirectoryExists(directoryPath);
      const filePath = path.join(directoryPath, safeFileName);
      const bgraData = Buffer.from(rgbaData);
      for (let i = 0; i < bgraData.length; i += 4) {
        const r = bgraData[i];
        bgraData[i] = bgraData[i + 2];
        bgraData[i + 2] = r;
      }
      const image = nativeImage.createFromBitmap(bgraData, {
        width: pngWidth,
        height: pngHeight,
      });
      const pngBytes = image.toPNG();
      await fs.promises.writeFile(filePath, pngBytes);
      return filePath;
    } catch (err) {
      console.error('Failed to save RGBA PNG to path:', err);
      return null;
    }
  },
);

ipcMain.handle(
  'export:startPngSequenceWindow',
  async (event, request: PngSequenceExportRequest): Promise<PngSequenceExportLaunchResult | null> => {
    let exportWindow: BrowserWindow | undefined;
    let releaseOwnerExport = () => undefined;
    let jobId: string | null = null;
    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (jobId) {
        pngSequenceExportJobMap.delete(jobId);
        pngSequenceExportOwnerByJobId.delete(jobId);
      }
      releaseOwnerExport();
    };

    try {
      const sanitized = sanitizePngSequenceExportRequest(request);
      if (!sanitized) return null;

      const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      releaseOwnerExport = retainPngSequenceExportOwner(ownerWindow);
      jobId = randomUUID();
      pngSequenceExportJobMap.set(jobId, sanitized);
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        pngSequenceExportOwnerByJobId.set(jobId, ownerWindow.webContents.id);
      }

      const fallbackBounds = { x: 0, y: 0, width: sanitized.outputWidth, height: sanitized.outputHeight };
      const display = screen.getDisplayMatching(ownerWindow?.getBounds() ?? fallbackBounds);
      const maxContentWidth = Math.max(960, Math.floor(display.workAreaSize.width * 0.9));
      const maxContentHeight = Math.max(540, Math.floor(display.workAreaSize.height * 0.9));
      const initialContentSize = fitContentSizeToAspect(
        sanitized.outputWidth,
        sanitized.outputHeight,
        maxContentWidth,
        maxContentHeight,
      );

      exportWindow = new BrowserWindow({
        width: initialContentSize.width,
        height: initialContentSize.height,
        useContentSize: true,
        minWidth: 960,
        minHeight: 540,
        show: false,
        paintWhenInitiallyHidden: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        title: `PNG Sequence Export - ${jobId.slice(0, 8)}`,
        backgroundColor: '#0a0a0f',
        parent: ownerWindow,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: false,
          backgroundThrottling: false,
        },
      });
      exportWindow.setAspectRatio(sanitized.outputWidth / sanitized.outputHeight);
      exportWindow.setMenuBarVisibility(false);
      exportWindow.setContentSize(initialContentSize.width, initialContentSize.height);

      exportWindow.on('closed', () => {
        cleanup();
      });

      await loadEditorWindow(exportWindow, { mode: 'exporter', jobId });

      return { jobId };
    } catch (err) {
      cleanup();
      if (exportWindow && !exportWindow.isDestroyed()) {
        exportWindow.close();
      }
      console.error('Failed to start PNG sequence export window:', err);
      return null;
    }
  },
);

ipcMain.handle('export:takePngSequenceJob', async (_event, jobId: string): Promise<PngSequenceExportRequest | null> => {
  if (!jobId || typeof jobId !== 'string') return null;
  const job = pngSequenceExportJobMap.get(jobId);
  if (!job) return null;
  pngSequenceExportJobMap.delete(jobId);
  return job;
});

ipcMain.on('export:pngSequenceProgress', (_event, progress: PngSequenceExportProgress) => {
  if (!progress || typeof progress !== 'object') return;
  if (typeof progress.jobId !== 'string' || progress.jobId.length === 0) return;
  if (!pngSequenceExportOwnerByJobId.has(progress.jobId)) return;
  sendPngSequenceExportProgressToOwner(progress.jobId, progress);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
