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
    themeToggle.innerHTML = theme === 'light' ? '<i class="bi bi-moon-stars-fill"></i>' : '<i class="bi bi-sun-fill"></i>';
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
    let count = 0;
    
    statusList.forEach(pc => {
        if (!activePCNames.has(pc.name) && pc.status === 'inactive') {
            const card = createInactivePCCard(pc);
            inactiveContainer.appendChild(card);
            count++;
        }
    });
    
    const inactiveCount = document.getElementById('inactive-count');
    if (inactiveCount) inactiveCount.innerText = count;
    
    // Show empty state if no inactive PCs
    if (inactiveContainer.children.length === 0) {
        inactiveContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 30px;">No inactive PCs</div>';
    }
}

function createInactivePCCard(pc) {
    const card = document.createElement('div');
    card.className = 'card inactive-card';
    
    const lastSeenDate = pc.lastSeen ? new Date(pc.lastSeen).toLocaleString() : 'Never';
    const screenshotPath = pc.lastScreenshot ? `/screenshots/${pc.lastScreenshot}?t=${Date.now()}` : '';
    
    card.innerHTML = `
        <div class="card-header">
            <div class="pc-info">
                <div class="pc-name">${pc.name}</div>
                <div class="pc-status-label"><div class="dot"></div> Offline</div>
            </div>
        </div>
        
        <div class="card-stats">
            <div class="stat-item" style="grid-column: span 2;">
                <div class="stat-label">Last Seen</div>
                <div class="stat-value">${lastSeenDate}</div>
            </div>
        </div>

        <div class="screenshot-container" onclick="openLightboxFromCard('${pc.name}')">
            ${screenshotPath ? `<img id="inactive-img-${pc.name}" src="${screenshotPath}" alt="Last screenshot">` : `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-size:0.8rem;">No Screenshot</div>`}
            <div class="screenshot-overlay"><i class="bi bi-zoom-in"></i> View Last Capture</div>
        </div>

        <div class="card-actions">
            ${screenshotPath ? `
                <button class="btn-action primary" style="grid-column: span 2;" id="downloadBtn-${pc.name}">
                    <i class="bi bi-download"></i> Download Last Capture
                </button>
            ` : ''}
        </div>
    `;
    
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
        
        const activeCount = document.getElementById('active-count');
        if (activeCount) activeCount.innerText = data.pcs.length;

        if (activeContainer.children.length === 0) {
            activeContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 30px;">No active PCs</div>';
        }
        
        displayInactivePCs();
    }

    if (data.type === "STATUS_UPDATE") {
        const timerEl = document.getElementById(`timer-${data.pc_name}`);
        const uptimeEl = document.getElementById(`uptime-${data.pc_name}`);
        const menuContainer = document.getElementById(`menu-container-${data.pc_name}`);
        if (timerEl) timerEl.innerText = data.countdown;
        if (uptimeEl) uptimeEl.innerText = data.uptime;
        // In the new UI, the menu is always there but we can hide/show the locked status if needed
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
        <div class="card-header">
            <div class="pc-info">
                <div class="pc-name">${pc.name}</div>
                <div class="pc-status-label"><div class="dot"></div> Online</div>
            </div>
            <div class="card-dropdown">
                <button class="dropdown-toggle" onclick="toggleMenu('${pc.name}', event)"><i class="bi bi-three-dots-vertical"></i></button>
                <div class="menu-content" id="menu-${pc.name}">
                    <button onclick="cmd('${pc.name}', 'SCREENSHOT')"><i class="bi bi-camera"></i> Refresh Screenshot</button>
                    <button onclick="openMsgModal('${pc.name}')"><i class="bi bi-chat-dots"></i> Send Message</button>
                    <button onclick="openNavModal('${pc.name}')"><i class="bi bi-globe"></i> Navigate URL</button>
                    <div style="height:1px; background:var(--border); margin:4px 0;"></div>
                    <button onclick="commitBypass('${pc.name}')" style="color: var(--warning); display: ${pc.isLocked ? 'flex' : 'none'};"><i class="bi bi-unlock"></i> Bypass Curfew</button>
                    <button onclick="confirmPower('${pc.name}', 'RESTART')" class="danger-text"><i class="bi bi-arrow-clockwise"></i> Restart PC</button>
                    <button onclick="confirmPower('${pc.name}', 'SHUTDOWN')" class="danger-text"><i class="bi bi-power"></i> Shutdown PC</button>
                </div>
            </div>
        </div>

        <div class="card-stats">
            <div class="stat-item">
                <div class="stat-label">AFK Timer</div>
                <div class="stat-value countdown" id="timer-${pc.name}">${pc.countdown}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">PC Uptime</div>
                <div class="stat-value uptime" id="uptime-${pc.name}">${pc.uptime || '-'}</div>
            </div>
            <div class="stat-item" style="grid-column: span 2; border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px;">
                <div class="stat-label">Last Sync</div>
                <div class="stat-value" style="font-size: 0.75rem;"><i class="bi bi-clock"></i> <span id="date-${pc.name}">${pc.lastDate}</span> | <span id="time-${pc.name}">${pc.lastTime}</span></div>
            </div>
        </div>

        <div class="screenshot-container" onclick="openLightboxFromCard('${pc.name}')">
            <img id="img-${pc.name}" src="${imgSrc || 'https://via.placeholder.com/320x180?text=No+Capture'}">
            <div class="screenshot-overlay"><i class="bi bi-zoom-in"></i> View Screen</div>
        </div>

        <div class="card-actions">
            <button class="btn-action primary" onclick="cmd('${pc.name}', 'SCREENSHOT')"><i class="bi bi-camera"></i> Refresh</button>
            <button class="btn-action" onclick="openMsgModal('${pc.name}')"><i class="bi bi-chat-dots"></i> Message</button>
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
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
        btn.innerText = "Cooling 5s";
        btn.disabled = true;
    });

    setTimeout(() => {
        validButtons.forEach(btn => {
            if (!btn) return;
            btn.disabled = false;
            if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
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
function toggleMenu(pc, event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById(`menu-${pc}`);
    const isShowing = menu.classList.contains('show');
    
    // Close all other menus
    document.querySelectorAll('.menu-content').forEach(m => m.classList.remove('show'));
    
    if (!isShowing) {
        menu.classList.add('show');
    }
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
    title.innerHTML = `<i class="bi bi-image"></i> Screenshot: ${pc}`;
    lightbox.classList.add('active');
    
    document.getElementById('downloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href = currentLightboxSrc;
        a.download = `${pc}_Screenshot.jpg`;
        a.click();
    };
}

window.onclick = function(event) {
    if (!event.target.matches('.dropdown-toggle') && !event.target.closest('.dropdown-toggle')) {
        document.querySelectorAll('.menu-content').forEach(m => m.classList.remove('show'));
    }
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
