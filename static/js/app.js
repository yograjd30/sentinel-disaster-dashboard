// State
let currentUser = null;
let notifications = [];

// ── Offline/PWA Sync state & helpers ──
function getOfflineUsers() {
    const defaults = [
        { username: 'admin', password: '123', role: 'admin', id: 1 },
        { username: 'citizen', password: '123', role: 'citizen', id: 2 },
        { username: 'rescue', password: '123', role: 'rescue', id: 3 }
    ];
    const stored = localStorage.getItem('sentinel_offline_users');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            const merged = [...defaults];
            parsed.forEach(p => {
                if (!merged.some(m => m.username === p.username)) {
                    merged.push(p);
                }
            });
            return merged;
        } catch (e) {
            return defaults;
        }
    }
    return defaults;
}

function saveOfflineUser(username, password, role, id) {
    const users = getOfflineUsers();
    if (!users.some(u => u.username === username)) {
        users.push({ username, password, role, id });
        localStorage.setItem('sentinel_offline_users', JSON.stringify(users));
    }
}

// Intercept Cache API to allow reading/writing cached API data in offline mode
async function getCachedData(url) {
    if ('caches' in window) {
        try {
            const cache = await caches.open('sentinel-api-v1');
            const response = await cache.match(url);
            if (response) {
                return await response.json();
            }
        } catch (e) {
            console.error('[Offline] Error reading Cache API:', e);
        }
    }
    return null;
}

async function updateCachedData(url, data) {
    if ('caches' in window) {
        try {
            const cache = await caches.open('sentinel-api-v1');
            const response = new Response(JSON.stringify(data), {
                headers: { 'Content-Type': 'application/json' }
            });
            await cache.put(url, response);
            console.log(`[Offline] Successfully updated Cache API for ${url}`);
        } catch (e) {
            console.error('[Offline] Error writing Cache API:', e);
        }
    }
}

// Queue system for offline POST/PUT actions
function queueOfflineAction(url, method, body, friendlyName) {
    const queue = JSON.parse(localStorage.getItem('sentinel_sync_queue') || '[]');
    const id = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    queue.push({ id, url, method, body, type: 'json', friendlyName });
    localStorage.setItem('sentinel_sync_queue', JSON.stringify(queue));
    
    // Add custom offline status notification
    addNotification(`[Offline] ${friendlyName} queued for sync.`, 'warning');
}

// Function to trigger a sync of all queued offline operations
async function syncOfflineQueue() {
    if (!navigator.onLine) return;
    const queue = JSON.parse(localStorage.getItem('sentinel_sync_queue') || '[]');
    if (queue.length === 0) return;

    console.log(`[Offline Sync] Syncing ${queue.length} pending items.`);
    addNotification(`Syncing ${queue.length} offline action(s)...`, 'info');

    const remaining = [];
    let successCount = 0;

    for (const item of queue) {
        try {
            const res = await fetch(item.url, {
                method: item.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.body)
            });

            if (res.ok) {
                successCount++;
            } else {
                console.warn(`[Offline Sync] Failed to sync item:`, item, res.status);
                remaining.push(item);
            }
        } catch (err) {
            console.error(`[Offline Sync] Connection error for sync item:`, err);
            remaining.push(item);
        }
    }

    localStorage.setItem('sentinel_sync_queue', JSON.stringify(remaining));

    if (successCount > 0) {
        addNotification(`Successfully synced ${successCount} offline action(s)!`, 'success');
        fetchData(); // reload fresh server data
    }
}


// ── Mobile sidebar ──
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
}

// Clock updates (IST 12-hour format)
function updateClock() {
    const now = new Date();
    const options = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    document.getElementById('live-clock').innerText = now.toLocaleTimeString('en-US', options) + ' IST';
}
setInterval(updateClock, 1000);
updateClock();

// ── Register Modal ──
function showRegisterPanel() {
    document.getElementById('register-modal').classList.remove('hidden');
    document.getElementById('register-modal').classList.add('flex');
    lucide.createIcons();
}
function hideRegisterPanel() {
    document.getElementById('register-modal').classList.add('hidden');
    document.getElementById('register-modal').classList.remove('flex');
    document.getElementById('register-error').classList.add('hidden');
    document.getElementById('register-form').reset();
}
async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const role     = document.getElementById('reg-role').value;
    const errEl    = document.getElementById('register-error');
    const btn      = document.getElementById('reg-submit-btn');
    btn.disabled = true; btn.textContent = 'Creating...';

    if (!navigator.onLine) {
        const offlineUsers = getOfflineUsers();
        if (offlineUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            errEl.textContent = 'Username already exists (offline validation).';
            errEl.classList.remove('hidden');
            btn.disabled = false; btn.textContent = 'Create Account';
            return;
        }
        
        // Save locally for offline login capability
        const mockId = Date.now();
        saveOfflineUser(username, password, role, mockId);
        
        // Queue the registration so it goes to the DB when back online
        queueOfflineAction('/api/register', 'POST', { username, password, role }, `Register user "${username}"`);
        
        hideRegisterPanel();
        document.getElementById('login-username').value = username;
        document.getElementById('login-password').value = password;
        alert('Account created offline! You can now sign in.');
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
    }

    try {
        const res  = await fetch('/api/register', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password, role})
        });
        const data = await res.json();
        if (data.success) {
            saveOfflineUser(username, password, role, data.id);
            hideRegisterPanel();
            // Auto-fill login form with new credentials
            document.getElementById('login-username').value = username;
            document.getElementById('login-password').value = password;
            alert('Account created! You can now sign in.');
        } else {
            errEl.textContent = data.message || 'Registration failed.';
            errEl.classList.remove('hidden');
        }
    } catch(err) {
        errEl.textContent = 'Connection error. Please try again.';
        errEl.classList.remove('hidden');
    }
    btn.disabled = false; btn.textContent = 'Create Account';
}

// Login & Auth
function selectRole(role) {
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/10');
        btn.classList.add('border-gray-700', 'bg-gray-900/50');
    });

    const btn = document.getElementById('role-btn-' + role);
    if (btn) {
        btn.classList.remove('border-gray-700', 'bg-gray-900/50');
        btn.classList.add('border-primary', 'bg-primary/10');
    }

    if (role === 'admin') {
        document.getElementById('login-username').value = 'admin';
        document.getElementById('login-password').value = '123';
    } else if (role === 'rescue') {
        document.getElementById('login-username').value = 'rescue';
        document.getElementById('login-password').value = '123';
    } else if (role === 'citizen') {
        document.getElementById('login-username').value = 'citizen';
        document.getElementById('login-password').value = '123';
    }
}
async function handleLogin(e = null) {
    if (e) e.preventDefault();
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;

    if (!navigator.onLine) {
        const offlineUsers = getOfflineUsers();
        const matched = offlineUsers.find(u => u.username === user && u.password === pass);
        if (matched) {
            currentUser = { success: true, username: matched.username, role: matched.role, id: matched.id };
            document.getElementById('login-modal').classList.add('hidden');
            setupProfile();
            addNotification(`Logged in in offline mode.`, 'success');
            fetchData();
            // Give DOM time to settle before invalidating map sizes
            setTimeout(() => {
                if (miniMap) miniMap.invalidateSize(true);
                if (fullMap) fullMap.invalidateSize(true);
            }, 400);
            return;
        } else {
            alert('Invalid credentials (offline mode)');
            return;
        }
    }
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data;
            saveOfflineUser(user, pass, data.role, data.id);
            document.getElementById('login-modal').classList.add('hidden');
            setupProfile();
            fetchData();
            // Give DOM time to settle before invalidating map sizes
            setTimeout(() => {
                if (miniMap) miniMap.invalidateSize(true);
                if (fullMap) fullMap.invalidateSize(true);
            }, 400);
            setTimeout(() => {
                if (miniMap) miniMap.invalidateSize(true);
            }, 800);
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
}

function handleLogout() {
    currentUser = null;
    document.getElementById('login-modal').classList.remove('hidden');
}

