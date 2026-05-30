const ws = new WebSocket(`ws://${window.location.host}`);
const activeContainer = document.getElementById('active-container') || document.getElementById('container');
const inactiveContainer = document.getElementById('inactive-container');
let currentTargetPC = "";
let currentLightboxPC = "";
let currentLightboxSrc = "";
const pcStatusMap = new Map(); // Track active/inactive status
const COOLDOWN_MS = 5000;
const themeToggle = document.getElementById('themeToggle');

function updateThemeToggle(theme) {
    if (!themeToggle) return;
    themeToggle.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeToggle(theme);
}

const savedTheme = localStorage.getItem('theme');
const initialTheme = savedTheme === 'light' ? 'light' : 'dark';
setTheme(initialTheme);

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
}

// Load PC status from JSON database
async function loadPCStatusFromDB() {
    try {
        const response = await fetch('/api/pcs-status');
        const data = await response.json();
        return data.pcs || [];
    } catch (err) {
        console.error('Failed to load PC status:', err);
        return [];
    }
}

// Display inactive PCs from database
async function displayInactivePCs() {
    if (!inactiveContainer) return;
    const statusList = await loadPCStatusFromDB();
    const activePCNames = new Set(Array.from(pcStatusMap.keys()));
    
    inactiveContainer.innerHTML = '';
    
    statusList.forEach(pc => {
        if (!activePCNames.has(pc.name) && pc.status === 'inactive') {
            const card = createInactivePCCard(pc);
            inactiveContainer.appendChild(card);
        }
    });
    
    // Show empty state if no inactive PCs
    if (inactiveContainer.children.length === 0) {
        inactiveContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 30px;">No inactive PCs</div>';
    }
}

function createInactivePCCard(pc) {
    const card = document.createElement('div');
    card.className = 'card inactive-card';
    
    const lastSeenDate = pc.lastSeen ? new Date(pc.lastSeen).toLocaleString() : 'Never';
    const screenshotPath = pc.lastScreenshot ? `/screenshots/${pc.lastScreenshot}?t=${Date.now()}` : '';
    
    card.innerHTML = `
        <div class="pc-title">${pc.name}</div>
        <div class="info-row" style="color: var(--danger);">Status: Offline</div>
        <div class="info-row">Last Seen: <span style="color: var(--text-dim);">${lastSeenDate}</span></div>
        ${screenshotPath ? `
            <div class="shot-box" onclick="openLightboxFromCard('${pc.name}')">
                <img id="inactive-img-${pc.name}" src="${screenshotPath}" alt="Last screenshot">
            </div>
            <div class="controls">
                <button class="btn-shot" style="width: 100%;" id="downloadBtn-${pc.name}">💾 Download Last Screenshot</button>
            </div>
        ` : `
            <div class="shot-box" style="background: rgba(255, 157, 111, 0.1); display: flex; align-items: center; justify-content: center;">
                <span style="color: var(--text-dim);">No screenshot available</span>
            </div>
        `}
    `;
    
    // Add download handler if screenshot exists
    if (screenshotPath) {
        setTimeout(() => {
            const downloadBtn = document.getElementById(`downloadBtn-${pc.name}`);
            if (downloadBtn) {
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = screenshotPath;
                    a.download = `${pc.name}_LastScreenshot.jpg`;
                    a.click();
                };
            }
        }, 0);
    }
    
    return card;
}

ws.onopen = () => ws.send(JSON.stringify({ type: "DASHBOARD_LOGIN" }));

ws.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "PC_LIST") {
        if (!activeContainer) return;
        activeContainer.innerHTML = '';
        pcStatusMap.clear();
        
        data.pcs.forEach(pc => {
            pcStatusMap.set(pc.name, { isActive: true, lastScreenshot: pc.fileName });
            const card = createPCCard(pc);
            activeContainer.appendChild(card);
        });
        
        // Show empty state for active if none
        if (activeContainer.children.length === 0) {
            activeContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 30px;">No active PCs</div>';
        }
        
        // Refresh inactive PCs display
        displayInactivePCs();
    }

    if (data.type === "STATUS_UPDATE") {
        const timerEl = document.getElementById(`timer-${data.pc_name}`);
        const uptimeEl = document.getElementById(`uptime-${data.pc_name}`);
        const menuContainer = document.getElementById(`menu-container-${data.pc_name}`);
        if (timerEl) timerEl.innerText = data.countdown;
        if (uptimeEl) uptimeEl.innerText = data.uptime;
        if (menuContainer) menuContainer.style.display = data.isLocked ? 'block' : 'none';
    }

    if (data.type === "SCREENSHOT_DATA") {
        const img = document.getElementById(`img-${data.pc_name}`);
        if (img) {
            img.src = data.image;
            if (pcStatusMap.has(data.pc_name)) {
                pcStatusMap.get(data.pc_name).lastScreenshot = data.image;
            }
        }

        if (currentLightboxPC === data.pc_name && document.getElementById('lightbox').classList.contains('active')) {
            const lightboxImg = document.getElementById('lightboxImg');
            const downloadBtn = document.getElementById('downloadBtn');
            lightboxImg.src = data.image;
            currentLightboxSrc = data.image;
            if (downloadBtn) {
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = currentLightboxSrc;
                    a.download = `${currentLightboxPC}_Screenshot.jpg`;
                    a.click();
                };
            }
        }
    }
};

function createPCCard(pc) {
    const card = document.createElement('div');
    card.id = `pc-${pc.name}`;
    card.className = 'card';
    const imgSrc = pc.fileName ? `/screenshots/${pc.fileName}?t=${Date.now()}` : '';

    card.innerHTML = `
        <div class="pc-menu" id="menu-container-${pc.name}" style="display: ${pc.isLocked ? 'block' : 'none'};">
            <div class="menu-dots" onclick="toggleMenu('${pc.name}')">&#8942;</div>
            <div class="menu-content" id="menu-${pc.name}">
                <button onclick="commitBypass('${pc.name}')" style="color: var(--warning);">🔓 Bypass Curfew</button>
            </div>
        </div>
        <div class="pc-title">${pc.name}</div>
        <div class="info-row">AFK Timer: <span id="timer-${pc.name}" class="countdown">${pc.countdown}</span></div>
        <div class="info-row">PC Uptime: <span id="uptime-${pc.name}" class="uptime">${pc.uptime || '-'}</span></div>
        <div class="info-row">Last Sync: <span id="date-${pc.name}">${pc.lastDate}</span> | <span id="time-${pc.name}">${pc.lastTime}</span></div>
        <div class="shot-box" onclick="openLightboxFromCard('${pc.name}')">
            <img id="img-${pc.name}" src="${imgSrc || 'https://via.placeholder.com/320x180?text=No+Capture'}">
        </div>
        <div class="controls">
            <button class="btn-shot" onclick="cmd('${pc.name}', 'SCREENSHOT')">Refresh Screen</button>
            <button class="btn-nav" onclick="openNavModal('${pc.name}')">Navigate</button>
            <button class="btn-msg" onclick="openMsgModal('${pc.name}')">Send Message</button>
            <button class="btn-pwr" id="restart-${pc.name}" onclick="confirmPower('${pc.name}', 'RESTART')">Restart</button>
            <button class="btn-pwr" id="shutdown-${pc.name}" onclick="confirmPower('${pc.name}', 'SHUTDOWN')">Shutdown</button>
        </div>
    `;
    return card;
}

function cmd(pc, action, payload = "") {
    ws.send(JSON.stringify({ type: "COMMAND", target_pc: pc, action: action, payload: payload }));
}

function applyCooldown(buttons) {
    const validButtons = buttons.filter(btn => btn);
    if (validButtons.length === 0) return;

    validButtons.forEach(btn => {
        if (btn.dataset.cooldown === "true") return;
        btn.dataset.cooldown = "true";
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
        btn.textContent = "Cooling 5s";
        btn.disabled = true;
    });

    setTimeout(() => {
        validButtons.forEach(btn => {
            if (!btn) return;
            btn.disabled = false;
            if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
            delete btn.dataset.cooldown;
        });
    }, COOLDOWN_MS);
}

/* BROADCAST LOGIC */
function confirmGlobalPower(action) {
    if (confirm(`⚠️ DANGER: Trigger ${action} on ALL connected PCs?`)) {
        cmd('ALL', action);
        const targetId = action === 'RESTART' ? 'global-restart' : 'global-shutdown';
        applyCooldown([document.getElementById(targetId)]);
    }
}

function confirmGlobalRefresh() {
    if (confirm("Refresh screenshots on ALL connected PCs?")) {
        cmd('ALL', 'SCREENSHOT');
    }
}

function commitGlobalBypass() {
    if (confirm("Unlock ALL currently locked PCs?")) {
        cmd('ALL', 'BYPASS_CURFEW');
    }
}

/* INDIVIDUAL LOGIC */
function toggleMenu(pc) {
    const menu = document.getElementById(`menu-${pc}`);
    const isVisible = menu.style.display === 'flex';
    document.querySelectorAll('.menu-content').forEach(m => m.style.display = 'none');
    menu.style.display = isVisible ? 'none' : 'flex';
}

function commitBypass(pc) {
    if (confirm(`Remotely unlock ${pc}?`)) cmd(pc, 'BYPASS_CURFEW');
}

function confirmPower(pc, action) {
    if (confirm(`Trigger ${action} on ${pc}?`)) {
        cmd(pc, action);
        const targetId = action === 'RESTART' ? `restart-${pc}` : `shutdown-${pc}`;
        applyCooldown([document.getElementById(targetId)]);
    }
}

/* MODAL LOGIC */
function openMsgModal(pc) {
    currentTargetPC = pc;
    document.getElementById('msgTargetName').innerText = pc === 'ALL' ? "Broadcast Message to ALL" : `Message to: ${pc}`;
    document.getElementById('msgInput').value = "";
    document.getElementById('msgModal').style.display = 'flex';
    document.getElementById('msgInput').focus();
}

