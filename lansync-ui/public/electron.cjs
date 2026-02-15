require('dotenv').config();
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const http = require('http');
const os = require('os');
const fs = require('fs');
const localtunnel = require('localtunnel');
const formidable = require('formidable');

let FILE_PORT = 5000;
let mainWindow;
let myLocalIP = "";
let myPublicURL = "";
let currentPasscode = "0000";
let mySharedFiles = [];
let receivedFiles = [];
let authenticatedPeers = new Map();

// 🟢 Helper to determine file types for the phone browser
const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html';
  if (ext === '.js') return 'text/javascript';
  if (ext === '.css') return 'text/css';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
};

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const lowerName = name.toLowerCase();
    // Ignore virtual adapters
    if (lowerName.includes('vmware') || lowerName.includes('virtualbox') || lowerName.includes('vEthernet')) continue;
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
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
    // In production, load the local file
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

async function startFileServer() {
  myLocalIP = getLocalIP();
  const server = http.createServer((req, res) => {
    // 🟢 CORS Headers (Allow Phone Connection)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Bypass-Tunnel-Reminder, Authorization');
    
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // 🟢 API: Login
    if (req.method === 'POST' && req.url === '/api/login') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const { passcode } = JSON.parse(body);
          if (passcode === currentPasscode) {
            const sessionToken = "ST-" + Math.random().toString(36).substring(2, 15);
            authenticatedPeers.set(sessionToken, Date.now());
            res.end(JSON.stringify({ success: true, token: sessionToken }));
          } else {
            res.writeHead(401); res.end(JSON.stringify({ success: false }));
          }
        } catch (e) { res.writeHead(400); res.end("Bad JSON"); }
      });
      return;
    }

    // 🟢 API: File List
    if (req.method === 'GET' && req.url === '/api/files') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mySharedFiles.map(f => f.name)));
      return;
    }

    // 🟢 API: Upload
    if (req.method === 'POST' && req.url === '/api/upload') {
      const form = new formidable.IncomingForm();
      form.uploadDir = os.tmpdir(); form.keepExtensions = true;
      form.parse(req, (err, fields, files) => {
        if (err) return;
        const uploadedFile = files.file[0] || files.file;
        receivedFiles.push({ id: Date.now(), name: uploadedFile.originalFilename, path: uploadedFile.filepath });
        updateFrontend();
        res.end('Success');
      });
      return;
    }

    // 🟢 CRITICAL FIX: Serve the React UI (dist folder) to the Phone
    // If the request is NOT an API, try to serve a file
    let safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';
    
    // Path to the built files (dist folder)
    const distPath = path.join(__dirname, '../dist', safePath);

    if (fs.existsSync(distPath) && fs.statSync(distPath).isFile()) {
      // Serve the file (HTML, CSS, JS)
      res.writeHead(200, { 'Content-Type': getMimeType(distPath) });
      fs.createReadStream(distPath).pipe(res);
      return;
    }

    // If file not found, try serving the shared file downloads
    const requestedName = decodeURIComponent(req.url.slice(1));
    const fileObj = mySharedFiles.find(f => f.name === requestedName);
    if (fileObj) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      fs.createReadStream(fileObj.path).pipe(res);
      return;
    }

    // If nothing matches, 404
    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(FILE_PORT, '0.0.0.0', async () => {
    generatePasscode();
    try {
      const tunnel = await localtunnel({ port: FILE_PORT });
      myPublicURL = tunnel.url;
    } catch (err) { myPublicURL = "Offline"; }
    updateFrontend();
  });
}

function updateFrontend() {
  if (mainWindow) mainWindow.webContents.send('refresh-data', { 
      localIP: myLocalIP, publicIP: myPublicURL,
      shared: mySharedFiles.map(f => f.name), received: receivedFiles,
      connectedCount: authenticatedPeers.size, passcode: currentPasscode,
      port: FILE_PORT
  });
}

ipcMain.on('remove-file', (e, name) => { mySharedFiles = mySharedFiles.filter(f => f.name !== name); updateFrontend(); });
ipcMain.on('select-files', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
  if (!result.canceled) {
    result.filePaths.forEach(p => {
      const name = path.basename(p);
      if (!mySharedFiles.find(f => f.name === name)) mySharedFiles.push({ name, path: p });
    });
    updateFrontend();
  }
});
ipcMain.on('save-received-file', async (e, id) => {
    const file = receivedFiles.find(f => f.id === id);
    const { filePath } = await dialog.showSaveDialog({ defaultPath: file.name });
    if (filePath) fs.copyFile(file.path, filePath, () => {});
});
ipcMain.on('request-init', () => updateFrontend());
app.on('ready', () => { createWindow(); startFileServer(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });