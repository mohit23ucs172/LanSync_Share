import { useState, useEffect, useRef } from "react";

// Safely import Electron
const electron = window.require ? window.require("electron") : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

/* -------------------------------------------------------------------------- */
/* PARTICLE SYSTEM                              */
/* -------------------------------------------------------------------------- */
const ParticleBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    // Set canvas to full screen
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // Particle Configuration
    const particleCount = 60;
    const particles = [];
    const colors = ["#00f2ff", "#7b2ff7", "#ff0055"]; // Neon Cyan, Violet, Pink

    class Particle {
      constructor() {
        this.reset();
      }

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

        // Bounce off edges
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

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    // Animation Loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw connecting lines (optional cool effect)
      particles.forEach((p, index) => {
        p.update();
        p.draw();
        
        // Connect nearby particles
        for (let j = index; j < particles.length; j++) {
          const dx = p.x - particles[j].x;
          const dy = p.y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 150) {
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

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: -1,
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
      }}
    />
  );
};

/* -------------------------------------------------------------------------- */
/* MAIN APPLICATION                             */
/* -------------------------------------------------------------------------- */

function App() {
  const [peers, setPeers] = useState({});
  const [myInfo, setMyInfo] = useState({ port: "...", ip: "Loading...", files: [] });
  const [status, setStatus] = useState("Connecting...");

  useEffect(() => {
    if (!ipcRenderer) {
        setStatus("Error: Not in Electron");
        return;
    }

    ipcRenderer.on("my-info", (event, data) => {
      setMyInfo(data);
      setStatus("Online & Ready");
    });

    ipcRenderer.on("peer-update", (event, data) => setPeers(data));

    return () => {
      ipcRenderer.removeAllListeners("peer-update");
      ipcRenderer.removeAllListeners("my-info");
    };
  }, []);

  const handleSelectFiles = () => {
    if (ipcRenderer) ipcRenderer.send("select-files");
  };

 const downloadFile = (ip, port, fileName) => {
    const url = `http://${ip}:${port}/${fileName}`;
    
    // 🟢 FIX: Use Electron "shell" to open in the system browser (Chrome/Edge)
    if (electron) {
      const { shell } = window.require("electron");
      shell.openExternal(url); 
    } else {
      // Fallback for web mode
      window.open(url, "_blank");
    }
  };

  // Safe check for peer count
  const peerCount = Object.keys(peers).filter(id => peers[id].port !== myInfo.port).length;

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
            backgroundColor: status.includes("Online") ? "rgba(0, 255, 136, 0.2)" : "rgba(255, 68, 68, 0.2)",
            color: status.includes("Online") ? "#00ff88" : "#ff4444",
            border: status.includes("Online") ? "1px solid #00ff88" : "1px solid #ff4444",
          }}>
            {status}
          </div>
        </header>

        {/* DASHBOARD GRID */}
        <div style={styles.dashboardLayout}>
          
          {/* LEFT: MY STATION (Glass Card) */}
          <div style={styles.glassCard}>
            <h3 style={styles.cardTitle}>📡 My Station</h3>
            <p style={styles.ipText}>{myInfo.ip}</p>
            
            <button 
                style={styles.addBtn} 
                onClick={handleSelectFiles}
                onMouseOver={(e) => e.target.style.transform = "scale(1.05)"}
                onMouseOut={(e) => e.target.style.transform = "scale(1)"}
            >
              ➕ Share Files
            </button>

            <div style={styles.fileListContainer}>
                <div style={styles.subHeader}>Shared Files ({myInfo.files.length})</div>
                <ul style={styles.fileList}>
                    {myInfo.files.map((f, i) => (
                        <li key={i} style={styles.fileItem}>
                           📄 {f}
                        </li>
                    ))}
                </ul>
            </div>
          </div>

          {/* RIGHT: NETWORK FILES */}
          <div style={styles.networkSection}>
            <h2 style={styles.sectionTitle}>
              Network Discovery 
              <span style={styles.peerCountBadge}>{peerCount} Peers Found</span>
            </h2>

            <div style={styles.grid}>
              {Object.keys(peers).map((socketId) => {
                const peer = peers[socketId];
                if (peer.port === myInfo.port) return null;

                return peer.files.map((file, index) => (
                  <div key={`${socketId}-${index}`} style={styles.fileCard}>
                    <div style={styles.fileIcon}>📄</div>
                    <div style={styles.fileInfo}>
                        <strong style={styles.fileName}>{file}</strong>
                        <small style={styles.hostInfo}>Host: {peer.ip}</small>
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
              
              {/* Empty State */}
              {peerCount === 0 && (
                  <div style={styles.emptyState}>
                      <div style={{fontSize: "3rem", marginBottom: "10px"}}>🔭</div>
                      Scanning for peers... <br/>
                      <small>Open LanSync on another device to start.</small>
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
/* STYLES (CSS-IN-JS)                           */
/* -------------------------------------------------------------------------- */
const styles = {
  container: {
    fontFamily: "'Segoe UI', Roboto, sans-serif",
    minHeight: "100vh",
    padding: "30px",
    color: "#fff",
    position: "relative",
    zIndex: 1, // Above canvas
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "40px",
    padding: "0 10px",
  },
  logoGroup: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
  },
  logoIcon: {
    fontSize: "2rem",
    background: "linear-gradient(45deg, #00f2ff, #7b2ff7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    filter: "drop-shadow(0 0 10px rgba(0, 242, 255, 0.5))",
  },
  title: {
    margin: 0,
    fontSize: "2rem",
    fontWeight: "700",
    letterSpacing: "1px",
  },
  statusBadge: {
    padding: "8px 16px",
    borderRadius: "20px",
    fontWeight: "600",
    fontSize: "0.9rem",
    backdropFilter: "blur(5px)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    transition: "all 0.3s ease",
  },
  
  // Layout
  dashboardLayout: {
    display: "grid",
    gridTemplateColumns: "300px 1fr",
    gap: "30px",
    maxWidth: "1200px",
    margin: "0 auto",
  },

  // Glass Card (Common)
  glassCard: {
    background: "rgba(255, 255, 255, 0.05)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "20px",
    padding: "25px",
    boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)",
    height: "fit-content",
  },

  // My Station Specific
  cardTitle: {
    margin: "0 0 10px 0",
    color: "#88ccff",
    fontSize: "1.1rem",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  ipText: {
    fontSize: "1.8rem",
    fontWeight: "bold",
    margin: "0 0 20px 0",
    fontFamily: "monospace",
    textShadow: "0 0 10px rgba(0, 242, 255, 0.3)",
  },
  addBtn: {
    width: "100%",
    background: "linear-gradient(90deg, #00f2ff, #00c3ff)",
    color: "#000",
    border: "none",
    padding: "12px",
    borderRadius: "10px",
    fontWeight: "bold",
    fontSize: "1rem",
    cursor: "pointer",
    transition: "transform 0.2s",
    boxShadow: "0 0 15px rgba(0, 242, 255, 0.4)",
    marginBottom: "20px",
  },
  fileListContainer: {
    marginTop: "20px",
    borderTop: "1px solid rgba(255,255,255,0.1)",
    paddingTop: "20px",
  },
  subHeader: {
    fontSize: "0.9rem",
    color: "#aaa",
    marginBottom: "10px",
  },
  fileList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  fileItem: {
    padding: "8px 12px",
    background: "rgba(255,255,255,0.05)",
    marginBottom: "8px",
    borderRadius: "8px",
    fontSize: "0.9rem",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  // Right Side
  networkSection: {
    display: "flex",
    flexDirection: "column",
  },
  sectionTitle: {
    fontSize: "1.5rem",
    marginBottom: "20px",
    display: "flex",
    alignItems: "center",
    gap: "15px",
  },
  peerCountBadge: {
    fontSize: "0.8rem",
    background: "rgba(255,255,255,0.1)",
    padding: "5px 10px",
    borderRadius: "10px",
    color: "#aaa",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "20px",
  },
  emptyState: {
    gridColumn: "1 / -1",
    textAlign: "center",
    padding: "50px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "20px",
    color: "#777",
    border: "2px dashed rgba(255,255,255,0.1)",
  },

  // File Cards (Network)
  fileCard: {
    background: "rgba(255, 255, 255, 0.07)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "15px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    transition: "transform 0.2s, background 0.2s",
    cursor: "default",
  },
  fileIcon: {
    fontSize: "2.5rem",
    marginBottom: "15px",
    filter: "drop-shadow(0 0 5px rgba(255,255,255,0.3))",
  },
  fileInfo: {
    flex: 1,
    marginBottom: "15px",
    width: "100%",
  },
  fileName: {
    display: "block",
    color: "#fff",
    fontSize: "1rem",
    marginBottom: "5px",
    wordBreak: "break-all",
  },
  hostInfo: {
    color: "#aaa",
    fontSize: "0.8rem",
  },
  downloadBtn: {
    width: "100%",
    background: "transparent",
    border: "1px solid #00f2ff",
    color: "#00f2ff",
    padding: "8px",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
    fontWeight: "bold",
  },
};

export default App;