function openNavModal(pc) {
    currentTargetPC = pc;
    document.getElementById('navTargetName').innerText = pc === 'ALL' ? "Navigate ALL PCs to URL" : `Navigate PC: ${pc}`;
    document.getElementById('navInput').value = "https://";
    document.getElementById('navModal').style.display = 'flex';
    document.getElementById('navInput').focus();
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function commitSendMessage() {
    const text = document.getElementById('msgInput').value;
    if (text.trim() === "") return;
    cmd(currentTargetPC, 'MESSAGE', text);
    closeModal('msgModal');
}

function commitNavigate() {
    const url = document.getElementById('navInput').value;
    if (url.trim() === "" || url === "https://") return;
    cmd(currentTargetPC, 'NAVIGATE', url);
    closeModal('navModal');
}

function openLightboxFromCard(pc) {
    const img = document.getElementById(`img-${pc}`) || document.getElementById(`inactive-img-${pc}`);
    if (!img || !img.src || img.src.includes('placeholder')) return;
    openLightbox(pc, img.src);
}

function openLightbox(pc, src) {
    if (!src || src.includes('placeholder')) return;
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    const title = document.getElementById('lightboxTitle');
    
    currentLightboxPC = pc;
    currentLightboxSrc = src;
    img.src = src;
    title.textContent = `Screenshot: ${pc}`;
    lightbox.classList.add('active');
    
    document.getElementById('downloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href = currentLightboxSrc;
        a.download = `${pc}_Screenshot.jpg`;
        a.click();
    };
}

window.onclick = function(event) {
    if (!event.target.matches('.menu-dots')) document.querySelectorAll('.menu-content').forEach(m => m.style.display = 'none');
}

window.addEventListener('keydown', (e) => {
    if (e.key === "Escape") { 
        closeModal('msgModal'); 
        closeModal('navModal'); 
        document.getElementById('lightbox').classList.remove('active'); 
        currentLightboxPC = "";
        currentLightboxSrc = "";
    }
});

function cmd(pc, action, payload = "") {
    ws.send(JSON.stringify({ type: "COMMAND", target_pc: pc, action: action, payload: payload }));
}

function applyCooldown(buttons) {
    const validButtons = buttons.filter(btn => btn);
    if (validButtons.length === 0) return;

    validButtons.forEach(btn => {
        if (btn.dataset.cooldown === "true") return;
        btn.dataset.cooldown = "true";
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
        btn.textContent = "Cooling 5s";
        btn.disabled = true;
    });

    setTimeout(() => {
        validButtons.forEach(btn => {
            if (!btn) return;
            btn.disabled = false;
            if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
            delete btn.dataset.cooldown;
        });
    }, COOLDOWN_MS);
}

/* BROADCAST LOGIC */
function confirmGlobalPower(action) {
    if (confirm(`⚠️ DANGER: Trigger ${action} on ALL connected PCs?`)) {
        cmd('ALL', action);
        const targetId = action === 'RESTART' ? 'global-restart' : 'global-shutdown';
        applyCooldown([document.getElementById(targetId)]);
    }
}

function confirmGlobalRefresh() {
    if (confirm("Refresh screenshots on ALL connected PCs?")) {
        cmd('ALL', 'SCREENSHOT');
    }
}

function commitGlobalBypass() {
    if (confirm("Unlock ALL currently locked PCs?")) {
        cmd('ALL', 'BYPASS_CURFEW');
    }
}

/* INDIVIDUAL LOGIC */
function toggleMenu(pc) {
    const menu = document.getElementById(`menu-${pc}`);
    const isVisible = menu.style.display === 'flex';
    document.querySelectorAll('.menu-content').forEach(m => m.style.display = 'none');
    menu.style.display = isVisible ? 'none' : 'flex';
}

function commitBypass(pc) {
    if (confirm(`Remotely unlock ${pc}?`)) cmd(pc, 'BYPASS_CURFEW');
}

function confirmPower(pc, action) {
    if (confirm(`Trigger ${action} on ${pc}?`)) {
        cmd(pc, action);
        const targetId = action === 'RESTART' ? `restart-${pc}` : `shutdown-${pc}`;
        applyCooldown([document.getElementById(targetId)]);
    }
}

/* MODAL LOGIC */
function openMsgModal(pc) {
    currentTargetPC = pc;
    document.getElementById('msgTargetName').innerText = pc === 'ALL' ? "Broadcast Message to ALL" : `Message to: ${pc}`;
    document.getElementById('msgInput').value = "";
    document.getElementById('msgModal').style.display = 'flex';
    document.getElementById('msgInput').focus();
}

function openNavModal(pc) {
    currentTargetPC = pc;
    document.getElementById('navTargetName').innerText = pc === 'ALL' ? "Navigate ALL PCs to URL" : `Navigate PC: ${pc}`;
    document.getElementById('navInput').value = "https://";
    document.getElementById('navModal').style.display = 'flex';
    document.getElementById('navInput').focus();
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function commitSendMessage() {
    const text = document.getElementById('msgInput').value;
    if (text.trim() === "") return;
    cmd(currentTargetPC, 'MESSAGE', text);
    closeModal('msgModal');
}

function commitNavigate() {
    const url = document.getElementById('navInput').value;
    if (url.trim() === "" || url === "https://") return;
    cmd(currentTargetPC, 'NAVIGATE', url);
    closeModal('navModal');
}

