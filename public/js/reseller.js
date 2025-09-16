// File Path: public/js/reseller.js
document.addEventListener('DOMContentLoaded', () => {
    // Vanta.js Background Effect
    VANTA.WAVES({ el: "#vanta-bg", mouseControls: true, touchControls: true, gyroControls: false, minHeight: 200.0, minWidth: 200.0, scale: 1.0, scaleMobile: 1.0, color: 0x20002f, shininess: 25.0, waveHeight: 15.0, waveSpeed: 0.65, zoom: 0.85 });

    const token = localStorage.getItem('nexguard_reseller_token');
    if (!token) {
        window.location.href = '/reseller/login';
        return;
    }

    // --- DOM Elements ---
    const userListContainer = document.getElementById('user-list-container');
    const userSearchInput = document.getElementById('user-search');
    let allUsers = []; // Cache for user data
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // --- Modal Elements ---
    const createUserModal = document.getElementById('create-user-modal');
    const userCreatedModal = document.getElementById('user-created-modal');
    const userDetailsModal = document.getElementById('user-details-modal');
    const appSettingsModal = document.getElementById('app-settings-modal');

    // --- Toast Notification Function ---
    function showToast(message, type = 'success') { /* ... (same as before) ... */ }

    // --- Modal Helper Functions ---
    function openModal(modalElement) {
        modalElement.classList.remove('opacity-0', 'pointer-events-none');
        modalElement.querySelector('.modal-content').classList.remove('scale-95');
    }
    function closeModal(modalElement) {
        modalElement.classList.add('opacity-0', 'pointer-events-none');
        modalElement.querySelector('.modal-content').classList.add('scale-95');
    }

    // --- Render Functions ---
    const renderUsers = (usersToRender) => {
        if (usersToRender.length === 0) {
            userListContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">You have not created any users yet.</div>';
            return;
        }
        userListContainer.innerHTML = usersToRender.map(user => {
            const plan = user.active_plans[0] || {};
            return `
            <div class="glass-panel p-4 rounded-lg space-y-3 cursor-pointer hover:border-purple-500 border border-transparent transition-colors" data-username="${plan.v2rayUsername}">
                <div class="flex justify-between items-start">
                    <p class="font-bold text-lg text-white break-all">${plan.v2rayUsername || 'N/A'}</p>
                    <span class="bg-green-500/20 text-green-300 text-xs font-medium px-3 py-1 rounded-full flex-shrink-0 ml-2">Active</span>
                </div>
                <div class="flex flex-col sm:flex-row text-xs text-gray-400 gap-x-4 gap-y-1">
                    <span><i class="fa-solid fa-rocket fa-fw text-purple-400"></i> Plan: <strong class="text-gray-200">${plan.planId || 'N/A'}</strong></span>
                    <span><i class="fa-solid fa-wifi fa-fw text-purple-400"></i> Connection: <strong class="text-gray-200">${plan.connId || 'N/A'}</strong></span>
                    <span><i class="fa-solid fa-calendar-check fa-fw text-purple-400"></i> Created: <strong class="text-gray-200">${new Date(user.created_at).toLocaleDateString()}</strong></span>
                </div>
            </div>`;
        }).join('');
    };

    const renderCreateUserModal = () => {
        createUserModal.innerHTML = `
            <div class="modal-content glass-panel w-full max-w-md p-6 rounded-lg transform scale-95">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold font-['Orbitron']">Create V2Ray User</h2>
                    <button class="close-modal-btn text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                <form id="create-user-form" class="space-y-4">
                    <input type="text" name="username" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" placeholder="V2Ray Username" required>
                    <select name="planId" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" required>
                        <option value="" disabled selected>Select Plan</option>
                        <option value="100GB">100GB Plan</option>
                        <option value="200GB">200GB Plan</option>
                        <option value="Unlimited">Unlimited Plan</option>
                    </select>
                    <select name="connId" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" required>
                        <option value="" disabled selected>Select Connection</option>
                        <option value="dialog">Dialog Router</option>
                        <option value="hutch">Hutch SIM</option>
                        <option value="dialog_sim">Dialog SIM</option>
                    </select>
                    <button type="submit" class="w-full ai-button py-2.5 rounded-lg font-semibold">Create User</button>
                </form>
            </div>`;
    };

    const renderUserCreatedModal = (username, v2rayLink) => {
        userCreatedModal.innerHTML = `
            <div class="modal-content glass-panel w-full max-w-md p-6 rounded-lg text-center transform scale-95">
                 <i class="fa-solid fa-check-circle text-5xl text-green-400 mb-4"></i>
                 <h2 class="text-xl font-bold font-['Orbitron'] mb-2">User Created!</h2>
                 <p class="text-slate-300 mb-4">User <strong class="text-white">${username}</strong> has been successfully created.</p>
                 <div class="relative bg-slate-900/70 p-3 rounded-md text-left">
                    <p class="font-mono text-xs text-slate-400 break-all pr-16">${v2rayLink}</p>
                    <button class="absolute top-2 right-2 copy-btn bg-purple-500/20 text-purple-300 hover:bg-purple-500/40 px-3 py-1 text-xs rounded-md" data-link="${v2rayLink}">
                        <i class="fa-solid fa-copy"></i> Copy
                    </button>
                 </div>
                 <button class="close-modal-btn mt-6 w-full bg-slate-700/50 hover:bg-slate-700 text-slate-200 py-2 rounded-lg">Close</button>
            </div>`;
    };

    // --- Main Logic ---
    const fetchAndRenderUsers = async () => { /* ... (same as before) ... */ };
    
    // --- Event Listeners ---
    document.getElementById('create-user-btn').addEventListener('click', () => {
        renderCreateUserModal();
        openModal(createUserModal);
    });

    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'create-user-form') {
            e.preventDefault();
            const button = e.target.querySelector('button[type="submit"]');
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Creating...';
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            data.password = 'auto'; // Password is not needed from form

            try {
                const res = await fetch('/api/reseller/users', { method: 'POST', headers, body: JSON.stringify(data) });
                const result = await res.json();
                if (!res.ok) throw new Error(result.message);
                
                closeModal(createUserModal);
                // We need to fetch the new user's link from the DB to show it.
                // For now, we just show a success message. We'll improve this in the next phase.
                showToast(result.message, 'success');
                await fetchAndRenderUsers();
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                button.disabled = false;
                button.innerHTML = 'Create User';
            }
        }
    });
    
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.close-modal-btn')) {
            closeModal(e.target.closest('.modal-overlay'));
        }
        if (e.target.closest('.copy-btn')) {
            const link = e.target.closest('.copy-btn').dataset.link;
            navigator.clipboard.writeText(link).then(() => showToast('Link copied!', 'success'));
        }
    });

    // ... (other event listeners: search, logout, settings, etc.)

    // Initial Load
    fetchAndRenderUsers();
});