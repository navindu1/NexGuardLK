// File Path: public/js/reseller.js
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('nexguard_reseller_token');
    if (!token) {
        window.location.href = '/reseller/login';
        return;
    }

    const userListContainer = document.getElementById('user-list-container');
    const userSearchInput = document.getElementById('user-search');
    let allUsers = []; 

    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    
    function showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        const colors = { success: 'bg-green-600', error: 'bg-red-600' };
        toast.className = `p-4 rounded-lg text-white text-sm shadow-lg ${colors[type]} transform transition-all duration-300 translate-x-full`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-x-full'), 100);
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => toast.remove(), 4000);
        }, 4000);
    }

    const renderUsers = (usersToRender) => {
        if (usersToRender.length === 0) {
            userListContainer.innerHTML = '<div class="glass-panel p-8 rounded-lg text-center text-gray-400">You have not created any users yet.</div>';
            return;
        }
        userListContainer.innerHTML = usersToRender.map(user => {
            const plan = user.active_plans[0] || {};
            return `
            <div class="glass-panel p-4 rounded-lg space-y-3">
                <div class="flex justify-between items-start">
                    <p class="font-bold text-lg text-white break-all">${plan.v2rayUsername || 'N/A'}</p>
                    <div class="flex gap-2 flex-shrink-0 ml-2">
                        <button class="bg-sky-500/20 text-sky-400 px-2 py-1 text-xs rounded-md" onclick="alert('Renew feature coming soon!')">Renew</button>
                        <button class="bg-red-500/20 text-red-400 px-2 py-1 text-xs rounded-md" onclick="alert('Delete feature coming soon!')">Delete</button>
                    </div>
                </div>
                <div class="flex flex-col sm:flex-row text-xs text-gray-400 gap-x-4 gap-y-1">
                    <span><i class="fa-solid fa-rocket fa-fw text-purple-400"></i> Plan: <strong class="text-gray-200">${plan.planId || 'N/A'}</strong></span>
                    <span><i class="fa-solid fa-wifi fa-fw text-purple-400"></i> Connection: <strong class="text-gray-200">${plan.connId || 'N/A'}</strong></span>
                    <span><i class="fa-solid fa-calendar-check fa-fw text-purple-400"></i> Created: <strong class="text-gray-200">${new Date(user.created_at).toLocaleDateString()}</strong></span>
                </div>
            </div>`;
        }).join('');
    };

    const fetchAndRenderUsers = async () => {
        userListContainer.innerHTML = '<p class="text-center text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading your users...</p>';
        try {
            const res = await fetch('/api/reseller/users', { headers });
            const data = await res.json();
            if (data.success) {
                allUsers = data.users;
                renderUsers(allUsers);
            } else { throw new Error(data.message); }
        } catch (error) {
            userListContainer.innerHTML = `<div class="glass-panel p-8 rounded-lg text-center text-red-400">${error.message}</div>`;
        }
    };
    
    userSearchInput.addEventListener('input', () => {
        const searchTerm = userSearchInput.value.toLowerCase();
        const filteredUsers = allUsers.filter(user => 
            (user.active_plans[0]?.v2rayUsername || '').toLowerCase().includes(searchTerm)
        );
        renderUsers(filteredUsers);
    });

    const modal = document.getElementById('create-user-modal');
    const createUserBtn = document.getElementById('create-user-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const createUserForm = document.getElementById('create-user-form');
    
    const openModal = () => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('.modal-content').classList.remove('scale-95');
    };
    const closeModal = () => {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('.modal-content').classList.add('scale-95');
    };

    createUserBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    createUserForm.addEventListener('submit', async(e) => {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Creating...';
        
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        try {
            const res = await fetch('/api/reseller/users', { method: 'POST', headers, body: JSON.stringify(data) });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);
            
            showToast(result.message, 'success');
            e.target.reset();
            closeModal();
            await fetchAndRenderUsers();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = 'Create User';
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('nexguard_reseller_token');
        window.location.href = '/reseller/login';
    });
    document.getElementById('apk-download-link').addEventListener('click', () => {
        alert("Please set the APK download link.");
    });

    fetchAndRenderUsers();
});