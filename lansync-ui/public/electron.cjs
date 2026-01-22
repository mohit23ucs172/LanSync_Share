// public/electron.cjs
require('dotenv').config(); 
const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const http = require('http');
const os = require('os'); // Added to find Wi-Fi IP

// --- CONFIGURATION ---
const TRACKER_URL = process.env.TRACKER_URL 

let mainWindow;
let myPort;
// FAKE FILES (For demo purposes)
let myFiles = ['assignment_solution.pdf', 'ubuntu_22_04.iso', 'funny_cat.mp4']; 

// --- HELPER: GET LOCAL WI-FI IP ---
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Find IPv4 that is NOT internal (not 127.0.0.1)
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost'; // Fallback
}

// --- A. CREATE THE WINDOW ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
  });

  mainWindow.loadURL(
    isDev 
      ? 'http://localhost:5173' 
      : `file://${path.join(__dirname, '../dist/index.html')}`
  );
}

// --- B. START THE FILE SERVER ---
function startFileServer() {
  myPort = Math.floor(Math.random() * (9000 - 4000) + 4000);

  const server = http.createServer((req, res) => {
    const fileName = req.url.slice(1);
    console.log(`[Electron] Incoming request for: ${fileName}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`SUCCESS! Downloaded ${fileName} from ${getLocalIP()}`);
  });

  server.listen(myPort, () => {
    console.log(`[Electron] File Server running on Port ${myPort}`);
    connectToTracker();
  });
}

// --- C. CONNECT TO TRACKER ---
async function connectToTracker() {
  const myIP = getLocalIP();
  console.log(`[Electron] Connecting to Tracker at ${TRACKER_URL} as ${myIP}`);

  try {
    // Dynamic import to fix ESM/CommonJS conflict
    const socketIoModule = await import("socket.io-client");
    const io = socketIoModule.io || socketIoModule.default;
    const socket = io(TRACKER_URL);

    socket.on('connect', () => {
      console.log('[Electron] Connected to Tracker!');
      
      // SEND REAL IP instead of localhost
      socket.emit('register', { 
          ip: myIP, 
          port: myPort, 
          files: myFiles 
      });

      if (mainWindow) {
          mainWindow.webContents.send('my-info', { port: myPort, ip: myIP });
      }
    });

    socket.on('peer-update', (peers) => {
      if (mainWindow) mainWindow.webContents.send('peer-update', peers);
    });

  } catch (error) {
    console.error("Failed to connect to tracker:", error);
  }
}

// --- APP LIFECYCLE ---
app.on('ready', () => {
  createWindow();
  startFileServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});