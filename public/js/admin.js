// File Path: public/js/admin.js
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('nexguard_admin_token');
    if (!token) {
        window.location.href = '/admin/login';
        return;
    }

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
   
    
    let cachedData = { stats: {}, pendingOrders: [], allOrders: [], allUsers: [] };

    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const api = {
        get: (endpoint) => fetch(endpoint, { headers }).then(res => {
            if (res.status === 401 || res.status === 403) logout();
            return res.json();
        }),
        post: (endpoint, body) => fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }).then(res => res.json()),
        delete: (endpoint, body) => fetch(endpoint, { method: 'DELETE', headers, body: JSON.stringify(body) }).then(res => res.json())
    };

    const renderStats = (stats = {}, allUsers = []) => {
        document.getElementById('pending-orders-stat').textContent = stats.pending || 0;
        document.getElementById('approved-orders-stat').textContent = stats.approved || 0;
        document.getElementById('rejected-orders-stat').textContent = stats.rejected || 0;
        const regularUsersCount = allUsers.filter(u => u.role === 'user').length;
        const resellerCount = allUsers.filter(u => u.role === 'reseller').length;
        document.getElementById('total-users-stat').textContent = regularUsersCount;
        document.getElementById('total-resellers-stat').textContent = resellerCount;
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
                    <button class="btn btn-view view-proof-btn" data-proof-url="/${order.receipt_path}"><i class="fa-solid fa-receipt"></i><span class="hidden sm:inline">Proof</span></button>
                    <button class="btn btn-approve" data-order-id="${order.id}"><i class="fa-solid fa-check"></i><span class="hidden sm:inline">Approve</span></button>
                    <button class="btn btn-reject" data-order-id="${order.id}"><i class="fa-solid fa-times"></i><span class="hidden sm:inline">Reject</span></button>
                </div>
            </div>`).join('');
    };

// File Path: public/js/admin.js - Replace the existing renderUsers function with this one

// File Path: public/js/admin.js 
// Replace the entire renderUsers function with this new code

const renderUsers = (users = []) => {
    contentTitle.textContent = "User Management";
    searchBarContainer.classList.remove('hidden');
    const regularUsers = users.filter(u => u.role === 'user');
    if (regularUsers.length === 0) {
        contentContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No users found.</div>';
        return;
    }
    const table = `
        <div class="glass-panel rounded-xl overflow-x-auto">
            <table class="min-w-full text-sm responsive-table">
                <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                    <th class="p-3 text-left font-semibold text-white whitespace-nowrap">Username</th>
                    <th class="p-3 text-left font-semibold text-white whitespace-nowrap">Email / WhatsApp</th>
                    <th class="p-3 text-left font-semibold text-white whitespace-nowrap">V2Ray Profiles</th>
                    <th class="p-3 text-center font-semibold text-white">Action</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-800">${regularUsers.map(user => `
                    <tr id="user-${user.id}">
                        <td data-label="Username">${user.username}</td>
                        <td data-label="Contact">${user.email}<br><span class="text-xs text-slate-400">${user.whatsapp}</span></td>
                        <td data-label="V2Ray Profiles">${(user.active_plans || []).map(p => p.v2rayUsername).join(', ') || 'None'}</td>
                        <td data-label="Action" class="text-center">
                            <button class="btn btn-ban" data-user-id="${user.id}" data-username="${user.username}">
                                <i class="fa-solid fa-user-slash"></i> Ban
                            </button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    contentContainer.innerHTML = table;
};

// File Path: public/js/admin.js 
// Replace the entire renderResellers function with this new code

