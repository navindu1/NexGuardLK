document.addEventListener("DOMContentLoaded", () => {
    
    // This logic runs on both admin.html and admin-login.html
    // So we handle the login form first.
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
        // --- PART 1: LOGIN PAGE LOGIC ---
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const rememberMe = document.getElementById('remember-me').checked;
            const messageDiv = document.getElementById('error-message');
            const loginButton = loginForm.querySelector('button[type="submit"]');

            loginButton.disabled = true;
            loginButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Logging in...';

            try {
                const response = await fetch('/api/auth/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, rememberMe }),
                });
                const result = await response.json();
                if (result.success) {
                    localStorage.setItem('nexguard_admin_token', result.token);
                    window.location.href = '/admin'; 
                } else {
                    messageDiv.textContent = result.message;
                }
            } catch (error) {
                messageDiv.textContent = 'An error occurred. Please try again.';
            } finally {
                loginButton.disabled = false;
                loginButton.innerHTML = 'Login';
            }
        });
        // If we are on the login page, we don't need to run the dashboard logic.
        return; 
    }

    // --- PART 2: ADMIN DASHBOARD LOGIC (Runs only on admin.html) ---
    const token = localStorage.getItem('nexguard_admin_token');
    if (!token) {
        window.location.href = '/admin/login';
        return;
    }

    const autoReloadCheckbox = document.getElementById('auto-reload-checkbox');
    let autoReloadInterval;

    // --- NEW: Function to handle reload state ---
    const setupAutoReload = () => {
        const isEnabled = localStorage.getItem('autoReloadEnabled') === 'true';
        autoReloadCheckbox.checked = isEnabled;

        if (isEnabled) {
            autoReloadInterval = setInterval(() => {
                // Only reload if viewing an order list
                if (['pending', 'unconfirmed', 'approved', 'rejected'].includes(currentView)) {
                    showToast('Auto-reloading data...', false);
                    loadDataAndRender(currentView);
                }
            }, 30000); // Reload every 30 seconds
        } else {
            clearInterval(autoReloadInterval);
        }
    };

    // --- NEW: Event listener for the checkbox ---
    autoReloadCheckbox.addEventListener('change', () => {
        localStorage.setItem('autoReloadEnabled', autoReloadCheckbox.checked);
        clearInterval(autoReloadInterval); // Clear any existing interval before setting up a new one
        setupAutoReload();
        if (autoReloadCheckbox.checked) {
            showToast('Auto-reload enabled.', false);
        } else {
            showToast('Auto-reload disabled.', true);
        }
    });

    // --- Element Selectors ---
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
    const settingsBtn = document.getElementById('settings-btn');

    
    // --- State Management ---
    let currentView = 'pending';
    let dataCache = { orders: [], users: [], connections: [], plans: [], settings: {} };

    // --- Helper Functions ---
    function logout() {
        localStorage.removeItem('nexguard_admin_token');
        window.location.href = '/admin/login';
    }

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
         if (response.status === 401 || response.status === 403) {
            logout();
            return; 
        }
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

    // --- RENDER FUNCTIONS ---
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
        contentContainer.innerHTML = orders.map(order => {
        // --- NEW: Add a variable for the final username ---
        const finalUsernameHtml = order.final_username 
            ? `<div><span class="font-bold text-slate-400 text-xs">V2Ray User</span><p class="text-purple-300">${order.final_username}</p></div>`
            : '';

        return `
            <div class="glass-panel p-4 rounded-lg grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
                <div><span class="font-bold text-slate-400 text-xs">User</span><p>${order.website_username}</p></div>
                <div><span class="font-bold text-slate-400 text-xs">Plan</span><p>${order.plan_id}</p></div>
                ${status === 'approved' ? finalUsernameHtml : `<div><span class="font-bold text-slate-400 text-xs">Type</span><p>${order.is_renewal ? 'Renewal' : 'New'}</p></div>`}
                <div><span class="font-bold text-slate-400 text-xs">Submitted</span><p>${new Date(order.created_at).toLocaleString()}</p></div>
                <div class="flex gap-2"><button class="btn btn-view view-receipt-btn" data-url="${order.receipt_path}"><i class="fa-solid fa-receipt"></i></button></div>
                <div class="flex gap-2 items-center justify-end">
                    ${status === 'pending' || status === 'unconfirmed' ? `
                    <button class="btn btn-approve approve-btn" data-id="${order.id}">Approve</button>
                    <button class="btn btn-reject reject-btn" data-id="${order.id}">Reject</button>` 
                    : `<span class="text-xs text-gray-500">Action Taken</span>`}
                </div>
            </div>`;
    }).join('');
}

    function renderUsers(users, role = 'user') {
        currentView = role === 'user' ? 'users' : 'resellers';
        const title = role === 'user' ? 'User' : 'Reseller';
        contentTitle.textContent = `${title} Management`;
        searchBarContainer.classList.remove('hidden');
        searchInput.placeholder = `Search ${title}s...`;
        addNewBtn.classList.add('hidden');
        const filteredUsers = (users || []).filter(u => u.role === role && (u.username.toLowerCase().includes(searchInput.value.toLowerCase()) || (u.email || '').toLowerCase().includes(searchInput.value.toLowerCase())));
        if (filteredUsers.length === 0) {
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg">No ${title.toLowerCase()}s found.</div>`;
            return;
        }
        const tableHeaders = role === 'user' ? `<th class="p-3 text-left font-semibold">Active Plans</th>` : `<th class="p-3 text-left font-semibold">Credit Balance</th>`;
        contentContainer.innerHTML = `<div class="glass-panel rounded-xl overflow-hidden"><table class="min-w-full text-sm responsive-table">
            <thead class="border-b border-slate-700 bg-slate-900/50"><tr>
                <th class="p-3 text-left font-semibold">Username</th><th class="p-3 text-left font-semibold">Contact</th>${tableHeaders}<th class="p-3 text-center font-semibold">Actions</th>
            </tr></thead>
            <tbody>${filteredUsers.map(user => {
                const roleSpecificData = role === 'user' ? `<td data-label="Active Plans">${(user.active_plans || []).length}</td>` : `<td data-label="Credit">LKR ${user.credit_balance.toFixed(2)}</td>`;
                const roleSpecificButtons = role === 'reseller' ? `<button class="btn btn-approve add-credit-btn" data-id="${user.id}" data-username="${user.username}"><i class="fa-solid fa-coins"></i></button>` : '';
                return `<tr class="border-b border-slate-800 hover:bg-slate-800/50">
                    <td data-label="Username">${user.username}</td>
                    <td data-label="Contact"><div>${user.email}</div><div class="text-xs text-slate-400">${user.whatsapp || ''}</div></td>
                    ${roleSpecificData}
                    <td data-label="Actions" class="actions-cell"><div class="flex justify-center gap-2">${roleSpecificButtons}<button class="btn btn-ban" data-id="${user.id}"><i class="fa-solid fa-user-slash"></i></button></div></td>
                </tr>`}).join('')}
            </tbody></table></div>`;
    }

    function renderConnections() {
        currentView = 'connections';
        contentTitle.textContent = `Connections & Packages`;
        searchBarContainer.classList.add('hidden');
        addNewBtn.classList.remove('hidden');
        addNewBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Connection';
        addNewBtn.dataset.type = 'connection';

        const connections = dataCache.connections || [];
        if (connections.length === 0) {
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg">No connections configured. Click 'Add Connection' to start.</div>`;
            return;
        }

        contentContainer.innerHTML = connections.map((conn, index) => {
            const isMultiPackage = conn.requires_package_choice;
            const isCollapsed = index > 0;

            const headerHtml = `
                <div class="connection-header ${isCollapsed ? 'collapsed' : ''}" data-collapsible-target="conn-body-${conn.id}">
                    <div class="connection-title flex items-center gap-4">
                         <i class="fa-solid fa-chevron-right collapse-icon text-slate-400"></i>
                        <h3>
                            <i class="${conn.icon || 'fa-solid fa-server'} text-purple-400"></i>
                            <span>${conn.name}</span>
                            <span class="type-badge ${isMultiPackage ? 'multi-package' : 'single-package'}">
                                ${isMultiPackage ? 'Multi-Package' : 'Single-Package'}
                            </span>
                        </h3>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-view edit-conn-btn" data-id="${conn.id}"><i class="fa-solid fa-pencil"></i> Edit</button>
                        <button class="btn btn-reject delete-conn-btn" data-id="${conn.id}"><i class="fa-solid fa-trash"></i> Delete</button>
                        ${isMultiPackage ? `<button class="btn btn-approve add-pkg-btn" data-id="${conn.id}"><i class="fa-solid fa-plus"></i> Add Package</button>` : ''}
                    </div>
                </div>`;

            let bodyHtml = '';
            if (isMultiPackage) {
                const packages = conn.packages || [];
                const packageListHtml = packages.length > 0
                    ? packages.map(pkg => {
                        const templateValue = pkg.template || '';
                        return `
                        <div class="package-item">
                            <div class="name">${pkg.name}</div>
                            <div class="inbound">Inbound: <strong>${pkg.inbound_id}</strong></div>
                            <div class="template-display">
                                <p class="template-text" title="${templateValue}">${templateValue}</p>
                            </div>
                            <div class="actions">
                                <button class="btn btn-view !p-2" onclick="navigator.clipboard.writeText('${templateValue.replace(/'/g, "\\'")}')" title="Copy VLESS Link"><i class="fa-solid fa-copy"></i></button>
                                <button class="btn btn-view edit-pkg-btn !p-2" data-id="${pkg.id}" data-conn-id="${conn.id}" title="Edit Package"><i class="fa-solid fa-pencil"></i></button>
                                <button class="btn btn-reject delete-pkg-btn !p-2" data-id="${pkg.id}" title="Delete Package"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>`;
                    }).join('')
                    : '<div class="text-center p-4 text-slate-400 text-sm">No packages added for this connection yet.</div>';
                
                bodyHtml = `<div class="package-list">${packageListHtml}</div>`;
            } else {
                const templateValue = conn.default_vless_template || '';
                bodyHtml = `
                    <div class="details-grid">
                        <div class="detail-item"><div class="label">Default Package</div><div class="value">${conn.default_package || 'N/A'}</div></div>
                        <div class="detail-item"><div class="label">Default Inbound ID</div><div class="value">${conn.default_inbound_id || 'N/A'}</div></div>
                    </div>
                    <div class="detail-item">
                        <div class="label">Default Template</div>
                        <div class="relative">
                            <textarea readonly class="w-full bg-slate-800/50 p-2 rounded h-20 text-xs font-mono pr-10">${templateValue}</textarea>
                            <button class="absolute top-2 right-2 btn btn-view !p-2" onclick="navigator.clipboard.writeText('${templateValue.replace(/'/g, "\\'")}')" title="Copy VLESS Link"><i class="fa-solid fa-copy"></i></button>
                        </div>
                    </div>`;
            }
            
            return `<div class="connection-card">
                        ${headerHtml}
                        <div class="connection-body ${!isCollapsed ? 'expanded' : ''}" id="conn-body-${conn.id}">
                            ${bodyHtml}
                        </div>
                    </div>`;

        }).join('');
    }
    
    function renderPlans() {
        currentView = 'plans';
        contentTitle.textContent = `Plan Management`;
        searchBarContainer.classList.add('hidden');
        addNewBtn.classList.remove('hidden');
        addNewBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Plan';
        addNewBtn.dataset.type = 'plan';

        const plans = dataCache.plans || [];
        if (plans.length === 0) {
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg">No plans configured.</div>`;
            return;
        }

        contentContainer.innerHTML = `
        <div class="connection-card">
            <div class="connection-body expanded" style="padding: 0;">
                <table class="min-w-full text-sm responsive-table">
                    <thead class="border-b border-slate-700 bg-slate-900/50">
                        <tr>
                            <th class="p-4 text-left font-semibold">Plan Name</th>
                            <th class="p-4 text-left font-semibold">Price (LKR)</th>
                            <th class="p-4 text-left font-semibold">Data (GB)</th>
                            <th class="p-4 text-center font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${plans.map(plan => `
                            <tr class="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/50">
                                <td data-label="Plan Name" class="p-4 font-medium text-white">${plan.plan_name}</td>
                                <td data-label="Price" class="p-4">LKR ${plan.price.toFixed(2)}</td>
                                <td data-label="Data" class="p-4">${plan.total_gb === 0 ? 'Unlimited' : `${plan.total_gb} GB`}</td>
                                <td data-label="Actions" class="actions-cell p-4">
                                    <div class="flex justify-center gap-2">
                                        <button class="btn btn-reject delete-plan-btn" data-id="${plan.id}" title="Delete Plan"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    // --- FORM RENDERING ---
    function showConnectionForm(conn = {}) {
        const isEditing = !!conn.id;
        formModalTitle.textContent = isEditing ? 'Edit Connection' : 'Create New Connection';
        
        formModalContent.innerHTML = `
            <input type="hidden" name="id" value="${conn.id || ''}">
            <input type="text" name="name" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="Connection Name (e.g., Dialog 4G)" value="${conn.name || ''}" required>
            <input type="text" name="icon" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="FontAwesome Icon (e.g., fa-solid fa-wifi)" value="${conn.icon || ''}" required>
            <div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <label for="requires_package_choice" class="font-medium text-slate-200">Requires Multiple Packages?</label>
                <div class="relative inline-block w-10 align-middle select-none">
                    <input type="checkbox" id="requires_package_choice" name="requires_package_choice" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" ${conn.requires_package_choice ? 'checked' : ''}/>
                    <label for="requires_package_choice" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer"></label>
                </div>
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
            <input type="hidden" name="id" value="${pkg.id || ''}"><input type="hidden" name="connection_id" value="${connId}">
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

    async function loadDataAndRender(view) {
        currentView = view;
        renderLoading();
        try {
            const result = await apiFetch('/stats');
            if (!result) return;
            dataCache.stats = result.data;
            
            Object.keys(dataCache.stats).forEach(key => {
                const el = document.getElementById(`${key}-orders-stat`) || document.getElementById(`total-${key}-stat`);
                if (el) el.textContent = dataCache.stats[key];
            });

            if (['pending', 'unconfirmed', 'approved', 'rejected'].includes(view)) {
                const ordersResult = await apiFetch('/orders');
                dataCache.orders = ordersResult.data;
                renderOrders(view);
            } else if (['users', 'resellers'].includes(view)) {
                const usersResult = await apiFetch('/users');
                dataCache.users = usersResult.data;
                renderUsers(dataCache.users, view === 'users' ? 'user' : 'reseller');
            } else if (view === 'connections') {
                const connResult = await apiFetch('/connections');
                dataCache.connections = connResult.data;
                renderConnections();
            } else if (view === 'plans') {
                const plansResult = await apiFetch('/plans');
                dataCache.plans = plansResult.data;
                renderPlans();
            }
        } catch (error) {
            showToast(error.message, true);
            contentContainer.innerHTML = `<div class="glass-panel p-6 text-center rounded-lg text-red-400">Failed to load data. Please refresh.</div>`;
        }
    }

    // --- Event Listeners ---
    document.getElementById('stats-section').addEventListener('click', e => {
    const card = e.target.closest('.glass-panel[id^="card-"]');
    if (!card) return;

    const view = card.id.replace('card-', '');

    // --- අලුතින් එක් කළ வேண்டிய කොටස ---
    if (view === 'reports') {
        renderReportModal();
        return; // 여기서 함수를 종료합니다.
    }
    // --- අලුත් කොටස අවසන් ---

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
        const header = e.target.closest('[data-collapsible-target]');
    
        if (button) {
            const id = button.dataset.id;
            const connId = button.dataset.connId;
    
            switch (true) {
                case button.classList.contains('view-receipt-btn'):
                    modalImage.src = button.dataset.url;
                    imageModal.classList.add('active');
                    break;
                case button.classList.contains('approve-btn'):
                    await handleAction(`/orders/approve`, { orderId: id }, 'Approving...', 'Order Approved', 'POST', button);
                    break;
                case button.classList.contains('reject-btn'):
                    await handleAction(`/orders/reject`, { orderId: id }, 'Rejecting...', 'Order Rejected', 'POST', button);
                    break;
                case button.classList.contains('edit-conn-btn'): {
                    const connToEdit = dataCache.connections.find(c => c.id == id);
                    if (connToEdit) showConnectionForm(connToEdit);
                    break;
                }
                case button.classList.contains('delete-conn-btn'):
                    if(confirm('SURE? This deletes connection & ALL its packages.')) {
                        await handleAction(`/connections/${id}`, null, 'Deleting...', 'Connection Deleted', 'DELETE', button);
                    }
                    break;
                case button.classList.contains('add-pkg-btn'):
                    showPackageForm({}, id);
                    break;
                case button.classList.contains('edit-pkg-btn'): {
                    const conn = dataCache.connections.find(c => c.id == connId);
                    if (conn) {
                        const pkg = conn.packages.find(p => p.id == id);
                        if (pkg) showPackageForm(pkg, connId);
                    }
                    break;
                }
                case button.classList.contains('delete-pkg-btn'):
                    if(confirm('Delete this package?')) {
                        await handleAction(`/packages/${id}`, null, 'Deleting...', 'Package Deleted', 'DELETE', button);
                    }
                    break;
                case button.classList.contains('delete-plan-btn'):
                     if(confirm('Delete this plan?')) {
                        await handleAction(`/plans/${id}`, null, 'Deleting...', 'Plan Deleted', 'DELETE', button);
                    }
                    break;
                case button.classList.contains('add-credit-btn'): {
                    const amount = prompt(`Add credit for ${button.dataset.username}:`);
                    if (amount && !isNaN(parseFloat(amount))) {
                        await handleAction(`/users/credit`, { userId: id, amount: parseFloat(amount) }, 'Adding Credit...', 'Credit Added', 'POST', button);
                    }
                    break;
                }
            }
            return;
        }
    
        if (header) {
            const targetId = header.dataset.collapsibleTarget;
            const targetBody = document.getElementById(targetId);
            if (targetBody) {
                header.classList.toggle('collapsed');
                targetBody.classList.toggle('expanded');
            }
        }
    });
    
    formModalSaveBtn.addEventListener('click', (e) => {
        const form = e.target.closest('.modal').querySelector('#form-modal-content');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        if(form.querySelector('#requires_package_choice')) { data.requires_package_choice = form.querySelector('#requires_package_choice').checked; }
        const type = formModal.dataset.formType;
        let endpoint, method;
        if (type === 'package') { endpoint = data.id ? `/packages/${data.id}` : '/packages'; method = data.id ? 'PUT' : 'POST'; }
        if (type === 'connection') { endpoint = data.id ? `/connections/${data.id}` : '/connections'; method = data.id ? 'PUT' : 'POST'; }
        if (type === 'plan') { endpoint = data.id ? `/plans/${data.id}` : '/plans'; method = data.id ? 'PUT' : 'POST'; }
        handleAction(endpoint, data, 'Saving...', 'Saved successfully', method, formModalSaveBtn);
        formModal.classList.remove('active');
    });

    async function renderReportModal() {
    reportModalContent.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-xl"></i></div>';
    reportModal.classList.add('active');
    try {
        const result = await apiFetch('/reports/summary');
        const summary = result.data;
        
        const formatSummary = (period, data) => `
            <div class="bg-slate-800/50 p-4 rounded-lg">
                <h4 class="text-lg font-bold text-purple-300 capitalize">${period}</h4>
                <div class="mt-2 grid grid-cols-2 gap-4 text-center">
                    <div>
                        <p class="text-xs text-slate-400">Approved Orders</p>
                        <p class="text-2xl font-bold text-white">${data.count}</p>
                    </div>
                    <div>
                        <p class="text-xs text-slate-400">Total Revenue</p>
                        <p class="text-2xl font-bold text-white">LKR ${data.revenue.toFixed(2)}</p>
                    </div>
                </div>
            </div>
        `;

        reportModalContent.innerHTML = `
            ${formatSummary('daily', summary.daily)}
            ${formatSummary('weekly', summary.weekly)}
            ${formatSummary('monthly', summary.monthly)}
        `;

    } catch (error) {
        showToast(error.message, true);
        reportModalContent.innerHTML = '<p class="text-red-400">Failed to load report summary.</p>';
    }
}


    async function renderSettingsModal() {
        const settingsContent = document.getElementById('settings-modal-content');
        const settingsModalEl = document.getElementById('settings-modal');
        settingsContent.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin text-xl"></i></div>';
        settingsModalEl.classList.add('active');
        try {
            const [settingsResult, connectionsResult] = await Promise.all([apiFetch('/settings'), apiFetch('/connections')]);
            const settings = settingsResult.data || {};
            const connections = connectionsResult.data || [];
            let settingsHtml = `<div><h4 class="font-bold text-lg text-purple-300 mb-2">Auto-Confirm Orders</h4><p class="text-xs text-slate-400 mb-4">Enable this to automatically move pending orders to 'Unconfirmed' for review after 10 minutes.</p><div class="space-y-3">`;
            connections.forEach(conn => {
                const settingKey = `auto_approve_${conn.name}`;
                const isChecked = settings[settingKey] === 'true' || settings[settingKey] === true;
                settingsHtml += `<div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"><label for="${settingKey}" class="font-medium text-slate-200">${conn.name}</label><div class="relative inline-block w-10 align-middle select-none"><input type="checkbox" id="${settingKey}" name="${settingKey}" class="toggle-checkbox setting-toggle absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" ${isChecked ? 'checked' : ''}/><label for="${settingKey}" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer"></label></div></div>`;
            });
            settingsHtml += '</div></div>';
            settingsContent.innerHTML = settingsHtml;
        } catch (error) {
            showToast(error.message, true);
            settingsContent.innerHTML = '<p class="text-red-400">Failed to load settings.</p>';
        }
    }

    settingsBtn.addEventListener('click', renderSettingsModal);

    document.getElementById('settings-modal-save-btn').addEventListener('click', async (e) => {
        const button = e.target;
        const toggles = document.querySelectorAll('.setting-toggle');
        const settingsToSave = {};
        toggles.forEach(toggle => { settingsToSave[toggle.name] = toggle.checked; });
        await handleAction('/settings', settingsToSave, 'Saving...', 'Settings Saved!', 'POST', button);
        document.getElementById('settings-modal').classList.remove('active');
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
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('manual-reload-btn').addEventListener('click', () => loadDataAndRender(currentView));
    searchInput.addEventListener('input', () => {
        if (currentView === 'users' || currentView === 'resellers') renderUsers(dataCache.users, currentView === 'users' ? 'user' : 'reseller');
    });

    setActiveCard(document.getElementById(`card-${currentView}`));
    loadDataAndRender(currentView);
    setupAutoReload();
});

//------new-------//