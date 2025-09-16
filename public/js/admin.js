document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('nexguard_admin_token');
    if (!token) {
        window.location.href = '/admin-login.html';
        return;
    }

    // --- DOM Elements ---
    const contentTitle = document.getElementById('content-title');
    const contentContainer = document.getElementById('content-container');
    const searchBarContainer = document.getElementById('search-bar-container');
    const userSearchInput = document.getElementById('user-search');
    
    // Cards
    const cards = {
        pending: document.getElementById('card-pending'),
        approved: document.getElementById('card-approved'),
        rejected: document.getElementById('card-rejected'),
        users: document.getElementById('card-users')
    };

    // Modal
    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    
    // --- Data Cache ---
    let cachedData = {
        stats: {},
        pendingOrders: [],
        allOrders: [],
        allUsers: []
    };

    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const api = {
        get: (endpoint) => fetch(endpoint, { headers }).then(res => {
            if (res.status === 401 || res.status === 403) logout();
            return res.json().catch(() => ({ success: false, message: 'Invalid JSON response from server.' }));
        }),
        post: (endpoint, body) => fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }).then(res => res.json()),
        delete: (endpoint, body) => fetch(endpoint, { method: 'DELETE', headers, body: JSON.stringify(body) }).then(res => res.json())
    };

    // --- Render Functions ---
    const renderStats = (stats = {}) => {
        document.getElementById('pending-orders-stat').textContent = stats.pending || 0;
        document.getElementById('approved-orders-stat').textContent = stats.approved || 0;
        document.getElementById('rejected-orders-stat').textContent = stats.rejected || 0;
        document.getElementById('total-users-stat').textContent = stats.users || 0;
    };

    const renderPendingOrders = (orders = []) => {
        contentTitle.textContent = "Pending Order Approvals";
        searchBarContainer.classList.add('hidden');
        if (!orders || orders.length === 0) {
            contentContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No pending orders.</div>';
            return;
        }
        contentContainer.innerHTML = orders.map(order => `
            <div class="glass-panel p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4" id="order-${order.id}">
                <div>
                    <p class="font-bold text-lg">${order.username}</p>
                    <p class="text-sm text-slate-300">${order.planId} | ${order.connId} ${order.pkg ? `(${order.pkg})` : ''}</p>
                    <p class="text-xs text-slate-400 mt-1">Contact: ${order.whatsapp} | Ordered By: ${order.websiteUsername}</p>
                </div>
                <div class="flex items-center gap-3 self-end md:self-center">
                    <button class="btn btn-view view-proof-btn" data-proof-url="${order.receipt_path}"><i class="fa-solid fa-receipt"></i> View Proof</button>
                    <button class="btn btn-approve" data-order-id="${order.id}"><i class="fa-solid fa-check"></i> Approve</button>
                    <button class="btn btn-reject" data-order-id="${order.id}"><i class="fa-solid fa-times"></i> Reject</button>
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
        const table = `
            <div class="glass-panel rounded-xl overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead class="border-b border-slate-700 bg-slate-900/50 sticky top-0"><tr>
                        <th class="p-3 text-left font-semibold text-white">Date</th>
                        <th class="p-3 text-left font-semibold text-white">V2Ray User</th>
                        <th class="p-3 text-left font-semibold text-white">Plan</th>
                        <th class="p-3 text-left font-semibold text-white">Website User</th>
                    </tr></thead>
                    <tbody class="divide-y divide-slate-800">${filteredOrders.map(order => `
                        <tr>
                            <td class="p-3 text-slate-400">${new Date(order.approvedAt || order.rejectedAt || order.createdAt).toLocaleDateString()}</td>
                            <td class="p-3">${order.finalUsername || order.username}</td>
                            <td class="p-3">${order.planId}</td>
                            <td class="p-3">${order.websiteUsername}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        contentContainer.innerHTML = table;
    };

    const renderUsers = (users = []) => {
        contentTitle.textContent = "User Management";
        searchBarContainer.classList.remove('hidden');
        if (!users || users.length === 0) {
            contentContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No users found.</div>';
            return;
        }
        const table = `
            <div class="glass-panel rounded-xl overflow-x-auto">
                <table class="min-w-full text-sm">
                    <thead class="border-b border-slate-700 bg-slate-900/50 sticky top-0"><tr>
                        <th class="p-3 text-left font-semibold text-white">Username</th>
                        <th class="p-3 text-left font-semibold text-white">Email / WhatsApp</th>
                        <th class="p-3 text-left font-semibold text-white">V2Ray Profiles</th>
                        <th class="p-3 text-center font-semibold text-white">Action</th>
                    </tr></thead>
                    <tbody class="divide-y divide-slate-800">${users.map(user => `
                        <tr id="user-${user.id}">
                            <td class="p-3">${user.username}</td>
                            <td class="p-3">${user.email}<br><span class="text-xs text-slate-400">${user.whatsapp}</span></td>
                            <td class="p-3">${(user.activePlans || []).map(p => p.v2rayUsername).join(', ') || 'None'}</td>
                            <td class="p-3 text-center">
                                <button class="btn btn-ban" data-user-id="${user.id}" data-v2ray-usernames="${(user.activePlans || []).map(p => p.v2rayUsername).join(',')}" data-username="${user.username}">
                                    <i class="fa-solid fa-user-slash"></i> Ban
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        contentContainer.innerHTML = table;
    };

    const loadAllData = async () => {
        const result = await api.get('/api/admin/dashboard-data');
        if (result.success && result.data) {
            cachedData = result.data;
            renderStats(cachedData.stats);
            setActiveCard('pending');
            renderPendingOrders(cachedData.pendingOrders);
        } else {
            contentContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-red-500">${result.message || 'Failed to load dashboard data.'}</div>`;
        }
    };
    
    const setActiveCard = (cardKey) => {
        Object.values(cards).forEach(card => card.classList.remove('border-purple-500', 'bg-slate-900/50'));
        if (cards[cardKey]) {
            cards[cardKey].classList.add('border-purple-500', 'bg-slate-900/50');
        }
    };
    
    // --- Event Listeners ---
    contentContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        if (button.classList.contains('view-proof-btn')) {
    // modal එකේ පෙන්වනවා වෙනුවට අලුත් tab එකක link එක open කරන්න
    window.open(button.dataset.proofUrl, '_blank');
}
 else if (button.classList.contains('btn-ban')) {
            const userId = button.dataset.userId;
            const username = button.dataset.username;
            const v2rayUsernames = button.dataset.v2rayUsernames;
            if (!confirm(`Are you sure you want to ban "${username}"?`)) return;
            
            button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Banning...';
            const result = await api.delete(`/api/admin/ban-user`, { userId, v2rayUsernames });
            if(result.success) { await loadAllData(); } 
            else { alert(`Error: ${result.message}`); button.disabled = false; button.innerHTML = '<i class="fa-solid fa-user-slash"></i> Ban'; }
        }

        const orderId = button.dataset.orderId;
        if (!orderId) return;

        if (button.classList.contains('btn-approve')) {
            button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Approving...';
            const result = await api.post(`/api/admin/approve-order/${orderId}`);
            if (result.success) { await loadAllData(); }
            else { alert(`Error: ${result.message}`); button.disabled = false; button.innerHTML = '<i class="fa-solid fa-check"></i> Approve'; }
        } else if (button.classList.contains('btn-reject')) {
            if (!confirm('Are you sure you want to reject this order?')) return;
            button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejecting...';
            const result = await api.post(`/api/admin/reject-order/${orderId}`);
            if (result.success) { await loadAllData(); }
            else { alert(`Error: ${result.message}`); button.disabled = false; button.innerHTML = '<i class="fa-solid fa-times"></i> Reject'; }
        }
    });

    userSearchInput.addEventListener('keyup', () => {
        const searchTerm = userSearchInput.value.toLowerCase();
        const filteredUsers = (cachedData.allUsers || []).filter(user => 
            user.username.toLowerCase().includes(searchTerm) || 
            user.email.toLowerCase().includes(searchTerm)
        );
        renderUsers(filteredUsers);
    });

    const logout = () => {
        localStorage.removeItem('nexguard_admin_token');
        window.location.href = '/admin/login';
    };

    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('modal-close-btn').addEventListener('click', () => imageModal.classList.remove('active'));
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.classList.remove('active'); });

    // --- Card Click Handlers ---
    cards.pending.addEventListener('click', () => { setActiveCard('pending'); renderPendingOrders(cachedData.pendingOrders); });
    cards.approved.addEventListener('click', () => { setActiveCard('approved'); renderOrderHistory(cachedData.allOrders, 'approved'); });
    cards.rejected.addEventListener('click', () => { setActiveCard('rejected'); renderOrderHistory(cachedData.allOrders, 'rejected'); });
    cards.users.addEventListener('click', () => { setActiveCard('users'); renderUsers(cachedData.allUsers); });

    // --- Initial Load ---
    loadAllData();
});