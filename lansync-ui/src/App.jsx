import { useState, useEffect, useRef } from "react";
import QRCode from "react-qr-code"; 

const electron = window.require ? window.require("electron") : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

/* -------------------------------------------------------------------------- */
/* 🎨 ARTWORK BACKGROUND: "NEURAL CONSTELLATION" */
/* -------------------------------------------------------------------------- */
const ConstellationBackground = () => {
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

    // Config
    const particles = [];
    const particleCount = 60;
    const connectionDist = 140; // Distance to draw lines

    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.8, // Slow float
            vy: (Math.random() - 0.5) * 0.8,
            size: Math.random() * 2 + 1,
            color: `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.2})`
        });
    }

    const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 1. Update & Draw Particles
        particles.forEach((p, index) => {
            p.x += p.vx; p.y += p.vy;

            // Bounce off edges
            if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();

            // 2. Draw Connections (The "Art")
            for (let j = index + 1; j < particles.length; j++) {
                const p2 = particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < connectionDist) {
                    ctx.beginPath();
                    // Fade line based on distance
                    ctx.strokeStyle = `rgba(67, 240, 255, ${1 - dist/connectionDist})`; 
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        });
        animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => { window.removeEventListener("resize", resizeCanvas); cancelAnimationFrame(animationFrameId); };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: "fixed", top: 0, left: 0, zIndex: -1, 
        // 🟢 RICH ARTWORK GRADIENT (Not Black)
        background: "linear-gradient(to bottom right, #0f2027, #203a43, #2c5364)" 
      }} 
    />
  );
};

