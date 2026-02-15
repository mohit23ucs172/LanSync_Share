import React, { useState, useEffect, useRef } from "react";
import QRCode from "react-qr-code";

const electron = window.require ? window.require("electron") : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

/* 🎨 Constellation Background - Essential for UI */
const ConstellationBackground = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; 
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener("resize", resize); resize();
    const particles = [];
    for (let i = 0; i < 60; i++) {
      particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, size: Math.random() * 2 + 1 });
    }
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = "rgba(0, 243, 255, 0.4)"; ctx.fill();
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j], dist = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
          if (dist < 140) { ctx.beginPath(); ctx.strokeStyle = `rgba(0, 243, 255, ${1 - dist / 140})`; ctx.lineWidth = 0.5; ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
        }
      });
      animationFrameId = requestAnimationFrame(animate);
    };
    animate(); return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(animationFrameId); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, zIndex: -1, background: "#0b0e14" }} />;
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [hostFiles, setHostFiles] = useState([]);
  const [myInfo, setMyInfo] = useState({ localIP: "", publicIP: "", shared: [], received: [], passcode: "----", port: 5000 });
  const [uploadStatus, setUploadStatus] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (ipcRenderer) {
      setIsLoggedIn(true);
      ipcRenderer.on("refresh-data", (e, data) => setMyInfo(data));
      ipcRenderer.send('request-init');
    } else {
        const token = localStorage.getItem('lanSyncToken');
        if (token) { setIsLoggedIn(true); startPolling(getHost()); }
    }
  }, []);

  const isDev = !electron; 
  const activePort = myInfo.port || 5000;
  const linkPort = isDev ? "5173" : activePort;
  const currentHost = myInfo.localIP || window.location.hostname;
  const localLink = `http://${currentHost}:${linkPort}`;

  function getHost() {
    const paramHost = new URLSearchParams(window.location.search).get('host');
    return paramHost || `http://${window.location.hostname}:${activePort}`;
  }

  const handleLogin = async () => {
    const host = getHost();
    try {
      const res = await fetch(`${host}/api/login`, { 
        method: 'POST', 
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({ passcode }) 
      });
      const data = await res.json();
      if (data.success) { 
        localStorage.setItem('lanSyncToken', data.token);
        setIsLoggedIn(true); startPolling(host); 
      } else { alert("Wrong Passcode!"); }
    } catch (e) { alert("Connection Error: Check Firewall"); }
  };

  const startPolling = (host) => {
    const fetchFiles = async () => { 
      try { 
        const token = localStorage.getItem('lanSyncToken');
        const res = await fetch(`${host}/api/files`, { headers: { "Bypass-Tunnel-Reminder": "true", "Authorization": token } }); 
        setHostFiles(await res.json()); 
      } catch (e) {} 
    };
    fetchFiles(); setInterval(fetchFiles, 3000);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploadStatus("Uploading...");
    const formData = new FormData(); formData.append("file", file);
    try {
      await fetch(`${getHost()}/api/upload`, { 
        method: "POST", 
        headers: { "Bypass-Tunnel-Reminder": "true", "Authorization": localStorage.getItem('lanSyncToken') }, 
        body: formData 
      });
      setUploadStatus("✅ Sent!"); setTimeout(() => setUploadStatus(""), 3000);
    } catch (e) { setUploadStatus("❌ Failed"); }
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.loginBox}>
        <ConstellationBackground />
        <div style={styles.card}>
          <h2 style={{ color: "#00f3ff", marginBottom: "20px" }}>🔐 LanSync Login</h2>
          <input type="text" placeholder="Passcode" style={styles.input} onChange={e => setPasscode(e.target.value)} />
          <button style={styles.mainBtn} onClick={handleLogin}>Unlock Access</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <ConstellationBackground />
      <header style={styles.header}>
        <h1 style={styles.title}>LanSync ⚡</h1>
        <button style={styles.helpToggle} onClick={() => setShowHelp(!showHelp)}>
          {showHelp ? "✖ Close Help" : "❓ How to Connect"}
        </button>
      </header>

      {showHelp && (
        <div style={styles.helpPanel}>
          <h3>🚀 Getting Started for Anyone</h3>
          <ul>
            <li>**Step 1:** Both devices must be on the **same Wi-Fi** or use a **Hotspot**.</li>
            <li>**Step 2:** Click "Allow Access" on the Windows Firewall popup if it appears.</li>
            <li>**Step 3:** Scan the QR code or visit: <code style={styles.neon}>{localLink}</code>.</li>
            <li>**Step 4:** Enter the 4-digit passcode shown on the laptop to start sharing.</li>
          </ul>
        </div>
      )}

      <div style={styles.grid}>
        <div style={styles.card}>
          <h3 style={styles.cardHeader}>📡 Connection</h3>
          {ipcRenderer ? (
            <div style={styles.qrBox}>
              <div style={styles.qrFrame}><QRCode value={localLink} size={150} /></div>
              <p style={styles.linkText}>{localLink}</p>
              <div style={styles.passBox}>PASSCODE: <span style={styles.neon}>{myInfo.passcode}</span></div>
              <button style={styles.mainBtn} onClick={() => ipcRenderer.send('select-files')}>+ Share Files</button>
            </div>
          ) : (
            <div style={styles.qrBox}>
              <label style={styles.uploadArea}>☁️ <span>Tap to Send File to PC</span><input type="file" style={{ display: "none" }} onChange={handleUpload} /></label>
              <p style={{ color: "#00f3ff", marginTop: '10px' }}>{uploadStatus}</p>
              <button style={styles.actionBtn} onClick={() => window.location.reload()}>🔄 Refresh Link</button>
            </div>
          )}
        </div>

        <div style={{ ...styles.card, flex: 1.5 }}>
          <h3 style={styles.cardHeader}>📂 {ipcRenderer ? "Sharing" : "Downloads"}</h3>
          <div style={styles.list}>
            {(ipcRenderer ? myInfo.shared : hostFiles).map(f => (
              <div key={f} style={styles.row}>
                <span>📄 {f}</span>
                {ipcRenderer ? (
                    <button style={styles.deselect} onClick={() => ipcRenderer.send('remove-file', f)}>Remove</button>
                ) : (
                    <button style={styles.actionBtn} onClick={() => window.open(`${getHost()}/${f}`)}>Download</button>
                )}
              </div>
            ))}
            {(ipcRenderer ? myInfo.shared : hostFiles).length === 0 && <p style={styles.empty}>No files shared yet.</p>}
          </div>
        </div>

        {ipcRenderer && (
          <div style={{ ...styles.card, flex: 1.5 }}>
            <h3 style={styles.cardHeader}>📥 Received (Inbox)</h3>
            <div style={styles.list}>
              {myInfo.received.map(f => (
                <div key={f.id} style={styles.row}>
                  <span>📥 {f.name}</span>
                  <button style={styles.actionBtn} onClick={() => ipcRenderer.send('save-received-file', f.id)}>Save to PC</button>
                </div>
              ))}
              {myInfo.received.length === 0 && <p style={styles.empty}>Inbox is empty.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { padding: "40px", color: "#ffffff", minHeight: "100vh", display: "flex", flexDirection: "column", gap: "25px", position: "relative", zIndex: 1 },
  header: { borderBottom: "1px solid rgba(255, 255, 255, 0.1)", display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' },
  title: { fontSize: "2.8rem", fontWeight: "900", background: "linear-gradient(90deg, #00f3ff, #0072ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 },
  helpToggle: { background: "rgba(0, 243, 255, 0.1)", border: "1px solid #00f3ff", color: "#00f3ff", padding: "8px 15px", borderRadius: "10px", cursor: "pointer" },
  helpPanel: { background: "rgba(0, 0, 0, 0.4)", padding: "20px", borderRadius: "20px", border: "1px solid rgba(0, 243, 255, 0.3)", animation: "fadeIn 0.5s" },
  grid: { display: "flex", gap: "20px", justifyContent: "center", flexWrap: "wrap" },
  card: { background: "rgba(15, 25, 35, 0.6)", backdropFilter: "blur(12px)", borderRadius: "24px", border: "1px solid rgba(255, 255, 255, 0.1)", flex: 1, minWidth: "320px", overflow: "hidden" },
  cardHeader: { background: "rgba(0, 0, 0, 0.3)", padding: "15px 20px", fontSize: "0.8rem", color: "#00f3ff", textTransform: 'uppercase' },
  qrBox: { padding: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" },
  qrFrame: { background: "#ffffff", padding: "10px", borderRadius: "12px" },
  linkText: { fontSize: "0.6rem", color: "#00f3ff", wordBreak: 'break-all', textAlign: 'center' },
  passBox: { background: "rgba(0, 0, 0, 0.4)", padding: "12px", borderRadius: "15px", width: "90%", border: "1px solid #00f3ff", textAlign: "center" },
  neon: { color: "#00f3ff", fontSize: "1.2rem", fontWeight: "bold" },
  mainBtn: { width: "90%", padding: "12px", background: "linear-gradient(135deg, #00f3ff, #0072ff)", border: "none", borderRadius: "10px", color: "#fff", cursor: "pointer", fontWeight: 'bold' },
  list: { padding: "15px" },
  row: { background: "rgba(255, 255, 255, 0.03)", padding: "12px", borderRadius: "12px", display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: 'center' },
  actionBtn: { background: "rgba(0, 243, 255, 0.1)", color: "#00f3ff", border: "1px solid #00f3ff", padding: "5px 10px", borderRadius: "8px", cursor: "pointer" },
  deselect: { background: "rgba(255, 69, 58, 0.15)", color: "#ff453a", border: "none", padding: "4px 10px", borderRadius: "8px", cursor: "pointer" },
  uploadArea: { border: "2px dashed #00f3ff", padding: "40px 20px", borderRadius: "24px", color: "#00f3ff", cursor: "pointer", textAlign: "center", width: "80%" },
  loginBox: { height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" },
  input: { background: "rgba(0, 0, 0, 0.4)", border: "1px solid #00f3ff", padding: "16px", borderRadius: "16px", color: "#fff", textAlign: "center", fontSize: "1.2rem", width: "80%", marginBottom: "15px" },
  empty: { textAlign: 'center', opacity: 0.4, padding: '20px' }
};

export default App;