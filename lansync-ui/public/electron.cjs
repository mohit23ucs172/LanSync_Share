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
let FILE_PORT = 5000; // Start checking from 5000
let mainWindow;
let myLocalIP = "";
let myPublicURL = "";
let currentPasscode = "0000";
let mySharedFiles = [];
let receivedFiles = [];
let authenticatedPeers = new Map();

// 🟢 Helper: Get Local Wi-Fi IP
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

// 🟢 Helper: Generate New Passcode
function generatePasscode() {
  currentPasscode = Math.floor(1000 + Math.random() * 9000).toString();
  updateFrontend();
}

// 🟢 Window Creation
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // 🟢 Important for loading local files in some envs
    },
  });

  // 🟢 PRODUCTION FIX: Load file path correctly
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools(); // Optional: Open DevTools in Dev
  } else {
    // This looks for index.html in the 'dist' folder relative to this script
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

// 🟢 File Server Logic
async function startFileServer() {
  myLocalIP = getLocalIP();

  const server = http.createServer((req, res) => {
    // 🟢 CRITICAL CORS FIX: Allow the phone to talk to the laptop
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // Allow the custom header we added in App.jsx
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Bypass-Tunnel-Reminder'); 
    res.setHeader('Bypass-Tunnel-Reminder', 'true'); 

    // 🟢 Handle Preflight (OPTIONS) request immediately
    // Browsers send this first to check if they are allowed to connect
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const clientIP = req.socket.remoteAddress;

    // 1. LOGIN API
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
        } catch (e) { res.writeHead(400); res.end("Bad Request"); }
      });
      return;
    }

    // 2. Auth Check
    if (!authenticatedPeers.has(clientIP) && req.url !== '/api/login') {
      res.writeHead(403); res.end("Login Required");
      return;
    }

    // 3. List Files API
    if (req.method === 'GET' && req.url === '/api/files') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mySharedFiles.map(f => f.name)));
      return;
    }

    // 4. Upload API
    if (req.method === 'POST' && req.url === '/api/upload') {
      const form = new formidable.IncomingForm();
      form.uploadDir = os.tmpdir();
      form.keepExtensions = true;
      form.parse(req, (err, fields, files) => {
        if (err) { res.writeHead(500); res.end("Upload Error"); return; }
        const uploadedFile = files.file[0] || files.file;
        receivedFiles.push({
          id: Date.now(),
          name: uploadedFile.originalFilename,
          path: uploadedFile.filepath,
          sender: fields.sender || "Peer"
        });
        updateFrontend();
        res.end('Success');
      });
      return;
    }

    // 5. Download API
    // Remove the leading slash and decode spaces
    const requestedName = decodeURIComponent(req.url.slice(1));
    const fileObj = mySharedFiles.find(f => f.name === requestedName);
    
    if (fileObj) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      fs.createReadStream(fileObj.path).pipe(res);
    } else {
      // If not an API call and file not found, 404
      if (!req.url.startsWith('/api/')) {
         res.writeHead(404); res.end("File not found");
      }
    }
  });

  // 🟢 DYNAMIC PORT FINDER
  // If 5000 is busy, it automatically moves to 5001, 5002, etc.
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`Port ${FILE_PORT} is busy, trying ${FILE_PORT + 1}...`);
      FILE_PORT++;
      server.listen(FILE_PORT);
    }
  });

  server.listen(FILE_PORT, async () => {
    console.log(`Server running on port ${FILE_PORT}`);
    generatePasscode();
    try {
      // Create the tunnel on the correct port
      const tunnel = await localtunnel({ port: FILE_PORT });
      myPublicURL = tunnel.url;
    } catch (err) {
      myPublicURL = "Offline";
    }
    updateFrontend();
  });
}

// 🟢 Frontend Updater
function updateFrontend() {
  if (mainWindow) {
    mainWindow.webContents.send('refresh-data', {
      localIP: myLocalIP,
      publicIP: myPublicURL,
      shared: mySharedFiles.map(f => f.name),
      received: receivedFiles,
      connectedCount: authenticatedPeers.size,
      passcode: currentPasscode
    });
  }
}

// 🟢 IPC Events
ipcMain.on('remove-file', (e, name) => {
  mySharedFiles = mySharedFiles.filter(f => f.name !== name);
  updateFrontend();
});

ipcMain.on('select-files', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
  if (!result.canceled) {
    result.filePaths.forEach(p => {
      const name = path.basename(p);
      if (!mySharedFiles.find(f => f.name === name)) {
        mySharedFiles.push({ name, path: p });
      }
    });
    updateFrontend();
  }
});

ipcMain.on('save-received-file', async (e, id) => {
  const file = receivedFiles.find(f => f.id === id);
  if (!file) return;
  const { filePath } = await dialog.showSaveDialog({ defaultPath: file.name });
  if (filePath) {
    fs.copyFile(file.path, filePath, () => {
        // success callback
    });
  }
});

ipcMain.on('request-init', () => updateFrontend());

// 🟢 App Lifecycle
app.on('ready', () => {
  createWindow();
  startFileServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});