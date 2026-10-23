const { app, BrowserWindow, protocol, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

protocol.registerSchemesAsPrivileged([{
  scheme: 'shiri',
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);

const smokeUserData = process.env.SHIRI_SMOKE_DATA;
if (smokeUserData) app.setPath('userData', smokeUserData);
if (smokeUserData) {
  app.setName('shiri-journal-smoke');
  app.setAppUserModelId('com.shiri.journal.smoke');
}
const gotLock = smokeUserData ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId('com.shiri.journal');
  app.setPath('userData', smokeUserData || path.join(app.getPath('appData'), 'ZongjieJilu'));

  let mainWindow;

  const createWindow = () => {
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 900,
      minHeight: 620,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#0a0f16',
      icon: app.isPackaged
        ? path.join(process.resourcesPath, 'icon.ico')
        : path.join(__dirname, 'build', 'icon.ico'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('shiri://journal/')) event.preventDefault();
    });
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.loadURL('shiri://journal/shiri-journal.html');
  };

  app.whenReady().then(() => {
    const files = new Map([
      ['/shiri-journal.html', ['shiri-journal.html', 'text/html; charset=utf-8']],
      ['/deep-green-flow.png', ['deep-green-flow.png', 'image/png']],
      ['/shiri-logo.png', ['shiri-logo.png', 'image/png']]
    ]);
    const contentSecurityPolicy = [
      "default-src 'self' blob: data:",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "connect-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'"
    ].join('; ');

    protocol.handle('shiri', async (request) => {
      const pathname = new URL(request.url).pathname;
      const [fileName, contentType] = files.get(pathname) || [];
      if (!fileName) return new Response('Not found', { status: 404 });

      try {
        const body = await fs.readFile(path.join(__dirname, 'app', fileName));
        return new Response(body, {
          headers: {
            'content-type': contentType,
            'content-security-policy': contentSecurityPolicy,
            'x-content-type-options': 'nosniff'
          }
        });
      } catch {
        return new Response('Application asset unavailable', { status: 500 });
      }
    });

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
