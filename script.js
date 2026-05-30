/* ===========================================
   AZEU DASHBOARD — CLIENT SCRIPT
   WebSocket events & emitters are UNCHANGED.
   Only UI helpers and rendering are enhanced.
   =========================================== */

const ws = new WebSocket(`ws://${window.location.host}`);
const activeContainer   = document.getElementById('active-container') || document.getElementById('container');
const inactiveContainer = document.getElementById('inactive-container');

let currentTargetPC   = "";
let currentLightboxPC = "";
let currentLightboxSrc = "";
let activePCs = [];
let currentSortField = 'name';
let currentSortOrder = 'asc';
const pcStatusMap = new Map(); // Track active/inactive status
const COOLDOWN_MS = 5000;
const themeToggle = document.getElementById('themeToggle');

/* ───────────────────────────────────────────
   THEME
─────────────────────────────────────────── */

function updateThemeToggle(theme) {
    if (!themeToggle) return;
    themeToggle.innerHTML = theme === 'light'
        ? '<i class="bi bi-moon-stars-fill"></i>'
        : '<i class="bi bi-sun-fill"></i>';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeToggle(theme);
}

const savedTheme  = localStorage.getItem('theme');
const initialTheme = savedTheme === 'light' ? 'light' : 'dark';
setTheme(initialTheme);

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
}

/* ───────────────────────────────────────────
   MOBILE HAMBURGER MENU
─────────────────────────────────────────── */

const hamburgerBtn  = document.getElementById('hamburgerBtn');
const sidebar       = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('open');
    if (hamburgerBtn) hamburgerBtn.classList.add('active');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('open');
    if (hamburgerBtn) hamburgerBtn.classList.remove('active');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

function toggleSidebar() {
    if (sidebar && sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);

// Auto-close sidebar when a nav action is clicked on mobile
if (sidebar) {
    sidebar.querySelectorAll('.nav-item, .nav-btn').forEach(el => {
        el.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });
}

// Close sidebar on window resize past mobile breakpoint
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        closeSidebar();
    }
});

/* ───────────────────────────────────────────
   MANILA TIME DISPLAY
─────────────────────────────────────────── */
function updateManilaTime() {
    const timeSpan = document.getElementById('manila-time');
    if (!timeSpan) return;

    const options = {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    };
    
    try {
        const now = new Date();
        const timeString = new Intl.DateTimeFormat('en-US', options).format(now);
        timeSpan.textContent = `${timeString} • Manila`;
    } catch (err) {
        console.error('Error formatting Manila time:', err);
    }
}

updateManilaTime();
setInterval(updateManilaTime, 1000);

/* ───────────────────────────────────────────
   TOAST NOTIFICATIONS  (UI-only helper)
─────────────────────────────────────────── */

const TOAST_ICONS = {
    success: 'bi bi-check-circle-fill',
    error:   'bi bi-x-circle-fill',
    info:    'bi bi-info-circle-fill',
    warning: 'bi bi-exclamation-triangle-fill',
};

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

/* ───────────────────────────────────────────
   PC STATUS DATABASE  (unchanged logic)
─────────────────────────────────────────── */

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

