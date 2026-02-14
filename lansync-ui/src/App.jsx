import React, { useState, useEffect, useRef } from "react";
import QRCode from "react-qr-code";

const electron = window.require ? window.require("electron") : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

/* 🎨 Constellation Artwork Background */
const ConstellationBackground = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; 
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    const resize = () => { 
      canvas.width = window.innerWidth; 
      canvas.height = window.innerHeight; 
    };
    window.addEventListener("resize", resize); 
    resize();

    const particles = [];
    for (let i = 0; i < 60; i++) {
      particles.push({ 
        x: Math.random() * canvas.width, 
        y: Math.random() * canvas.height, 
        vx: (Math.random() - 0.5) * 0.8, 
        vy: (Math.random() - 0.5) * 0.8, 
        size: Math.random() * 2 + 1 
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); 
        ctx.fillStyle = "rgba(0, 243, 255, 0.4)"; 
        ctx.fill();
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j], dist = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
          if (dist < 140) { 
            ctx.beginPath(); 
            ctx.strokeStyle = `rgba(0, 243, 255, ${1 - dist / 140})`; 
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
    return () => { 
      window.removeEventListener("resize", resize); 
      cancelAnimationFrame(animationFrameId); 
    };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, zIndex: -1, background: "#0b0e14" }} />;
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [hostFiles, setHostFiles] = useState([]);
  const [myInfo, setMyInfo] = useState({ localIP: "", publicIP: "", shared: [], received: [], passcode: "----" });
  const [uploadStatus, setUploadStatus] = useState("");

  useEffect(() => {
    if (ipcRenderer) {
      setIsLoggedIn(true);
      ipcRenderer.on("refresh-data", (e, data) => setMyInfo(data));
      ipcRenderer.send('request-init');
    }
  }, []);

  const handleLogin = async () => {
    const host = new URLSearchParams(window.location.search).get('host') || `http://${window.location.hostname}:5000`;
    try {
      const res = await fetch(`${host}/api/login`, { method: 'POST', body: JSON.stringify({ passcode }) });
      const data = await res.json();
      if (data.success) { 
        setIsLoggedIn(true); 
        startPolling(host); 
      } else {
        alert("Wrong Passcode!");
      }
    } catch (e) { alert("Connection Error"); }
  };

  const startPolling = (host) => {
    const fetchFiles = async () => { try { const res = await fetch(`${host}/api/files`); setHostFiles(await res.json()); } catch (e) { } };
    fetchFiles(); setInterval(fetchFiles, 3000);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploadStatus("Uploading...");
    const formData = new FormData(); formData.append("file", file);
    const host = new URLSearchParams(window.location.search).get('host') || `http://${window.location.hostname}:5000`;
    try {
      await fetch(`${host}/api/upload`, { method: "POST", body: formData });
      setUploadStatus("✅ Sent!");
      setTimeout(() => setUploadStatus(""), 3000);
    } catch (e) { setUploadStatus("❌ Failed"); }
  };

  // 🟢 Helper to copy links to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setUploadStatus("📋 Link Copied!");
    setTimeout(() => setUploadStatus(""), 2000);
  };

  const localLink = `http://${myInfo.localIP}:5173`;
  const vercelLink = `https://lan-sync-share.vercel.app?host=${myInfo.publicIP}`;

  if (!isLoggedIn) {
    return (
      <div style={styles.loginBox}>
        <ConstellationBackground />
        <div style={styles.card}>
          <h2 style={{ color: "#00f3ff", marginBottom: "20px" }}>🔐 LanSync Login</h2>
          <input type="text" placeholder="Passcode from PC" style={styles.input} onChange={e => setPasscode(e.target.value)} />
          <button style={styles.mainBtn} onClick={handleLogin}>Unlock Access</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <ConstellationBackground />
      <header style={styles.header}><h1 style={styles.title}>LanSync ⚡</h1></header>

      <div style={styles.grid}>
        {/* CONNECTION & CONTROL CARD */}
        <div style={styles.card}>
          <h3 style={styles.cardHeader}>📡 Connection</h3>
          {ipcRenderer ? (
            <div style={styles.qrBox}>
              <div style={styles.tabs}>
                <div style={styles.qrItem}>
                    <p>Wi-Fi</p>
                    <div style={styles.qrFrame}><QRCode value={localLink} size={110} /></div>
                    <p style={styles.linkText} onClick={() => copyToClipboard(localLink)}>{myInfo.localIP}</p>
                </div>
                <div style={styles.qrItem}>
                    <p>Vercel</p>
                    <div style={styles.qrFrame}><QRCode value={vercelLink} size={110} /></div>
                    <p style={styles.linkText} onClick={() => copyToClipboard(vercelLink)}>Copy Public Link</p>
                </div>
              </div>
              <div style={styles.passBox}>PASSCODE: <span style={styles.neon}>{myInfo.passcode}</span></div>
              <button style={styles.mainBtn} onClick={() => ipcRenderer.send('select-files')}>+ Add Files</button>
            </div>
          ) : (
            <div style={styles.qrBox}>
              <label style={styles.uploadArea}>
                <span style={{fontSize: "2rem"}}>☁️</span>
                <span>Tap to Send File</span>
                <input type="file" style={{ display: "none" }} onChange={handleUpload} />
              </label>
              <p style={{ marginTop: "15px", color: "#00f3ff" }}>{uploadStatus}</p>
            </div>
          )}
        </div>

        {/* FILE PREVIEW & DESELECT CARD */}
        <div style={{ ...styles.card, flex: 1.5 }}>
          <h3 style={styles.cardHeader}>📂 {ipcRenderer ? "Currently Sharing" : "Available Downloads"}</h3>
          <div style={styles.list}>
            {(ipcRenderer ? myInfo.shared : hostFiles).map(f => (
              <div key={f} style={styles.row}>
                <span style={{fontSize: "0.9rem"}}>📄 {f}</span>
                {ipcRenderer ? (
                  <button style={styles.deselect} onClick={() => ipcRenderer.send('remove-file', f)}>Deselect</button>
                ) : (
                  <button style={styles.actionBtn} onClick={() => window.open(`${new URLSearchParams(window.location.search).get('host') || `http://${window.location.hostname}:5000`}/${f}`)}>Download</button>
                )}
              </div>
            ))}
            {(ipcRenderer ? myInfo.shared : hostFiles).length === 0 && <p style={styles.empty}>No files active.</p>}
          </div>
        </div>

        {/* INCOMING INBOX (PC ONLY) */}
        {ipcRenderer && (
          <div style={{ ...styles.card, flex: 1.5 }}>
            <h3 style={styles.cardHeader}>📥 Incoming Inbox</h3>
            <div style={styles.list}>
              {myInfo.received.map(f => (
                <div key={f.id} style={styles.row}>
                  <span style={{fontSize: "0.9rem"}}>{f.name} <small style={{opacity: 0.6}}>({f.sender})</small></span>
                  <button style={styles.actionBtn} onClick={() => ipcRenderer.send('save-received-file', f.id)}>Save</button>
                </div>
              ))}
              {myInfo.received.length === 0 && <p style={styles.empty}>Inbox is empty.</p>}
            </div>
          </div>
        )}
      </div>
      {uploadStatus.includes("Link") && <div style={styles.toast}>{uploadStatus}</div>}
    </div>
  );
}

const styles = {
  container: { padding: "40px", color: "#ffffff", minHeight: "100vh", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column", gap: "25px", background: "transparent", position: "relative", zIndex: 1 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", padding: "10px 0", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" },
  title: { margin: 0, fontSize: "2.8rem", fontWeight: "900", background: "linear-gradient(90deg, #00f3ff, #0072ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textShadow: "0 0 20px rgba(0, 243, 255, 0.5)" },
  grid: { display: "flex", gap: "20px", flexWrap: "nowrap", justifyContent: "center" },
  card: { background: "rgba(15, 25, 35, 0.6)", backdropFilter: "blur(12px) saturate(160%)", borderRadius: "24px", border: "1px solid rgba(255, 255, 255, 0.1)", flex: 1, minWidth: "320px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.6)" },
  cardHeader: { background: "rgba(0, 0, 0, 0.3)", padding: "15px 20px", fontSize: "0.8rem", fontWeight: "800", color: "#00f3ff", letterSpacing: "2px", textTransform: "uppercase", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" },
  qrBox: { padding: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" },
  tabs: { display: "flex", gap: "15px", justifyContent: "center", width: "100%" },
  qrItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flex: 1, fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" },
  qrFrame: { background: "#ffffff", padding: "8px", borderRadius: "12px", boxShadow: "0 0 20px rgba(0, 243, 255, 0.2)" },
  linkText: { fontSize: "0.7rem", color: "#00f3ff", cursor: "pointer", textDecoration: "underline", wordBreak: "break-all", opacity: 0.8 },
  passBox: { background: "rgba(0, 0, 0, 0.4)", padding: "12px", borderRadius: "15px", width: "90%", border: "1px solid rgba(0, 243, 255, 0.3)", textAlign: "center", margin: "10px 0" },
  neon: { color: "#00f3ff", fontSize: "1.8rem", fontWeight: "bold", letterSpacing: "5px", textShadow: "0 0 10px #00f3ff" },
  mainBtn: { width: "90%", padding: "12px", background: "linear-gradient(135deg, #00f3ff, #0072ff)", border: "none", borderRadius: "10px", color: "#fff", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 15px rgba(0, 114, 255, 0.3)" },
  list: { display: "flex", flexDirection: "column", gap: "8px", padding: "15px" },
  row: { background: "rgba(255, 255, 255, 0.03)", padding: "12px 15px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(255, 255, 255, 0.05)" },
  deselect: { background: "rgba(255, 69, 58, 0.15)", color: "#ff453a", border: "1px solid rgba(255, 69, 58, 0.4)", padding: "4px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "0.75rem" },
  uploadArea: { border: "2px dashed rgba(0, 243, 255, 0.4)", padding: "50px 30px", borderRadius: "24px", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", background: "rgba(0, 243, 255, 0.02)", color: "#00f3ff", width: "90%" },
  loginBox: { height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" },
  input: { background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(0, 243, 255, 0.3)", padding: "16px", borderRadius: "16px", color: "#ffffff", width: "100%", marginBottom: "25px", textAlign: "center", fontSize: "1.2rem", outline: "none" },
  actionBtn: { background: "rgba(0, 243, 255, 0.1)", color: "#00f3ff", border: "1px solid rgba(0, 243, 255, 0.3)", padding: "5px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem" },
  empty: { color: "rgba(255, 255, 255, 0.2)", textAlign: "center", padding: "30px 0", fontSize: "0.9rem" },
  toast: { position: "fixed", bottom: "30px", left: "50%", transform: "translateX(-50%)", background: "#00f3ff", color: "#000", padding: "10px 20px", borderRadius: "50px", fontWeight: "bold", zIndex: 10, boxShadow: "0 0 20px rgba(0,243,255,0.5)" }
};

export default App;