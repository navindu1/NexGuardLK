// File Path: public/js/admin.js (Complete and Final Version)

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
        approved: document.getElementById('card-approved'),
        rejected: document.getElementById('card-rejected'),
        users: document.getElementById('card-users'),
        resellers: document.getElementById('card-resellers')
    };

    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const editResellerModal = document.getElementById('edit-reseller-modal');
    const editResellerForm = document.getElementById('edit-reseller-form');
    const editModalCloseBtn = document.getElementById('edit-modal-close-btn');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // --- Data Cache ---
    let cachedData = { stats: {}, pendingOrders: [], allOrders: [], allUsers: [] };

    // --- API Helper ---
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const api = {
        get: (endpoint) => fetch(endpoint, { headers }).then(res => res.json()),
        post: (endpoint, body) => fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }).then(res => res.json()),
        put: (endpoint, body) => fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(body) }).then(res => res.json()),
        delete: (endpoint, body) => fetch(endpoint, { method: 'DELETE', headers, body: JSON.stringify(body) }).then(res => res.json())
    };

    // --- Render Functions (These create the HTML content) ---

    const renderStats = (stats = {}, allUsers = []) => {
        document.getElementById('pending-orders-stat').textContent = stats.pending || 0;
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
                    <p class="font-bold text-lg">     ${order.username}</p>
                    <p class="text-sm text-slate-300">${order.plan_id} | ${order.conn_id} ${order.pkg ? `(${order.pkg})` : ''}</p>
                    <p class="text-xs text-slate-400 mt-1">Contact: ${order.whatsapp} | Ordered By: ${order.website_username}</p>
                </div>
                <div class="flex items-center gap-2 sm:gap-3 self-end md:self-center flex-wrap">
                    <button class="btn btn-view view-proof-btn" data-proof-url="/${order.receipt_path}"><i class="fa-solid fa-receipt"></i><span class="hidden sm:inline">Proof</span></button>
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
                            <td data-label="Username">     ${user.username}</td>
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
                        const createdUserCount = cachedData.allUsers.filter(u => u.created_by === reseller.id).length;
                        return `
                        <tr>
                            <td data-label="Reseller">     ${reseller.username}</td>
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


    // --- Core Logic ---

    const loadAllData = async () => {
        contentContainer.innerHTML = '<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-3xl text-purple-400"></i></div>';
        const result = await api.get('/api/admin/dashboard-data');
        if (result.success && result.data) {
            cachedData = result.data;
            renderStats(cachedData.stats, cachedData.allUsers);
            setActiveCard('pending');
            renderPendingOrders(cachedData.pendingOrders);
        } else {
            contentContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-red-500">${result.message || 'Failed to load dashboard data.'}</div>`;
        }
    };
    
    const setActiveCard = (cardKey) => {
        Object.values(cards).forEach(card => card.classList.remove('border-purple-500', 'bg-slate-900/50'));
        if (cards[cardKey]) cards[cardKey].classList.add('border-purple-500', 'bg-slate-900/50');
    };

    const logout = () => {
        localStorage.removeItem('nexguard_admin_token');
        window.location.href = '/admin/login';
    };


    // --- Event Listeners ---

    contentContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        if (button.classList.contains('view-proof-btn')) {
            modalImage.src = button.dataset.proofUrl;
            imageModal.classList.add('active');
        } else if (button.classList.contains('btn-ban')) {
            const userId = button.dataset.userId;
            const username = button.dataset.username;
            if (!confirm(`Are you sure you want to ban "${username}"?`)) return;
            button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Banning...';
            const result = await api.delete('/api/admin/ban-user', { userId });
            if (result.success) await loadAllData();
            else { alert(`Error: ${result.message}`); button.disabled = false; button.innerHTML = '<i class="fa-solid fa-user-slash"></i> Ban'; }
        } else if (button.classList.contains('btn-edit-reseller')) {
            const resellerId = button.dataset.resellerId;
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
        
        const orderId = button.dataset.orderId;
        if (!orderId) return;

        if (button.classList.contains('btn-approve')) {
            button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Approving...';
            const result = await api.post(`/api/admin/approve-order/${orderId}`);
            if (result.success) await loadAllData();
            else { alert(`Error: ${result.message}`); button.disabled = false; button.innerHTML = '<i class="fa-solid fa-check"></i> Approve'; }
        } else if (button.classList.contains('btn-reject')) {
            button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejecting...';
            const result = await api.post(`/api/admin/reject-order/${orderId}`);
            if (result.success) await loadAllData();
            else { alert(`Error: ${result.message}`); button.disabled = false; button.innerHTML = '<i class="fa-solid fa-times"></i> Reject'; }
        }
    });

    contentContainer.addEventListener('submit', async(e) => {
        if (e.target.id === 'add-reseller-form') {
            e.preventDefault();
            const form = e.target;
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true; button.textContent = 'Adding...';
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const result = await api.post('/api/admin/resellers', data);
            if (result.success) {
                alert('Reseller created successfully!');
                form.reset();
                await loadAllData();
                renderResellers(cachedData.allUsers);
            } else { alert(`Error: ${result.message}`); }
            button.disabled = false; button.textContent = 'Add Reseller';
        }
    });

    editResellerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true; button.textContent = 'Updating...';
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const resellerId = data.id;
        if (!data.password) delete data.password;
        const result = await api.put(`/api/admin/resellers/${resellerId}`, data);
        if (result.success) {
            alert('Reseller updated successfully!');
            editResellerModal.classList.remove('active');
            await loadAllData();
            renderResellers(cachedData.allUsers);
        } else { alert(`Error: ${result.message}`); }
        button.disabled = false; button.textContent = 'Update Reseller';
    });
    
    userSearchInput.addEventListener('input', () => {
        const searchTerm = userSearchInput.value.toLowerCase();
        const filteredUsers = (cachedData.allUsers || []).filter(user => (user.role === 'user') && (user.username.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm)));
        renderUsers(filteredUsers);
    });

    logoutBtn.addEventListener('click', logout);
    modalCloseBtn.addEventListener('click', () => imageModal.classList.remove('active'));
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.classList.remove('active'); });
    editModalCloseBtn.addEventListener('click', () => editResellerModal.classList.remove('active'));
    editResellerModal.addEventListener('click', (e) => { if (e.target === editResellerModal) editResellerModal.classList.remove('active'); });

    Object.keys(cards).forEach(key => {
        if (cards[key]) {
            cards[key].addEventListener('click', () => {
                setActiveCard(key);
                switch (key) {
                    case 'pending': renderPendingOrders(cachedData.pendingOrders); break;
                    case 'approved': renderOrderHistory(cachedData.allOrders, 'approved'); break;
                    case 'rejected': renderOrderHistory(cachedData.allOrders, 'rejected'); break;
                    case 'users': renderUsers(cachedData.allUsers); break;
                    case 'resellers': renderResellers(cachedData.allUsers); break;
                }
            });
        }
    });
    
    // --- Initial Load ---
    loadAllData();
});