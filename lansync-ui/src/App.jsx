import { useState, useEffect, useRef } from "react";
import io from "socket.io-client"; 

// Safely import Electron
const electron = window.require ? window.require("electron") : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

// 🟢 CLOUD URL
const TRACKER_URL = "https://lansync-backend.onrender.com";

/* -------------------------------------------------------------------------- */
/* PARTICLE SYSTEM                                                           */
/* -------------------------------------------------------------------------- */
const ParticleBackground = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const particleCount = 40; // Reduced for better mobile performance
    const particles = [];
    const colors = ["#00f2ff", "#7b2ff7", "#ff0055"];

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() - 0.5) * 1.5;
        this.speedY = (Math.random() - 0.5) * 1.5;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.opacity = Math.random() * 0.5 + 0.2;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.opacity;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }

    for (let i = 0; i < particleCount; i++) particles.push(new Particle());

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, index) => {
        p.update();
        p.draw();
        for (let j = index; j < particles.length; j++) {
          const dx = p.x - particles[j].x;
          const dy = p.y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
            ctx.lineWidth = 1;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      });
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} style={styles.canvas} />;
};

/* -------------------------------------------------------------------------- */
/* MAIN APPLICATION                                                           */
/* -------------------------------------------------------------------------- */

function App() {
  const [peers, setPeers] = useState({});
  const [myInfo, setMyInfo] = useState({ port: null, ip: "Loading...", files: [] });
  const [status, setStatus] = useState("Connecting...");
  const socketRef = useRef(null);

  useEffect(() => {
    // MODE A: ELECTRON (Desktop)
    if (ipcRenderer) {
      ipcRenderer.on("my-info", (event, data) => {
        setMyInfo(data);
        setStatus("Online (Host)");
      });
      ipcRenderer.on("peer-update", (event, data) => setPeers(data));
      ipcRenderer.on('download-complete', (event, fileName) => {
        alert(`✅ Download Finished!\nSaved to Downloads folder: ${fileName}`);
      });
      return () => {
        ipcRenderer.removeAllListeners("peer-update");
        ipcRenderer.removeAllListeners("my-info");
        ipcRenderer.removeAllListeners("download-complete");
      };
    } 
    // MODE B: MOBILE / WEB
    else {
      setMyInfo({ ...myInfo, ip: "Mobile/Web Client" });
      socketRef.current = io(TRACKER_URL);
      
      socketRef.current.on("connect", () => {
        setStatus("Online (Receiver)");
        socketRef.current.emit("register", { ip: "Mobile-User", port: 0, files: [] });
      });

      socketRef.current.on("peer-update", (data) => setPeers(data));
      return () => { if (socketRef.current) socketRef.current.disconnect(); };
    }
  }, []);

  const handleSelectFiles = () => {
    if (ipcRenderer) ipcRenderer.send("select-files");
    else alert("To share files, please use the PC version.");
  };

  const downloadFile = (ip, port, fileName) => {
    const url = `http://${ip}:${port}/${fileName}`;
    if (ipcRenderer) ipcRenderer.send("start-download", { ip, port, fileName });
    else window.open(url, "_blank");
  };

  const peerCount = Object.keys(peers).filter(id => {
    const peer = peers[id];
    return peer.port !== 0 && peer.ip !== myInfo.ip;
  }).length;

  return (
    <>
      <ParticleBackground />
      <div style={styles.container}>
        {/* HEADER */}
        <header style={styles.header}>
          <div style={styles.logoGroup}>
            <div style={styles.logoIcon}>⚡</div>
            <h1 style={styles.title}>LanSync</h1>
          </div>
          <div style={{
            ...styles.statusBadge,
            borderColor: status.includes("Online") ? "#00ff88" : "#ff4444",
            color: status.includes("Online") ? "#00ff88" : "#ff4444",
            backgroundColor: status.includes("Online") ? "rgba(0, 255, 136, 0.1)" : "rgba(255, 68, 68, 0.1)",
          }}>
            {status}
          </div>
        </header>

        {/* RESPONSIVE LAYOUT */}
        <div style={styles.dashboardLayout}>
          
          {/* LEFT: MY STATION */}
          <div style={styles.sidebar}>
            <div style={styles.glassCard}>
              <h3 style={styles.cardTitle}>📡 My Station</h3>
              <p style={styles.ipText}>{myInfo.ip}</p>
              
              {ipcRenderer ? (
                <>
                  <button style={styles.addBtn} onClick={handleSelectFiles}>➕ Share Files</button>
                  <div style={styles.fileListContainer}>
                    <div style={styles.subHeader}>Shared Files ({myInfo.files.length})</div>
                    <ul style={styles.fileList}>
                      {myInfo.files.map((f, i) => <li key={i} style={styles.fileItem}>📄 {f}</li>)}
                    </ul>
                  </div>
                </>
              ) : (
                <div style={styles.mobileHint}>
                  📱 <strong>Mobile Mode</strong><br/>
                  You can download files from PCs on this network. To share files, open LanSync on a laptop.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: FILES */}
          <div style={styles.mainContent}>
            <h2 style={styles.sectionTitle}>
              Network Files <span style={styles.peerCountBadge}>{peerCount} Found</span>
            </h2>

            <div style={styles.grid}>
              {Object.keys(peers).map((socketId) => {
                const peer = peers[socketId];
                if (peer.port === 0 || peer.ip === myInfo.ip) return null;

                return peer.files.map((file, index) => (
                  <div key={`${socketId}-${index}`} style={styles.fileCard}>
                    <div style={styles.fileIcon}>📄</div>
                    <div style={styles.fileInfo}>
                        <strong style={styles.fileName}>{file}</strong>
                        <small style={styles.hostInfo}>Host: {peer.ip}</small>
                    </div>
                    <button style={styles.downloadBtn} onClick={() => downloadFile(peer.ip, peer.port, file)}>
                      Download
                    </button>
                  </div>
                ));
              })}
              
              {peerCount === 0 && (
                  <div style={styles.emptyState}>
                      <div style={{fontSize: "3rem", marginBottom: "10px"}}>🔭</div>
                      Scanning... <br/>
                      <small>No PCs found sharing files.</small>
                  </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* RESPONSIVE STYLES                                                          */
/* -------------------------------------------------------------------------- */
const styles = {
  canvas: { position: "fixed", top: 0, left: 0, zIndex: -1, background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" },
  container: { fontFamily: "'Segoe UI', Roboto, sans-serif", minHeight: "100vh", padding: "20px", color: "#fff", position: "relative", zIndex: 1 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" },
  logoGroup: { display: "flex", alignItems: "center", gap: "10px" },
  logoIcon: { fontSize: "1.8rem", background: "linear-gradient(45deg, #00f2ff, #7b2ff7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  title: { margin: 0, fontSize: "1.5rem", fontWeight: "700" },
  statusBadge: { padding: "5px 12px", borderRadius: "15px", fontWeight: "600", fontSize: "0.8rem", border: "1px solid", backdropFilter: "blur(5px)" },
  
  // 🟢 NEW: FLEXBOX LAYOUT FOR RESPONSIVENESS
  dashboardLayout: {
    display: "flex",
    flexWrap: "wrap", // Allows stacking on phone
    gap: "20px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  sidebar: {
    flex: "1 1 300px", // Takes full width on phone, 300px on PC
    minWidth: "280px",
  },
  mainContent: {
    flex: "999 1 300px", // Takes remaining space
    minWidth: "280px",
  },

  glassCard: { background: "rgba(255, 255, 255, 0.05)", backdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "20px", padding: "20px", boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)" },
  cardTitle: { margin: "0 0 10px 0", color: "#88ccff", fontSize: "1rem", textTransform: "uppercase" },
  ipText: { fontSize: "1.4rem", fontWeight: "bold", margin: "0 0 20px 0", fontFamily: "monospace", wordBreak: "break-all" },
  addBtn: { width: "100%", background: "linear-gradient(90deg, #00f2ff, #00c3ff)", color: "#000", border: "none", padding: "12px", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", marginBottom: "20px" },
  mobileHint: { padding: "15px", background: "rgba(255,255,255,0.05)", borderRadius: "10px", color: "#ccc", fontSize: "0.9rem", lineHeight: "1.5" },
  
  fileListContainer: { marginTop: "10px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "15px" },
  subHeader: { fontSize: "0.8rem", color: "#aaa", marginBottom: "10px" },
  fileList: { listStyle: "none", padding: 0, margin: 0 },
  fileItem: { padding: "8px 10px", background: "rgba(255,255,255,0.05)", marginBottom: "5px", borderRadius: "6px", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },

  sectionTitle: { fontSize: "1.4rem", marginBottom: "15px", display: "flex", alignItems: "center", gap: "10px" },
  peerCountBadge: { fontSize: "0.8rem", background: "rgba(255,255,255,0.1)", padding: "4px 8px", borderRadius: "8px", color: "#aaa" },
  
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "15px" },
  emptyState: { gridColumn: "1 / -1", textAlign: "center", padding: "40px", background: "rgba(255,255,255,0.03)", borderRadius: "20px", color: "#777", border: "2px dashed rgba(255,255,255,0.1)" },
  
  fileCard: { background: "rgba(255, 255, 255, 0.07)", backdropFilter: "blur(10px)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "15px", padding: "15px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  fileIcon: { fontSize: "2rem", marginBottom: "10px" },
  fileInfo: { flex: 1, marginBottom: "10px", width: "100%" },
  fileName: { display: "block", color: "#fff", fontSize: "0.95rem", marginBottom: "5px", wordBreak: "break-all" },
  hostInfo: { color: "#aaa", fontSize: "0.75rem" },
  downloadBtn: { width: "100%", background: "transparent", border: "1px solid #00f2ff", color: "#00f2ff", padding: "8px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" },
};

export default App;