const renderResellers = (users = []) => {
    contentTitle.textContent = "Reseller Management";
    searchBarContainer.classList.add('hidden');
    const resellers = users.filter(u => u.role === 'reseller');

    const addResellerForm = `
        <div class="glass-panel p-5 rounded-lg mb-6">
            <h3 class="text-lg font-bold mb-4">Add New Reseller</h3>
            <form id="add-reseller-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" name="username" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" placeholder="Username" required>
                <input type="email" name="email" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" placeholder="Email" required>
                <input type="password" name="password" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" placeholder="Password" required>
                <input type="text" name="whatsapp" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500" placeholder="WhatsApp (Optional)">
                <button type="submit" class="btn btn-approve md:col-span-2 justify-center">Add Reseller</button>
            </form>
        </div>`;

    let resellerListHtml;
    if (resellers.length === 0) {
        resellerListHtml = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">No resellers found.</div>';
    } else {
        resellerListHtml = `
        <div class="glass-panel rounded-xl overflow-x-auto">
            <table class="min-w-full text-sm responsive-table">
                 <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                    <th class="p-3 text-left font-semibold text-white whitespace-nowrap">Reseller Username</th>
                    <th class="p-3 text-left font-semibold text-white">Contact</th>
                    <th class="p-3 text-left font-semibold text-white whitespace-nowrap">Users Created</th>
                    <th class="p-3 text-center font-semibold text-white">Actions</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-800">${resellers.map(reseller => {
                    const createdUserCount = cachedData.allUsers.filter(u => u.created_by === reseller.id).length;
                    return `
                    <tr>
                        <td data-label="Reseller">${reseller.username}</td>
                        <td data-label="Contact">${reseller.email}<br><span class="text-xs text-slate-400">${reseller.whatsapp || 'N/A'}</span></td>
                        <td data-label="Users Created">${createdUserCount}</td>
                        <td data-label="Actions" class="text-center">
                            <div class="flex justify-center gap-2 flex-wrap">
                                <button class="btn btn-view btn-edit-reseller" data-reseller-id="${reseller.id}">
                                    <i class="fa-solid fa-pencil"></i> Edit
                                </button>
                                <button class="btn btn-ban" data-user-id="${reseller.id}" data-username="${reseller.username}">
                                    <i class="fa-solid fa-user-slash"></i> Ban
                                </button>
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

    contentContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        // --- NEW: Handle Edit Reseller button click ---
        if (button.classList.contains('btn-edit-reseller')) {
            const resellerId = button.dataset.resellerId;
            const resellerData = cachedData.allUsers.find(u => u.id === resellerId);
            if (resellerData) {
                // Populate the modal form
                editResellerForm.elements.id.value = resellerData.id;
                editResellerForm.elements.username.value = resellerData.username;
                editResellerForm.elements.email.value = resellerData.email;
                editResellerForm.elements.whatsapp.value = resellerData.whatsapp || '';
                editResellerForm.elements.password.value = ''; // Clear password field
                // Show the modal
                editResellerModal.classList.add('active');
            }
        }
    });
 
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
            else {
                alert(`Error: ${result.message}`);
                button.disabled = false;
                button.innerHTML = '<i class="fa-solid fa-user-slash"></i> Ban';
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
            button.disabled = true;
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const result = await api.post('/api/admin/resellers', data);
            if (result.success) {
                alert('Reseller created successfully!');
                form.reset();
                await loadAllData();
                renderResellers(cachedData.allUsers);
            } else { alert(`Error: ${result.message}`); }
            button.disabled = false;
        }
    });

    userSearchInput.addEventListener('keyup', () => {
        const searchTerm = userSearchInput.value.toLowerCase();
        const filteredUsers = (cachedData.allUsers || []).filter(user => (user.role === 'user') && (user.username.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm)));
        renderUsers(filteredUsers);
    });

    editResellerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const resellerId = data.id;

        // Remove password from data if it's empty
        if (!data.password) {
            delete data.password;
        }

        const result = await api.put(`/api/admin/resellers/${resellerId}`, data);

        if (result.success) {
            alert('Reseller updated successfully!');
            editResellerModal.classList.remove('active');
            await loadAllData();
            renderResellers(cachedData.allUsers);
        } else {
            alert(`Error: ${result.message}`);
        }
        button.disabled = false;
    });

    // --- NEW: Listeners to close the Edit modal ---
    editModalCloseBtn.addEventListener('click', () => editResellerModal.classList.remove('active'));
    editResellerModal.addEventListener('click', (e) => {
        if (e.target === editResellerModal) editResellerModal.classList.remove('active');
    });

    const logout = () => {
        localStorage.removeItem('nexguard_admin_token');
        window.location.href = '/admin/login';
    };

    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('modal-close-btn').addEventListener('click', () => imageModal.classList.remove('active'));
    imageModal.addEventListener('click', (e) => { if (e.target === imageModal) imageModal.classList.remove('active'); });

    // Card Click Handlers
    Object.keys(cards).forEach(key => {
        if (cards[key]) {
            cards[key].addEventListener('click', () => {
                setActiveCard(key);
                //...
switch (key) {
    case 'pending':
        renderPendingOrders(cachedData.pendingOrders);
        break;
    case 'approved':
        renderOrderHistory(cachedData.allOrders, 'approved'); // <-- ADD THIS LINE
        break;
    case 'rejected':
        renderOrderHistory(cachedData.allOrders, 'rejected'); // <-- ADD THIS LINE
        break;
    case 'users':
        renderUsers(cachedData.allUsers);
        break;
    case 'resellers':
        renderResellers(cachedData.allUsers);
        break;
}
//...
            });
        }
    });
    
    loadAllData();
});