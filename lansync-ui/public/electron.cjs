require('dotenv').config(); 
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const http = require('http');
const os = require('os'); 
const fs = require('fs'); // Need File System to read real files

// --- CONFIGURATION ---
// 🟢 HARDCODED CLOUD URL (Keep this!)
const TRACKER_URL = 'https://lansync-backend.onrender.com';

let mainWindow;
let myPort;
let socket;

// 🟢 REAL FILE STORAGE
// We store objects: { name: "notes.pdf", path: "C:/Users/Ajay/Documents/notes.pdf" }
let mySharedFiles = []; 

function getLocalIP() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (localhost) and non-IPv4
      if (net.family === 'IPv4' && !net.internal) {
        // 🟢 FILTER: Ignore "Virtual", "VMware", and "vEthernet" adapters
        // We prefer interfaces that look like real Wi-Fi
        if (!name.toLowerCase().includes('virtual') && 
            !name.toLowerCase().includes('vmware') && 
            !name.toLowerCase().includes('pseudo')) {
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
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  mainWindow.loadURL(isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../dist/index.html')}`);
}

// --- 🟢 REAL FILE SERVER ---
function startFileServer() {
  myPort = Math.floor(Math.random() * (9000 - 4000) + 4000);

  const server = http.createServer((req, res) => {
    // 1. Get the requested filename (remove the leading slash)
    // The browser requests: http://ip:port/filename.pdf -> req.url is "/filename.pdf"
    const requestedName = decodeURIComponent(req.url.slice(1)); 
    console.log(`[Server] Request for: ${requestedName}`);

    // 2. Find the file in our shared list
    const fileObj = mySharedFiles.find(f => f.name === requestedName);

    if (fileObj) {
      // 3. STREAM THE REAL FILE
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream', // Force download
        'Content-Disposition': `attachment; filename="${fileObj.name}"`
      });
      const readStream = fs.createReadStream(fileObj.path);
      readStream.pipe(res); // Send file chunks to the friend
    } else {
      res.writeHead(404);
      res.end('File not found');
    }
  });

  server.listen(myPort, () => {
    console.log(`[Server] File Server running on Port ${myPort}`);
    connectToTracker();
  });
}

// --- CONNECT TO TRACKER ---
async function connectToTracker() {
  const myIP = getLocalIP();
  try {
    const socketIoModule = await import("socket.io-client");
    const io = socketIoModule.io || socketIoModule.default;
    socket = io(TRACKER_URL);

    socket.on('connect', () => {
      console.log('[Socket] Connected!');
      updateTracker(); // Send my initial list (empty)
    });

    socket.on('peer-update', (peers) => {
      if (mainWindow) mainWindow.webContents.send('peer-update', peers);
    });
  } catch (error) {
    console.error("Connection failed:", error);
  }
}

// Helper to update everyone about my files
function updateTracker() {
  if (!socket) return;
  const myIP = getLocalIP();
  // We only send file NAMES to the public, not full paths
  const fileNames = mySharedFiles.map(f => f.name);
  
  socket.emit('register', { ip: myIP, port: myPort, files: fileNames });
  
  // Update my own UI
  if (mainWindow) mainWindow.webContents.send('my-info', { ip: myIP, port: myPort, files: fileNames });
}

// --- 🟢 HANDLE FILE SELECTION (IPC) ---
ipcMain.on('select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections']
  });

  if (!result.canceled) {
    // Add new files to our list
    result.filePaths.forEach(fullPath => {
      const fileName = path.basename(fullPath);
      // Prevent duplicates
      if (!mySharedFiles.find(f => f.name === fileName)) {
        mySharedFiles.push({ name: fileName, path: fullPath });
      }
    });
    // Tell the world we have new files
    updateTracker();
  }
});

app.on('ready', () => {
  createWindow();
  startFileServer();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ... existing code ...

// 🟢 NEW: HANDLE IN-APP DOWNLOADS
ipcMain.on('start-download', (event, { ip, port, fileName }) => {
  const url = `http://${ip}:${port}/${fileName}`;
  const downloadPath = path.join(app.getPath('downloads'), fileName);
  
  console.log(`[Electron] Downloading ${fileName} to ${downloadPath}`);

  const file = fs.createWriteStream(downloadPath);
  
  http.get(url, (response) => {
    if (response.statusCode !== 200) {
      console.error("Download failed: File not found on peer");
      return;
    }
    
    response.pipe(file);

    file.on('finish', () => {
      file.close();
      console.log("Download Completed!");
      // Tell the Frontend it's done
      event.sender.send('download-complete', fileName);
    });
  }).on('error', (err) => {
    fs.unlink(downloadPath, () => {}); // Delete partial file
    console.error("Network Error:", err.message);
  });
});

// ... app.on('ready') ...