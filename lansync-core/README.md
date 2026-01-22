# LanSync Core (P2P File Sharing Engine)

A high-performance Peer-to-Peer file sharing protocol built with **Node.js**, **Streams**, and **Socket.IO**. Designed to solve bandwidth congestion in local networks (Hostels/Offices) by enabling direct device-to-device transfers.

## 🚀 Key Features
* **Zero-RAM Overhead:** Uses `fs.createReadStream` and piping to handle multi-gigabyte files with minimal memory footprint.
* **Decentralized Discovery:** Implements a Tracker pattern (WebSocket) for dynamic peer discovery.
* **Binary Stream Processing:** Handles raw binary data transfer ensuring data integrity for any file type (.mp4, .iso, .pdf).

## 🛠️ Tech Stack
* **Runtime:** Node.js
* **Transport:** HTTP (Data Stream) & WebSocket (Signaling)
* **Architecture:** Event-Driven Non-blocking I/O

## ⚡ How to Run
1.  **Start Tracker:** `node tracker.js`
2.  **Start Client A (Seeder):** `node client.js`
3.  **Start Client B (Leecher):** `node client.js` -> `download <PORT> <FILE>`