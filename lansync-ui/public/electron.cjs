require('dotenv').config();
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const http = require('http');
const os = require('os');
const fs = require('fs');
const localtunnel = require('localtunnel');
const formidable = require('formidable');

// 🟢 Global Variables
let FILE_PORT = 5000;
let mainWindow;
let myLocalIP = "";
let myPublicURL = "";
let currentPasscode = "0000";
let mySharedFiles = [];
let receivedFiles = [];
let authenticatedPeers = new Map();

// 🟢 FIX 1: Smart IP Discovery (Ignores Virtual Adapters)
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (localhost) and non-IPv4
      if (net.family === 'IPv4' && !net.internal) {
        const nameLower = name.toLowerCase();
        // Skip VMware, VirtualBox, WSL, etc.
        if (!nameLower.includes('virtual') && !nameLower.includes('wsl') && !nameLower.includes('vmware') && !nameLower.includes('pseudo')) {
            return net.address;
        }
      }
    }
  }
  return 'localhost';
}

function generatePasscode() {
  currentPasscode = Math.floor(1000 + Math.random() * 9000).toString();
  updateFrontend();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300, height: 900, titleBarStyle: 'hidden',
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  mainWindow.on('closed', () => (mainWindow = null));
}

// 🟢 FIX 2: Serve Static Files (Makes Port 5000 a Real Web Server)
async function startFileServer() {
  myLocalIP = getLocalIP();

  const server = http.createServer((req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Bypass-Tunnel-Reminder');
    res.setHeader('Bypass-Tunnel-Reminder', 'true');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const clientIP = req.socket.remoteAddress;

    // --- API ROUTES ---
    if (req.method === 'POST' && req.url === '/api/login') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const { passcode } = JSON.parse(body);
          if (passcode === currentPasscode) {
            authenticatedPeers.set(clientIP, Date.now());
            res.end(JSON.stringify({ success: true, hostName: os.hostname() }));
          } else {
            res.writeHead(401); res.end(JSON.stringify({ success: false }));
          }
        } catch (e) { res.writeHead(400); res.end("Bad"); }
      });
      return;
    }

    if (!authenticatedPeers.has(clientIP) && req.url !== '/api/login' && req.url.startsWith('/api/')) {
      res.writeHead(403); res.end("Login Required");
      return;
    }

    if (req.method === 'GET' && req.url === '/api/files') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mySharedFiles.map(f => f.name)));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/upload') {
      const form = new formidable.IncomingForm();
      form.uploadDir = os.tmpdir(); form.keepExtensions = true;
      form.parse(req, (err, fields, files) => {
        const uploadedFile = files.file[0] || files.file;
        receivedFiles.push({ id: Date.now(), name: uploadedFile.originalFilename, path: uploadedFile.filepath, sender: fields.sender || "Peer" });
        updateFrontend();
        res.end('Success');
      });
      return;
    }

    // --- FILE DOWNLOAD & STATIC SERVING ---
    const requestedPath = decodeURIComponent(req.url.slice(1));
    
    // 1. Check if it's a shared file download
    const sharedFile = mySharedFiles.find(f => f.name === requestedPath);
    if (sharedFile) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        fs.createReadStream(sharedFile.path).pipe(res);
        return;
    }

    // 2. Serve Frontend Files (dist folder) for Production
    // If not an API, try to serve the file from ../dist
    let localPath = path.join(__dirname, '../dist', requestedPath === '' ? 'index.html' : requestedPath);
    
    // Safety check to ensure we don't serve files outside dist
    if (!localPath.startsWith(path.join(__dirname, '../dist'))) localPath = path.join(__dirname, '../dist/index.html');

    if (fs.existsSync(localPath) && fs.lstatSync(localPath).isFile()) {
        const ext = path.extname(localPath);
        const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(localPath).pipe(res);
    } else {
        // Fallback to index.html for React Router (SPA)
        const indexPath = path.join(__dirname, '../dist/index.html');
        if (fs.existsSync(indexPath)) {
             res.writeHead(200, { 'Content-Type': 'text/html' });
             fs.createReadStream(indexPath).pipe(res);
        } else {
             res.writeHead(404); res.end("Not Found");
        }
    }
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') { FILE_PORT++; server.listen(FILE_PORT, '0.0.0.0'); }
  });

  // 🟢 LISTEN ON 0.0.0.0 (Accepts connections from Hotspot/Wi-Fi)
  server.listen(FILE_PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${FILE_PORT}`);
    generatePasscode();
    try { const tunnel = await localtunnel({ port: FILE_PORT }); myPublicURL = tunnel.url; } catch (err) { myPublicURL = "Offline"; }
    updateFrontend();
  });
}

function updateFrontend() {
  if (mainWindow) {
    mainWindow.webContents.send('refresh-data', {
      localIP: myLocalIP, publicIP: myPublicURL, shared: mySharedFiles.map(f => f.name),
      received: receivedFiles, connectedCount: authenticatedPeers.size, passcode: currentPasscode,
      port: FILE_PORT // Send real port to UI
    });
  }
}

// IPC Events
ipcMain.on('remove-file', (e, name) => { mySharedFiles = mySharedFiles.filter(f => f.name !== name); updateFrontend(); });
ipcMain.on('select-files', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
  if (!result.canceled) {
    result.filePaths.forEach(p => { if (!mySharedFiles.find(f => f.name === path.basename(p))) mySharedFiles.push({ name: path.basename(p), path: p }); });
    updateFrontend();
  }
});
ipcMain.on('save-received-file', async (e, id) => {
  const file = receivedFiles.find(f => f.id === id);
  if (!file) return;
  const { filePath } = await dialog.showSaveDialog({ defaultPath: file.name });
  if (filePath) fs.copyFile(file.path, filePath, () => {});
});
ipcMain.on('request-init', () => updateFrontend());
app.on('ready', () => { createWindow(); startFileServer(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });