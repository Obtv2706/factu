'use strict';

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

const LOCK = app.requestSingleInstanceLock();
if (!LOCK) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(start);
}

let win = null;
let serverClose = null;
let isQuitting = false;

async function start() {
  process.env.NODE_ENV = 'development';
  process.env.COOKIE_SECURE = 'false';
  process.env.SESSION_SECRET = 'electron-secret';

  const dataDir = app.getPath('userData');
  process.env.DATA_DIR = dataDir;

  const backupsDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const { createServer } = require('./server/app');
  const server = await createServer({ host: '127.0.0.1', port: 0, dataDir });
  serverClose = server.close;
  const url = `http://127.0.0.1:${server.port}`;

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Factu — Estimados de Construcción',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.once('ready-to-show', () => {
    win.center();
    win.show();
    win.focus();
  });

  await win.loadURL(url).catch((err) => {
    console.error('[electron] Error cargando URL:', err.message);
    win.show();
  });

  buildMenu();

  win.on('close', async (e) => {
    if (isQuitting) return;
    e.preventDefault();
    await autoBackup(dataDir);
    isQuitting = true;
    win.destroy();
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async () => {
  isQuitting = true;
  if (serverClose) {
    await serverClose().catch(() => {});
  }
});

function buildMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Respaldo ahora...',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            const dataDir = app.getPath('userData');
            await autoBackup(dataDir);
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'Respaldo',
              message: 'Respaldo creado exitosamente.',
              detail: `Ubicación: ${path.join(dataDir, 'backups')}`,
            });
          },
        },
        {
          label: 'Abrir carpeta de respaldos',
          click: () => {
            shell.openPath(path.join(app.getPath('userData'), 'backups'));
          },
        },
        {
          label: 'Abrir carpeta de datos',
          click: () => {
            shell.openPath(app.getPath('userData'));
          },
        },
        { type: 'separator' },
        {
          label: 'Salir',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => win.reload() },
        { label: 'DevTools', accelerator: 'F12', click: () => win.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Más grande', accelerator: 'CmdOrCtrl+=', click: () => win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5) },
        { label: 'Más pequeño', accelerator: 'CmdOrCtrl+-', click: () => win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5) },
        { label: 'Zoom normal', accelerator: 'CmdOrCtrl+0', click: () => win.webContents.setZoomLevel(0) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de Factu',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'Factu — Estimados de Construcción',
              message: 'Factu v1.0.0',
              detail: 'Sistema web de estimados de construcción con ganancia por etapa y exportación a PDF.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function autoBackup(dataDir) {
  const backupsDir = path.join(dataDir, 'backups');
  const dbPath = path.join(dataDir, 'factu.db');
  if (!fs.existsSync(dbPath)) return;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(backupsDir, `factu-${ts}.db`);
  fs.copyFileSync(dbPath, dest);

  const files = fs.readdirSync(backupsDir)
    .filter((f) => f.startsWith('factu-') && f.endsWith('.db'))
    .sort()
    .reverse();
  for (const f of files.slice(10)) {
    fs.unlinkSync(path.join(backupsDir, f));
  }
}
