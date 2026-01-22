import { useState, useEffect } from "react";
// Safely import Electron's IPC renderer
const electron = window.require ? window.require("electron") : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

function App() {
  const [peers, setPeers] = useState({});
  // Default state includes a placeholder for IP
  const [myInfo, setMyInfo] = useState({ port: "...", ip: "..." });
  const [status, setStatus] = useState("Connecting to Internal Engine...");

  useEffect(() => {
    if (!ipcRenderer) {
      setStatus("Error: Not running in Electron mode.");
      return;
    }

    // 1. Listen for "Who am I?" (My Port & IP)
    ipcRenderer.on("my-info", (event, data) => {
      console.log("Received my info:", data);
      setMyInfo(data); // data = { port: 1234, ip: '192.168.1.5' }
      setStatus("Online & Ready");
    });

    // 2. Listen for "Who else is here?" (Peers)
    ipcRenderer.on("peer-update", (event, data) => {
      console.log("Peers updated:", data);
      setPeers(data);
    });

    // Cleanup listeners when app closes to prevent memory leaks
    return () => {
      if (ipcRenderer) {
        ipcRenderer.removeAllListeners("peer-update");
        ipcRenderer.removeAllListeners("my-info");
      }
    };
  }, []);

  const downloadFile = (ip, port, fileName) => {
    // Open the download link in the default browser
    // URL format: http://192.168.1.5:4500/filename.pdf
    const url = `http://${ip}:${port}/${fileName}`;
    window.open(url, "_blank");
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>LanSync ⚡</h1>
        <div style={styles.statusBadge}>
          Status: <span style={{ color: "#4caf50", fontWeight: "bold" }}>{status}</span>
        </div>
      </header>

      <div style={styles.dashboard}>
        {/* My Info Card */}
        <div style={styles.cardMyInfo}>
          <h3>📡 My Station</h3>
          <div style={styles.infoRow}>
            <span><strong>IP:</strong> {myInfo.ip}</span>
            <span><strong>Port:</strong> {myInfo.port}</span>
          </div>
          <p style={styles.helperText}>Sharing files automatically in background.</p>
        </div>

        {/* Network Files Section */}
        <h2 style={styles.sectionTitle}>Available on Network</h2>
        
        {Object.keys(peers).length === 0 ? (
          <div style={styles.emptyState}>
            <p>No peers found yet.</p>
            <small>Open LanSync on another device to see files here.</small>
          </div>
        ) : (
          <div style={styles.grid}>
            {Object.keys(peers).map((socketId) => {
              const peer = peers[socketId];
              // Don't show my own files
              if (peer.port === myInfo.port) return null;

              return peer.files.map((file, index) => (
                <div key={`${socketId}-${index}`} style={styles.fileCard}>
                  <div style={styles.fileIcon}>📄</div>
                  <div style={styles.fileInfo}>
                    <strong style={styles.fileName}>{file}</strong>
                    <div style={styles.fileMeta}>Host: {peer.ip}</div>
                  </div>
                  <button
                    style={styles.downloadBtn}
                    onClick={() => downloadFile(peer.ip, peer.port, file)}
                  >
                    Download
                  </button>
                </div>
              ));
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Styles
const styles = {
  container: { fontFamily: "'Segoe UI', sans-serif", backgroundColor: "#f4f7f6", minHeight: "100vh", padding: "20px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" },
  title: { margin: 0, color: "#2c3e50" },
  statusBadge: { background: "white", padding: "8px 15px", borderRadius: "20px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)", fontSize: "0.9rem" },
  dashboard: { maxWidth: "900px", margin: "0 auto" },
  cardMyInfo: { background: "white", padding: "20px", borderRadius: "12px", marginBottom: "30px", borderLeft: "6px solid #007bff", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" },
  infoRow: { display: "flex", gap: "20px", fontSize: "1.1rem", marginBottom: "5px" },
  helperText: { fontSize: "0.85em", color: "#888", margin: 0 },
  sectionTitle: { color: "#34495e", borderBottom: "2px solid #e0e0e0", paddingBottom: "10px", marginBottom: "20px" },
  emptyState: { textAlign: "center", color: "#888", padding: "40px", fontStyle: "italic" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "20px" },
  fileCard: { background: "white", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "15px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", transition: "transform 0.2s", border: "1px solid #eee" },
  fileIcon: { fontSize: "2.5rem", textAlign: "center" },
  fileInfo: { textAlign: "center" },
  fileName: { display: "block", color: "#333", marginBottom: "5px", wordBreak: "break-word" },
  fileMeta: { fontSize: "0.8rem", color: "#888" },
  downloadBtn: { background: "#007bff", color: "white", border: "none", padding: "10px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", marginTop: "auto", transition: "background 0.2s" }
};

export default App;