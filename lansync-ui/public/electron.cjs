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
let mySharedFiles = []; 
let receivedFiles = []; 

// 🟢 NEW: Track Connected Devices
// We store IPs of devices that pinged us recently
let connectedPeers = new Map(); 

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        const lowerName = name.toLowerCase();
        if (!lowerName.includes('virtual') && !lowerName.includes('vmware') && !lowerName.includes('wsl')) {
            return net.address;
        }
      }
    }
  }
  return 'localhost';
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

    // 🟢 TRACKING LOGIC: If someone asks for files, they are "Connected"
    const clientIP = req.socket.remoteAddress;
    if (clientIP) {
        connectedPeers.set(clientIP, Date.now());
        cleanOldPeers(); // Remove stale connections
    }

    // API: List Files
    if (req.method === 'GET' && req.url === '/api/files') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mySharedFiles.map(f => f.name)));
      return;
    }

    // API: RECEIVE FILE
    if (req.method === 'POST' && req.url === '/api/upload') {
      const form = new formidable.IncomingForm();
      form.uploadDir = os.tmpdir(); 
      form.keepExtensions = true;

      form.parse(req, (err, fields, files) => {
        if (err) { res.writeHead(500); res.end('Error'); return; }
        
        const uploadedFile = files.file[0] || files.file;
        const senderName = fields.sender ? (Array.isArray(fields.sender) ? fields.sender[0] : fields.sender) : "Unknown Device";

        const fileData = {
            id: Date.now(),
            name: uploadedFile.originalFilename,
            path: uploadedFile.filepath,
            size: (uploadedFile.size / 1024 / 1024).toFixed(2) + " MB",
            sender: senderName
        };

        receivedFiles.push(fileData);
        updateFrontend();
        
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Success');
      });
      return;
    }

    // API: DOWNLOAD
    const requestedName = decodeURIComponent(req.url.slice(1)); 
    const fileObj = mySharedFiles.find(f => f.name === requestedName);
    if (fileObj) {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileObj.name}"`
      });
      fs.createReadStream(fileObj.path).pipe(res);
    } else {
      res.writeHead(404); res.end('File not found');
    }
  });

  server.listen(FILE_PORT, async () => {
    console.log(`[Server] Running at http://${myLocalIP}:${FILE_PORT}`);
    try {
      const tunnel = await localtunnel({ port: FILE_PORT });
      myPublicURL = tunnel.url; 
    } catch (err) { myPublicURL = "Offline"; }
    updateFrontend();
    
    // Periodically update UI to show device count changes
    setInterval(updateFrontend, 2000);
  });
}

// 🟢 Remove devices that haven't pinged in 10 seconds
function cleanOldPeers() {
    const now = Date.now();
    for (const [ip, lastSeen] of connectedPeers.entries()) {
        if (now - lastSeen > 10000) {
            connectedPeers.delete(ip);
        }
    }
    updateFrontend();
}

function updateFrontend() {
  if (mainWindow) mainWindow.webContents.send('refresh-data', { 
      localIP: myLocalIP, 
      publicIP: myPublicURL,
      shared: mySharedFiles.map(f => f.name),
      received: receivedFiles,
      connectedCount: connectedPeers.size // 🟢 Send Count
  });
}

ipcMain.on('save-received-file', async (event, fileId) => {
    const file = receivedFiles.find(f => f.id === fileId);
    if(!file) return;
    const { filePath } = await dialog.showSaveDialog({ defaultPath: file.name });
    if (filePath) {
        fs.copyFile(file.path, filePath, (err) => {
            if (!err) event.sender.send('file-saved-success', file.name);
        });
    }
});

ipcMain.on('select-files', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
  if (!result.canceled) {
    result.filePaths.forEach(fullPath => {
      const fileName = path.basename(fullPath);
      if (!mySharedFiles.find(f => f.name === fileName)) mySharedFiles.push({ name: fileName, path: fullPath });
    });
    updateFrontend();
  }
});

ipcMain.on('request-init', () => updateFrontend());
app.on('ready', () => { createWindow(); startFileServer(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });