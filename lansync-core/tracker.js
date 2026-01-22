// // tracker.js - The Central Server (The "Phonebook")
// const express = require('express');
// const http = require('http');
// const { Server } = require("socket.io");

// const app = express();
// const server = http.createServer(app);
// const io = new Server(server, { cors: { origin: "*" } });

// // Store connected peers: { socketId: { ip: "192.168.1.5", files: [] } }
// let peers = {}; 

// io.on('connection', (socket) => {
//   console.log('A peer connected:', socket.id);

//   // 1. Peer joins and sends their Local IP and File List
//   socket.on('register', (data) => {
//     peers[socket.id] = { ip: data.ip, files: data.files };
//     console.log(`Registered ${data.ip} with files: ${data.files}`);
    
//     // Broadcast updated list to everyone
//     io.emit('peer-update', peers);
//   });

//   // 2. Peer disconnects
//   socket.on('disconnect', () => {
//     delete peers[socket.id];
//     io.emit('peer-update', peers);
//     console.log('Peer disconnected:', socket.id);
//   });
// });

// server.listen(3000, () => {
//   console.log('Tracker running on port 3000');
// });






// tracker.js - The Central Server (Phonebook + Database + Environment Variables)
require('dotenv').config(); // 1. Load the .env file immediately

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 2. Use variables from the .env file (with a backup default using ||)
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lansync';

// --- DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Database'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const LogSchema = new mongoose.Schema({
    socket_id: String,
    ip: String,
    port: Number,
    files_shared: [String],
    joined_at: { type: Date, default: Date.now }
});

const Log = mongoose.model('Log', LogSchema);

let peers = {}; 

io.on('connection', (socket) => {
  console.log('A peer connected:', socket.id);

  socket.on('register', async (data) => {
    peers[socket.id] = { 
        ip: data.ip, 
        port: data.port, 
        files: data.files 
    };
    
    console.log(`[+] Registered ${data.ip}:${data.port}`);

    try {
        await Log.create({
            socket_id: socket.id,
            ip: data.ip,
            port: data.port,
            files_shared: data.files
        });
        console.log("   ↳ Saved to Database History");
    } catch (err) {
        console.error("   ↳ Database Save Failed:", err.message);
    }
    
    io.emit('peer-update', peers);
  });

  socket.on('disconnect', () => {
    delete peers[socket.id];
    io.emit('peer-update', peers);
    console.log('Peer disconnected:', socket.id);
  });
});

// 3. Listen on the dynamic port
server.listen(PORT, () => {
  console.log(`Tracker running on port ${PORT}`);
});