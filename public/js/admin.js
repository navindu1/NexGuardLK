document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Basic Setup & Authentication ---
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = '/admin-login.html';
        return;
    }

    // --- 2. Element Selectors ---
    const contentTitle = document.getElementById('content-title');
    const contentContainer = document.getElementById('content-container');
    const searchBarContainer = document.getElementById('search-bar-container');
    const searchInput = document.getElementById('search-input');
    const addNewBtn = document.getElementById('add-new-btn');
    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const formModal = document.getElementById('form-modal');
    const formModalTitle = document.getElementById('form-modal-title');
    const formModalContent = document.getElementById('form-modal-content');
    const formModalSaveBtn = document.getElementById('form-modal-save-btn');
    const settingsModal = document.getElementById('settings-modal');

    // --- 3. State Management & Caching ---
    let currentView = 'pending';
    let dataCache = { orders: [], users: [], connections: [], plans: [], settings: {} };
    let salesChart = null;
    let autoReloadInterval = null;

    // --- 4. Helper Functions (API, UI, Formatting) ---
    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = `fixed top-5 right-5 p-4 rounded-lg shadow-lg text-white text-sm z-[100] transition-transform transform translate-x-full ${isError ? 'bg-red-600' : 'bg-green-600'}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-x-full'), 100);
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    async function apiFetch(url, options = {}) {
        const defaultOptions = { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
        const response = await fetch(`/api/admin${url}`, { ...defaultOptions, ...options });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'An API error occurred');
        return data;
    }

    function renderLoading() {
        contentContainer.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin fa-3x text-purple-400"></i></div>`;
    }
    
    function setActiveCard(cardElement) {
        document.querySelectorAll('#stats-section .glass-panel').forEach(c => c.classList.remove('border-purple-500', 'bg-slate-900/50'));
        if(cardElement) {
            cardElement.classList.add('border-purple-500', 'bg-slate-900/50');
        }
    }

    function formatBytes(bytes, decimals = 2) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    // --- 5. RENDER FUNCTIONS FOR EACH VIEW ---

    function renderOrders(status) {
        currentView = status;
        contentTitle.textContent = `${status.charAt(0).toUpperCase() + status.slice(1)} Orders`;
        searchBarContainer.classList.add('hidden');
        addNewBtn.classList.add('hidden');
        const orders = (dataCache.orders || []).filter(o => o.status === status);
        if (orders.length === 0) {
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg">No ${status} orders found.</div>`;
            return;
        }
        contentContainer.innerHTML = orders.map(order => `
            <div class="glass-panel p-4 rounded-lg grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
                <div><span class="font-bold text-slate-400 text-xs">User</span><p>${order.website_username}</p></div>
                <div><span class="font-bold text-slate-400 text-xs">Plan</span><p>${order.plan_id}</p></div>
                <div><span class="font-bold text-slate-400 text-xs">Type</span><p>${order.is_renewal ? 'Renewal' : 'New'}</p></div>
                <div><span class="font-bold text-slate-400 text-xs">Submitted</span><p>${new Date(order.created_at).toLocaleString()}</p></div>
                <div class="flex gap-2"><button class="btn btn-view view-receipt-btn" data-url="${order.receipt_path}"><i class="fa-solid fa-receipt"></i></button></div>
                <div class="flex gap-2 items-center justify-end">
                    ${status === 'pending' || status === 'unconfirmed' ? `
                    <button class="btn btn-approve approve-btn" data-id="${order.id}">Approve</button>
                    <button class="btn btn-reject reject-btn" data-id="${order.id}">Reject</button>` 
                    : `<span class="text-xs text-gray-500">Action Taken</span>`}
                </div>
            </div>`).join('');
    }

    function renderUsers(users, role = 'user') {
        currentView = role === 'user' ? 'users' : 'resellers';
        const title = role === 'user' ? 'User' : 'Reseller';
        contentTitle.textContent = `${title} Management`;
        searchBarContainer.classList.remove('hidden');
        searchInput.placeholder = `Search ${title}s...`;
        addNewBtn.classList.add('hidden');

        const filteredUsers = (users || []).filter(u => u.role === role && (
            u.username.toLowerCase().includes(searchInput.value.toLowerCase()) || 
            (u.email || '').toLowerCase().includes(searchInput.value.toLowerCase())
        ));

        if (filteredUsers.length === 0) {
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg">No ${title.toLowerCase()}s found.</div>`;
            return;
        }
        
        const tableHeaders = role === 'user'
            ? `<th class="p-3 text-left font-semibold">Active Plans</th>`
            : `<th class="p-3 text-left font-semibold">Credit Balance</th>`;

        contentContainer.innerHTML = `<div class="glass-panel rounded-xl overflow-hidden"><table class="min-w-full text-sm responsive-table">
            <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                <th class="p-3 text-left font-semibold">Username</th>
                <th class="p-3 text-left font-semibold">Contact</th>
                ${tableHeaders}
                <th class="p-3 text-center font-semibold">Actions</th>
            </tr></thead>
            <tbody>${filteredUsers.map(user => {
                const roleSpecificData = role === 'user'
                    ? `<td data-label="Active Plans">${(user.active_plans || []).length}</td>`
                    : `<td data-label="Credit">LKR ${user.credit_balance.toFixed(2)}</td>`;
                
                const roleSpecificButtons = role === 'reseller'
                    ? `<button class="btn btn-approve add-credit-btn" data-id="${user.id}" data-username="${user.username}"><i class="fa-solid fa-coins"></i></button>`
                    : '';

                return `<tr class="border-b border-slate-800 hover:bg-slate-800/50">
                    <td data-label="Username">${user.username}</td>
                    <td data-label="Contact"><div>${user.email}</div><div class="text-xs text-slate-400">${user.whatsapp || ''}</div></td>
                    ${roleSpecificData}
                    <td data-label="Actions" class="actions-cell">
                        <div class="flex justify-center gap-2">
                            ${roleSpecificButtons}
                            <button class="btn btn-ban" data-id="${user.id}"><i class="fa-solid fa-user-slash"></i></button>
                        </div>
                    </td>
                </tr>`
            }).join('')}
            </tbody></table></div>`;
    }

    function renderConnections() {
        currentView = 'connections';
        contentTitle.textContent = `Connections & Packages`;
        searchBarContainer.classList.add('hidden');
        addNewBtn.classList.remove('hidden');
        addNewBtn.textContent = 'Add Connection';
        addNewBtn.dataset.type = 'connection';

        const connections = dataCache.connections || [];
        if (connections.length === 0) {
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg">No connections configured.</div>`;
            return;
        }
        contentContainer.innerHTML = connections.map(conn => `
            <div class="glass-panel p-4 rounded-lg mb-4">
                <div class="flex justify-between items-center flex-wrap gap-2">
                    <div>
                        <h3 class="text-xl font-bold flex items-center"><i class="${conn.icon} mr-3"></i> ${conn.name}</h3>
                        <p class="text-sm text-slate-400">Type: ${conn.requires_package_choice ? 'Multi-Package' : 'Single-Package'}</p>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-view edit-conn-btn" data-id="${conn.id}"><i class="fa-solid fa-pencil"></i> Edit</button>
                        <button class="btn btn-reject delete-conn-btn" data-id="${conn.id}"><i class="fa-solid fa-trash"></i> Delete</button>
                        ${conn.requires_package_choice ? `<button class="btn btn-approve add-pkg-btn" data-id="${conn.id}"><i class="fa-solid fa-plus"></i> Add Package</button>` : ''}
                    </div>
                </div>
                ${conn.requires_package_choice ? `
                <div class="mt-4 overflow-x-auto"><table class="w-full text-left text-sm">
                    <thead class="border-b border-slate-700"><tr class="bg-slate-900/50"><th class="p-3">Name</th><th class="p-3">Inbound</th><th class="p-3">Template</th><th class="p-3 text-right">Actions</th></tr></thead>
                    <tbody>${(conn.packages || []).length > 0 ? (conn.packages || []).map(pkg => `
                        <tr class="border-b border-slate-700 hover:bg-slate-800/50">
                            <td class="p-3">${pkg.name}</td>
                            <td class="p-3">${pkg.inbound_id}</td>
                            <td class="p-3"><textarea readonly class="w-full bg-slate-800 p-1 rounded h-16 text-xs">${pkg.template}</textarea></td>
                            <td class="p-3 text-right">
                                <button class="btn btn-view edit-pkg-btn" data-id="${pkg.id}" data-conn-id="${conn.id}"><i class="fa-solid fa-pencil"></i></button>
                                <button class="btn btn-reject delete-pkg-btn" data-id="${pkg.id}"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('') : '<tr><td colspan="4" class="p-3 text-center text-slate-400">No packages yet.</td></tr>'}</tbody>
                </table></div>`
                : `<div class="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <p><strong>Default Package:</strong> ${conn.default_package || 'N/A'}</p>
                    <p><strong>Default Inbound ID:</strong> ${conn.default_inbound_id || 'N/A'}</p>
                    <p class="col-span-2"><strong>Default Template:</strong> <textarea readonly class="w-full bg-slate-800 p-1 rounded h-16 text-xs">${conn.default_vless_template || ''}</textarea></p>
                </div>`}
            </div>
        `).join('');
    }
    
    function renderPlans() {
        currentView = 'plans';
        contentTitle.textContent = `Plan Management`;
        searchBarContainer.classList.add('hidden');
        addNewBtn.classList.remove('hidden');
        addNewBtn.textContent = 'Add Plan';
        addNewBtn.dataset.type = 'plan';

        const plans = dataCache.plans || [];
        if (plans.length === 0) {
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg">No plans configured.</div>`;
            return;
        }
        contentContainer.innerHTML = `<div class="glass-panel rounded-xl overflow-hidden"><table class="min-w-full text-sm responsive-table">
            <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                <th class="p-3 text-left font-semibold">Plan Name</th><th class="p-3 text-left font-semibold">Price (LKR)</th><th class="p-3 text-left font-semibold">Data (GB)</th><th class="p-3 text-center font-semibold">Actions</th>
            </tr></thead>
            <tbody>${plans.map(plan => `
                <tr class="border-b border-slate-800 hover:bg-slate-800/50">
                    <td data-label="Plan Name">${plan.plan_name}</td>
                    <td data-label="Price">LKR ${plan.price.toFixed(2)}</td>
                    <td data-label="Data">${plan.total_gb} GB</td>
                    <td data-label="Actions" class="actions-cell">
                        <div class="flex justify-center gap-2">
                             <button class="btn btn-reject delete-plan-btn" data-id="${plan.id}"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`).join('')}
            </tbody></table></div>`;
    }

    // --- 6. FORM RENDERING ---
    function showConnectionForm(conn = {}) {
        formModalTitle.textContent = conn.id ? 'Edit Connection' : 'Create New Connection';
        formModalContent.innerHTML = `
            <input type="hidden" name="id" value="${conn.id || ''}">
            <input type="text" name="name" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Connection Name (e.g., Dialog 4G)" value="${conn.name || ''}" required>
            <input type="text" name="icon" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="FontAwesome Icon (e.g., fa-solid fa-wifi)" value="${conn.icon || ''}" required>
            <div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <label for="requires_package_choice" class="font-medium text-slate-200">Requires Multiple Packages?</label>
                <div class="relative inline-block w-10 align-middle select-none"><input type="checkbox" id="requires_package_choice" name="requires_package_choice" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" ${conn.requires_package_choice ? 'checked' : ''}/><label for="requires_package_choice" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer"></label></div>
            </div>
            <div id="single-package-fields" class="${conn.requires_package_choice ? 'hidden' : ''} space-y-4">
                <input type="text" name="default_package" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Default Package Name (Optional)" value="${conn.default_package || ''}">
                <input type="number" name="default_inbound_id" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Default Inbound ID" value="${conn.default_inbound_id || ''}">
                <textarea name="default_vless_template" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" rows="3" placeholder="Default VLESS Template">${conn.default_vless_template || ''}</textarea>
            </div>`;
        formModal.dataset.formType = 'connection';
        formModal.classList.add('active');
        document.getElementById('requires_package_choice').addEventListener('change', e => document.getElementById('single-package-fields').classList.toggle('hidden', e.target.checked));
    }

    function showPackageForm(pkg = {}, connId) {
        formModalTitle.textContent = pkg.id ? 'Edit Package' : 'Create New Package';
        formModalContent.innerHTML = `
            <input type="hidden" name="id" value="${pkg.id || ''}">
            <input type="hidden" name="connection_id" value="${connId}">
            <input type="text" name="name" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Package Name" value="${pkg.name || ''}" required>
            <input type="number" name="inbound_id" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Inbound ID" value="${pkg.inbound_id || ''}" required>
            <textarea name="template" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" rows="4" placeholder="VLESS Template">${pkg.template || ''}</textarea>`;
        formModal.dataset.formType = 'package';
        formModal.classList.add('active');
    }

    function showPlanForm(plan = {}) {
        formModalTitle.textContent = plan.id ? 'Edit Plan' : 'Create New Plan';
        formModalContent.innerHTML = `
            <input type="hidden" name="id" value="${plan.id || ''}">
            <input type="text" name="plan_name" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Plan Name (e.g., 30 Days 100GB)" value="${plan.plan_name || ''}" required>
            <input type="number" step="0.01" name="price" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Price (LKR)" value="${plan.price || ''}" required>
            <input type="number" name="total_gb" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Total Data (GB)" value="${plan.total_gb || ''}" required>`;
        formModal.dataset.formType = 'plan';
        formModal.classList.add('active');
    }

    // --- 7. Main Data Loading & View Dispatcher ---
    async function loadDataAndRender(view) {
        currentView = view;
        renderLoading();
        try {
            const [stats, orders, connections, users, plans] = await Promise.all([
                apiFetch('/stats'), apiFetch('/orders'), apiFetch('/connections'), apiFetch('/users'), apiFetch('/plans')
            ]);
            dataCache = { stats: stats.data, orders: orders.data, connections: connections.data, users: users.data, plans: plans.data };

            Object.keys(dataCache.stats).forEach(key => {
                const el = document.getElementById(`${key}-orders-stat`) || document.getElementById(`total-${key}-stat`);
                if (el) el.textContent = dataCache.stats[key];
            });

            const rendererView = view === 'users' ? () => renderUsers(dataCache.users, 'user') :
                                view === 'resellers' ? () => renderUsers(dataCache.users, 'reseller') :
                                view === 'connections' ? renderConnections :
                                view === 'plans' ? renderPlans : () => renderOrders(view);
            rendererView();

        } catch (error) {
            showToast(error.message, true);
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg text-red-400">Failed to load data. Please refresh.</div>`;
        }
    }

    // --- 8. Event Listeners ---
    document.getElementById('stats-section').addEventListener('click', e => {
        const card = e.target.closest('.glass-panel[id^="card-"]');
        if (!card) return;
        const view = card.id.replace('card-', '');
        setActiveCard(card);
        loadDataAndRender(view);
    });
    
    addNewBtn.addEventListener('click', () => {
        const type = addNewBtn.dataset.type;
        if (type === 'connection') showConnectionForm();
        if (type === 'plan') showPlanForm();
    });

    contentContainer.addEventListener('click', async e => {
        const button = e.target.closest('button');
        if (!button) return;
        const id = button.dataset.id;
        if (button.classList.contains('view-receipt-btn')) { modalImage.src = button.dataset.url; imageModal.classList.add('active'); }
        else if (button.classList.contains('approve-btn')) await handleAction(`/orders/approve`, { orderId: id }, 'Approving...', 'Order Approved', 'POST', button);
        else if (button.classList.contains('reject-btn')) await handleAction(`/orders/reject`, { orderId: id }, 'Rejecting...', 'Order Rejected', 'POST', button);
        else if (button.classList.contains('edit-conn-btn')) showConnectionForm(dataCache.connections.find(c => c.id === id));
        else if (button.classList.contains('delete-conn-btn')) if(confirm('SURE? This deletes connection & ALL its packages.')) await handleAction(`/connections/${id}`, null, 'Deleting...', 'Connection Deleted', 'DELETE', button);
        else if (button.classList.contains('add-pkg-btn')) showPackageForm({}, id);
        else if (button.classList.contains('edit-pkg-btn')) {
            const conn = dataCache.connections.find(c => c.id === button.dataset.connId);
            const pkg = conn.packages.find(p => p.id === id);
            showPackageForm(pkg, button.dataset.connId);
        }
        else if (button.classList.contains('delete-pkg-btn')) if(confirm('Delete this package?')) await handleAction(`/packages/${id}`, null, 'Deleting...', 'Package Deleted', 'DELETE', button);
        else if (button.classList.contains('delete-plan-btn')) if(confirm('Delete this plan?')) await handleAction(`/plans/${id}`, null, 'Deleting...', 'Plan Deleted', 'DELETE', button);
        else if (button.classList.contains('add-credit-btn')) {
            const amount = prompt(`Add credit for ${button.dataset.username}:`);
            if (amount && !isNaN(parseFloat(amount))) await handleAction(`/users/credit`, { userId: id, amount: parseFloat(amount) }, 'Adding Credit...', 'Credit Added', 'POST', button);
        }
    });
    
    formModalSaveBtn.addEventListener('click', () => {
        const form = formModalContent;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        if(form.querySelector('#requires_package_choice')) data.requires_package_choice = form.querySelector('#requires_package_choice').checked;
        const type = formModal.dataset.formType;
        let endpoint, method;
        if (type === 'package') { endpoint = data.id ? `/packages/${data.id}` : '/packages'; method = data.id ? 'PUT' : 'POST'; }
        if (type === 'connection') { endpoint = data.id ? `/connections/${data.id}` : '/connections'; method = data.id ? 'PUT' : 'POST'; }
        if (type === 'plan') { endpoint = data.id ? `/plans/${data.id}` : '/plans'; method = data.id ? 'PUT' : 'POST'; }
        handleAction(endpoint, data, 'Saving...', 'Saved successfully', method, formModalSaveBtn);
        formModal.classList.remove('active');
    });

    async function handleAction(endpoint, body, loadingText, successText, method = 'POST', button) {
        let originalHtml = '';
        if(button) { originalHtml = button.innerHTML; button.disabled = true; button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`; }
        try {
            await apiFetch(endpoint, { method, body: body ? JSON.stringify(body) : null });
            showToast(successText);
            loadDataAndRender(currentView);
        } catch (error) {
            showToast(error.message, true);
        } finally {
            if (button) { button.disabled = false; button.innerHTML = originalHtml; }
        }
    }

    document.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', (e) => e.target.closest('.modal').classList.remove('active')));
    document.getElementById('logout-btn').addEventListener('click', () => { localStorage.removeItem('adminToken'); window.location.href = '/admin-login.html'; });
    document.getElementById('manual-reload-btn').addEventListener('click', () => loadDataAndRender(currentView));
    searchInput.addEventListener('input', () => {
        if (currentView === 'users' || currentView === 'resellers') renderUsers(dataCache.users, currentView === 'users' ? 'user' : 'reseller');
    });

    // --- 9. Initial Load ---
    setActiveCard(document.getElementById(`card-${currentView}`));
    loadDataAndRender(currentView);
});

