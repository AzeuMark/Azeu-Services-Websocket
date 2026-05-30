const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const SECURITY_TOKEN = "azeu_websocket_token";
const PC_STATUS_FILE = path.join(__dirname, 'pcs-status.json');

const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

let connectedPCs = new Map();

// --- PC STATUS MANAGEMENT ---

function loadPCStatus() {
    try {
        if (fs.existsSync(PC_STATUS_FILE)) {
            return JSON.parse(fs.readFileSync(PC_STATUS_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading PC status:', err);
    }
    return { pcs: [], lastUpdated: new Date().toISOString() };
}

function savePCStatus(statusData) {
    try {
        statusData.lastUpdated = new Date().toISOString();
        fs.writeFileSync(PC_STATUS_FILE, JSON.stringify(statusData, null, 2));
    } catch (err) {
        console.error('Error saving PC status:', err);
    }
}

function updatePCStatus(pcName, status, options = {}) {
    const statusData = loadPCStatus();
    let pcEntry = statusData.pcs.find(p => p.name === pcName);
    
    if (!pcEntry) {
        pcEntry = { name: pcName, status: 'inactive', lastScreenshot: null, lastSeen: null, connected: false };
        statusData.pcs.push(pcEntry);
    }
    
    pcEntry.status = status;
    pcEntry.lastSeen = new Date().toISOString();
    pcEntry.connected = (status === 'active');
    if (options.lastScreenshot) {
        pcEntry.lastScreenshot = options.lastScreenshot;
    }
    
    savePCStatus(statusData);
}

// --- MODULAR FUNCTIONS ---

function sendPCCommand(pcName, command, content = "") {
    const pc = connectedPCs.get(pcName);
    if (pc && pc.socket.readyState === WebSocket.OPEN) {
        pc.socket.send(JSON.stringify({ command, content }));
        return true;
    }
    return false;
}

function getManilaDateTime() {
    const now = new Date();
    
    // Date part: MM-DD-YYYY
    const dStr = now.toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '-');
    
    // Time part: hh:mm:ss AM/PM
    const tStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    
    return { date: dStr, time: tStr };
}

// --- FILE STORAGE LOGIC ---

function handleScreenshotStorage(pcName, base64Image, date, time) {
    const safeDate = date.replace(/[/\\?%*:|"<>]/g, '-');
    const safeTime = time.replace(/[/\\?%*:|"<>]/g, '_');
    const newFileName = `${pcName}-${safeDate}-(${safeTime}).jpg`;
    const filePath = path.join(screenshotDir, newFileName);

    try {
        const files = fs.readdirSync(screenshotDir);
        files.forEach(file => {
            if (file.startsWith(pcName + "-")) fs.unlinkSync(path.join(screenshotDir, file));
        });
        const base64Data = base64Image.replace(/^data:image\/jpeg;base64,/, "");
        fs.writeFileSync(filePath, base64Data, 'base64');
        
        // Update PC status with screenshot
        updatePCStatus(pcName, 'active', { lastScreenshot: newFileName });
        
        return newFileName;
    } catch (err) { return null; }
}

function getExistingScreenshotInfo(pcName) {
    try {
        const files = fs.readdirSync(screenshotDir);
        const pcFile = files.find(f => f.startsWith(pcName + "-"));
        if (pcFile) {
            const match = pcFile.match(/-(.*?)-\((.*?)\)\.jpg$/);
            if (match) return { fileName: pcFile, date: match[1], time: match[2].replace(/_/g, ':') };
        }
    } catch (err) {}
    return { fileName: null, date: "-", time: "-" };
}

function findLatestScreenshot(pcName) {
    try {
        const files = fs.readdirSync(screenshotDir);
        const pcFiles = files.filter(f => f.startsWith(pcName + "-") && f.endsWith('.jpg'));
        if (pcFiles.length > 0) {
            const fileStats = pcFiles.map(f => ({
                name: f,
                time: fs.statSync(path.join(screenshotDir, f)).mtime.getTime()
            })).sort((a, b) => b.time - a.time);
            return fileStats[0].name;
        }
    } catch (err) {
        console.error(`Error finding screenshot for ${pcName}:`, err);
    }
    return null;
}

function requestScreenshotIfMissing(pcName) {
    const pc = connectedPCs.get(pcName);
    if (!pc) return false;
    if (pc.fileName || pc.screenshotPending) return false;

    if (sendPCCommand(pcName, "SCREENSHOT")) {
        pc.screenshotPending = true;
        return true;
    }

    return false;
}

function requestMissingScreenshots() {
    connectedPCs.forEach((pc, name) => {
        if (pc && !pc.fileName) {
            requestScreenshotIfMissing(name);
        }
    });
}

// --- SERVER SETUP ---

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use('/screenshots', express.static(screenshotDir));

// API endpoint to get PC status
app.get('/api/pcs-status', (req, res) => {
    try {
        const statusData = loadPCStatus();
        // Enrich with latest screenshots from folder for each PC
        statusData.pcs.forEach(pc => {
            if (!pc.lastScreenshot) {
                const found = findLatestScreenshot(pc.name);
                if (found) {
                    pc.lastScreenshot = found;
                }
            }
        });
        res.json(statusData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load PC status' });
    }
});

wss.on('connection', (ws) => {
    let pcName = "Unknown";
    let isDashboard = false;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case "IDENTITY":
                    if (data.token !== SECURITY_TOKEN) { ws.terminate(); return; }
                    pcName = data.pc_name;
                    const saved = getExistingScreenshotInfo(pcName);
                    const connManila = getManilaDateTime();
                    connectedPCs.set(pcName, { 
                        socket: ws, 
                        countdown: "Connecting...", 
                        uptime: "-", 
                        isLocked: false,
                        lastDate: saved.fileName ? saved.date : connManila.date, 
                        lastTime: saved.fileName ? saved.time : connManila.time, 
                        fileName: saved.fileName,
                        screenshotPending: false
                    });
                    updatePCStatus(pcName, 'active', { lastScreenshot: saved.fileName || null });
                    requestScreenshotIfMissing(pcName);
                    broadcastToDashboards({ type: "PC_LIST", pcs: getDetailedPCList() });
                    break;

                case "DASHBOARD_LOGIN":
                    isDashboard = true;
                    ws.send(JSON.stringify({ type: "PC_LIST", pcs: getDetailedPCList() }));
                    requestMissingScreenshots();
                    break;

                case "STATUS_UPDATE":
                    const pc = connectedPCs.get(data.pc_name);
                    if (pc) {
                        pc.countdown = data.countdown;
                        pc.uptime = data.uptime;
                        pc.isLocked = data.isLocked;
                        
                        const statusManila = getManilaDateTime();
                        pc.lastDate = statusManila.date;
                        pc.lastTime = statusManila.time;
                        
                        // Inject into broadcast data for active dashboards
                        data.lastDate = statusManila.date;
                        data.lastTime = statusManila.time;
                    }
                    broadcastToDashboards(data);
                    break;

                case "SCREENSHOT_DATA":
                    const shotManila = getManilaDateTime();
                    const fn = handleScreenshotStorage(data.pc_name, data.image, shotManila.date, shotManila.time);
                    const cPC = connectedPCs.get(data.pc_name);
                    if (cPC) {
                        cPC.screenshotPending = false;
                        if (fn) {
                            cPC.lastDate = shotManila.date;
                            cPC.lastTime = shotManila.time;
                            cPC.fileName = fn;
                        }
                    }
                    data.image = `/screenshots/${fn}?t=${Date.now()}`;
                    data.lastDate = shotManila.date;
                    data.lastTime = shotManila.time;
                    broadcastToDashboards(data);
                    break;

                case "COMMAND":
                    // --- UPDATED COMMAND LOGIC FOR "ALL" TARGET ---
                    if (data.target_pc === "ALL") {
                        console.log(`[BROADCAST] ${data.action} to ALL PCs`);
                        connectedPCs.forEach((val, name) => {
                            // Logic check for Bypass: Only send to locked PCs
                            if (data.action === "BYPASS_CURFEW" && !val.isLocked) return;
                            
                            sendPCCommand(name, data.action, data.payload);
                        });
                    } else {
                        sendPCCommand(data.target_pc, data.action, data.payload);
                    }
                    break;
            }
        } catch (err) {}
    });

    ws.on('close', () => {
        if (!isDashboard) { 
            updatePCStatus(pcName, 'inactive');
            connectedPCs.delete(pcName); 
            broadcastToDashboards({ type: "PC_LIST", pcs: getDetailedPCList() }); 
        }
    });
});

function getDetailedPCList() {
    return Array.from(connectedPCs.entries()).map(([name, data]) => ({ 
        name, countdown: data.countdown, uptime: data.uptime, isLocked: data.isLocked,
        lastDate: data.lastDate, lastTime: data.lastTime, fileName: data.fileName 
    }));
}

function broadcastToDashboards(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

server.listen(PORT, () => {
    const interfaces = os.networkInterfaces();
    console.clear();
    console.log("AZEU REMOTE SERVER ACTIVE");
    for (const n of Object.keys(interfaces)) {
        for (const i of interfaces[n]) {
            if (i.family === 'IPv4' && !i.internal && !n.includes('vmware')) {
                console.log(`Dashboard: http://${i.address}:${PORT}`);
                console.log(`C# Link:   ws://${i.address}:${PORT}`);
            }
        }
    }
});
