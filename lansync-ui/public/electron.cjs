require('dotenv').config(); 
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const http = require('http');
const os = require('os'); 
const fs = require('fs'); 
const localtunnel = require('localtunnel'); 
const formidable = require('formidable'); 

const FILE_PORT = 5000; 
let mainWindow;
let myLocalIP = "";
let myPublicURL = ""; 
let currentPasscode = "0000"; 
let mySharedFiles = []; 
let receivedFiles = []; 
let authenticatedPeers = new Map(); 

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!name.toLowerCase().includes('virtual')) return net.address;
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
    width: 1300, height: 900,
    titleBarStyle: 'hidden', 
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  mainWindow.loadURL(isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../dist/index.html')}`);
}

async function startFileServer() {
  myLocalIP = getLocalIP();
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Bypass-Tunnel-Reminder', 'true');

    const clientIP = req.socket.remoteAddress;

    // 🟢 LOGIN API
    if (req.method === 'POST' && req.url === '/api/login') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        const { passcode } = JSON.parse(body);
        if (passcode === currentPasscode) {
          authenticatedPeers.set(clientIP, Date.now());
          res.end(JSON.stringify({ success: true, hostName: os.hostname() }));
        } else {
          res.writeHead(401); res.end(JSON.stringify({ success: false }));
        }
      });
      return;
    }

    // Auth Gate
    if (!authenticatedPeers.has(clientIP) && req.url !== '/api/login') {
      res.writeHead(403); res.end("Login Required");
      return;
    }

    // 🟢 API: LIST FILES FOR PHONE
    if (req.method === 'GET' && req.url === '/api/files') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mySharedFiles.map(f => f.name)));
      return;
    }

    // 🟢 API: RECEIVE FROM PHONE
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

    // 🟢 API: DOWNLOAD FROM PC
    const requestedName = decodeURIComponent(req.url.slice(1)); 
    const fileObj = mySharedFiles.find(f => f.name === requestedName);
    if (fileObj) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      fs.createReadStream(fileObj.path).pipe(res);
    }
  });

  server.listen(FILE_PORT, async () => {
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
      connectedCount: authenticatedPeers.size, passcode: currentPasscode 
  });
}

// IPC Events for Sharing Control
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
    if (filePath) fs.copyFile(file.path, filePath, () => e.sender.send('file-saved-success', file.name));
});
ipcMain.on('request-init', () => updateFrontend());
app.on('ready', () => { createWindow(); startFileServer(); });