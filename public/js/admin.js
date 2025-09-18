document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('nexguard_admin_token');
    if (!token) {
        window.location.href = '/admin/login';
        return;
    }

    // --- DOM Elements ---
    const contentTitle = document.getElementById('content-title');
    const contentContainer = document.getElementById('content-container');
    const searchBarContainer = document.getElementById('search-bar-container');
    const userSearchInput = document.getElementById('user-search');
    
    const cards = {
        pending: document.getElementById('card-pending'),
        unconfirmed: document.getElementById('card-unconfirmed'),
        approved: document.getElementById('card-approved'),
        rejected: document.getElementById('card-rejected'),
        users: document.getElementById('card-users'),
        resellers: document.getElementById('card-resellers'),
        connections: document.getElementById('card-connections'),
        reports: document.getElementById('card-reports'),
    };

    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const editResellerModal = document.getElementById('edit-reseller-modal');
    const settingsModal = document.getElementById('settings-modal');
    const editResellerForm = document.getElementById('edit-reseller-form');
    
    const logoutBtn = document.getElementById('logout-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const manualReloadBtn = document.getElementById('manual-reload-btn');
    const autoReloadCheckbox = document.getElementById('auto-reload-checkbox');

    // --- Data Cache & State ---
    let cachedData = { stats: {}, pendingOrders: [], allOrders: [], allUsers: [], unconfirmedOrders: [], connections: [] };
    let autoReloadInterval = null;
    let salesChart = null;

    // --- API Helper ---
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const api = {
        get: (endpoint) => fetch(endpoint, { headers }).then(res => res.json()),
        post: (endpoint, body) => fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }).then(res => res.json()),
        put: (endpoint, body) => fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(body) }).then(res => res.json()),
        delete: (endpoint, body) => fetch(endpoint, { method: 'DELETE', headers, body: JSON.stringify(body) }).then(res => res.json())
    };

    // --- Render Functions ---
    const renderStats = (stats = {}, allUsers = []) => {
        document.getElementById('pending-orders-stat').textContent = stats.pending || 0;
        document.getElementById('unconfirmed-orders-stat').textContent = stats.unconfirmed || 0;
        document.getElementById('approved-orders-stat').textContent = stats.approved || 0;
        document.getElementById('rejected-orders-stat').textContent = stats.rejected || 0;
        document.getElementById('total-users-stat').textContent = (allUsers.filter(u => u.role === 'user')).length;
        document.getElementById('total-resellers-stat').textContent = (allUsers.filter(u => u.role === 'reseller')).length;
    };

    const renderPendingOrders = (orders = []) => {
        contentTitle.textContent = "Pending Order Approvals";
        searchBarContainer.classList.add('hidden');
        if (orders.length === 0) {
            contentContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No pending orders.</div>';
            return;
        }
        contentContainer.innerHTML = orders.map(order => `
            <div class="glass-panel p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4" id="order-${order.id}">
                <div class="flex-grow">
                    <p class="font-bold text-lg">${order.username}</p>
                    <p class="text-sm text-slate-300">${order.plan_id} | ${order.conn_id} ${order.pkg ? `(${order.pkg})` : ''}</p>
                    <p class="text-xs text-slate-400 mt-1">Contact: ${order.whatsapp} | Ordered By: ${order.website_username}</p>
                </div>
                <div class="flex items-center gap-2 sm:gap-3 self-end md:self-center flex-wrap">
                    <button class="btn btn-view view-proof-btn" data-proof-url="${order.receipt_path}"><i class="fa-solid fa-receipt"></i><span class="hidden sm:inline">Proof</span></button>
                    <button class="btn btn-approve" data-order-id="${order.id}"><i class="fa-solid fa-check"></i><span class="hidden sm:inline">Approve</span></button>
                    <button class="btn btn-reject" data-order-id="${order.id}"><i class="fa-solid fa-times"></i><span class="hidden sm:inline">Reject</span></button>
                </div>
            </div>`).join('');
    };

    const renderOrderHistory = (orders = [], statusFilter) => {
        contentTitle.textContent = `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Orders`;
        searchBarContainer.classList.add('hidden');
        const filteredOrders = orders.filter(o => o.status === statusFilter);
        if (filteredOrders.length === 0) {
            contentContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No ${statusFilter} orders found.</div>`;
            return;
        }
        contentContainer.innerHTML = `
            <div class="glass-panel rounded-xl overflow-hidden">
                <table class="min-w-full text-sm responsive-table">
                    <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                        <th class="p-3 text-left font-semibold text-white">Date</th>
                        <th class="p-3 text-left font-semibold text-white">V2Ray User</th>
                        <th class="p-3 text-left font-semibold text-white">Plan</th>
                        <th class="p-3 text-left font-semibold text-white">Website User</th>
                    </tr></thead>
                    <tbody>${filteredOrders.map(order => `
                        <tr>
                            <td data-label="Date">${new Date(order.approved_at || order.created_at).toLocaleDateString()}</td>
                            <td data-label="V2Ray User">${order.final_username || order.username}</td>
                            <td data-label="Plan">${order.plan_id}</td>
                            <td data-label="Website User">${order.website_username}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    };

    const renderUsers = (users = []) => {
        contentTitle.textContent = "User Management";
        searchBarContainer.classList.remove('hidden');
        const regularUsers = users.filter(u => u.role === 'user');
        if (regularUsers.length === 0) {
            contentContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No users found.</div>';
            return;
        }
        contentContainer.innerHTML = `
            <div class="glass-panel rounded-xl overflow-hidden">
                <table class="min-w-full text-sm responsive-table">
                    <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                        <th class="p-3 text-left font-semibold text-white whitespace-nowrap">Username</th>
                        <th class="p-3 text-left font-semibold text-white whitespace-nowrap">Email / WhatsApp</th>
                        <th class="p-3 text-left font-semibold text-white whitespace-nowrap">V2Ray Profiles</th>
                        <th class="p-3 text-center font-semibold text-white">Action</th>
                    </tr></thead>
                    <tbody>${regularUsers.map(user => `
                        <tr>
                            <td data-label="Username">${user.username}</td>
                            <td data-label="Contact"><div>${user.email}</div><div class="text-xs text-slate-400">${user.whatsapp}</div></td>
                            <td data-label="V2Ray Profiles" class="break-all">${(user.active_plans || []).map(p => p.v2rayUsername).join(', ') || 'None'}</td>
                            <td data-label="Action" class="actions-cell">
                                <div class="flex justify-end md:justify-center">
                                    <button class="btn btn-ban" data-user-id="${user.id}" data-username="${user.username}"><i class="fa-solid fa-user-slash"></i> Ban</button>
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    };

    const renderResellers = (users = []) => {
        contentTitle.textContent = "Reseller Management";
        searchBarContainer.classList.add('hidden');
        const resellers = users.filter(u => u.role === 'reseller');
        const addResellerForm = `
            <div class="glass-panel p-5 rounded-lg mb-6">
                <h3 class="text-lg font-bold mb-4">Add New Reseller</h3>
                <form id="add-reseller-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" name="username" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Username" required>
                    <input type="email" name="email" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Email" required>
                    <input type="password" name="password" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Password" required>
                    <input type="text" name="whatsapp" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="WhatsApp (Optional)">
                    <button type="submit" class="btn btn-approve md:col-span-2 justify-center">Add Reseller</button>
                </form>
            </div>`;

        let resellerListHtml;
        if (resellers.length === 0) {
            resellerListHtml = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No resellers found.</div>';
        } else {
            resellerListHtml = `
            <div class="glass-panel rounded-xl overflow-hidden">
                <table class="min-w-full text-sm responsive-table">
                     <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                        <th class="p-3 text-left font-semibold text-white whitespace-nowrap">Reseller Username</th>
                        <th class="p-3 text-left font-semibold text-white">Contact</th>
                        <th class="p-3 text-left font-semibold text-white whitespace-nowrap">Users Created</th>
                        <th class="p-3 text-center font-semibold text-white">Actions</th>
                    </tr></thead>
                    <tbody>${resellers.map(reseller => {
                        const createdUserCount = (cachedData.allUsers || []).filter(u => u.created_by === reseller.id).length;
                        return `
                        <tr>
                            <td data-label="Reseller">${reseller.username}</td>
                            <td data-label="Contact"><div>${reseller.email}</div><div class="text-xs text-slate-400">${reseller.whatsapp || 'N/A'}</div></td>
                            <td data-label="Users Created">${createdUserCount}</td>
                            <td data-label="Actions" class="actions-cell">
                                <div class="flex justify-end md:justify-center flex-wrap gap-2">
                                    <button class="btn btn-view btn-edit-reseller" data-reseller-id="${reseller.id}"><i class="fa-solid fa-pencil"></i> Edit</button>
                                    <button class="btn btn-ban" data-user-id="${reseller.id}" data-username="${reseller.username}"><i class="fa-solid fa-user-slash"></i> Ban</button>
                                </div>
                            </td>
                        </tr>`
                    }).join('')}
                    </tbody>
                </table>
            </div>`;
        }
        contentContainer.innerHTML = addResellerForm + resellerListHtml;
    };

    const renderConnectionsView = (inbounds = []) => {
        contentTitle.textContent = "Live V2Ray Inbounds & Clients";
        searchBarContainer.classList.add('hidden');
        if (inbounds.length === 0) {
            contentContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No V2Ray inbounds found or failed to connect to the panel.</div>';
            return;
        }

        const formatBytes = (bytes, decimals = 2) => {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        };

        contentContainer.innerHTML = inbounds.map(inbound => `
            <div class="glass-panel rounded-xl overflow-hidden mb-6">
                <button class="w-full p-4 text-left bg-slate-900/50 hover:bg-slate-800/60 transition-colors flex justify-between items-center inbound-toggle">
                    <div>
                        <h3 class="font-bold text-lg text-white font-['Orbitron']">${inbound.remark} (${inbound.protocol})</h3>
                        <p class="text-xs text-slate-400">Port: ${inbound.port} | Clients: ${inbound.clientCount}</p>
                    </div>
                    <i class="fa-solid fa-chevron-down transition-transform"></i>
                </button>
                <div class="inbound-clients-table hidden p-1 sm:p-4">
                    <table class="min-w-full text-sm responsive-table">
                        <thead class="border-b border-slate-700">
                            <tr>
                                <th class="p-3 text-left font-semibold text-white">Client Email</th>
                                <th class="p-3 text-left font-semibold text-white">Usage</th>
                                <th class="p-3 text-left font-semibold text-white">Expiry</th>
                                <th class="p-3 text-center font-semibold text-white">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${inbound.clients.length > 0 ? inbound.clients.map(client => `
                                <tr>
                                    <td data-label="Client">${client.email}</td>
                                    <td data-label="Usage">${formatBytes(client.up + client.down)} / ${client.total > 0 ? formatBytes(client.total) : 'Unlimited'}</td>
                                    <td data-label="Expiry">${client.expiryTime > 0 ? new Date(client.expiryTime).toLocaleDateString() : 'Never'}</td>
                                    <td data-label="Status" class="actions-cell">
                                        <div class="flex justify-end md:justify-center">
                                            <span class="px-2 py-1 text-xs rounded-full ${client.enable ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}">
                                                ${client.enable ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            `).join('') : `<tr><td colspan="4" class="text-center p-4 text-slate-400">No clients in this inbound.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join('');
    };

    const renderUnconfirmedOrders = (orders = []) => {
        contentTitle.textContent = "Unconfirmed Auto-Approved Orders";
        searchBarContainer.classList.add('hidden');
        if (orders.length === 0) {
            contentContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No unconfirmed orders.</div>';
            return;
        }
        contentContainer.innerHTML = orders.map(order => `
            <div class="glass-panel p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4" id="order-${order.id}">
                <div class="flex-grow">
                    <p class="font-bold text-lg">${order.final_username}</p>
                    <p class="text-sm text-slate-300">${order.plan_id} | ${order.conn_id}</p>
                    <p class="text-xs text-slate-400 mt-1">Auto-Approved on: ${new Date(order.approved_at).toLocaleString()}</p>
                </div>
                <div class="flex items-center gap-2 sm:gap-3 self-end md:self-center flex-wrap">
                    <button class="btn btn-view view-proof-btn" data-proof-url="${order.receipt_path}"><i class="fa-solid fa-receipt"></i><span class="hidden sm:inline">Proof</span></button>
                    <button class="btn btn-approve" data-order-id="${order.id}" data-action="confirm"><i class="fa-solid fa-check-double"></i><span class="hidden sm:inline">Confirm</span></button>
                    <button class="btn btn-reject" data-order-id="${order.id}" data-action="reject-auto"><i class="fa-solid fa-user-times"></i><span class="hidden sm:inline">Reject</span></button>
                </div>
            </div>`).join('');
    };
    
    const renderReportsView = (summaryData = {}) => {
        contentTitle.textContent = "Sales & Revenue Reports";
        searchBarContainer.classList.add('hidden');

        if (!summaryData.last7Days) {
             contentContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-gray-400">Could not load report data.</div>`;
             return;
        }

        const { last7Days, last30Days, allTime } = summaryData;

        contentContainer.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div class="glass-panel p-5 rounded-xl">
                    <p class="text-sm text-slate-400">Revenue (Last 7 Days)</p>
                    <h3 class="text-3xl font-bold text-white mt-2">LKR ${last7Days.totalRevenue.toLocaleString()}</h3>
                </div>
                <div class="glass-panel p-5 rounded-xl">
                    <p class="text-sm text-slate-400">Revenue (Last 30 Days)</p>
                    <h3 class="text-3xl font-bold text-white mt-2">LKR ${last30Days.totalRevenue.toLocaleString()}</h3>
                </div>
                <div class="glass-panel p-5 rounded-xl">
                    <p class="text-sm text-slate-400">Total Revenue (All Time)</p>
                    <h3 class="text-3xl font-bold text-white mt-2">LKR ${allTime.totalRevenue.toLocaleString()}</h3>
                </div>
            </div>
            <div class="glass-panel p-5 rounded-xl">
                 <h4 class="text-lg font-bold text-white mb-4">Daily Sales (Last 7 Days)</h4>
                 <canvas id="salesChart" class="max-h-80"></canvas>
            </div>
        `;

        const ctx = document.getElementById('salesChart').getContext('2d');
        if (salesChart) {
            salesChart.destroy();
        }
        salesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days.salesByDay.map(d => new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })),
                datasets: [{
                    label: 'Orders',
                    data: last7Days.salesByDay.map(d => d.count),
                    backgroundColor: 'rgba(168, 85, 247, 0.2)',
                    borderColor: 'rgba(168, 85, 247, 1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } },
                    x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } }
                },
                plugins: { legend: { labels: { color: '#e0e0e0' } } }
            }
        });
    };

    const renderConnectionSettings = (connections = []) => {
        const addForm = `
            <div class="glass-panel p-5 rounded-lg mb-6">
                <h3 class="text-lg font-bold mb-4">Add New Connection</h3>
                <form id="add-connection-form" class="space-y-4">
                    <input type="text" name="name" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Connection Name (e.g., Dialog 4G)" required>
                    <input type="number" name="inbound_id" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="V2Ray Inbound ID" required>
                    <textarea name="vless_template" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" rows="3" placeholder="VLESS Template (e.g., vless://{uuid}@...&remark={remark})" required></textarea>
                    <button type="submit" class="btn btn-approve justify-center w-full">Add Connection</button>
                </form>
            </div>`;

        const listHtml = connections.length === 0 ? '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No connections configured.</div>' : `
            <div class="glass-panel rounded-xl overflow-hidden">
                <table class="min-w-full text-sm responsive-table">
                     <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                        <th class="p-3 text-left font-semibold text-white">Name</th>
                        <th class="p-3 text-left font-semibold text-white">Inbound ID</th>
                        <th class="p-3 text-center font-semibold text-white">Actions</th>
                    </tr></thead>
                    <tbody>${connections.map(c => `
                        <tr>
                            <td data-label="Name">${c.name}</td>
                            <td data-label="Inbound ID">${c.inbound_id}</td>
                            <td data-label="Actions" class="actions-cell">
                                <div class="flex justify-end md:justify-center gap-2">
                                    <button class="btn btn-reject btn-delete-connection" data-conn-id="${c.id}"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        return addForm + listHtml;
    };
    
    const renderSettings = (settings = [], connections = []) => {
        let settingsMap = {};
        settings.forEach(s => { settingsMap[s.setting_key] = s.setting_value; });

        const autoApprovalHtml = connections.length > 0
            ? connections.map(conn => {
                const settingKey = `auto_approve_${conn.name}`;
                const isChecked = settingsMap[settingKey] || false;
                return `
                <div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                    <span class="font-medium text-slate-200">${conn.name}</span>
                    <div class="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                        <input type="checkbox" name="${settingKey}" id="${settingKey}" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" ${isChecked ? 'checked' : ''}/>
                        <label for="${settingKey}" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer"></label>
                    </div>
                </div>`;
            }).join('')
            : '<p class="text-xs text-slate-400 text-center">No connections found. Please add connections in the "Connections" tab first.</p>';

        document.getElementById('settings-content').innerHTML = `
            <div id="settings-tabs" class="flex items-center gap-4 border-b border-white/10 mb-4">
                <button data-tab="auto-approve" class="py-2 px-1 text-sm font-semibold border-b-2 border-purple-500 text-white">Auto-Approval</button>
                <button data-tab="connections" class="py-2 px-1 text-sm font-semibold border-b-2 border-transparent text-slate-400 hover:text-white">Connections</button>
            </div>
            <div id="tab-auto-approve" class="settings-tab-panel space-y-3">
                 <p class="text-xs text-slate-400">Enable auto-approval for specific connection types. Orders will be approved automatically after 10 minutes.</p>
                 ${autoApprovalHtml}
            </div>
            <div id="tab-connections" class="settings-tab-panel hidden">
                ${renderConnectionSettings(connections)}
            </div>
        `;
    };

    const loadAllData = async (isReload = false) => {
        if (!isReload) {
            contentContainer.innerHTML = '<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-3xl text-purple-400"></i></div>';
        }
        try {
            const result = await api.get('/api/admin/dashboard-data');
            if (result.success && result.data) {
                cachedData = result.data;
                renderStats(cachedData.stats, cachedData.allUsers);
                
                const activeCardKey = document.querySelector('#stats-section .border-purple-500')?.id.replace('card-','');
                if (!isReload) {
                    setActiveCard('pending');
                    renderPendingOrders(cachedData.pendingOrders);
                } else if (activeCardKey) {
                    document.getElementById(`card-${activeCardKey}`).click();
                } else {
                    renderPendingOrders(cachedData.pendingOrders);
                }
            } else {
                contentContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-red-500">${result.message || 'Failed to load dashboard data.'}</div>`;
            }
        } catch (error) {
            console.error("Failed to load data:", error);
            contentContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-red-500">Connection error. Could not load data.</div>`;
        }
    };
    
    const setActiveCard = (cardKey) => {
        Object.values(cards).forEach(card => card?.classList.remove('border-purple-500', 'bg-slate-900/50'));
        if (cards[cardKey]) cards[cardKey].classList.add('border-purple-500', 'bg-slate-900/50');
    };

    const logout = () => {
        localStorage.removeItem('nexguard_admin_token');
        window.location.href = '/admin/login';
    };

    // --- Event Listeners ---
    contentContainer.addEventListener('click', async (e) => {
        const targetElement = e.target.closest('button');
        const toggleButton = e.target.closest('.inbound-toggle');
        
        if (toggleButton) {
            const table = toggleButton.nextElementSibling;
            const icon = toggleButton.querySelector('i');
            table.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
            return;
        }

        if (!targetElement) return;

        const orderId = targetElement.dataset.orderId;
        if (orderId) {
            targetElement.disabled = true;
            const action = targetElement.dataset.action || (targetElement.classList.contains('btn-approve') ? 'approve' : 'reject');

            switch(action) {
                case 'approve':
                    targetElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Approving...';
                    const approveResult = await api.post(`/api/admin/approve-order/${orderId}`);
                    if (!approveResult.success) alert(`Error: ${approveResult.message}`);
                    break;
                case 'reject':
                    targetElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejecting...';
                    await api.post(`/api/admin/reject-order/${orderId}`);
                    break;
                case 'confirm':
                    targetElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirming...';
                    await api.post(`/api/admin/orders/${orderId}/confirm`);
                    break;
                case 'reject-auto':
                    if (confirm('Are you sure? This will delete the V2Ray user.')) {
                        targetElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejecting...';
                        await api.post(`/api/admin/orders/${orderId}/reject-auto`);
                    } else {
                        targetElement.disabled = false;
                    }
                    break;
            }
            loadAllData(true);
            return;
        }
        
        if (targetElement.classList.contains('view-proof-btn')) {
            modalImage.src = targetElement.dataset.proofUrl;
            imageModal.classList.add('active');
        } else if (targetElement.classList.contains('btn-ban')) {
            const userId = targetElement.dataset.userId;
            const username = targetElement.dataset.username;
            if (confirm(`Are you sure you want to ban "${username}"?`)) {
                targetElement.disabled = true;
                targetElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Banning...';
                await api.delete('/api/admin/ban-user', { userId });
                loadAllData(true);
            }
        } else if (targetElement.classList.contains('btn-edit-reseller')) {
            const resellerId = targetElement.dataset.resellerId;
            const resellerData = cachedData.allUsers.find(u => u.id === resellerId);
            if (resellerData) {
                editResellerForm.elements.id.value = resellerData.id;
                editResellerForm.elements.username.value = resellerData.username;
                editResellerForm.elements.email.value = resellerData.email;
                editResellerForm.elements.whatsapp.value = resellerData.whatsapp || '';
                editResellerForm.elements.password.value = '';
                editResellerModal.classList.add('active');
            }
        }
    });

    contentContainer.addEventListener('submit', async(e) => {
        if (e.target.id === 'add-reseller-form') {
            e.preventDefault();
            const form = e.target;
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true; button.textContent = 'Adding...';
            const data = Object.fromEntries(new FormData(form).entries());
            const result = await api.post('/api/admin/resellers', data);
            if (result.success) {
                form.reset();
                loadAllData(true).then(() => {
                    setActiveCard('resellers');
                    renderResellers(cachedData.allUsers);
                });
            } else { 
                alert(`Error: ${result.message}`);
                button.disabled = false; button.textContent = 'Add Reseller';
            }
        }
        if (e.target.id === 'add-connection-form') {
            e.preventDefault();
            const form = e.target;
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true; button.textContent = 'Adding...';
            const data = Object.fromEntries(new FormData(form).entries());
            const result = await api.post('/api/admin/connections', data);
            if (result.success) {
                form.reset();
                const connResult = await api.get('/api/admin/connections');
                if (connResult.success) {
                    cachedData.connections = connResult.data;
                    document.getElementById('tab-connections').innerHTML = renderConnectionSettings(cachedData.connections);
                }
            } else {
                alert(`Error: ${result.message}`);
            }
            button.disabled = false;
        }
    });

    editResellerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true; button.textContent = 'Updating...';
        const data = Object.fromEntries(new FormData(e.target).entries());
        const resellerId = data.id;
        if (!data.password) delete data.password;
        const result = await api.put(`/api/admin/resellers/${resellerId}`, data);
        if (result.success) {
            editResellerModal.classList.remove('active');
            loadAllData(true).then(() => {
                setActiveCard('resellers');
                renderResellers(cachedData.allUsers);
            });
        } else { 
            alert(`Error: ${result.message}`);
            button.disabled = false; button.textContent = 'Update Reseller';
        }
    });
    
    userSearchInput.addEventListener('input', () => {
        const searchTerm = userSearchInput.value.toLowerCase();
        const filteredUsers = (cachedData.allUsers || []).filter(user => (user.role === 'user') && (user.username.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm)));
        renderUsers(filteredUsers);
    });

    logoutBtn.addEventListener('click', logout);

    // --- CORRECTED AND IMPROVED click listener for cards ---
     Object.keys(cards).forEach(key => {
        if (cards[key]) {
            cards[key].addEventListener('click', async () => {
                setActiveCard(key);
                try {
                    // Show a loading spinner for API-dependent views
                    if (['unconfirmed', 'connections', 'reports'].includes(key)) {
                        contentContainer.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-purple-400"></i></div>`;
                    }

                    switch (key) {
                        case 'pending': renderPendingOrders(cachedData.pendingOrders); break;
                        case 'approved': renderOrderHistory(cachedData.allOrders, 'approved'); break;
                        case 'rejected': renderOrderHistory(cachedData.allOrders, 'rejected'); break;
                        case 'users': renderUsers(cachedData.allUsers); break;
                        case 'resellers': renderResellers(cachedData.allUsers); break;
                        case 'unconfirmed': 
                            const res = await api.get('/api/admin/unconfirmed-orders');
                            if (res.success) renderUnconfirmedOrders(res.data);
                            else throw new Error(res.message);
                            break;
                        case 'connections':
                            const inboundsRes = await api.get('/api/admin/inbounds');
                            if (inboundsRes.success) renderConnectionsView(inboundsRes.data);
                            else throw new Error(inboundsRes.message);
                            break;
                        case 'reports': 
                            const summaryRes = await api.get('/api/admin/reports/summary');
                            if (summaryRes.success) renderReportsView(summaryRes.data);
                            else throw new Error(summaryRes.message);
                            break;
                    }
                } catch (error) {
                    console.error(`Error loading view for ${key}:`, error);
                    contentContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-red-400"><strong>Error:</strong> Could not load data. ${error.message || 'Check panel connection.'}</div>`;
                }
            });
        }
    });

    manualReloadBtn.addEventListener('click', () => loadAllData(true));
    autoReloadCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            if (autoReloadInterval) clearInterval(autoReloadInterval);
            autoReloadInterval = setInterval(() => loadAllData(true), 30000);
        } else {
            clearInterval(autoReloadInterval);
        }
    });

    settingsBtn.addEventListener('click', async () => {
        const [settingsResult, connectionsResult] = await Promise.all([
            api.get('/api/admin/settings'),
            api.get('/api/admin/connections')
        ]);

        if (settingsResult.success && connectionsResult.success) {
            cachedData.connections = connectionsResult.data || [];
            renderSettings(settingsResult.data || [], cachedData.connections);
            settingsModal.classList.add('active');
        } else {
            alert('Could not load settings. Please try again.');
        }
    });
    
    document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
        const checkboxes = settingsModal.querySelectorAll('#tab-auto-approve input[type="checkbox"]');
        const settingsPayload = Array.from(checkboxes).map(cb => ({ key: cb.name, value: cb.checked }));
        await api.post('/api/admin/settings', { settings: settingsPayload });
        settingsModal.classList.remove('active');
    });

    settingsModal.addEventListener('click', async (e) => {
        if (e.target.matches('#settings-tabs button')) {
            const tabId = e.target.dataset.tab;
            document.querySelectorAll('#settings-tabs button').forEach(btn => {
                btn.classList.remove('border-purple-500', 'text-white');
                btn.classList.add('border-transparent', 'text-slate-400');
            });
            e.target.classList.add('border-purple-500', 'text-white');
            e.target.classList.remove('border-transparent', 'text-slate-400');

            document.querySelectorAll('.settings-tab-panel').forEach(panel => panel.classList.add('hidden'));
            document.getElementById(`tab-${tabId}`).classList.remove('hidden');
        }
        const deleteButton = e.target.closest('.btn-delete-connection');
        if (deleteButton) {
            const connId = deleteButton.dataset.connId;
            if (confirm('Are you sure you want to delete this connection?')) {
                await api.delete(`/api/admin/connections/${connId}`);
                const connResult = await api.get('/api/admin/connections');
                if (connResult.success) {
                    cachedData.connections = connResult.data;
                    document.getElementById('tab-connections').innerHTML = renderConnectionSettings(cachedData.connections);
                }
            }
        }
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('.modal-close-btn')) {
                modal.classList.remove('active');
            }
        });
    });

    // --- Initial Load ---
    loadAllData();
});