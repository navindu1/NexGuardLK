// File Path: public/js/reseller.js
document.addEventListener('DOMContentLoaded', () => {
    VANTA.WAVES({ el: "#vanta-bg", mouseControls: true, touchControls: true, gyroControls: false, minHeight: 200.0, minWidth: 200.0, scale: 1.0, scaleMobile: 1.0, color: 0x20002f, shininess: 25.0, waveHeight: 15.0, waveSpeed: 0.65, zoom: 0.85 });

    const token = localStorage.getItem('nexguard_reseller_token');
    if (!token) {
        window.location.href = '/reseller/login';
        return;
    }

    // --- DOM Elements ---
    const userListContainer = document.getElementById('user-list-container');
    const userSearchInput = document.getElementById('user-search');
    const createUserBtn = document.getElementById('create-user-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const settingsBtn = document.getElementById('settings-btn');
    
    // --- Modals ---
    const createUserModal = document.getElementById('create-user-modal');
    const userCreatedModal = document.getElementById('user-created-modal');
    const userDetailsModal = document.getElementById('user-details-modal');
    const appSettingsModal = document.getElementById('app-settings-modal');

    // --- State ---
    let allUsers = [];
    let connections = [];

    // --- Helper Functions (Toast & API) ---
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

    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const api = {
        get: (endpoint) => fetch(endpoint, { headers }).then(res => res.json()),
        post: (endpoint, body) => fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }).then(res => res.json()),
        put: (endpoint, body) => fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(body) }).then(res => res.json()),
        delete: (endpoint) => fetch(endpoint, { method: 'DELETE', headers }).then(res => res.json()),
    };

    // --- Render Functions ---
    const renderDashboard = (data) => {
        document.getElementById('reseller-username').textContent = `Welcome, ${data.reseller.username}`;
        document.getElementById('total-users-stat').textContent = data.userCount;
        document.getElementById('credit-balance-stat').textContent = `LKR ${parseFloat(data.reseller.credit_balance || 0).toFixed(2)}`;
    };

    const renderUsers = (usersToRender) => {
        if (usersToRender.length === 0) {
            userListContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">You have not created any users yet.</div>';
            return;
        }
        userListContainer.innerHTML = usersToRender.map(user => {
            const plan = user.active_plans[0] || {};
            return `
            <div class="glass-panel p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer hover:border-purple-500 border border-transparent transition-colors view-user-details" data-user-id="${user.id}">
                <div>
                    <p class="font-bold text-lg text-white break-all">${plan.v2rayUsername || user.username}</p>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 mt-1">
                        <span><i class="fa-solid fa-rocket fa-fw text-purple-400"></i> Plan: <strong class="text-gray-200">${plan.planId || 'N/A'}</strong></span>
                        <span><i class="fa-solid fa-wifi fa-fw text-purple-400"></i> Connection: <strong class="text-gray-200">${plan.connId || 'N/A'}</strong></span>
                    </div>
                </div>
                <div class="text-xs text-slate-300 self-end sm:self-center">Created: ${new Date(user.created_at).toLocaleDateString()}</div>
            </div>`;
        }).join('');
    };

    const renderCreateUserModal = () => {
        const planOptions = `<option value="" disabled selected>Select Plan</option>
                                 <option value="100GB">100GB Plan</option>
                                 <option value="200GB">200GB Plan</option>
                                 <option value="Unlimited">Unlimited Plan</option>`;
        const connOptions = connections.length > 0
            ? connections.map(c => `<option value="${c.name}">${c.name}</option>`).join('')
            : '<option disabled>No connections available</option>';

        createUserModal.innerHTML = `
            <div class="glass-panel w-full max-w-md p-6 rounded-lg relative">
                <button class="modal-close-btn absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">&times;</button>
                <h2 class="text-xl font-bold font-['Orbitron'] mb-4">Create New V2Ray User</h2>
                <form id="create-user-form" class="space-y-4">
                    <input type="text" name="username" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="V2Ray Username" required>
                    <select name="planId" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" required>${planOptions}</select>
                    <select name="connId" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" required>${connOptions}</select>
                    <button type="submit" class="w-full ai-button py-2.5 rounded-lg font-semibold">Create User</button>
                </form>
            </div>`;
        createUserModal.classList.add('active');
    };
    
    const renderUserCreatedModal = (username, v2rayLink) => {
        userCreatedModal.innerHTML = `
            <div class="glass-panel w-full max-w-md p-6 rounded-lg text-center relative">
                <button class="modal-close-btn absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">&times;</button>
                <i class="fa-solid fa-check-circle text-5xl text-green-400 mb-4"></i>
                <h2 class="text-xl font-bold font-['Orbitron'] mb-2">User Created!</h2>
                <p class="text-slate-300 mb-4">User <strong class="text-white">${username}</strong> has been successfully created.</p>
                <div class="relative bg-slate-900/70 p-3 rounded-md text-left">
                   <p class="font-mono text-xs text-slate-400 break-all pr-16">${v2rayLink}</p>
                   <button class="absolute top-2 right-2 copy-btn bg-purple-500/20 text-purple-300 hover:bg-purple-500/40 px-3 py-1 text-xs rounded-md" data-link="${v2rayLink}">
                       <i class="fa-solid fa-copy"></i> Copy
                   </button>
                </div>
            </div>`;
        userCreatedModal.classList.add('active');
    };

    const renderUserDetailsModal = (user) => {
        const plan = user.active_plans[0] || {};
        userDetailsModal.innerHTML = `
            <div class="glass-panel w-full max-w-lg p-6 rounded-lg relative">
                <button class="modal-close-btn absolute top-4 right-4 text-gray-400 hover:text-white text-2xl">&times;</button>
                <h2 class="text-xl font-bold font-['Orbitron'] mb-4 break-all">${plan.v2rayUsername || user.username}</h2>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between p-2 bg-slate-800/50 rounded"><span>Plan:</span><span class="font-semibold text-white">${plan.planId}</span></div>
                    <div class="flex justify-between p-2 bg-slate-800/50 rounded"><span>Connection:</span><span class="font-semibold text-white">${plan.connId}</span></div>
                    <div class="flex justify-between p-2 bg-slate-800/50 rounded"><span>Created Date:</span><span class="font-semibold text-white">${new Date(user.created_at).toLocaleString()}</span></div>
                </div>
                <div class="mt-4">
                    <label class="text-xs text-slate-400">V2Ray Link</label>
                    <div class="relative bg-slate-900/70 p-3 rounded-md text-left mt-1">
                       <p class="font-mono text-xs text-slate-400 break-all pr-16">${plan.v2rayLink}</p>
                       <button class="absolute top-2 right-2 copy-btn bg-purple-500/20 text-purple-300 hover:bg-purple-500/40 px-3 py-1 text-xs rounded-md" data-link="${plan.v2rayLink}"><i class="fa-solid fa-copy"></i> Copy</button>
                    </div>
                </div>
                <div class="mt-6 border-t border-red-500/30 pt-4">
                    <button class="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 font-semibold delete-user-btn" data-user-id="${user.id}" data-username="${plan.v2rayUsername || user.username}">
                        <i class="fa-solid fa-trash"></i> Delete This User
                    </button>
                </div>
            </div>`;
        userDetailsModal.classList.add('active');
    };

    // --- Main Logic ---
    const loadDashboardData = async () => {
        userListContainer.innerHTML = '<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-purple-400"></i></div>';
        try {
            const result = await api.get('/api/reseller/dashboard-data');
            if (!result.success) throw new Error(result.message);
            
            renderDashboard(result.data);
            allUsers = result.data.users;
            renderUsers(allUsers);

        } catch (error) {
            console.error(error);
            userListContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-red-400">${error.message}</div>`;
        }
    };

    // --- Event Listeners ---
    createUserBtn.addEventListener('click', async () => {
        if (connections.length === 0) {
            try {
                const result = await api.get('/api/connections');
                if (result.success) connections = result.data;
            } catch (error) {
                 showToast('Could not load connections.', true);
            }
        }
        renderCreateUserModal();
    });

    userListContainer.addEventListener('click', async (e) => {
        const userCard = e.target.closest('.view-user-details');
        if (userCard) {
            const userId = userCard.dataset.userId;
            const user = allUsers.find(u => u.id === userId);
            if(user) renderUserDetailsModal(user);
        }
    });

    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'create-user-form') {
            e.preventDefault();
            const button = e.target.querySelector('button[type="submit"]');
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Creating...';
            const data = Object.fromEntries(new FormData(e.target).entries());
            
            try {
                const result = await api.post('/api/reseller/users', data);
                if (!result.success) throw new Error(result.message);
                
                createUserModal.classList.remove('active');
                renderUserCreatedModal(result.data.v2rayUsername, result.data.v2rayLink);
                await loadDashboardData();
            } catch (error) {
                showToast(`Error: ${error.message}`, true);
            } finally {
                button.disabled = false;
                button.innerHTML = 'Create User';
            }
        }
    });

    document.body.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.modal-close-btn');
        if (closeBtn) closeBtn.closest('.modal').classList.remove('active');

        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            navigator.clipboard.writeText(copyBtn.dataset.link);
            showToast('Link Copied!');
        }
        
        const deleteBtn = e.target.closest('.delete-user-btn');
        if (deleteBtn) {
            const userId = deleteBtn.dataset.userId;
            const username = deleteBtn.dataset.username;
            if (confirm(`Are you sure you want to permanently delete user "${username}"?`)) {
                api.delete(`/api/reseller/users/${userId}`).then(result => {
                    if (result.success) {
                        showToast('User deleted successfully.');
                        userDetailsModal.classList.remove('active');
                        loadDashboardData();
                    } else {
                        showToast(`Error: ${result.message}`, true);
                    }
                });
            }
        }
    });
    
    userSearchInput.addEventListener('input', () => {
        const searchTerm = userSearchInput.value.toLowerCase();
        const filtered = allUsers.filter(user => {
            const plan = user.active_plans[0] || {};
            return (plan.v2rayUsername || user.username).toLowerCase().includes(searchTerm);
        });
        renderUsers(filtered);
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('nexguard_reseller_token');
        window.location.href = '/reseller/login';
    });

    // --- Initial Load ---
    loadDashboardData();
});

