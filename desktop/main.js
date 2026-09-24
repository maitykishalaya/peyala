const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');

let mainWindow = null;
let tray = null;
let backendProcess = null;
let frontendProcess = null;
let isQuitting = false;

function logEngine(msg) {
  try {
    const userData = app.getPath('userData');
    if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
    const logPath = path.join(userData, 'peyala_engine.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

// ── Smart Dynamic Project Root Discovery ─────────────────────────────
function saveRootDir(dir) {
  try {
    const userData = app.getPath('userData');
    if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, 'peyala_config.json'), JSON.stringify({ rootDir: dir }, null, 2));
  } catch (_) {}
}

function findRootDir() {
  // 1. If running unpacked in dev:
  const candidateDev = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(candidateDev, 'backend', 'src', 'server.js'))) {
    return candidateDev;
  }

  // 2. If packaged with extraResources (e.g. process.resourcesPath):
  if (process.resourcesPath) {
    if (fs.existsSync(path.join(process.resourcesPath, 'backend', 'src', 'server.js'))) {
      return process.resourcesPath;
    }
    const candidateApp = path.join(process.resourcesPath, 'app');
    if (fs.existsSync(path.join(candidateApp, 'backend', 'src', 'server.js'))) {
      return candidateApp;
    }
  }

  // 3. Check environment variable
  if (process.env.PEYALA_ROOT && fs.existsSync(path.join(process.env.PEYALA_ROOT, 'backend', 'src', 'server.js'))) {
    return process.env.PEYALA_ROOT;
  }

  // 4. Check saved config in userData
  try {
    const configPath = path.join(app.getPath('userData'), 'peyala_config.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.rootDir && fs.existsSync(path.join(cfg.rootDir, 'backend', 'src', 'server.js'))) {
        return cfg.rootDir;
      }
    }
  } catch (_) {}

  // 5. Search standard locations on Windows:
  const homeDir = os.homedir();
  const possiblePaths = [
    path.join(homeDir, 'Desktop', 'peyala_v8'),
    path.join(homeDir, 'Desktop', 'peyala'),
    path.join(homeDir, 'Downloads', 'peyala_v8'),
    path.join(homeDir, 'Downloads', 'peyala'),
    path.join(homeDir, 'peyala_v8'),
    path.join(homeDir, 'peyala'),
    'C:\\Peyala',
    'C:\\peyala_v8',
    'D:\\Peyala',
    'D:\\peyala_v8',
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, 'backend', 'src', 'server.js')) && fs.existsSync(path.join(p, 'frontend'))) {
      saveRootDir(p);
      return p;
    }
  }

  // 6. Search Desktop subdirectories for peyala
  try {
    const desktopDir = path.join(homeDir, 'Desktop');
    if (fs.existsSync(desktopDir)) {
      const entries = fs.readdirSync(desktopDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.toLowerCase().includes('peyala')) {
          const candidate = path.join(desktopDir, entry.name);
          if (fs.existsSync(path.join(candidate, 'backend', 'src', 'server.js'))) {
            saveRootDir(candidate);
            return candidate;
          }
        }
      }
    }
  } catch (_) {}

  return candidateDev;
}

let ROOT_DIR = findRootDir();
let BACKEND_DIR = path.join(ROOT_DIR, 'backend');
let FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

function refreshDirs(newRoot) {
  ROOT_DIR = newRoot;
  BACKEND_DIR = path.join(ROOT_DIR, 'backend');
  FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
  saveRootDir(newRoot);
  console.log('[Peyala] Configured project root directory: ' + newRoot);
}

const ICON_PATH = fs.existsSync(path.join(__dirname, 'icon.ico'))
  ? path.join(__dirname, 'icon.ico')
  : fs.existsSync(path.join(ROOT_DIR, 'icon.ico'))
  ? path.join(ROOT_DIR, 'icon.ico')
  : path.join(FRONTEND_DIR, 'public', 'icon.png');

