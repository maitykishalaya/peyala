const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut } = require('electron');
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

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const ICON_PATH = fs.existsSync(path.join(__dirname, 'icon.ico'))
  ? path.join(__dirname, 'icon.ico')
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
function startLocalEngines() {
  console.log('[Peyala] Preparing local ports 3000 & 4000...');
  killPort(3000);
  killPort(4000);

  const nodeBin = getNodeExecutable();

  // 1. Launch Backend API (Node.js Express on Port 4000)
  console.log('[Peyala] Launching backend server on port 4000 using ' + nodeBin + '...');
  const backendScript = path.join(BACKEND_DIR, 'src', 'server.js');

  backendProcess = spawn(nodeBin, [backendScript], {
    cwd: BACKEND_DIR,
    env: { ...process.env, NODE_ENV: 'production', PORT: '4000' },
    stdio: 'inherit',
    windowsHide: true,
  });

  backendProcess.on('error', (err) => console.error('[Peyala Backend Error]', err));
  backendProcess.on('exit', (code, signal) => {
    if (!isQuitting && code !== 0 && code !== null) {
      console.warn(`[Peyala] Backend process exited (code: ${code}, signal: ${signal})`);
    }
  });

  // 2. Launch Frontend (Next.js Production Server on Port 3000)
  console.log('[Peyala] Launching frontend production server on port 3000...');
  const nextCli = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');

  frontendProcess = spawn(nodeBin, [nextCli, 'start', '-p', '3000'], {
    cwd: FRONTEND_DIR,
    env: { ...process.env, NODE_ENV: 'production', PORT: '3000' },
    stdio: 'inherit',
    windowsHide: true,
  });

  frontendProcess.on('error', (err) => console.error('[Peyala Frontend Error]', err));
  frontendProcess.on('exit', (code, signal) => {
    if (!isQuitting && code !== 0 && code !== null) {
      console.warn(`[Peyala] Frontend process exited (code: ${code}, signal: ${signal})`);
    }
  });
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
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.maximize();

  // Show window only when ready to avoid blank white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window close
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      // Clean quit
      isQuitting = true;
      stopLocalEngines();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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
        width: 300,
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
              margins: { marginType: 'none' },
              pageSize: { width: 80000, height: 297000 }, // 80mm roll
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

// ── App Lifecycle ────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createMainWindow();
  setupTray();

  // Start backend & frontend production servers
  startLocalEngines();

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
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);

  try {
    console.log('[Peyala] Waiting for local production server on port 3000...');
    await waitForPort(3000, 45000);
    console.log('[Peyala] Local server is online! Loading POS terminal...');
    if (mainWindow) {
      mainWindow.loadURL('http://127.0.0.1:3000/login');
    }
  } catch (err) {
    console.error('[Peyala Startup Error]', err);
    if (mainWindow) {
      mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`
        <body style="background:#0f172a;color:#ef4444;font-family:sans-serif;padding:40px;text-align:center;">
          <h2>⚠️ Startup Delay</h2>
          <p style="color:#cbd5e1;">Local server took longer than expected to bind port 3000.</p>
          <button onclick="window.location.href='http://127.0.0.1:3000/login'" style="background:#ef4444;color:white;border:none;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;">Retry Connecting</button>
        </body>
      `)}`
      );
    }
  }
});

app.on('window-all-closed', () => {
  stopLocalEngines();
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopLocalEngines();
});