function App() {
  const [hostFiles, setHostFiles] = useState([]); 
  const [receivedFiles, setReceivedFiles] = useState([]); 
  const [mySharedFiles, setMySharedFiles] = useState([]); 
  const [myInfo, setMyInfo] = useState({ localIP: "Loading...", publicIP: "...", files: [], connectedCount: 0 });
  const [uploadStatus, setUploadStatus] = useState("");
  const [deviceName] = useState(() => "Mobile-" + Math.floor(Math.random() * 1000));

  useEffect(() => {
    if (ipcRenderer) {
      // PC MODE
      ipcRenderer.on("refresh-data", (event, data) => {
          setMyInfo(data);
          setMySharedFiles(data.shared);
          if(data.received) setReceivedFiles(data.received);
      });
      ipcRenderer.send('request-init'); 
      ipcRenderer.on('file-saved-success', (event, name) => alert(`✅ Saved: ${name}`));
    } else {
      // PHONE MODE
      const hostIP = window.location.hostname;
      setMyInfo({ localIP: "Connected", publicIP: "N/A", files: [], connectedCount: 1 });
      const fetchFiles = async () => {
        try {
          const res = await fetch(`http://${hostIP}:5000/api/files`);
          const files = await res.json();
          setHostFiles(files);
        } catch (err) {}
      };
      fetchFiles();
      setInterval(fetchFiles, 3000);
    }
  }, []);

  const handleSelectFiles = () => ipcRenderer.send("select-files");
  const saveReceivedFile = (id) => ipcRenderer.send('save-received-file', id);

  const handleMobileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus("Sending...");
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sender", deviceName); 

    const hostIP = window.location.hostname;
    try {
        await fetch(`http://${hostIP}:5000/api/upload`, { method: "POST", body: formData });
        setUploadStatus("✅ Sent!");
        setTimeout(() => setUploadStatus(""), 2000);
    } catch (err) { setUploadStatus("❌ Failed"); }
  };

  const downloadFile = (fileName) => {
    const hostIP = window.location.hostname;
    window.open(`http://${hostIP}:5000/${fileName}`, "_blank");
  };

  return (
    <>
      <ConstellationBackground />
      <div style={styles.container}>
        
        {/* HEADER */}
        <div style={styles.topBar}>
            <div style={{display:"flex", alignItems:"center", gap:"15px"}}>
                <div style={styles.logoBox}>⚡</div>
                <div>
                    <h1 style={styles.title}>LanSync</h1>
                    
                    {/* 🟢 CONNECTED DEVICES INDICATOR */}
                    {ipcRenderer && (
                         <div style={styles.connectedBadge}>
                            <span style={styles.greenDot}></span>
                            {myInfo.connectedCount > 0 
                                ? `${myInfo.connectedCount} Device${myInfo.connectedCount > 1 ? 's' : ''} Online`
                                : "Waiting for devices..."}
                         </div>
                    )}
                </div>
            </div>
            <div style={styles.deviceTag}>
                {ipcRenderer ? "🖥️ PC Host" : `📱 ${deviceName}`}
            </div>
        </div>

        {/* MAIN GRID */}
        <div style={styles.grid}>
            
            {/* --- 1. CONNECTION CARD --- */}
            {ipcRenderer && (
                <div style={styles.card}>
                    <div style={styles.cardHeader}>📡 CONNECTION</div>
                    <div style={{padding:"25px", textAlign:"center"}}>
                        <div style={styles.qrFrame}>
                             <QRCode value={`http://${myInfo.localIP}:5173`} size={150} bgColor="transparent" fgColor="#fff" />
                        </div>
                        <h2 style={styles.ipText}>{myInfo.localIP}</h2>
                        <p style={{color:"#88c0d0"}}>Scan to join Network</p>
                    </div>
                </div>
            )}

            {/* --- 2. INBOX (RECEIVED FILES) --- */}
            <div style={{...styles.card, flex: 1.5}}>
                <div style={styles.cardHeader}>
                    {ipcRenderer ? "📥 RECEIVED FILES" : "📤 UPLOAD TO PC"}
                </div>
                
                <div style={styles.cardBody}>
                    {/* PC VIEW */}
                    {ipcRenderer && (
                        <div style={styles.fileList}>
                            {receivedFiles.length === 0 ? (
                                <div style={styles.emptyState}>
                                    <span style={{fontSize:"2rem", opacity:0.5}}>📭</span><br/>
                                    Inbox Empty
                                </div>
                            ) : (
                                receivedFiles.map((f, i) => (
                                    <div key={i} style={styles.fileRow}>
                                        <div style={styles.iconReceived}>⬇</div>
                                        <div style={{flex:1}}>
                                            <div style={{fontWeight:"bold"}}>{f.name}</div>
                                            <div style={styles.meta}>From: <span style={{color:"#88c0d0"}}>{f.sender}</span></div>
                                        </div>
                                        <button style={styles.saveBtn} onClick={() => saveReceivedFile(f.id)}>Save</button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* PHONE VIEW */}
                    {!ipcRenderer && (
                        <div style={{textAlign:"center", padding:"10px"}}>
                            <label style={styles.uploadArea}>
                                <span style={{fontSize:"3rem", marginBottom:"10px"}}>☁️</span>
                                <span>Tap to Send File</span>
                                <input type="file" style={{display:"none"}} onChange={handleMobileUpload} />
                            </label>
                            {uploadStatus && <div style={styles.toast}>{uploadStatus}</div>}
                        </div>
                    )}
                </div>
            </div>

            {/* --- 3. SHARED FILES (OUTBOX) --- */}
            <div style={{...styles.card, flex: 1.5}}>
                <div style={styles.cardHeader}>
                    {ipcRenderer ? "📤 SHARED BY YOU" : "💾 DOWNLOAD"}
                </div>

                <div style={styles.cardBody}>
                    {/* PC VIEW */}
                    {ipcRenderer && (
                        <>
                            <button style={styles.addBtn} onClick={handleSelectFiles}>+ Add Files</button>
                            <div style={styles.fileList}>
                                {mySharedFiles.map((f, i) => (
                                    <div key={i} style={styles.fileRowSimple}>
                                        <span>📄 {f}</span>
                                        <span style={styles.activeTag}>Active</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* PHONE VIEW */}
                    {!ipcRenderer && (
                        <div style={styles.fileList}>
                            {hostFiles.length === 0 ? (
                                <div style={styles.emptyState}>No files shared by PC yet.</div>
                            ) : (
                                hostFiles.map((f, i) => (
                                    <div key={i} style={styles.fileRow}>
                                        <div style={styles.iconShared}>📄</div>
                                        <div style={{flex:1, fontWeight:"500"}}>{f}</div>
                                        <button style={styles.downloadBtn} onClick={() => downloadFile(f)}>⬇</button>
                                    </div>
                                ))
                            )}
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
/* 💎 GLASSMORPHISM STYLES */
/* -------------------------------------------------------------------------- */
const styles = {
  container: { fontFamily: "'Segoe UI', sans-serif", padding: "30px", color: "white", minHeight: "100vh" },
  
  // Header
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", background:"rgba(255,255,255,0.05)", padding:"15px 25px", borderRadius:"15px", border:"1px solid rgba(255,255,255,0.1)" },
  logoBox: { width:45, height:45, background: "linear-gradient(135deg, #00c6ff, #0072ff)", borderRadius:"12px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.5rem", boxShadow:"0 0 15px rgba(0, 114, 255, 0.4)" },
  title: { margin: 0, fontWeight: "700", letterSpacing: "1px" },
  
  connectedBadge: { fontSize: "0.85rem", color: "#88c0d0", display:"flex", alignItems:"center", marginTop:"5px" },
  greenDot: { width:8, height:8, background:"#00ff88", borderRadius:"50%", marginRight:8, boxShadow:"0 0 8px #00ff88" },
  deviceTag: { background:"rgba(0,0,0,0.3)", padding:"5px 15px", borderRadius:"20px", fontSize:"0.9rem", border:"1px solid rgba(255,255,255,0.1)" },

  // Grid
  grid: { display: "flex", gap: "25px", flexWrap: "wrap", alignItems: "flex-start" },

  // Cards
  card: { background: "rgba(255, 255, 255, 0.05)", backdropFilter: "blur(12px)", borderRadius: "20px", border: "1px solid rgba(255, 255, 255, 0.1)", overflow: "hidden", display:"flex", flexDirection:"column", minWidth:"300px" },
  cardHeader: { background: "rgba(0,0,0,0.2)", padding: "15px 20px", fontSize: "0.9rem", letterSpacing: "1px", fontWeight:"bold", color:"#ccc", borderBottom:"1px solid rgba(255,255,255,0.05)" },
  cardBody: { padding: "20px" },

  // Connection
  qrFrame: { background: "white", padding: "15px", borderRadius: "15px", display: "inline-block", marginBottom: "15px" },
  ipText: { fontSize: "1.8rem", margin: "0 0 5px 0", color: "#fff", fontFamily: "monospace", textShadow: "0 0 10px rgba(255,255,255,0.2)" },

  // Lists
  fileList: { display: "flex", flexDirection: "column", gap: "10px" },
  fileRow: { background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "12px", display: "flex", alignItems: "center", gap: "15px", border:"1px solid rgba(255,255,255,0.05)" },
  fileRowSimple: { padding: "12px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", color: "#ddd" },
  
  iconReceived: { background: "rgba(0, 255, 136, 0.1)", color: "#00ff88", width: 40, height: 40, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight:"bold" },
  iconShared: { background: "rgba(0, 198, 255, 0.1)", color: "#00c6ff", width: 40, height: 40, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize:"1.2rem" },
  
  meta: { fontSize: "0.8rem", color: "#aaa", marginTop: "2px" },
  emptyState: { textAlign: "center", color: "#666", padding: "20px" },

  // Buttons
  addBtn: { width: "100%", padding: "12px", background: "linear-gradient(90deg, #00c6ff, #0072ff)", border: "none", borderRadius: "10px", color: "white", fontWeight: "bold", cursor: "pointer", marginBottom: "15px" },
  saveBtn: { background: "#00ff88", color: "#000", border: "none", padding: "6px 15px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" },
  downloadBtn: { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", width: 35, height: 35, borderRadius: "50%", color: "white", cursor: "pointer" },
  
  activeTag: { fontSize: "0.7rem", color: "#00c6ff", background: "rgba(0, 198, 255, 0.1)", padding: "2px 6px", borderRadius: "4px" },

  // Mobile
  uploadArea: { border: "2px dashed #00c6ff", borderRadius: "15px", padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", background: "rgba(0, 198, 255, 0.05)", color: "#00c6ff", fontWeight: "bold", transition:"0.2s" },
  toast: { marginTop: "15px", background: "#00ff88", color: "black", padding: "10px", borderRadius: "10px", fontWeight: "bold" }
};

export default App;