// Prevent unhandled errors from terminating the process unexpectedly
process.on('uncaughtException', (err) => {
  console.error('[Peyala Desktop Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Peyala Desktop Unhandled Rejection]', reason);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Peyala] Another instance is already running. Quitting duplicate instance.');
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Utility: Resolve Node.js binary reliably on Windows ──────────────
function getNodeExecutable() {
  const portableNode = path.join(ROOT_DIR, 'portable-node', 'node.exe');
  if (fs.existsSync(portableNode)) return portableNode;
  const standardNode = 'C:\\Program Files\\nodejs\\node.exe';
  if (fs.existsSync(standardNode)) return standardNode;
  const localAppDataNode = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe');
  if (fs.existsSync(localAppDataNode)) return localAppDataNode;
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

// ── Utility: Check if a port is currently open ───────────────────────
function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

// ── Utility: Kill processes on specific ports (Windows) ──────────────
function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -aon 2>nul | findstr ":${port} " | findstr "LISTENING"`, { encoding: 'utf-8' });
      const lines = output.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid) && pid !== '0' && parseInt(pid) !== process.pid) {
          try {
            execSync(`taskkill /F /PID ${pid} >nul 2>&1`);
            console.log(`[Peyala] Freed port ${port} by terminating PID ${pid}`);
          } catch (_) {}
        }
      }
    }
  } catch (_) {
    // Port was already free
  }
}

// ── Utility: Wait for TCP port to accept connections ─────────────────
function waitForPort(port, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(800);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`Timeout waiting for port ${port}`));
        else setTimeout(tryConnect, 400);
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`Timeout waiting for port ${port}`));
        else setTimeout(tryConnect, 400);
      });
      socket.connect(port, '127.0.0.1');
    };
    tryConnect();
  });
}

// ── Start Local Production Engines (Backend & Frontend) ─────────────
async function startLocalEngines() {
  const p3000 = await isPortOpen(3000);
  const p4000 = await isPortOpen(4000);

  if (p3000 && p4000) {
    console.log('[Peyala] Local servers are already online and serving ports 3000 & 4000.');
    return;
  }

  // Ensure ROOT_DIR exists and contains backend
  if (!fs.existsSync(path.join(BACKEND_DIR, 'src', 'server.js'))) {
    console.warn('[Peyala] Backend script not found at ' + BACKEND_DIR + '. Searching alternative locations...');
    const discovered = findRootDir();
    if (discovered && fs.existsSync(path.join(discovered, 'backend', 'src', 'server.js'))) {
      refreshDirs(discovered);
    } else {
      console.error('[Peyala] Could not auto-detect Peyala project directory with backend.');
      return;
    }
  }

  console.log('[Peyala] Preparing local ports 3000 & 4000...');
  if (!p3000) killPort(3000);
  if (!p4000) killPort(4000);

function logEngine(msg) {
  try {
    const logPath = path.join(app.getPath('userData'), 'peyala_engine.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

  const nodeBin = getNodeExecutable();
  logEngine(`Starting engines using nodeBin: ${nodeBin}, ROOT_DIR: ${ROOT_DIR}`);

  // 1. Launch Backend API (Node.js Express on Port 4000)
  if (!p4000) {
    console.log('[Peyala] Launching backend server on port 4000 using ' + nodeBin + ' in ' + BACKEND_DIR + '...');
    const backendScript = path.join(BACKEND_DIR, 'src', 'server.js');
    logEngine(`Launching backend: ${backendScript}`);

    backendProcess = spawn(nodeBin, [backendScript], {
      cwd: BACKEND_DIR,
      env: { ...process.env, NODE_ENV: 'production', PORT: '4000' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    backendProcess.stdout?.on('data', (d) => { console.log(`[Peyala Backend] ${d}`); logEngine(`[Backend stdout] ${d}`); });
    backendProcess.stderr?.on('data', (d) => { console.error(`[Peyala Backend Error] ${d}`); logEngine(`[Backend stderr] ${d}`); });

    backendProcess.on('error', (err) => { console.error('[Peyala Backend Error]', err); logEngine(`[Backend spawn error] ${err.message}`); });
    backendProcess.on('exit', (code, signal) => {
      logEngine(`[Backend exited] code: ${code}, signal: ${signal}`);
      if (!isQuitting && code !== 0 && code !== null) {
        console.warn(`[Peyala] Backend process exited (code: ${code}, signal: ${signal})`);
      }
    });
  }

  // 2. Launch Frontend (Next.js Production Server on Port 3000)
  if (!p3000) {
    console.log('[Peyala] Launching frontend production server on port 3000 in ' + FRONTEND_DIR + '...');
    const nextCli = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
    logEngine(`Launching frontend: ${nextCli} start -p 3000`);

    frontendProcess = spawn(nodeBin, [nextCli, 'start', '-p', '3000'], {
      cwd: FRONTEND_DIR,
      env: { ...process.env, NODE_ENV: 'production', PORT: '3000' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    frontendProcess.stdout?.on('data', (d) => { console.log(`[Peyala Frontend] ${d}`); logEngine(`[Frontend stdout] ${d}`); });
    frontendProcess.stderr?.on('data', (d) => { console.error(`[Peyala Frontend Error] ${d}`); logEngine(`[Frontend stderr] ${d}`); });

    frontendProcess.on('error', (err) => { console.error('[Peyala Frontend Error]', err); logEngine(`[Frontend spawn error] ${err.message}`); });
    frontendProcess.on('exit', (code, signal) => {
      logEngine(`[Frontend exited] code: ${code}, signal: ${signal}`);
      if (!isQuitting && code !== 0 && code !== null) {
        console.warn(`[Peyala] Frontend process exited (code: ${code}, signal: ${signal})`);
      }
    });
  }
}

// ── Clean Engine Termination ─────────────────────────────────────────
function stopLocalEngines() {
  console.log('[Peyala] Stopping local engines...');
  try {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill();
    }
  } catch (_) {}

  try {
    if (frontendProcess && !frontendProcess.killed) {
      frontendProcess.kill();
    }
  } catch (_) {}

  killPort(3000);
  killPort(4000);
}

// ── Create Main Application Window ───────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 650,
    icon: ICON_PATH,
    title: 'Peyala POS — Restaurant Operations & Counter Terminal',
    backgroundColor: '#111827', // Slate 900
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.maximize();
  mainWindow.show();
  mainWindow.focus();

  // Handle window close
  mainWindow.on('close', (e) => {
    logEngine('mainWindow close event triggered');
    if (!isQuitting) {
      // Clean quit
      isQuitting = true;
      stopLocalEngines();
    }
  });

  mainWindow.on('closed', () => {
    logEngine('mainWindow closed event triggered');
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logEngine(`[webContents did-fail-load] code: ${errorCode}, error: ${errorDescription}, url: ${validatedURL}`);
  });

  // Register local keyboard shortcuts for POS operations
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setKiosk(!mainWindow.isKiosk());
      event.preventDefault();
    } else if (input.key === 'F5' && input.type === 'keyDown') {
      mainWindow.reload();
      event.preventDefault();
    }
  });
}

// ── Utility: Resolve Local Wi-Fi / LAN IP for Mobile Waiter Devices ──
function getLocalLanIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
          return net.address;
        }
      }
    }
  } catch (_) {}
  return 'localhost';
}

// ── Setup Windows System Tray ─────────────────────────────────────────
function setupTray() {
  try {
    tray = new Tray(ICON_PATH);
    tray.setToolTip('Peyala POS — Counter Station');

    const lanIp = getLocalLanIp();
    const mobileUrl = `http://${lanIp}:3000`;

    const contextMenu = Menu.buildFromTemplate([
      { label: '🍵 Peyala POS Station (Online)', enabled: false },
      {
        label: `📱 Mobile Waiter URL: ${mobileUrl}`,
        click: () => {
          require('electron').clipboard.writeText(mobileUrl);
        },
      },
      { type: 'separator' },
      {
        label: '🪑 POS Floor Plan (/tables)',
        click: () => {
          if (mainWindow) {
            mainWindow.loadURL('http://127.0.0.1:3000/tables');
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: '🍳 Kitchen Display (/kds)',
        click: () => {
          if (mainWindow) {
            mainWindow.loadURL('http://127.0.0.1:3000/kds');
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: '📊 Sales & Reports (/reports)',
        click: () => {
          if (mainWindow) {
            mainWindow.loadURL('http://127.0.0.1:3000/reports');
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: '🖥️ Toggle Fullscreen Kiosk',
        click: () => {
          if (mainWindow) {
            mainWindow.setKiosk(!mainWindow.isKiosk());
          }
        },
      },
      {
        label: '🔄 Restart Local Servers',
        click: () => {
          stopLocalEngines();
          startLocalEngines();
          setTimeout(() => {
            if (mainWindow) mainWindow.loadURL('http://127.0.0.1:3000/login');
          }, 3000);
        },
      },
      { type: 'separator' },
      {
        label: '❌ Exit Peyala POS',
        click: () => {
          isQuitting = true;
          stopLocalEngines();
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.error('[Peyala Tray Init Error]', err);
  }
}

// ── Native Hardware Silent Thermal Printing IPC Handlers ──────────────
ipcMain.handle('print-thermal-slip', async (event, { html, printerName, silent = true }) => {
  return new Promise((resolve) => {
    try {
      const printWindow = new BrowserWindow({
        show: false,
        width: 360,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      printWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => {
          printWindow.webContents.print(
            {
              silent: silent !== false,
              printBackground: true,
              deviceName: printerName || '',
              margins: { marginType: 'printableArea' },
            },
            (success, failureReason) => {
              try {
                printWindow.close();
              } catch (_) {}
              if (!success) {
                console.error('[Peyala Print Error]', failureReason);
              }
              resolve({ success, failureReason });
            }
          );
        }, 100);
      });

      printWindow.webContents.on('did-fail-load', (e, code, desc) => {
        try {
          printWindow.close();
        } catch (_) {}
        resolve({ success: false, failureReason: desc });
      });
    } catch (err) {
      console.error('[Peyala Print Exception]', err);
      resolve({ success: false, failureReason: err.message });
    }
  });
});

ipcMain.handle('get-system-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err) {
    console.error('[Peyala Get Printers Error]', err);
    return [];
  }
});

ipcMain.handle('toggle-kiosk', () => {
  if (mainWindow) {
    mainWindow.setKiosk(!mainWindow.isKiosk());
    return mainWindow.isKiosk();
  }
  return false;
});

ipcMain.handle('is-kiosk', () => {
  return mainWindow ? mainWindow.isKiosk() : false;
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Peyala POS Folder (peyala_v8)',
    properties: ['openDirectory'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0];
    if (fs.existsSync(path.join(selected, 'backend', 'src', 'server.js'))) {
      refreshDirs(selected);
      await startLocalEngines();
      try {
        await waitForPort(3000, 25000);
        if (mainWindow) mainWindow.loadURL('http://127.0.0.1:3000/login');
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    } else {
      return { success: false, error: 'The selected folder does not contain Peyala backend\\src\\server.js' };
    }
  }
  return { success: false, error: 'Cancelled' };
});

ipcMain.handle('restart-local-servers', async () => {
  stopLocalEngines();
  await startLocalEngines();
  try {
    await waitForPort(3000, 25000);
    if (mainWindow) mainWindow.loadURL('http://127.0.0.1:3000/login');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function getRecoveryHtml(currentRootDir) {
  const displayDir = (currentRootDir || 'Not Found').replace(/\\/g, '\\\\');
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Peyala POS Station — Recovery</title>
        <style>
          body {
            margin: 0;
            background: #0f172a;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            user-select: none;
          }
          .card {
            text-align: center;
            background: #1e293b;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            border: 1px solid #334155;
            max-width: 520px;
          }
          .icon { font-size: 48px; margin-bottom: 16px; }
          h2 { margin: 0 0 12px 0; font-size: 22px; color: #ffffff; }
          p { margin: 0 0 20px 0; color: #94a3b8; font-size: 14px; line-height: 1.6; }
          .path-box {
            background: #0f172a;
            padding: 10px 14px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            color: #cbd5e1;
            word-break: break-all;
            margin-bottom: 24px;
            border: 1px solid #334155;
          }
          .btn-group { display: flex; flex-direction: column; gap: 10px; }
          button {
            padding: 12px 20px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
          }
          .btn-primary { background: #ef4444; color: #ffffff; }
          .btn-primary:hover { background: #dc2626; }
          .btn-secondary { background: #334155; color: #ffffff; }
          .btn-secondary:hover { background: #475569; }
          .btn-outline { background: transparent; color: #38bdf8; border: 1px solid #0284c7; }
          .btn-outline:hover { background: rgba(56, 189, 248, 0.1); }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🍵</div>
          <h2>Peyala POS Station Setup</h2>
          <p>Local server did not respond on port 3000. Ensure the Peyala project folder is located or reconnect.</p>
          <div class="path-box">Search Path: ${displayDir}</div>
          <div class="btn-group">
            <button class="btn-primary" onclick="if(window.electronAPI && window.electronAPI.restartServers){window.electronAPI.restartServers().then(res => { if (!res.success) alert(res.error); });}else{window.location.reload();}">🔄 Restart Local Engines</button>
            <button class="btn-secondary" onclick="if(window.electronAPI && window.electronAPI.selectProjectFolder){window.electronAPI.selectProjectFolder().then(res => { if (!res.success && res.error !== 'Cancelled') alert(res.error); });}">📁 Select Peyala Project Folder</button>
            <button class="btn-outline" onclick="window.location.href='http://127.0.0.1:3000/login'">🌐 Retry Connecting to Port 3000</button>
          </div>
        </div>
      </body>
    </html>
  `;
}

// ── App Lifecycle ────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createMainWindow();
  setupTray();

  // Load a lightweight loading screen while waiting for the production server
  const loadingHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Loading Peyala POS...</title>
        <style>
          body {
            margin: 0;
            background: #0f172a;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            user-select: none;
          }
          .card {
            text-align: center;
            background: #1e293b;
            padding: 40px 50px;
            border-radius: 20px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            border: 1px solid #334155;
            max-width: 440px;
          }
          .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #334155;
            border-top: 4px solid #ef4444;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 24px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          h1 { margin: 0 0 10px 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
          p { margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
          .badge {
            display: inline-block;
            margin-top: 20px;
            padding: 6px 14px;
            background: #0f172a;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 700;
            color: #ef4444;
            border: 1px solid #334155;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="spinner"></div>
          <h1>Peyala POS Station</h1>
          <p>Initializing high-performance local engines and thermal printing interface...</p>
          <div class="badge">🚀 Lightning Fast Local Server</div>
        </div>
      </body>
    </html>
  `;
  if (mainWindow) {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);
  }

  // Start backend & frontend production servers
  await startLocalEngines();

  try {
    logEngine('Waiting for local production server on port 3000...');
    console.log('[Peyala] Waiting for local production server on port 3000...');
    await waitForPort(3000, 35000);
    logEngine('Local server is online on port 3000! Loading POS terminal...');
    console.log('[Peyala] Local server is online! Loading POS terminal...');
    if (mainWindow) {
      mainWindow.loadURL('http://127.0.0.1:3000/login');
    }
  } catch (err) {
    logEngine(`waitForPort timed out or failed: ${err.message}`);
    console.error('[Peyala Startup Error]', err);
    if (mainWindow) {
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getRecoveryHtml(ROOT_DIR))}`);
    }
  }
});

app.on('window-all-closed', () => {
  logEngine('app event: window-all-closed');
  stopLocalEngines();
  app.quit();
  setTimeout(() => process.exit(0), 500);
});

app.on('before-quit', () => {
  logEngine('app event: before-quit');
  isQuitting = true;
  stopLocalEngines();
  setTimeout(() => process.exit(0), 500);
});