async function displayInactivePCs() {
    if (!inactiveContainer) return;
    const statusList  = await loadPCStatusFromDB();
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

    if (inactiveContainer.children.length === 0) {
        inactiveContainer.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-pc-display"></i>
                <p>No inactive PCs</p>
            </div>`;
    }
}

function createInactivePCCard(pc) {
    const card = document.createElement('div');
    card.className = 'card inactive-card';

    const lastSeenDate  = pc.lastSeen ? new Date(pc.lastSeen).toLocaleString() : 'Never';
    const screenshotPath = pc.lastScreenshot
        ? `/screenshots/${pc.lastScreenshot}?t=${Date.now()}`
        : '';

    card.innerHTML = `
        <div class="card-header">
            <div class="pc-info">
                <div class="pc-name">${pc.name}</div>
                <div class="pc-status-label"><div class="dot"></div> Offline</div>
            </div>
        </div>

        <div class="card-stats">
            <div class="stat-item stat-span">
                <div class="stat-label">Last Seen</div>
                <div class="stat-value">${lastSeenDate}</div>
            </div>
        </div>

        <div class="screenshot-container" onclick="openLightboxFromCard('${pc.name}')">
            ${screenshotPath
                ? `<img id="inactive-img-${pc.name}" src="${screenshotPath}" alt="Last screenshot">`
                : `<div class="empty-state" style="padding:16px;">
                       <i class="bi bi-camera-video-off" style="font-size:1.4rem;"></i>
                       <p>No Screenshot</p>
                   </div>`}
            <div class="screenshot-overlay"><i class="bi bi-zoom-in"></i> View Last Capture</div>
        </div>

        <div class="card-actions">
            ${screenshotPath
                ? `<button class="btn-action primary" style="grid-column: span 2;" id="downloadBtn-${pc.name}">
                       <i class="bi bi-download"></i> Download Last Capture
                   </button>`
                : ''}
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

/* ───────────────────────────────────────────
   WEBSOCKET  (all emitters UNCHANGED)
─────────────────────────────────────────── */

ws.onopen = () => ws.send(JSON.stringify({ type: "DASHBOARD_LOGIN" }));

ws.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.type === "PC_LIST") {
        pcStatusMap.clear();
        data.pcs.forEach(pc => {
            pcStatusMap.set(pc.name, { isActive: true, lastScreenshot: pc.fileName });
        });
        activePCs = data.pcs;
        renderActivePCs();
        displayInactivePCs();
    }

    if (data.type === "STATUS_UPDATE") {
        const pcObj = activePCs.find(p => p.name === data.pc_name);
        if (pcObj) {
            pcObj.countdown = data.countdown;
            pcObj.uptime = data.uptime;
            pcObj.isLocked = data.isLocked;
            if (data.lastDate) pcObj.lastDate = data.lastDate;
            if (data.lastTime) pcObj.lastTime = data.lastTime;
        }

        const timerEl = document.getElementById(`timer-${data.pc_name}`);
        const uptimeEl = document.getElementById(`uptime-${data.pc_name}`);
        if (timerEl)  timerEl.innerText  = data.countdown;
        if (uptimeEl) uptimeEl.innerText = data.uptime;

        const dateEl = document.getElementById(`date-${data.pc_name}`);
        const timeEl = document.getElementById(`time-${data.pc_name}`);
        if (dateEl && data.lastDate) dateEl.innerText = data.lastDate;
        if (timeEl && data.lastTime) timeEl.innerText = data.lastTime;
    }

    if (data.type === "SCREENSHOT_DATA") {
        const pcObj = activePCs.find(p => p.name === data.pc_name);
        if (pcObj) {
            if (data.lastDate) pcObj.lastDate = data.lastDate;
            if (data.lastTime) pcObj.lastTime = data.lastTime;
            pcObj.fileName = data.image.split('?')[0].split('/').pop();
        }

        const img = document.getElementById(`img-${data.pc_name}`);
        if (img) {
            img.src = data.image;
            if (pcStatusMap.has(data.pc_name)) {
                pcStatusMap.get(data.pc_name).lastScreenshot = data.image;
            }
        }

        const dateEl = document.getElementById(`date-${data.pc_name}`);
        const timeEl = document.getElementById(`time-${data.pc_name}`);
        if (dateEl && data.lastDate) dateEl.innerText = data.lastDate;
        if (timeEl && data.lastTime) timeEl.innerText = data.lastTime;

        if (currentLightboxPC === data.pc_name &&
            document.getElementById('lightbox').classList.contains('active')) {
            const lightboxImg = document.getElementById('lightboxImg');
            const downloadBtn = document.getElementById('downloadBtn');
            lightboxImg.src  = data.image;
            currentLightboxSrc = data.image;
            if (downloadBtn) {
                downloadBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href      = currentLightboxSrc;
                    a.download  = `${currentLightboxPC}_Screenshot.jpg`;
                    a.click();
                };
            }
        }
    }
};

/* ───────────────────────────────────────────
   SORTING AND RENDERING SYSTEM
─────────────────────────────────────────── */

function parseTimeToSeconds(timeStr) {
    if (!timeStr || timeStr === '-' || timeStr.toLowerCase().includes('connecting')) return 0;
    
    if (timeStr.includes('d') || timeStr.includes('h') || timeStr.includes('m') || timeStr.includes('s')) {
        let totalSec = 0;
        const dayMatch = timeStr.match(/(\d+)\s*d/);
        const hourMatch = timeStr.match(/(\d+)\s*h/);
        const minMatch = timeStr.match(/(\d+)\s*m/);
        const secMatch = timeStr.match(/(\d+)\s*s/);
        
        if (dayMatch) totalSec += parseInt(dayMatch[1]) * 86400;
        if (hourMatch) totalSec += parseInt(hourMatch[1]) * 3600;
        if (minMatch) totalSec += parseInt(minMatch[1]) * 60;
        if (secMatch) totalSec += parseInt(secMatch[1]);
        return totalSec;
    }
    
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    
    const num = parseFloat(timeStr.replace(/[^\d.]/g, ''));
    return isNaN(num) ? 0 : num;
}

function parseLastSync(dateStr, timeStr) {
    if (!dateStr || dateStr === '-' || !timeStr || timeStr === '-') return new Date(0);
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const formattedDate = `${parts[2]}-${parts[0]}-${parts[1]}`;
        return new Date(`${formattedDate} ${timeStr}`);
    }
    return new Date(0);
}

function sortPCs(pcs, field, order) {
    const sorted = [...pcs];
    const isAsc = order === 'asc';
    
    sorted.sort((a, b) => {
        let valA, valB;
        
        if (field === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
            return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (field === 'uptime') {
            valA = parseTimeToSeconds(a.uptime);
            valB = parseTimeToSeconds(b.uptime);
        } else if (field === 'afk') {
            valA = parseTimeToSeconds(a.countdown);
            valB = parseTimeToSeconds(b.countdown);
        } else if (field === 'sync') {
            valA = parseLastSync(a.lastDate, a.lastTime).getTime();
            valB = parseLastSync(b.lastDate, b.lastTime).getTime();
        }
        
        if (valA === valB) return 0;
        return isAsc ? (valA - valB) : (valB - valA);
    });
    
    return sorted;
}

function renderActivePCs() {
    if (!activeContainer) return;
    
    const searchInput = document.getElementById('pc-search');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const filtered = activePCs.filter(pc => !query || pc.name.toLowerCase().includes(query));
    const sorted = sortPCs(filtered, currentSortField, currentSortOrder);
    
    activeContainer.innerHTML = '';
    
    sorted.forEach(pc => {
        const card = createPCCard(pc);
        activeContainer.appendChild(card);
    });
    
    const activeCount = document.getElementById('active-count');
    if (activeCount) activeCount.innerText = sorted.length;
    
    if (sorted.length === 0) {
        activeContainer.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-wifi-off"></i>
                <p>${query ? 'No matching PCs found' : 'No active PCs connected'}</p>
            </div>`;
    }
}

function toggleSortMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('sortMenu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

function setSort(field, order) {
    currentSortField = field;
    currentSortOrder = order;
    
    document.querySelectorAll('.sort-opt').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`sort-opt-${field}-${order}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    const menu = document.getElementById('sortMenu');
    if (menu) menu.classList.remove('show');
    
    renderActivePCs();
}

/* ───────────────────────────────────────────
   CARD RENDERING
─────────────────────────────────────────── */

function createPCCard(pc) {
    const card   = document.createElement('div');
    card.id      = `pc-${pc.name}`;
    card.className = 'card';
    const imgSrc = pc.fileName ? `/screenshots/${pc.fileName}?t=${Date.now()}` : '';

    card.innerHTML = `
        <div class="card-header">
            <div class="pc-info">
                <div class="pc-name">${pc.name}</div>
                <div class="pc-status-label"><div class="dot"></div> Online</div>
            </div>
            <div class="card-dropdown">
                <button class="dropdown-toggle" onclick="toggleMenu('${pc.name}', event)">
                    <i class="bi bi-three-dots-vertical"></i>
                </button>
                <div class="menu-content" id="menu-${pc.name}">
                    <button class="danger-text" onclick="confirmPower('${pc.name}', 'RESTART')">
                        <i class="bi bi-arrow-clockwise"></i> Restart PC
                    </button>
                    <button class="danger-text" onclick="confirmPower('${pc.name}', 'SHUTDOWN')">
                        <i class="bi bi-power"></i> Shutdown PC
                    </button>
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
            <div class="stat-item stat-span stat-divider">
                <div class="stat-label">Last Sync</div>
                <div class="stat-value" style="font-size: 0.74rem;">
                    <i class="bi bi-clock" style="opacity:0.6;"></i>
                    <span id="date-${pc.name}">${pc.lastDate}</span>
                    &nbsp;|&nbsp;
                    <span id="time-${pc.name}">${pc.lastTime}</span>
                </div>
            </div>
        </div>

        <div class="screenshot-container" onclick="openLightboxFromCard('${pc.name}')">
            <img id="img-${pc.name}" src="${imgSrc || 'https://via.placeholder.com/320x180/0c1627/3b82f6?text=No+Capture'}">
            <div class="screenshot-overlay"><i class="bi bi-zoom-in"></i> View Screen</div>
        </div>

        <div class="card-actions">
            ${pc.isLocked ? `
            <button class="btn-action warning-bg-solid" onclick="commitBypass('${pc.name}')" style="grid-column: span 3; margin-bottom: 2px;">
                <i class="bi bi-unlock"></i> Bypass Curfew
            </button>
            ` : ''}
            <button class="btn-action primary" onclick="cmd('${pc.name}', 'SCREENSHOT')">
                <i class="bi bi-camera"></i> Refresh
            </button>
            <button class="btn-action" onclick="openMsgModal('${pc.name}')">
                <i class="bi bi-chat-dots"></i> Message
            </button>
            <button class="btn-action" onclick="openNavModal('${pc.name}')">
                <i class="bi bi-globe"></i> Navigate
            </button>
        </div>
    `;

    return card;
}

/* ───────────────────────────────────────────
   COMMANDS  (emitters UNCHANGED)
─────────────────────────────────────────── */

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
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Cooling 5s';
        btn.disabled  = true;
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

/* ───────────────────────────────────────────
   BROADCAST LOGIC  (emitters UNCHANGED)
─────────────────────────────────────────── */

/* ───────────────────────────────────────────
   MODERN CONFIRM DIALOG SYSTEM
─────────────────────────────────────────── */
let activeConfirmPromise = null;

function showConfirmModal(title, message, isDanger = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const messageEl = document.getElementById('confirmModalMessage');
        const confirmBtn = document.getElementById('confirmModalBtn');
        const cancelBtn = document.getElementById('confirmModalCancelBtn');

        if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
            resolve(confirm(message));
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;

        if (isDanger) {
            confirmBtn.className = 'btn-action danger-bg-solid';
            confirmBtn.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Confirm';
        } else {
            confirmBtn.className = 'btn-action primary';
            confirmBtn.innerHTML = 'Confirm';
        }

        modal.style.display = 'flex';
        confirmBtn.focus();

        const cleanup = (result) => {
            modal.style.display = 'none';
            activeConfirmPromise = null;
            resolve(result);
        };

        confirmBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);

        activeConfirmPromise = {
            resolve: cleanup
        };
    });
}

/* ───────────────────────────────────────────
   BROADCAST LOGIC  (emitters UNCHANGED)
─────────────────────────────────────────── */

async function confirmGlobalPower(action) {
    const isDanger = true;
    const confirmed = await showConfirmModal(
        `⚠️ Trigger Global ${action}`,
        `Are you sure you want to trigger a system ${action.toLowerCase()} on ALL connected PCs? This action cannot be undone.`,
        isDanger
    );
    
    if (confirmed) {
        cmd('ALL', action);
        const targetId = action === 'RESTART' ? 'global-restart' : 'global-shutdown';
        applyCooldown([document.getElementById(targetId)]);
        showToast(`${action} sent to all PCs`, 'warning');
    }
}

async function confirmGlobalRefresh() {
    const confirmed = await showConfirmModal(
        "Refresh All Screenshots",
        "Request new screenshots from all connected PCs?"
    );
    
    if (confirmed) {
        cmd('ALL', 'SCREENSHOT');
        showToast('Screenshot refresh requested for all PCs', 'info');
    }
}

async function commitGlobalBypass() {
    const confirmed = await showConfirmModal(
        "Unlock All PCs",
        "Bypass curfew and unlock all currently locked PCs?"
    );
    
    if (confirmed) {
        cmd('ALL', 'BYPASS_CURFEW');
        showToast('Curfew bypass sent to all locked PCs', 'success');
    }
}

/* ───────────────────────────────────────────
   INDIVIDUAL LOGIC  (emitters UNCHANGED)
─────────────────────────────────────────── */

function toggleMenu(pc, event) {
    if (event) event.stopPropagation();
    const menu     = document.getElementById(`menu-${pc}`);
    const isShowing = menu.classList.contains('show');

    document.querySelectorAll('.menu-content').forEach(m => m.classList.remove('show'));

    if (!isShowing) menu.classList.add('show');
}

async function commitBypass(pc) {
    const confirmed = await showConfirmModal(
        `Unlock ${pc}`,
        `Unlock and bypass curfew restrictions on remote machine ${pc}?`
    );
    
    if (confirmed) {
        cmd(pc, 'BYPASS_CURFEW');
        showToast(`Bypass sent to ${pc}`, 'success');
    }
}

async function confirmPower(pc, action) {
    const isDanger = action === 'SHUTDOWN' || action === 'RESTART';
    const confirmed = await showConfirmModal(
        `${action} ${pc}`,
        `Are you sure you want to trigger a ${action.toLowerCase()} on ${pc}?`,
        isDanger
    );
    
    if (confirmed) {
        cmd(pc, action);
        const targetId = action === 'RESTART' ? `restart-${pc}` : `shutdown-${pc}`;
        applyCooldown([document.getElementById(targetId)]);
        showToast(`${action} sent to ${pc}`, 'warning');
    }
}

/* ───────────────────────────────────────────
   MODAL LOGIC  (emitters UNCHANGED)
─────────────────────────────────────────── */

function openMsgModal(pc) {
    currentTargetPC = pc;
    document.getElementById('msgTargetName').innerHTML =
        `<i class="bi bi-chat-dots"></i> ${pc === 'ALL' ? 'Broadcast Message to ALL' : `Message to: ${pc}`}`;
    document.getElementById('msgInput').value = "";
    document.getElementById('msgModal').style.display = 'flex';
    document.getElementById('msgInput').focus();
}

function openNavModal(pc) {
    currentTargetPC = pc;
    document.getElementById('navTargetName').innerHTML =
        `<i class="bi bi-globe"></i> ${pc === 'ALL' ? 'Navigate ALL PCs to URL' : `Navigate PC: ${pc}`}`;
    document.getElementById('navInput').value = "https://";
    document.getElementById('navModal').style.display = 'flex';
    document.getElementById('navInput').focus();
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function commitSendMessage() {
    const text = document.getElementById('msgInput').value;
    if (text.trim() === "") return;
    cmd(currentTargetPC, 'MESSAGE', text);
    showToast(`Message sent to ${currentTargetPC === 'ALL' ? 'all PCs' : currentTargetPC}`, 'success');
    closeModal('msgModal');
}

function commitNavigate() {
    const url = document.getElementById('navInput').value;
    if (url.trim() === "" || url === "https://") return;
    cmd(currentTargetPC, 'NAVIGATE', url);
    showToast(`Navigate command sent to ${currentTargetPC === 'ALL' ? 'all PCs' : currentTargetPC}`, 'info');
    closeModal('navModal');
}

/* ───────────────────────────────────────────
   LIGHTBOX  (unchanged logic)
─────────────────────────────────────────── */

function openLightboxFromCard(pc) {
    const img = document.getElementById(`img-${pc}`) || document.getElementById(`inactive-img-${pc}`);
    if (!img || !img.src || img.src.includes('placeholder')) return;
    openLightbox(pc, img.src);
}

function openLightbox(pc, src) {
    if (!src || src.includes('placeholder')) return;
    const lightbox   = document.getElementById('lightbox');
    const img        = document.getElementById('lightboxImg');
    const title      = document.getElementById('lightboxTitle');

    currentLightboxPC  = pc;
    currentLightboxSrc = src;
    img.src  = src;
    title.innerHTML = `<i class="bi bi-image"></i> Screenshot: ${pc}`;
    lightbox.classList.add('active');

    document.getElementById('downloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href     = currentLightboxSrc;
        a.download = `${pc}_Screenshot.jpg`;
        a.click();
    };
}

/* ───────────────────────────────────────────
   SEARCH FILTER  (UI-only, no WS changes)
─────────────────────────────────────────── */

const searchInput = document.getElementById('pc-search');
if (searchInput) {
    searchInput.addEventListener('input', () => {
        renderActivePCs();
    });
}

/* ───────────────────────────────────────────
   GLOBAL CLICK & KEYDOWN
─────────────────────────────────────────── */

window.onclick = function(event) {
    if (!event.target.matches('.dropdown-toggle') && !event.target.closest('.dropdown-toggle')) {
        document.querySelectorAll('.menu-content').forEach(m => m.classList.remove('show'));
    }

    if (!event.target.matches('#sortMenuBtn') && !event.target.closest('#sortMenuBtn')) {
        const sortMenu = document.getElementById('sortMenu');
        if (sortMenu) sortMenu.classList.remove('show');
    }

    // Modal background auto-close
    const overlays = ['msgModal', 'navModal', 'customConfirmModal'];
    overlays.forEach(id => {
        const modal = document.getElementById(id);
        if (modal && event.target === modal) {
            closeModal(id);
            if (id === 'customConfirmModal' && activeConfirmPromise) {
                activeConfirmPromise.resolve(false);
            }
        }
    });
};

// Auto-close lightbox when clicking the overlay background
const lightboxEl = document.getElementById('lightbox');
if (lightboxEl) {
    lightboxEl.addEventListener('click', (e) => {
        if (e.target === lightboxEl) {
            lightboxEl.classList.remove('active');
            currentLightboxPC = "";
            currentLightboxSrc = "";
        }
    });
}

window.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        closeSidebar();
        closeModal('msgModal');
        closeModal('navModal');
        closeModal('customConfirmModal');
        if (activeConfirmPromise) {
            activeConfirmPromise.resolve(false);
        }
        document.getElementById('lightbox').classList.remove('active');
        currentLightboxPC  = "";
        currentLightboxSrc = "";
    }

    if (e.key === "Enter") {
        // 1. Custom Confirm Modal Enter Key
        const confirmModal = document.getElementById('customConfirmModal');
        if (confirmModal && confirmModal.style.display === 'flex' && activeConfirmPromise) {
            e.preventDefault();
            activeConfirmPromise.resolve(true);
        }

        // 2. Message Modal Enter Key (except Shift+Enter)
        const msgModal = document.getElementById('msgModal');
        if (msgModal && msgModal.style.display === 'flex') {
            const msgInput = document.getElementById('msgInput');
            if (document.activeElement === msgInput && !e.shiftKey) {
                e.preventDefault();
                commitSendMessage();
            }
        }

        // 3. Navigate Modal Enter Key
        const navModal = document.getElementById('navModal');
        if (navModal && navModal.style.display === 'flex') {
            const navInput = document.getElementById('navInput');
            if (document.activeElement === navInput) {
                e.preventDefault();
                commitNavigate();
            }
        }
    }
});

function logout() {
    localStorage.removeItem('azeu_dashboard_auth');
    window.location.replace('auth.html');
}
