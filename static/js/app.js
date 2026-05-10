// State
let currentUser = null;
let notifications = [];

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
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data;
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
        icon.style.width = '1.5rem';
        icon.style.height = '1.5rem';
        document.getElementById('user-initials').classList.replace('text-xs', 'text-[10px]');
    } else {
        icon.style.width = '2.5rem';
        icon.style.height = '2.5rem';
        document.getElementById('user-initials').classList.replace('text-[10px]', 'text-sm');
    }

    // Role restrictions — show/hide admin-only UI elements
    const addResourceBtn = document.getElementById('add-resource-btn');
    if (addResourceBtn) addResourceBtn.style.display = currentUser.role === 'citizen' ? 'none' : 'flex';

    const adminSettingsBtn = document.getElementById('admin-settings-btn');
    if (adminSettingsBtn) adminSettingsBtn.style.display = currentUser.role === 'admin' ? 'flex' : 'none';

    document.querySelectorAll('.admin-edit-btn').forEach(btn => {
        if (currentUser.role === 'admin') {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });

    // All roles see all nav tabs
    const allNavs = ['command', 'weather', 'alerts', 'map', 'resources', 'ai', 'reports', 'precautions'];
    allNavs.forEach(nav => {
        const navEl = document.getElementById('nav-item-' + nav);
        if (navEl) navEl.style.display = 'block';
    });

    // Show role-specific precaution sections
    const rescueSection = document.getElementById('precautions-rescue');
    const citizenSection = document.getElementById('precautions-citizen');
    const adminSection = document.getElementById('precautions-admin');
    if (rescueSection) rescueSection.style.display = currentUser.role === 'rescue' ? 'block' : 'none';
    if (citizenSection) citizenSection.style.display = currentUser.role === 'citizen' ? 'block' : 'none';
    if (adminSection) adminSection.style.display = currentUser.role === 'admin' ? 'block' : 'none';

    // Everyone lands on Command Center
    switchTab('command');
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
    
    try {
        const res = await fetch(`/api/depots/${depotId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                food: parseInt(food.replace(/,/g, '')),
                water: parseInt(water.replace(/,/g, '')),
                medical: parseInt(medical.replace(/,/g, '')),
                teams: parseInt(teams.replace(/,/g, ''))
            })
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
    alerts.forEach(alert => {
        let colorClass = alert.severity === 'high' ? 'bg-danger/20 border-danger/50 text-danger' : 
                         alert.severity === 'medium' ? 'bg-warning/20 border-warning/50 text-warning' : 'bg-primary/20 border-primary/50 text-primary';
        let icon = alert.severity === 'high' ? 'alert-octagon' : 'alert-triangle';
        
        container.innerHTML += `
            <div class="bg-surface p-5 rounded-xl border border-border shadow-sm flex items-start">
                <div class="p-3 ${colorClass} rounded-lg mr-4">
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
                    <div class="mt-3 flex space-x-2">
                        <button class="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded transition-colors border border-gray-700">Acknowledge</button>
                        <button class="px-3 py-1 bg-primary hover:bg-primary/90 text-white text-xs rounded transition-colors">Dispatch Team</button>
                    </div>
                </div>
            </div>
        `;
    });
    lucide.createIcons();
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
    
    try {
        const res = await fetch('/api/reports', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                author_id: currentUser.id,
                author_name: currentUser.username,
                author_role: currentUser.role,
                location: loc,
                description: desc,
                urgency: urgency,
                image_url: imageUrl
            })
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

