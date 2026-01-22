// // client.js - Run this on multiple terminals to simulate users
// const io = require('socket.io-client');
// const socket = io('http://localhost:3000'); // Connect to Tracker

// // Simulate my data
// const myIp = "192.168.2.5"; // In real app, we detect this automatically
// const myFiles = ["matrix_movie.mp4", "notes.pdf"];

// socket.on('connect', () => {
//   console.log('Connected to Tracker!');
  
//   // Tell tracker who I am
//   socket.emit('register', { ip: myIp, files: myFiles });
// });

// // Listen for other peers
// socket.on('peer-update', (peers) => {
//   console.log('--- Current Network State ---');
//   console.log(peers);
// });

//2nd updated client.js - Run this on multiple terminals to simulate users

// const io = require('socket.io-client');
// const http = require('http');
// const fs = require('fs');
// const path = require('path');

// // CONFIGURATION
// const TRACKER_URL = 'http://localhost:3000';
// const MY_IP = 'localhost'; // In real life, we detect this
// const MY_FILES = ['my_secret.txt']; 

// // 1. Generate a Random Port for sharing (between 4000 and 9000)
// const MY_PORT = Math.floor(Math.random() * (9000 - 4000 + 1)) + 4000;

// // --- PART A: THE MINI-SERVER (SEEDER) ---
// // This handles other people asking for your files
// const fileServer = http.createServer((req, res) => {
//     const fileName = req.url.slice(1); // Remove the "/" from "/my_secret.txt"
//     console.log(`[P2P] Someone is asking for: ${fileName}`);

//     // Check if we actually have the file
//     if (MY_FILES.includes(fileName)) {
//         const filePath = path.join(__dirname, fileName);
        
//         // SDE SKILL: STREAMING
//         // We don't load the whole file into RAM. We stream it chunk by chunk.
//         const readStream = fs.createReadStream(filePath);
//         readStream.pipe(res); 
//         console.log(`[P2P] Sending ${fileName}...`);
//     } else {
//         res.writeHead(404);
//         res.end('File not found');
//     }
// });

// fileServer.listen(MY_PORT, () => {
//     console.log(`[Seeder] I am sharing files on Port ${MY_PORT}`);
//     connectToTracker(); // Only connect to tracker AFTER our server is ready
// });

// // --- PART B: THE TRACKER CONNECTION ---
// function connectToTracker() {
//     const socket = io(TRACKER_URL);

//     socket.on('connect', () => {
//         console.log('[Tracker] Connected!');
        
//         // Register with IP *AND* PORT now
//         socket.emit('register', { 
//             ip: MY_IP, 
//             port: MY_PORT, 
//             files: MY_FILES 
//         });
//     });

//     socket.on('peer-update', (peers) => {
//         console.log('\n--- Available Peers ---');
//         // Filter out myself so I don't see my own files
//         Object.keys(peers).forEach(socketId => {
//             const p = peers[socketId];
//             if (p.port !== MY_PORT) {
//                 console.log(`User at ${p.ip}:${p.port} has: ${p.files}`);
//             }
//         });
//     });
// }
// // --- PART C: THE DOWNLOADER ---
// This part is for downloading files from other peers
// (We'll implement this in a future version)

const io = require('socket.io-client');
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// CONFIGURATION
const TRACKER_URL = 'http://localhost:3000';
const MY_IP = 'localhost'; 
// Create a random port between 4000-9000
const MY_PORT = Math.floor(Math.random() * (9000 - 4000 + 1)) + 4000;

// FAKE FILE SYSTEM: In real life, scan a folder. Here, we just list this file.
// IMPORTANT: Make sure 'my_secret.txt' actually exists in the folder!
const MY_FILES = ['my_secret.txt']; 

// --- PART 1: THE SEEDER (Server) ---
// Handles incoming requests from other peers
const fileServer = http.createServer((req, res) => {
    const fileName = req.url.slice(1);
    console.log(`\n[!] Incoming request for: ${fileName}`);

    if (MY_FILES.includes(fileName) || fs.existsSync(fileName)) {
        const filePath = path.join(__dirname, fileName);
        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res); // Stream file to peer
    } else {
        res.writeHead(404);
        res.end('File not found');
    }
});

fileServer.listen(MY_PORT, () => {
    console.log(`\n=== LanSync Client Running ===`);
    console.log(`[+] Me: ${MY_IP}:${MY_PORT}`);
    console.log(`[+] Sharing: ${MY_FILES}`);
    connectToTracker();
});

// --- PART 2: THE DOWNLOADER (Client) ---
// Reads commands from your keyboard
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\nType command: download <PORT> <FILENAME>");
rl.on('line', (input) => {
    const args = input.split(' ');
    if (args[0] === 'download') {
        const targetPort = args[1];
        const fileName = args[2];
        downloadFile(targetPort, fileName);
    }
});

function downloadFile(port, fileName) {
    console.log(`\n[->] Connecting to peer at port ${port}...`);
    
    const fileUrl = `http://localhost:${port}/${fileName}`;
    const destPath = path.join(__dirname, `downloaded_${fileName}`);
    const file = fs.createWriteStream(destPath);

    http.get(fileUrl, (response) => {
        if (response.statusCode === 200) {
            response.pipe(file); // Pipe the incoming stream to disk
            file.on('finish', () => {
                file.close();
                console.log(`[SUCCESS] File saved as: downloaded_${fileName}`);
            });
        } else {
            console.log(`[ERROR] Peer said: File not found.`);
        }
    }).on('error', (err) => {
        console.log(`[ERROR] Connection failed: ${err.message}`);
    });
}

// --- PART 3: TRACKER CONNECTION ---
function connectToTracker() {
    const socket = io(TRACKER_URL);

    socket.on('connect', () => {
        socket.emit('register', { ip: MY_IP, port: MY_PORT, files: MY_FILES });
    });

    socket.on('peer-update', (peers) => {
        console.log('\n--- Network Update ---');
        Object.keys(peers).forEach(id => {
            const p = peers[id];
            if (p.port !== MY_PORT) {
                console.log(`Peer found: ${p.ip}:${p.port} | Files: ${p.files}`);
            }
        });
        process.stdout.write("\n> "); // Show prompt
    });
}