function setupProfile() {
    document.getElementById('user-name-display').innerText = currentUser.username;
    document.getElementById('user-role-display').innerText = currentUser.role;
    document.getElementById('user-initials').innerText = currentUser.username.substring(0, 2).toUpperCase();
    
    const icon = document.getElementById('user-profile-icon');
    if (currentUser.role === 'admin') {
        icon.style.width = '1.5rem'; icon.style.height = '1.5rem';
        document.getElementById('user-initials').classList.replace('text-xs', 'text-[10px]');
    } else {
        icon.style.width = '2.5rem'; icon.style.height = '2.5rem';
        document.getElementById('user-initials').classList.replace('text-[10px]', 'text-sm');
    }

    const role = currentUser.role;

    // ── Admin: Add Resource Location button in sidebar ──
    const addLocBtn = document.getElementById('add-resource-location-btn');
    if (addLocBtn) addLocBtn.style.display = role === 'admin' ? 'flex' : 'none';

    // ── Admin edit buttons on depot cards ──
    document.querySelectorAll('.admin-edit-btn').forEach(btn => {
        btn.classList.toggle('hidden', role !== 'admin');
    });

    // ── Citizen: Emergency SOS in sidebar ──
    const sosSection = document.getElementById('sidebar-sos-section');
    if (sosSection) sosSection.classList.toggle('hidden', role !== 'citizen');

    // ── Nav visibility per role ──
    // citizen: hide command, resources, ai
    // rescue:  hide command, resources, ai
    // admin:   show all
    const navItems = {
        command:    ['admin'],
        weather:    ['admin', 'rescue', 'citizen'],
        alerts:     ['admin', 'rescue', 'citizen'],
        map:        ['admin', 'rescue', 'citizen'],
        resources:  ['admin'],
        ai:         ['admin'],
        reports:    ['admin', 'rescue', 'citizen'],
        precautions:['admin', 'rescue', 'citizen'],
        missing:    ['admin', 'rescue', 'citizen']
    };
    Object.entries(navItems).forEach(([nav, roles]) => {
        const el = document.getElementById('nav-item-' + nav);
        if (el) el.style.display = roles.includes(role) ? 'block' : 'none';
    });

    // ── Field Reports: hide submission form for citizen & rescue ──
    const formContainer = document.getElementById('report-form-container');
    const reportsLayout = document.getElementById('reports-layout');
    if (formContainer && reportsLayout) {
        if (role === 'citizen' || role === 'rescue') {
            formContainer.style.display = 'none';
            reportsLayout.classList.remove('lg:grid-cols-2');
            reportsLayout.classList.add('lg:grid-cols-1');
        } else {
            formContainer.style.display = '';
            reportsLayout.classList.add('lg:grid-cols-2');
            reportsLayout.classList.remove('lg:grid-cols-1');
        }
    }

    // ── Precautions: show role-specific section ──
    const rescueSection  = document.getElementById('precautions-rescue');
    const citizenSection = document.getElementById('precautions-citizen');
    const adminSection   = document.getElementById('precautions-admin');
    if (rescueSection)  rescueSection.style.display  = role === 'rescue'  ? 'block' : 'none';
    if (citizenSection) citizenSection.style.display = role === 'citizen' ? 'block' : 'none';
    if (adminSection)   adminSection.style.display   = role === 'admin'   ? 'block' : 'none';

    // ── Default landing tab per role ──
    if (role === 'admin') switchTab('command');
    else switchTab('alerts');
}

// Notifications
function toggleNotifications() {
    const dd = document.getElementById('notifications-dropdown');
    dd.classList.toggle('hidden');
    document.getElementById('header-bell-badge').classList.add('hidden');
}

function addNotification(message, type='info') {
    notifications.unshift({ message, type, time: new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) });
    renderNotifications();
    document.getElementById('header-bell-badge').classList.remove('hidden');
}

function renderNotifications() {
    const list = document.getElementById('notifications-list');
    if (notifications.length === 0) {
        list.innerHTML = '<div class="p-4 text-center text-sm text-gray-500">No new notifications</div>';
        return;
    }
    list.innerHTML = notifications.map(n => `
        <div class="p-3 border-b border-border hover:bg-gray-800/30 transition-colors">
            <p class="text-sm text-gray-200">${n.message}</p>
            <p class="text-xs text-gray-500 mt-1">${n.time}</p>
        </div>
    `).join('');
}

function clearNotifications() {
    notifications = [];
    renderNotifications();
}

// Tab Switching
function switchTab(tabId) {
    // Hide all tabs - clear both class and inline display style
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.style.display = '';
    });

    const activeTab = document.getElementById('tab-' + tabId);
    activeTab.classList.remove('hidden');

    // Map tab needs display:flex explicitly so its children can flex-grow
    if (tabId === 'map') {
        activeTab.style.display = 'flex';
        activeTab.style.flexDirection = 'column';
    }
    
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.remove('text-primary', 'bg-gray-800');
        el.classList.add('text-gray-400');
    });
    const activeLink = document.querySelector(`.nav-link[onclick="switchTab('${tabId}')"]`);
    if(activeLink) {
        activeLink.classList.remove('text-gray-400');
        activeLink.classList.add('text-primary', 'bg-gray-800');
    }

    if(tabId === 'map') {
        // Invalidate map size after the browser has painted the visible container
        setTimeout(() => { if(fullMap) fullMap.invalidateSize(true); }, 50);
        setTimeout(() => { if(fullMap) fullMap.invalidateSize(true); }, 350);
    }
    
    // Resize all Chart.js v3 instances
    setTimeout(() => {
        Object.values(Chart.instances).forEach(chart => {
            if (chart) chart.resize();
        });
    }, 60);

    // Sync mobile bottom nav active state
    const tabToMobNav = { command: 0, alerts: 1, map: 2, reports: 3 };
    document.querySelectorAll('#mobile-bottom-nav .mob-nav').forEach((el, i) => {
        el.classList.toggle('text-primary', i === tabToMobNav[tabId]);
        el.classList.toggle('text-gray-500', i !== tabToMobNav[tabId]);
    });
}

// Maps setup
let miniMap, fullMap;

function initMaps() {
    // Mini Map (Command Center)
    if (document.getElementById('mini-map')) {
        miniMap = L.map('mini-map', { zoomControl: false }).setView([19.0760, 72.8777], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(miniMap);
    }

    // Full Map (Tactical Map)
    if (document.getElementById('full-map')) {
        fullMap = L.map('full-map').setView([19.0760, 72.8777], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(fullMap);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initMaps();
    
    // Register online sync listener
    window.addEventListener('online', () => {
        syncOfflineQueue();
    });

    // Check for offline sync on load
    if (navigator.onLine) {
        syncOfflineQueue();
    }

    // Fetch data only after login, initially just check session if it existed, but we have a modal.
    setInterval(() => {
        if (currentUser) fetchData();
    }, 30000);
});

// Fetch Data from API
async function fetchData() {
    try {
        const statsRes = await fetch('/api/stats');
        const stats = await statsRes.json();
        document.getElementById('stat-alerts').innerText = stats.active_alerts;
        document.getElementById('stat-teams').innerText = stats.deployed_teams;
        document.getElementById('stat-resources').innerText = stats.total_resources;
        document.getElementById('stat-zones').innerText = stats.safe_zones_active;
        // don't overwrite badge if we have custom notifications
        if (notifications.length === 0 && stats.active_alerts > 0) {
            document.getElementById('alert-badge').innerText = stats.active_alerts;
        }

        const alertsRes = await fetch('/api/alerts');
        const alerts = await alertsRes.json();
        renderAlerts(alerts);

        const resRes = await fetch('/api/resources');
        window.allResources = await resRes.json();
        renderResources(window.allResources);

        const weatherRes = await fetch('/api/weather');
        const weather = await weatherRes.json();
        renderWeather(weather);

        const incRes = await fetch('/api/incidents');
        const incidents = await incRes.json();
        renderIncidentsOnMap(incidents);

        const depotRes = await fetch('/api/depots');
        const depots = await depotRes.json();
        renderDepots(depots);
        
        fetchReports();
        fetchMissingPersons();
        renderTrendChart();
        renderDemandSupplyChart();
        renderWeatherChart();

    } catch (err) {
        console.error("Error fetching data:", err);
    }
}

function filterResources(depot) {
    if (!window.allResources) return;
    document.querySelectorAll('#depot-filters button').forEach(btn => {
        btn.classList.remove('bg-primary', 'text-white');
        btn.classList.add('bg-gray-800', 'text-gray-400');
    });
    const activeBtn = Array.from(document.querySelectorAll('#depot-filters button')).find(b => b.innerText.includes(depot) || (depot === 'All' && b.innerText === 'All Depots'));
    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-800', 'text-gray-400');
        activeBtn.classList.add('bg-primary', 'text-white');
    }
    
    if (depot === 'All') {
        renderResources(window.allResources);
    } else {
        renderResources(window.allResources.filter(r => r.location === depot));
    }
}

// Resource Editing Logic
function openEditModal(depotId, depotName) {
    if (currentUser?.role !== 'admin') return;
    
    document.getElementById('edit-modal-title').innerText = 'Edit ' + depotName;
    document.getElementById('edit-depot-id').value = depotId;
    
    // Extract current values from the card
    const card = document.getElementById('depot-card-' + depotId);
    if (!card) return;
    const values = card.querySelectorAll('.text-xl.font-bold.text-white');
    if (values.length >= 4) {
        document.getElementById('edit-food').value = values[0].innerText.replace(/,/g, '');
        document.getElementById('edit-water').value = values[1].innerText.replace(/,/g, '');
        document.getElementById('edit-medical').value = values[2].innerText.replace(/,/g, '');
        document.getElementById('edit-teams').value = values[3].innerText.replace(/,/g, '');
    }
    
    document.getElementById('edit-resource-modal').classList.remove('hidden');
    document.getElementById('edit-resource-modal').classList.add('flex');
}

function closeEditModal() {
    document.getElementById('edit-resource-modal').classList.add('hidden');
    document.getElementById('edit-resource-modal').classList.remove('flex');
}

function renderDepots(depots) {
    if (!depots) return;
    depots.forEach(depot => {
        const card = document.getElementById('depot-card-' + depot.id);
        if (card) {
            const values = card.querySelectorAll('.text-xl.font-bold.text-white');
            if (values.length >= 4) {
                values[0].innerText = Number(depot.food).toLocaleString();
                values[1].innerText = Number(depot.water).toLocaleString();
                values[2].innerText = Number(depot.medical).toLocaleString();
                values[3].innerText = Number(depot.teams).toLocaleString();
            }
        }
    });
}

async function saveResourceEdit(e) {
    e.preventDefault();
    if (currentUser?.role !== 'admin') return;
    
    const depotId = document.getElementById('edit-depot-id').value;
    const food = document.getElementById('edit-food').value;
    const water = document.getElementById('edit-water').value;
    const medical = document.getElementById('edit-medical').value;
    const teams = document.getElementById('edit-teams').value;

    const payload = {
        food: parseInt(food.replace(/,/g, '')),
        water: parseInt(water.replace(/,/g, '')),
        medical: parseInt(medical.replace(/,/g, '')),
        teams: parseInt(teams.replace(/,/g, ''))
    };
    
    if (!navigator.onLine) {
        queueOfflineAction(`/api/depots/${depotId}`, 'PUT', payload, `Update Depot ${depotId.toUpperCase()} inventory`);

        // Update local SW API cache so reload shows the changes
        const depots = await getCachedData('/api/depots');
        if (depots) {
            const updated = depots.map(d => {
                if (d.id === depotId) {
                    return { ...d, ...payload };
                }
                return d;
            });
            await updateCachedData('/api/depots', updated);
        }

        // Update local DOM card
        const card = document.getElementById('depot-card-' + depotId);
        if (card) {
            const values = card.querySelectorAll('.text-xl.font-bold.text-white');
            if (values.length >= 4) {
                values[0].innerText = Number(payload.food).toLocaleString();
                values[1].innerText = Number(payload.water).toLocaleString();
                values[2].innerText = Number(payload.medical).toLocaleString();
                values[3].innerText = Number(payload.teams).toLocaleString();
            }
        }
        closeEditModal();
        addNotification(`[Offline] Inventory updated for ${depotId.toUpperCase()} Depot`, 'success');
        return;
    }

    try {
        const res = await fetch(`/api/depots/${depotId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.success) {
            const card = document.getElementById('depot-card-' + depotId);
            if (card) {
                const values = card.querySelectorAll('.text-xl.font-bold.text-white');
                if (values.length >= 4) {
                    values[0].innerText = Number(food.replace(/,/g, '')).toLocaleString();
                    values[1].innerText = Number(water.replace(/,/g, '')).toLocaleString();
                    values[2].innerText = Number(medical.replace(/,/g, '')).toLocaleString();
                    values[3].innerText = Number(teams.replace(/,/g, '')).toLocaleString();
                }
            }
            closeEditModal();
            addNotification(`Inventory updated for ${depotId.toUpperCase()} Depot`, 'success');
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to update depot.");
    }
}


function renderAlerts(alerts) {
    const container = document.getElementById('alerts-container');
    container.innerHTML = '';
    const role = currentUser?.role || 'citizen';

    // Precautions map for AI auto-dispatch simulation
    const precautionMap = {
        high: [
            'Evacuate all residents in low-lying areas immediately.',
            'Deploy NDRF rescue teams to identified critical zones.',
            'Open emergency shelters and ensure water & medical supplies.',
            'Issue continuous public broadcasts every 15 minutes.',
            'Disable electrical supply in flooded zones.'
        ],
        medium: [
            'Issue advisory for affected regions, request voluntary evacuation.',
            'Put rescue teams on standby alert.',
            'Stock emergency shelters with 48-hour supplies.',
            'Monitor water/wind levels and update alerts every 30 min.'
        ],
        low: [
            'Monitor situation closely, no immediate action required.',
            'Inform local authorities and community leaders.',
            'Ensure communication lines remain operational.'
        ]
    };

    alerts.forEach(alert => {
        let colorClass = alert.severity === 'high' ? 'bg-danger/20 border-danger/50 text-danger' : 
                         alert.severity === 'medium' ? 'bg-warning/20 border-warning/50 text-warning' : 'bg-primary/20 border-primary/50 text-primary';
        let icon = alert.severity === 'high' ? 'alert-octagon' : 'alert-triangle';
        const precs = precautionMap[alert.severity] || precautionMap.low;

        // Build role-specific action buttons
        let actionsHtml = '';
        if (role === 'admin') {
            // AI auto-dispatch simulation
            const team = alert.severity === 'high' ? 'NDRF Alpha + Medical Unit' : 'Rescue Team Beta';
            actionsHtml = `
                <div class="mt-4 p-3 rounded-lg bg-gray-900 border border-gray-700">
                    <p class="text-xs font-semibold text-primary mb-2 flex items-center"><i data-lucide="cpu" class="w-3 h-3 mr-1"></i> AI RECOMMENDATION</p>
                    <p class="text-xs text-gray-300 mb-2">Auto-dispatch: <span class="text-white font-semibold">${team}</span> to ${alert.location}</p>
                    <div class="flex gap-2 mt-2">
                        <button onclick="aiAcknowledge(this, '${alert.id}')" class="px-3 py-1.5 bg-success/20 hover:bg-success/30 border border-success/40 text-success text-xs rounded-lg font-semibold transition-colors flex items-center gap-1"><i data-lucide="check-circle" class="w-3 h-3"></i> AI Acknowledge</button>
                        <button onclick="aiDispatch(this, '${alert.id}', '${alert.location}', '${team}')" class="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-xs rounded-lg font-semibold transition-colors flex items-center gap-1"><i data-lucide="send" class="w-3 h-3"></i> AI Dispatch</button>
                    </div>
                </div>`;
        } else if (role === 'rescue') {
            // Rescue: show precautions only
            actionsHtml = `
                <div class="mt-4 p-3 rounded-lg bg-gray-900 border border-gray-700">
                    <p class="text-xs font-semibold text-warning mb-2 flex items-center"><i data-lucide="shield-check" class="w-3 h-3 mr-1"></i> FIELD PRECAUTIONS</p>
                    <ul class="text-xs text-gray-300 space-y-1 list-disc pl-4">${precs.map(p => `<li>${p}</li>`).join('')}</ul>
                </div>`;
        } else {
            // Citizen: precautions only
            actionsHtml = `
                <div class="mt-4 p-3 rounded-lg bg-gray-900 border border-gray-700">
                    <p class="text-xs font-semibold text-primary mb-2 flex items-center"><i data-lucide="info" class="w-3 h-3 mr-1"></i> SAFETY ADVICE</p>
                    <ul class="text-xs text-gray-300 space-y-1 list-disc pl-4">${precs.map(p => `<li>${p}</li>`).join('')}</ul>
                </div>`;
        }

        container.innerHTML += `
            <div class="bg-surface p-5 rounded-xl border border-border shadow-sm flex items-start">
                <div class="p-3 ${colorClass} rounded-lg mr-4 flex-shrink-0">
                    <i data-lucide="${icon}" class="w-6 h-6"></i>
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-1">
                        <h3 class="text-lg font-semibold text-white">${alert.title}</h3>
                        <span class="text-xs text-gray-500">${alert.time}</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-400 mb-2">
                        <i data-lucide="map-pin" class="w-4 h-4 mr-1"></i> ${alert.location}
                    </div>
                    <p class="text-sm text-gray-300">${alert.description}</p>
                    ${actionsHtml}
                </div>
            </div>
        `;
    });
    lucide.createIcons();
}

// AI Alert Actions
function aiAcknowledge(btn, alertId) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i> Acknowledged';
    btn.classList.replace('bg-success/20','bg-success/40');
    addNotification(`Alert #${alertId} acknowledged by AI system`, 'success');
    lucide.createIcons();
}
function aiDispatch(btn, alertId, location, team) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-3 h-3"></i> Dispatching...';
    setTimeout(() => {
        btn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i> Dispatched';
        btn.classList.replace('bg-primary/20','bg-primary/40');
        addNotification(`AI dispatched ${team} → ${location}`, 'info');
        lucide.createIcons();
    }, 1200);
}

function renderResources(resources) {
    const tbody = document.getElementById('resources-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    resources.forEach(res => {
        let statusBadge = '';
        if (res.status === 'available') statusBadge = '<span class="px-2 py-1 bg-success/20 text-success text-xs rounded-full font-medium">Available</span>';
        else if (res.status === 'deployed') statusBadge = '<span class="px-2 py-1 bg-primary/20 text-primary text-xs rounded-full font-medium">Deployed</span>';
        else statusBadge = '<span class="px-2 py-1 bg-warning/20 text-warning text-xs rounded-full font-medium">Maintenance</span>';

        let typeIcon = '';
        if (res.type === 'medical') typeIcon = '<i data-lucide="cross" class="w-4 h-4 text-danger mr-2"></i>';
        else if (res.type === 'rescue') typeIcon = '<i data-lucide="life-buoy" class="w-4 h-4 text-warning mr-2"></i>';
        else typeIcon = '<i data-lucide="package" class="w-4 h-4 text-primary mr-2"></i>';

        tbody.innerHTML += `
            <tr class="hover:bg-gray-800/30 transition-colors border-b border-border/50">
                <td class="px-6 py-4 text-sm text-white font-medium flex items-center">${res.name}</td>
                <td class="px-6 py-4 text-sm text-gray-400 flex items-center">${typeIcon} <span class="capitalize">${res.type}</span></td>
                <td class="px-6 py-4">${statusBadge}</td>
                <td class="px-6 py-4 text-sm text-gray-400"><div class="flex items-center"><i data-lucide="map-pin" class="w-3 h-3 mr-1"></i> ${res.location}</div></td>
                <td class="px-6 py-4 text-sm text-gray-300 font-mono">${res.quantity}</td>
            </tr>
        `;
    });
    lucide.createIcons();
}

// City weather data store
let _weatherData = [];
let _activeCity = '';

function renderWeather(weatherData) {
    _weatherData = weatherData;
    const tabsEl = document.getElementById('city-tabs');
    if (!tabsEl) return;

    // Build city tab buttons
    tabsEl.innerHTML = '';
    weatherData.forEach((w, idx) => {
        const city = w.region;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.city = city;
        btn.textContent = city;
        btn.className = 'city-tab-btn px-4 py-1.5 text-sm rounded border transition-all ' +
            (idx === 0
                ? 'border-primary text-primary bg-primary/10'
                : 'border-[#1e2d3d] text-gray-400 hover:border-gray-500 hover:text-white');
        btn.onclick = () => selectCity(city);
        tabsEl.appendChild(btn);
    });

    // Select first city by default
    if (weatherData.length > 0) selectCity(weatherData[0].region);
}

function selectCity(city) {
    _activeCity = city;
    // Update tab active state
    document.querySelectorAll('.city-tab-btn').forEach(btn => {
        const active = btn.dataset.city === city;
        btn.className = 'city-tab-btn px-4 py-1.5 text-sm rounded border transition-all ' +
            (active
                ? 'border-primary text-primary bg-primary/10'
                : 'border-[#1e2d3d] text-gray-400 hover:border-gray-500 hover:text-white');
    });

    const w = _weatherData.find(d => d.region === city);
    if (!w) return;

    // Parse temperature — strip °C, ° etc.
    const tempNum = parseFloat(w.temperature);
    document.getElementById('wstat-temp').textContent    = isNaN(tempNum) ? w.temperature : tempNum.toFixed(1);
    document.getElementById('wstat-humidity').textContent = w.precipitation || '—';

    // Wind: strip units, show number
    const windNum = parseInt(w.wind_speed);
    document.getElementById('wstat-wind').textContent    = isNaN(windNum) ? w.wind_speed : windNum;

    // Rainfall — not directly in API, show 0 as placeholder
    document.getElementById('wstat-rain').textContent    = '0';

    // Risk score derived from condition
    const condLow = (w.condition || '').toLowerCase();
    let riskScore = 5, riskLabel = 'Stable';
    if (condLow.includes('storm') || condLow.includes('critical')) { riskScore = 9; riskLabel = 'Critical'; }
    else if (condLow.includes('rain') || condLow.includes('heavy'))  { riskScore = 7; riskLabel = 'Elevated'; }
    else if (condLow.includes('cloud') || condLow.includes('overcast')) { riskScore = 5; riskLabel = 'Moderate'; }
    document.getElementById('wstat-risk').textContent       = riskScore;
    document.getElementById('wstat-risk-label').textContent = riskLabel;
}

function filterCityTabs(query) {
    document.querySelectorAll('.city-tab-btn').forEach(btn => {
        const match = btn.dataset.city.toLowerCase().includes(query.toLowerCase());
        btn.style.display = match ? '' : 'none';
    });
}


// Markers tracking
let mapMarkers = [];
let fullMapMarkers = [];

function renderIncidentsOnMap(incidents) {
    // Clear old markers
    if (miniMap) mapMarkers.forEach(m => miniMap.removeLayer(m));
    if (fullMap) fullMapMarkers.forEach(m => fullMap.removeLayer(m));
    mapMarkers = [];
    fullMapMarkers = [];

    // Custom Icons using raw SVG or simple divIcon
    const createIcon = (color) => L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${color};"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });

    incidents.forEach(inc => {
        let color = inc.severity === 'high' ? '#ef4444' : inc.severity === 'medium' ? '#f59e0b' : '#10b981';
        let icon = createIcon(color);
        
        let city = "Unknown City";
        if (inc.lat > 18 && inc.lat < 20) city = "Mumbai";
        else if (inc.lat > 14 && inc.lat < 16) city = "Goa";
        else if (inc.lat > 28 && inc.lat < 30) city = "Delhi";
        
        const popupContent = `
            <div class="text-sm">
                <div class="font-bold text-gray-800 mb-1 border-b pb-1">City: ${city}</div>
                <div class="mb-1"><span class="font-semibold text-gray-600">Risk Level:</span> <span style="color:${color}; font-weight:bold">${inc.severity.toUpperCase()}</span></div>
                <div class="mb-1"><span class="font-semibold text-gray-600">Type:</span> ${inc.type.toUpperCase()}</div>
                <div class="text-gray-500 text-xs mt-2">${inc.description}</div>
            </div>
        `;
        
        // Mini map
        if (miniMap) {
            let m1 = L.marker([inc.lat, inc.lng], {icon}).addTo(miniMap)
                .bindPopup(popupContent);
            mapMarkers.push(m1);
        }

        // Full map
        if (fullMap) {
            let m2 = L.marker([inc.lat, inc.lng], {icon}).addTo(fullMap)
                .bindPopup(popupContent);
            fullMapMarkers.push(m2);
        }
    });
}

// Urgency Toggle
function setUrgency(level, btn) {
    document.querySelectorAll('.urgency-btn').forEach(b => {
        b.classList.remove('border-primary','text-primary','bg-primary/10',
                           'border-warning','text-warning','bg-warning/10',
                           'border-danger','text-danger','bg-danger/10');
        b.classList.add('border-[#1e2d3d]','text-gray-400','bg-transparent');
    });
    const colorMap = {
        low:      ['border-primary','text-primary','bg-primary/10'],
        medium:   ['border-primary','text-primary','bg-primary/10'],
        high:     ['border-warning','text-warning','bg-warning/10'],
        critical: ['border-danger','text-danger','bg-danger/10']
    };
    const classes = colorMap[level] || colorMap.medium;
    btn.classList.remove('border-[#1e2d3d]','text-gray-400','bg-transparent');
    classes.forEach(c => btn.classList.add(c));
    document.getElementById('report-urgency').value = level;
}

// Field Reports Logic
async function submitReport(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const loc = document.getElementById('report-location').value;
    const desc = document.getElementById('report-description').value;
    const urgency = document.getElementById('report-urgency')?.value || 'medium';
    const imageUrl = document.getElementById('report-image-url')?.value || '';

    const payload = {
        author_id: currentUser.id,
        author_name: currentUser.username,
        author_role: currentUser.role,
        location: loc,
        description: desc,
        urgency: urgency,
        image_url: imageUrl
    };

    if (!navigator.onLine) {
        queueOfflineAction('/api/reports', 'POST', payload, `Submit report for ${loc}`);

        // Update local SW API cache for reports
        const reports = await getCachedData('/api/reports') || [];
        const mockReport = {
            id: -Date.now(),
            author_name: currentUser.username,
            author_role: currentUser.role,
            location: loc,
            description: desc,
            urgency: urgency,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) + ', ' + new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
            risk_percentage: 30 + (desc.toLowerCase().includes('flood') || desc.toLowerCase().includes('cyclone') ? 40 : 0) + (desc.toLowerCase().includes('help') ? 20 : 0)
        };
        reports.unshift(mockReport);
        await updateCachedData('/api/reports', reports);

        // Update stats in cache
        const stats = await getCachedData('/api/stats');
        if (stats) {
            if (urgency === 'high' || urgency === 'critical') {
                stats.active_alerts = (stats.active_alerts || 0) + 1;
            }
            await updateCachedData('/api/stats', stats);
        }

        document.getElementById('field-report-form').reset();
        const medBtn = document.querySelector('[data-urgency="medium"]');
        if (medBtn) setUrgency('medium', medBtn);
        addNotification(`[Offline] Field Report queued for ${loc}`, 'warning');
        
        fetchReports(); // re-render using the updated cache
        return;
    }
    
    try {
        const res = await fetch('/api/reports', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('field-report-form').reset();
            // Reset urgency back to medium
            const medBtn = document.querySelector('[data-urgency="medium"]');
            if (medBtn) setUrgency('medium', medBtn);
            addNotification(`New Field Report from ${loc} by ${currentUser.username}`, 'warning');
            fetchReports();
        }
    } catch (err) { console.error(err); }
}

async function fetchReports() {
    try {
        const res = await fetch('/api/reports');
        const reports = await res.json();
        const container = document.getElementById('reports-list');
        const noMsg = document.getElementById('no-reports-msg');
        const countEl = document.getElementById('reports-count');
        
        // Update count
        if (countEl) countEl.textContent = `${reports.length} submitted`;
        
        // Remove old report cards (keep no-reports-msg)
        Array.from(container.children).forEach(child => {
            if (child.id !== 'no-reports-msg') child.remove();
        });

        if (reports.length === 0) {
            if (noMsg) noMsg.style.display = 'flex';
            return;
        }
        if (noMsg) noMsg.style.display = 'none';

        reports.forEach(r => {
            const urgencyColors = {
                low:      'text-primary border-primary/40',
                medium:   'text-primary border-primary/40',
                high:     'text-warning border-warning/40',
                critical: 'text-danger border-danger/40'
            };
            const urgency = r.urgency || 'medium';
            const urgencyClass = urgencyColors[urgency] || urgencyColors.medium;
            let riskColor = r.risk_percentage > 70 ? 'text-danger border-danger/30' : r.risk_percentage > 40 ? 'text-warning border-warning/30' : 'text-success border-success/30';
            
            const card = document.createElement('div');
            card.className = 'bg-[#0d1421] border border-[#1e2d3d] rounded-xl p-4';
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-full bg-[#1a2535] flex items-center justify-center flex-shrink-0">
                            <i data-lucide="user" class="w-3.5 h-3.5 text-gray-400"></i>
                        </div>
                        <div>
                            <div class="text-white font-medium text-sm">${r.author_name} <span class="text-xs text-gray-500 ml-1 capitalize">${r.author_role}</span></div>
                            <div class="text-xs text-gray-500 flex items-center mt-0.5"><i data-lucide="map-pin" class="w-3 h-3 mr-1"></i>${r.location} &bull; ${r.timestamp}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${urgencyClass}">${urgency}</span>
                        <div class="px-2 py-1 bg-[#0a1520] rounded-lg border ${riskColor} flex flex-col items-center justify-center min-w-[44px]">
                            <span class="text-[10px] text-gray-500">Risk</span>
                            <span class="font-bold text-sm ${riskColor.split(' ')[0]}">${r.risk_percentage}%</span>
                        </div>
                    </div>
                </div>
                <p class="text-sm text-gray-400 border-t border-[#1e2d3d] pt-2 mt-2">${r.description}</p>
            `;
            container.appendChild(card);
        });
        lucide.createIcons();
    } catch (err) {}
}

// New Charts
let trendChartInst, demandChartInst, weatherChartInst;

// Generate realistic rolling timestamps for charts
function generateTimeLabels(count, stepMinutes) {
    const labels = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
        const t = new Date(now.getTime() - i * stepMinutes * 60000);
        labels.push(t.getHours() + ':' + String(t.getMinutes()).padStart(2,'0'));
    }
    return labels;
}

// Generate smooth wave-like data
function genWave(count, base, amp, freq) {
    return Array.from({length: count}, (_, i) => {
        const v = base + amp * Math.sin(i * freq) + (Math.random() - 0.5) * amp * 0.4;
        return Math.max(0, Math.min(100, Math.round(v)));
    });
}

async function renderTrendChart() {
    if (trendChartInst) trendChartInst.destroy();
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    const N = 30;
    const labels = generateTimeLabels(N, 2);
    // Risk trend: mostly 60-80, with 2 dips
    const riskData = genWave(N, 72, 15, 0.5);
    riskData[10] = 38; riskData[11] = 35; riskData[12] = 40; // first dip
    riskData[N-3] = 32; riskData[N-2] = 88; // last spike
    
    trendChartInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Risk Score',
                data: riskData,
                borderColor: '#00d4d4',
                backgroundColor: (context) => {
                    const chart = context.chart;
                    const {ctx: c, chartArea} = chart;
                    if (!chartArea) return 'transparent';
                    const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    gradient.addColorStop(0, 'rgba(0,210,210,0.45)');
                    gradient.addColorStop(1, 'rgba(0,60,80,0.05)');
                    return gradient;
                },
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 600 },
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: '#0f172a', titleColor: '#9ca3af', bodyColor: '#e2e8f0', borderColor: '#1e293b', borderWidth: 1 } },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(30,41,59,0.8)' }, ticks: { color: '#4b5563', stepSize: 25, font: { size: 11 } }, border: { display: false } },
                x: { grid: { color: 'rgba(30,41,59,0.6)' }, ticks: { color: '#4b5563', maxRotation: 0, maxTicksLimit: 8, font: { size: 10 } }, border: { display: false } }
            }
        }
    });
}

async function renderDemandSupplyChart() {
    if (demandChartInst) demandChartInst.destroy();
    const ctx = document.getElementById('demandSupplyChart');
    if (!ctx) return;
    
    try {
        const res = await fetch('/api/demand-supply');
        const data = await res.json();
        demandChartInst = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.categories,
                datasets: [
                    { label: 'Demand', data: data.demand, backgroundColor: '#ef4444', borderRadius: 4 },
                    { label: 'Supply', data: data.supply, backgroundColor: '#10b981', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: {
                    y: { grid: { color: '#1e293b' }, ticks: { color: '#9ca3af' } },
                    x: { grid: { color: '#1e293b' }, ticks: { color: '#9ca3af' } }
                }
            }
        });
    } catch (err) {}
}

function renderWeatherChart() {
    if (weatherChartInst) weatherChartInst.destroy();
    const ctx = document.getElementById('weatherChart');
    if (!ctx) return;
    
    const N = 36;
    const labels = generateTimeLabels(N, 2);
    const rainData  = genWave(N, 15, 12, 1.2);
    const riskData  = genWave(N, 30, 35, 0.9);
    const tempData  = genWave(N, 35, 12, 0.4);
    const windData  = genWave(N, 45, 18, 0.7);

    weatherChartInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Rain',  data: rainData,  borderColor: '#ef4444', backgroundColor: 'transparent', tension: 0.4, borderWidth: 1.8, pointRadius: 0 },
                { label: 'Risk',  data: riskData,  borderColor: '#ef4444', backgroundColor: 'transparent', tension: 0.4, borderWidth: 1.8, pointRadius: 0, borderDash: [4,2] },
                { label: 'Temp',  data: tempData,  borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.4, borderWidth: 1.8, pointRadius: 0 },
                { label: 'Wind',  data: windData,  borderColor: '#22d3ee', backgroundColor: 'transparent', tension: 0.4, borderWidth: 1.8, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 600 },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#ffffff',
                        font: { size: 11 },
                        usePointStyle: true,
                        pointStyleWidth: 16,
                        padding: 16,
                        generateLabels: (chart) => chart.data.datasets.map((ds, i) => ({
                            text: ds.label,
                            fillStyle: ds.borderColor,
                            strokeStyle: ds.borderColor,
                            lineWidth: 2,
                            hidden: !chart.isDatasetVisible(i),
                            datasetIndex: i
                        }))
                    }
                },
                tooltip: { mode: 'index', intersect: false, backgroundColor: '#0f172a', titleColor: '#ffffff', bodyColor: '#ffffff', borderColor: '#1e293b', borderWidth: 1 }
            },
            scales: {
                y: {
                    min: 0, max: 100,
                    grid: { color: 'rgba(30,41,59,0.7)' },
                    ticks: { color: '#ffffff', stepSize: 25, font: { size: 10 } },
                    border: { display: false }
                },
                x: {
                    grid: { color: 'rgba(30,41,59,0.5)' },
                    ticks: { color: '#ffffff', maxRotation: 0, maxTicksLimit: 10, font: { size: 10 } },
                    border: { display: false }
                }
            }
        }
    });
    
    // Live update every 60s — shift data and add a new point
    clearInterval(window._weatherChartInterval);
    window._weatherChartInterval = setInterval(() => {
        if (!weatherChartInst) return;
        const chart = weatherChartInst;
        const newLabel = (() => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0'); })();
        chart.data.labels.push(newLabel); chart.data.labels.shift();
        [[rainData,0],[riskData,1],[tempData,2],[windData,3]].forEach(([arr, idx]) => {
            const last = arr[arr.length-1];
            const next = Math.max(0, Math.min(100, last + (Math.random()-0.5)*10));
            chart.data.datasets[idx].data.push(next);
            chart.data.datasets[idx].data.shift();
        });
        chart.update('none');
    }, 60000);
}

// AI Allocation Chart
let chartInstance = null;
function renderAIChart() {
    const ctx = document.getElementById('resourceChart');
    if(!ctx) return;
    
    if(chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['0h', '8h', '16h', '24h', '32h', '40h', '48h'],
            datasets: [{
                label: 'Medical Supplies Need',
                data: [20, 35, 60, 85, 70, 50, 40],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.4
            }, {
                label: 'Rescue Personnel Need',
                data: [45, 55, 50, 80, 95, 85, 60],
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#9ca3af' }
                }
            },
            scales: {
                y: {
                    grid: { color: '#1e293b' },
                    ticks: { color: '#9ca3af' }
                },
                x: {
                    grid: { color: '#1e293b' },
                    ticks: { color: '#9ca3af' }
                }
            }
        }
    });
}

// ── Tactical Map Filters ──
let _currentMapFilter = 'incidents';
let _depotMapMarkers = [];

function setMapFilter(filter) {
    _currentMapFilter = filter;
    // Update button styles
    document.querySelectorAll('.map-filter-btn').forEach(btn => {
        const isActive = btn.id === 'map-filter-' + filter;
        btn.className = 'map-filter-btn px-3 py-1.5 text-sm rounded-md transition-colors ' +
            (isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white');
    });

    // Clear depot markers
    if (fullMap) _depotMapMarkers.forEach(m => fullMap.removeLayer(m));
    _depotMapMarkers = [];

    if (filter === 'incidents') {
        // Re-render incident markers (already on map, just make sure visible)
        if (fullMap) fullMapMarkers.forEach(m => fullMap.addTo ? null : null); // markers already added
        fetch('/api/incidents').then(r => r.json()).then(renderIncidentsOnMap);
    } else if (filter === 'resources') {
        // Clear incident markers temporarily and show depot locations
        if (fullMap) fullMapMarkers.forEach(m => fullMap.removeLayer(m));
        fetch('/api/depots').then(r => r.json()).then(depots => {
            depots.forEach(d => {
                const [lat, lng] = d.location_coords.split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lng) && fullMap) {
                    const icon = L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div style="background:#10b981;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px #10b981;display:flex;align-items:center;justify-content:center;"></div>`,
                        iconSize: [16, 16], iconAnchor: [8, 8]
                    });
                    const marker = L.marker([lat, lng], {icon})
                        .bindPopup(`<div class="text-sm"><b>${d.name}</b><br>Food: ${d.food} | Water: ${d.water}<br>Medical: ${d.medical} | Teams: ${d.teams}</div>`)
                        .addTo(fullMap);
                    _depotMapMarkers.push(marker);
                }
            });
        });
    } else if (filter === 'weather') {
        // Clear incident markers and show weather region markers
        if (fullMap) fullMapMarkers.forEach(m => fullMap.removeLayer(m));
        const weatherCoords = {
            'Mumbai': [19.076, 72.877], 'Delhi': [28.613, 77.209],
            'Chennai': [13.082, 80.270], 'Kolkata': [22.572, 88.363],
            'Bengaluru': [12.971, 77.594], 'Hyderabad': [17.385, 78.486]
        };
        fetch('/api/weather').then(r => r.json()).then(weatherData => {
            weatherData.forEach(w => {
                const coords = weatherCoords[w.region];
                if (!coords || !fullMap) return;
                const condLow = w.condition.toLowerCase();
                const color = condLow.includes('storm') ? '#ef4444' : condLow.includes('rain') ? '#f59e0b' : '#10b981';
                const icon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px ${color};"></div>`,
                    iconSize: [14, 14], iconAnchor: [7, 7]
                });
                const marker = L.marker(coords, {icon})
                    .bindPopup(`<div class="text-sm"><b>${w.region}</b><br>${w.condition} | ${w.temperature}<br>Wind: ${w.wind_speed} | Rain: ${w.precipitation}</div>`)
                    .addTo(fullMap);
                _depotMapMarkers.push(marker);
            });
        });
    }
}

// ── Add Resource Location Modal ──
function openAddResourceModal() {
    if (currentUser?.role !== 'admin') return;
    document.getElementById('add-resource-modal').classList.remove('hidden');
    document.getElementById('add-resource-modal').classList.add('flex');
    document.getElementById('add-resource-error').classList.add('hidden');
    document.getElementById('add-resource-form').reset();
    lucide.createIcons();
}
function closeAddResourceModal() {
    document.getElementById('add-resource-modal').classList.add('hidden');
    document.getElementById('add-resource-modal').classList.remove('flex');
}
async function handleAddResource(e) {
    e.preventDefault();
    if (currentUser?.role !== 'admin') return;
    const name    = document.getElementById('new-resource-name').value.trim();
    const lat     = parseFloat(document.getElementById('new-resource-lat').value);
    const lng     = parseFloat(document.getElementById('new-resource-lng').value);
    const food    = parseInt(document.getElementById('new-resource-food').value) || 0;
    const water   = parseInt(document.getElementById('new-resource-water').value) || 0;
    const medical = parseInt(document.getElementById('new-resource-medical').value) || 0;
    const teams   = parseInt(document.getElementById('new-resource-teams').value) || 0;
    const errEl   = document.getElementById('add-resource-error');

    const payload = {name, lat, lng, food, water, medical, teams};

    if (!navigator.onLine) {
        queueOfflineAction('/api/depots', 'POST', payload, `Add resource depot "${name}"`);

        // Update local SW API cache for depots
        const depots = await getCachedData('/api/depots') || [];
        const mockId = name.toLowerCase().replace(/ /g, '_') + '_' + Date.now();
        const mockDepot = {
            id: mockId,
            name,
            location_coords: `${lat}, ${lng}`,
            food, water, medical, teams
        };
        depots.push(mockDepot);
        await updateCachedData('/api/depots', depots);

        // Update stats in cache
        const stats = await getCachedData('/api/stats');
        if (stats) {
            stats.total_resources = (stats.total_resources || 0) + 1;
            stats.deployed_teams = (stats.deployed_teams || 0) + teams;
            await updateCachedData('/api/stats', stats);
        }

        closeAddResourceModal();
        addNotification(`[Offline] Depot "${name}" added locally.`, 'success');
        appendDepotCard(mockDepot);

        if (fullMap) {
            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background:#10b981;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px #10b981;"></div>`,
                iconSize: [16, 16], iconAnchor: [8, 8]
            });
            L.marker([lat, lng], {icon})
                .bindPopup(`<b>${name}</b><br>Food: ${food} | Water: ${water}<br>Medical: ${medical} | Teams: ${teams}`)
                .addTo(fullMap);
        }
        return;
    }

    try {
        const res  = await fetch('/api/depots', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            closeAddResourceModal();
            addNotification(`New resource location "${name}" added.`, 'success');
            // Add depot card dynamically
            appendDepotCard(data);
            // Place marker on map
            if (fullMap) {
                const icon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background:#10b981;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px #10b981;"></div>`,
                    iconSize: [16, 16], iconAnchor: [8, 8]
                });
                L.marker([lat, lng], {icon})
                    .bindPopup(`<b>${name}</b><br>Food: ${food} | Water: ${water}<br>Medical: ${medical} | Teams: ${teams}`)
                    .addTo(fullMap);
            }
        } else {
            errEl.textContent = data.message || 'Failed to add location.';
            errEl.classList.remove('hidden');
        }
    } catch(err) {
        errEl.textContent = 'Connection error.';
        errEl.classList.remove('hidden');
    }
}

function appendDepotCard(depot) {
    const grid = document.querySelector('#tab-resources .grid');
    if (!grid) return;
    const card = document.createElement('div');
    card.className = 'bg-[#0f172a] rounded-xl border border-gray-800 p-5 relative';
    card.id = 'depot-card-' + depot.id;
    card.innerHTML = `
        <button onclick="openEditModal('${depot.id}', '${depot.name}')" class="admin-edit-btn absolute top-5 right-5 text-gray-500 hover:text-primary transition-colors" title="Edit Inventory"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
        <h3 class="text-sm font-bold text-white tracking-wider mb-1">${depot.name}</h3>
        <p class="text-xs text-gray-500 mb-5">${depot.location_coords}</p>
        <div class="grid grid-cols-2 gap-3">
            <div class="bg-[#162032] p-3 rounded-lg border border-gray-800/50"><div class="flex items-center text-gray-400 text-xs mb-1"><i data-lucide="apple" class="w-3 h-3 mr-1.5"></i> FOOD</div><div class="text-xl font-bold text-white">${Number(depot.food).toLocaleString()}</div></div>
            <div class="bg-[#162032] p-3 rounded-lg border border-gray-800/50"><div class="flex items-center text-gray-400 text-xs mb-1"><i data-lucide="droplet" class="w-3 h-3 mr-1.5"></i> WATER</div><div class="text-xl font-bold text-white">${Number(depot.water).toLocaleString()}</div></div>
            <div class="bg-[#162032] p-3 rounded-lg border border-gray-800/50"><div class="flex items-center text-gray-400 text-xs mb-1"><i data-lucide="activity" class="w-3 h-3 mr-1.5"></i> MEDICAL</div><div class="text-xl font-bold text-white">${Number(depot.medical).toLocaleString()}</div></div>
            <div class="bg-[#162032] p-3 rounded-lg border border-gray-800/50"><div class="flex items-center text-gray-400 text-xs mb-1"><i data-lucide="users" class="w-3 h-3 mr-1.5"></i> TEAMS</div><div class="text-xl font-bold text-white">${Number(depot.teams).toLocaleString()}</div></div>
        </div>`;
    grid.appendChild(card);
    lucide.createIcons();
}

// ══════════════════════════════════════════════════════════════
// ── Missing Person Report Feature ──
// ══════════════════════════════════════════════════════════════

function openMissingPersonModal() {
    const modal = document.getElementById('missing-person-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('missing-form-success').classList.add('hidden');
    document.getElementById('missing-form-error').classList.add('hidden');
    document.getElementById('missing-person-form').classList.remove('hidden');
    document.getElementById('mp-submit-btn').classList.remove('hidden');
    lucide.createIcons();
}

function closeMissingPersonModal() {
    const modal = document.getElementById('missing-person-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('missing-person-form').reset();
    // Reset photo preview
    document.getElementById('photo-preview').classList.add('hidden');
    document.getElementById('photo-preview').src = '';
    document.getElementById('photo-placeholder').classList.remove('hidden');
}

function previewMissingPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        alert('Photo must be under 5 MB.');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('photo-preview');
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        document.getElementById('photo-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

async function submitMissingPersonReport(e) {
    e.preventDefault();
    const btn = document.getElementById('mp-submit-btn');
    const errEl = document.getElementById('missing-form-error');
    const successEl = document.getElementById('missing-form-success');
    errEl.classList.add('hidden');
    successEl.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Submitting...';

    const name = document.getElementById('mp-name').value.trim();
    const age = parseInt(document.getElementById('mp-age').value) || 0;
    const gender = document.getElementById('mp-gender').value;
    const last_seen_location = document.getElementById('mp-location').value.trim();
    const last_seen_time = document.getElementById('mp-time').value;
    const description = document.getElementById('mp-description').value.trim();
    const reporter_name = document.getElementById('mp-reporter-name').value.trim();
    const reporter_phone = document.getElementById('mp-reporter-phone').value.trim();

    const payload = {
        name, age, gender, last_seen_location, last_seen_time, description, reporter_name, reporter_phone,
        photo_data: null
    };

    const proceedOffline = async () => {
        queueOfflineAction('/api/missing-persons', 'POST', payload, `Report missing person: ${name}`);

        // Update local SW API cache for missing persons
        const persons = await getCachedData('/api/missing-persons') || [];
        const mockPerson = {
            id: -Date.now(),
            name, age, gender, last_seen_location, last_seen_time, description, reporter_name, reporter_phone,
            photo_data: payload.photo_data,
            status: 'missing',
            submitted_at: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) + ', ' + new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
        };
        persons.push(mockPerson);
        // Youngest first (priority sorting)
        persons.sort((a, b) => a.age - b.age);
        await updateCachedData('/api/missing-persons', persons);

        successEl.classList.remove('hidden');
        document.getElementById('missing-person-form').classList.add('hidden');
        btn.classList.add('hidden');
        addNotification(`[Offline] Missing person report queued: ${name}`, 'warning');
        
        if (currentUser) fetchMissingPersons();
        setTimeout(() => closeMissingPersonModal(), 3000);
        
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Submit Missing Person Report';
        lucide.createIcons();
    };

    if (!navigator.onLine) {
        const photoInput = document.getElementById('missing-photo-input');
        if (photoInput.files.length > 0) {
            const reader = new FileReader();
            reader.onload = async function(event) {
                payload.photo_data = event.target.result;
                await proceedOffline();
            };
            reader.readAsDataURL(photoInput.files[0]);
        } else {
            await proceedOffline();
        }
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('age', age);
    formData.append('gender', gender);
    formData.append('last_seen_location', last_seen_location);
    formData.append('last_seen_time', last_seen_time);
    formData.append('description', description);
    formData.append('reporter_name', reporter_name);
    formData.append('reporter_phone', reporter_phone);

    const photoInput = document.getElementById('missing-photo-input');
    if (photoInput.files.length > 0) {
        formData.append('photo', photoInput.files[0]);
    }

    try {
        const res = await fetch('/api/missing-persons', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            successEl.classList.remove('hidden');
            document.getElementById('missing-person-form').classList.add('hidden');
            btn.classList.add('hidden');
            addNotification('New missing person report submitted — rescue teams notified.', 'warning');
            // Refresh the list if logged in
            if (currentUser) fetchMissingPersons();
            // Auto-close after 3s
            setTimeout(() => closeMissingPersonModal(), 3000);
        } else {
            errEl.textContent = data.message || 'Submission failed.';
            errEl.classList.remove('hidden');
        }
    } catch (err) {
        errEl.textContent = 'Connection error. Please try again.';
        errEl.classList.remove('hidden');
    }
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i> Submit Missing Person Report';
    lucide.createIcons();
}

async function fetchMissingPersons() {
    try {
        const res = await fetch('/api/missing-persons');
        const persons = await res.json();
        renderMissingPersons(persons);
    } catch (err) {
        console.error('Failed to fetch missing persons:', err);
    }
}

function renderMissingPersons(persons) {
    const container = document.getElementById('missing-persons-list');
    const noMsg = document.getElementById('no-missing-msg');
    if (!container) return;

    // Stats
    const total = persons.length;
    const missing = persons.filter(p => p.status === 'missing').length;
    const found = persons.filter(p => p.status === 'found').length;
    const totalEl = document.getElementById('missing-count-total');
    const missingEl = document.getElementById('missing-count-missing');
    const foundEl = document.getElementById('missing-count-found');
    if (totalEl) totalEl.textContent = total;
    if (missingEl) missingEl.textContent = missing;
    if (foundEl) foundEl.textContent = found;

    // Badge in nav
    const badge = document.getElementById('missing-badge');
    if (badge) {
        if (missing > 0) {
            badge.textContent = missing;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // Clear old cards (keep noMsg)
    Array.from(container.children).forEach(child => {
        if (child.id !== 'no-missing-msg') child.remove();
    });

    if (persons.length === 0) {
        if (noMsg) noMsg.style.display = 'flex';
        return;
    }
    if (noMsg) noMsg.style.display = 'none';

    const role = currentUser?.role || 'citizen';

    persons.forEach((p, idx) => {
        // Priority tag based on age
        let priorityLabel, priorityColor, priorityBg;
        if (p.age <= 12) {
            priorityLabel = 'CRITICAL';
            priorityColor = 'text-danger';
            priorityBg = 'bg-danger/10 border-danger/30';
        } else if (p.age <= 18) {
            priorityLabel = 'HIGH';
            priorityColor = 'text-orange-400';
            priorityBg = 'bg-orange-500/10 border-orange-500/30';
        } else if (p.age <= 40) {
            priorityLabel = 'MEDIUM';
            priorityColor = 'text-warning';
            priorityBg = 'bg-warning/10 border-warning/30';
        } else {
            priorityLabel = 'STANDARD';
            priorityColor = 'text-primary';
            priorityBg = 'bg-primary/10 border-primary/30';
        }

        const isFound = p.status === 'found';
        const cardBorder = isFound ? 'border-success/30' : 'border-gray-800';
        const cardBg = isFound ? 'bg-[#0a1a10]' : 'bg-[#0f172a]';

        // Mark as found button (rescue / admin only)
        let actionBtnHtml = '';
        if ((role === 'rescue' || role === 'admin') && !isFound) {
            actionBtnHtml = `
                <button onclick="markPersonFound(${p.id}, this)" class="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-success/10 border border-success/30 text-success text-xs font-semibold hover:bg-success/20 transition-all">
                    <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Mark as Found
                </button>`;
        }
        if (isFound) {
            actionBtnHtml = `
                <div class="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-success/20 border border-success/40 text-success text-xs font-bold">
                    <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> LOCATED / FOUND
                </div>`;
        }

        // Photo or initials fallback
        let photoHtml;
        if (p.photo_data) {
            photoHtml = `<img src="${p.photo_data}" alt="${p.name}" class="w-full h-36 object-cover rounded-lg mb-3">`;
        } else {
            const initials = p.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            photoHtml = `<div class="w-full h-36 rounded-lg mb-3 bg-gray-800 flex items-center justify-center text-3xl font-bold text-gray-600">${initials}</div>`;
        }

        const card = document.createElement('div');
        card.className = `${cardBg} rounded-xl border ${cardBorder} p-4 relative transition-all hover:border-orange-500/40`;
        card.id = 'missing-card-' + p.id;
        card.innerHTML = `
            <!-- Priority Badge -->
            <div class="absolute top-3 right-3 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider ${priorityBg} ${priorityColor}">
                #${idx + 1} ${priorityLabel}
            </div>

            ${photoHtml}

            <h3 class="text-lg font-bold text-white mb-0.5">${p.name}</h3>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
                <span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> Age: <span class="text-white font-semibold">${p.age}</span></span>
                ${p.gender ? `<span class="flex items-center gap-1"><i data-lucide="user" class="w-3 h-3"></i> ${p.gender}</span>` : ''}
            </div>

            <div class="space-y-1.5 text-xs">
                <div class="flex items-start gap-2 text-gray-400">
                    <i data-lucide="map-pin" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-orange-400"></i>
                    <span><span class="text-gray-500 uppercase tracking-wider">Last Seen:</span> <span class="text-white">${p.last_seen_location}</span></span>
                </div>
                ${p.last_seen_time ? `
                <div class="flex items-start gap-2 text-gray-400">
                    <i data-lucide="clock" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-orange-400"></i>
                    <span class="text-white">${p.last_seen_time}</span>
                </div>` : ''}
                ${p.description ? `
                <div class="flex items-start gap-2 text-gray-400 mt-2">
                    <i data-lucide="file-text" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-500"></i>
                    <span class="text-gray-300">${p.description}</span>
                </div>` : ''}
            </div>

            <div class="mt-3 pt-3 border-t border-gray-800/50 text-[11px] text-gray-500">
                <span>Reported by <span class="text-gray-300 font-medium">${p.reporter_name}</span></span>
                ${p.reporter_phone ? ` \u00b7 <a href="tel:${p.reporter_phone}" class="text-primary hover:underline">${p.reporter_phone}</a>` : ''}
                <span class="block mt-0.5">${p.submitted_at}</span>
            </div>

            ${actionBtnHtml}
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

async function markPersonFound(personId, btn) {
    if (!currentUser || (currentUser.role !== 'rescue' && currentUser.role !== 'admin')) return;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Updating...';

    if (!navigator.onLine) {
        queueOfflineAction(`/api/missing-persons/${personId}/status`, 'PUT', { status: 'found' }, `Mark person #${personId} as found`);

        // Update local SW API cache for missing persons
        const persons = await getCachedData('/api/missing-persons') || [];
        const updated = persons.map(p => {
            if (p.id === personId) {
                return { ...p, status: 'found' };
            }
            return p;
        });
        await updateCachedData('/api/missing-persons', updated);

        addNotification(`[Offline] Person marked as found.`, 'success');
        fetchMissingPersons(); // re-render list with new status
        return;
    }

    try {
        const res = await fetch(`/api/missing-persons/${personId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'found' })
        });
        const data = await res.json();
        if (data.success) {
            addNotification(`Missing person #${personId} has been located!`, 'success');
            fetchMissingPersons();
        }
    } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Mark as Found';
        lucide.createIcons();
    }
}

