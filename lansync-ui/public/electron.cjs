require('dotenv').config(); 
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const http = require('http');
const os = require('os'); 
const fs = require('fs'); // 🟢 REQUIRED for reading/writing files

// --- CONFIGURATION ---
// 🟢 Your Render URL
const TRACKER_URL = 'https://lansync-backend.onrender.com';

let mainWindow;
let myPort;
let socket;

// Real file storage
let mySharedFiles = []; 

// --- 1. SMART IP FINDER (Ignores VMware/Virtual Adapters) ---
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Must be IPv4 and NOT internal (localhost)
      if (net.family === 'IPv4' && !net.internal) {
        // 🟢 Filter out Virtual/VMware adapters to find Real Wi-Fi
        const lowerName = name.toLowerCase();
        if (!lowerName.includes('virtual') && 
            !lowerName.includes('vmware') && 
            !lowerName.includes('pseudo') &&
            !lowerName.includes('wsl')) {
            return net.address;
        }
      }
    }
  }
  return 'localhost';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 700,
    webPreferences: { 
      nodeIntegration: true, 
      contextIsolation: false 
    },
  });
  
  mainWindow.loadURL(isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, '../dist/index.html')}`
  );
}

// --- 2. FILE SERVER (Sends files to friends) ---
function startFileServer() {
  myPort = Math.floor(Math.random() * (9000 - 4000) + 4000);

  const server = http.createServer((req, res) => {
    const requestedName = decodeURIComponent(req.url.slice(1)); 
    console.log(`[Server] Friend requesting: ${requestedName}`);

    const fileObj = mySharedFiles.find(f => f.name === requestedName);

    if (fileObj) {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileObj.name}"`
      });
      const readStream = fs.createReadStream(fileObj.path);
      readStream.pipe(res);
    } else {
      res.writeHead(404);
      res.end('File not found');
    }
  });

  server.listen(myPort, () => {
    console.log(`[Server] Running on Port ${myPort}`);
    connectToTracker();
  });
}

// --- 3. CLOUD CONNECTION ---
async function connectToTracker() {
  const myIP = getLocalIP();
  console.log(`[Electron] Connecting to ${TRACKER_URL} as ${myIP}...`);

  try {
    const socketIoModule = await import("socket.io-client");
    const io = socketIoModule.io || socketIoModule.default;
    socket = io(TRACKER_URL);

    socket.on('connect', () => {
      console.log('✅ Connected to Cloud!');
      updateTracker();
    });

    socket.on('peer-update', (peers) => {
      if (mainWindow) mainWindow.webContents.send('peer-update', peers);
    });

  } catch (error) {
    console.error("❌ Connection failed:", error);
  }
}

function updateTracker() {
  if (!socket) return;
  const myIP = getLocalIP();
  const fileNames = mySharedFiles.map(f => f.name);
  
  socket.emit('register', { ip: myIP, port: myPort, files: fileNames });
  
  if (mainWindow) {
      mainWindow.webContents.send('my-info', { ip: myIP, port: myPort, files: fileNames });
  }
}

// --- 4. EVENTS ---

// A. Handle "Share Files" Button
ipcMain.on('select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections']
  });

  if (!result.canceled) {
    result.filePaths.forEach(fullPath => {
      const fileName = path.basename(fullPath);
      if (!mySharedFiles.find(f => f.name === fileName)) {
        mySharedFiles.push({ name: fileName, path: fullPath });
      }
    });
    updateTracker();
  }
});

// B. Handle "Download" Button (Internal Save)
ipcMain.on('start-download', (event, { ip, port, fileName }) => {
  const url = `http://${ip}:${port}/${fileName}`;
  const downloadPath = path.join(app.getPath('downloads'), fileName);
  
  console.log(`[Electron] Downloading ${fileName} to ${downloadPath}`);
  
  const file = fs.createWriteStream(downloadPath);
  
  http.get(url, (response) => {
    if (response.statusCode !== 200) {
      console.error("❌ Download failed: File not found on peer");
      return;
    }
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log("✅ Download Completed!");
      event.sender.send('download-complete', fileName);
    });
  }).on('error', (err) => {
    fs.unlink(downloadPath, () => {});
    console.error("❌ Network Error:", err.message);
  });
});

app.on('ready', () => {
  createWindow();
  startFileServer();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });