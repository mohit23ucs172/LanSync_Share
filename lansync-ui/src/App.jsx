import { useState, useEffect } from "react";
const electron = window.require ? window.require("electron") : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

function App() {
  const [peers, setPeers] = useState({});
  const [myInfo, setMyInfo] = useState({ port: "...", ip: "...", files: [] });
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    if (!ipcRenderer) return;

    // 1. Receive my own info (IP, Port, and Files I am sharing)
    ipcRenderer.on("my-info", (event, data) => {
      setMyInfo(data);
      setStatus("Online & Ready");
    });

    // 2. Receive info about other users
    ipcRenderer.on("peer-update", (event, data) => setPeers(data));

    return () => {
      ipcRenderer.removeAllListeners("peer-update");
      ipcRenderer.removeAllListeners("my-info");
    };
  }, []);

  // --- NEW: TELL ELECTRON TO OPEN FILE DIALOG ---
  const handleSelectFiles = () => {
    if (ipcRenderer) {
      ipcRenderer.send("select-files");
    }
  };

  const downloadFile = (ip, port, fileName) => {
    const url = `http://${ip}:${port}/${fileName}`;
    window.open(url, "_blank");
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>LanSync ⚡</h1>
        <div style={styles.statusBadge}>Status: {status}</div>
      </header>

      {/* MY STATION CARD */}
      <div style={styles.cardMyInfo}>
        <h3>📡 My Station ({myInfo.ip})</h3>
        
        {/* NEW BUTTON TO ADD FILES */}
        <button style={styles.addBtn} onClick={handleSelectFiles}>
          ➕ Share New Files
        </button>

        <div style={{ marginTop: "15px" }}>
            <strong>Sharing {myInfo.files.length} files:</strong>
            <ul style={{ color: "#666", fontSize: "0.9rem" }}>
                {myInfo.files.map(f => <li key={f}>{f}</li>)}
            </ul>
        </div>
      </div>

      {/* NETWORK FILES */}
      <h2 style={styles.sectionTitle}>Available on Network</h2>
      <div style={styles.grid}>
        {Object.keys(peers).map((socketId) => {
          const peer = peers[socketId];
          if (peer.port === myInfo.port) return null; // Don't show myself

          return peer.files.map((file, index) => (
            <div key={`${socketId}-${index}`} style={styles.fileCard}>
              <div style={styles.fileIcon}>📄</div>
              <strong style={styles.fileName}>{file}</strong>
              <button style={styles.downloadBtn} onClick={() => downloadFile(peer.ip, peer.port, file)}>
                Download
              </button>
            </div>
          ));
        })}
      </div>
    </div>
  );
}

const styles = {
  container: { fontFamily: "sans-serif", background: "#f4f7f6", minHeight: "100vh", padding: "20px" },
  header: { display: "flex", justifyContent: "space-between", marginBottom: "20px" },
  statusBadge: { background: "white", padding: "5px 15px", borderRadius: "15px", fontWeight: "bold", color: "green" },
  cardMyInfo: { background: "white", padding: "20px", borderRadius: "10px", marginBottom: "30px", borderLeft: "5px solid #007bff" },
  addBtn: { background: "#28a745", color: "white", border: "none", padding: "10px 20px", borderRadius: "5px", cursor: "pointer", fontSize: "1rem", marginTop: "10px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px" },
  fileCard: { background: "white", padding: "15px", borderRadius: "10px", textAlign: "center", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" },
  fileIcon: { fontSize: "2rem", marginBottom: "10px" },
  fileName: { display: "block", marginBottom: "10px", wordWrap: "break-word" },
  downloadBtn: { background: "#007bff", color: "white", border: "none", padding: "8px 15px", borderRadius: "5px", cursor: "pointer" }
};

export default App;