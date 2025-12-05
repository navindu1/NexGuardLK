// File: public/js/pages/profile.js
import { apiFetch, appData } from '../api.js';
import { showToast, SikFloatingMenu, togglePassword, qrModalLogic } from '../utils.js';
import { navigateTo } from '../router.js';
import { handleRenewalChoice } from './checkout.js';

let profilePollingInterval = null;
let lastKnownPlansStr = ""; 

export function renderProfilePage(renderFunc, params) {
    if (profilePollingInterval) {
        clearInterval(profilePollingInterval);
        profilePollingInterval = null;
    }
    lastKnownPlansStr = ""; 

    // --- CACHE VARIABLES ---
    let cachedUsageData = null; // Store usage data here
    let cachedOrdersData = null; // Store orders here
    let lastFetchedUsername = null; // To track if we switched users

    const user = JSON.parse(localStorage.getItem("nexguard_user"));
    if (!user) {
        navigateTo("/login");
        return;
    }

    // --- HELPER HTML & CSS ---
    const modalHtml = `
        <div id="help-modal" class="help-modal-overlay">
            <div class="help-modal-content grease-glass p-6 space-y-4 w-full max-w-md">
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-xl font-bold text-white font-['Orbitron'] drop-shadow-md">Help & Support Matrix</h2>
                        <button id="lang-toggle-btn" class="text-xs text-blue-300 hover:text-white hover:underline mt-1 transition-colors">English / සිංහල</button>
                    </div>
                    <button id="help-modal-close" class="text-white/80 hover:text-white text-3xl transition-all hover:rotate-90">&times;</button>
                </div>
                <div class="lang-content lang-en">
                    <div><h3 class="text-lg font-semibold text-blue-300 mb-2 drop-shadow-sm">How to find your Username?</h3><p class="text-gray-100 text-sm mb-4 font-medium leading-relaxed">Your username is the name assigned to your V2ray configuration. It's often visible in your V2ray client app, usually next to the server connection name.</p></div>
                </div>
                <div class="lang-content lang-si hidden">
                    <div><h3 class="text-lg font-semibold text-blue-300 mb-2 drop-shadow-sm">ඔබගේ Username එක සොයාගන්නේ කෙසේද?</h3><p class="text-gray-100 text-sm mb-4 font-medium leading-relaxed">ඔබගේ username යනු V2ray config ගොනුවට ලබා දී ඇති නමයි. එය බොහෝවිට V2ray client ඇප් එකේ, server සම්බන්ධතාවය අසල දිස්වේ.</p></div>
                </div>
                <div class="bg-black/20 border border-white/10 rounded-xl p-2 shadow-inner">
                    <img src="/assets/help.jpg" alt="Example" class="rounded-lg w-full h-auto opacity-95 hover:opacity-100 transition-opacity">
                </div>
            </div>
        </div>`;
    
    const pageStyles = `<style>
        #page-profile .form-input { height: 56px; padding: 20px 12px 8px 12px; background-color: rgba(0, 0, 0, 0.4); border-color: rgba(255, 255, 255, 0.2); } 
        #page-profile .form-label { position: absolute; top: 50%; left: 13px; transform: translateY(-50%); color: #9ca3af; pointer-events: none; transition: all 0.2s ease-out; font-size: 14px; } 
        #page-profile .form-input:focus ~ .form-label, #page-profile .form-input:not(:placeholder-shown) ~ .form-label { top: 10px; transform: translateY(0); font-size: 11px; color: var(--brand-blue); } 
        #page-profile .form-input[readonly] { background-color: rgba(0,0,0,0.2); cursor: not-allowed; } 
        .tab-btn { border-bottom: 3px solid transparent; transition: all .3s ease; color: #9ca3af; padding: 0.75rem 0.25rem; font-weight: 600; white-space: nowrap; } 
        .tab-btn.active { border-bottom-color: var(--brand-blue); color: #fff; } 
        .tab-panel { display: none; } 
        .tab-panel.active { display: block; animation: pageFadeIn 0.5s; }
        .help-modal-overlay { opacity: 0; visibility: hidden; transition: opacity 0.3s ease-out, visibility 0.3s ease-out; background: rgba(0, 0, 0, 0.2); z-index: 9999; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .help-modal-overlay.visible { opacity: 1; visibility: visible; }
        .help-modal-content { opacity: 0; transform: scale(0.90); transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .help-modal-overlay.visible .help-modal-content { opacity: 1; transform: scale(1); }
        .grease-glass { background: rgba(30, 40, 60, 0.4); backdrop-filter: blur(20px) saturate(200%); -webkit-backdrop-filter: blur(20px) saturate(200%); border-radius: 35px; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5); }
        .plan-selector-container { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem; position: relative; z-index: 100; overflow: visible !important; }
        .plan-selector-label { font-size: 0.875rem; font-weight: 600; color: #d1d5db; flex-shrink: 0; }
        ul.fmenu { display: inline-block; list-style: none; padding: 0; margin: 0; white-space: nowrap; position: relative; overflow: visible !important; }
        ul.fmenu > li.fmenu-item { position: relative; overflow: visible !important; }
        ul.fmenu .trigger-menu { display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; height: 44px; padding: 0 1.2rem; border-radius: 999px; background-color: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer; transition: all ease 0.3s; min-width: 180px; overflow: visible !important; }
        ul.fmenu .trigger-menu:hover, ul.fmenu .trigger-menu.open { border-color: var(--brand-blue); box-shadow: 0 0 15px rgba(59, 130, 246, 0.3); }
        ul.fmenu .trigger-menu i { color: #9ca3af; font-size: 0.9rem; transition: color ease 0.3s; }
        ul.fmenu .trigger-menu:hover i, ul.fmenu .trigger-menu.open i { color: #60a5fa; }
        ul.fmenu .trigger-menu .text { display: block; font-size: 0.95rem; color: #ffffff; padding: 0 0.5rem; font-weight: 500; }
        ul.fmenu .trigger-menu .arrow { font-size: 0.8rem; transition: transform ease 0.3s; }
        ul.fmenu .trigger-menu.open .arrow { transform: rotate(180deg); }
        ul.fmenu .floating-menu { display: block; position: absolute; top: 100%; margin-top: 12px; left: 0; width: max-content; min-width: 100%; list-style: none; padding: 0.5rem; background-color: #0f172a; border: 1px solid rgba(71, 85, 105, 0.6); border-radius: 35px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); z-index: 9999 !important; opacity: 0; visibility: hidden; transform: translateY(-10px); transition: opacity 0.3s, transform 0.3s; }
        ul.fmenu .trigger-menu.open + .floating-menu { opacity: 1 !important; visibility: visible !important; transform: translateY(0) !important; max-height: none !important; overflow: visible !important; }
        ul.fmenu .floating-menu > li a { color: #cbd5e1; font-size: 0.9rem; text-decoration: none; display: block; padding: 0.75rem 1.2rem; border-radius: 35px; transition: all 0.2s ease; border: 1px solid transparent; }
        ul.fmenu .floating-menu > li a:hover { background-color: rgba(59, 130, 246, 0.15); color: #ffffff; border-color: rgba(59, 130, 246, 0.3); }
    </style>`;
    
    let profilePictureUrl = (user.profilePicture || "/assets/profilePhoto.jpg").replace("public/", "");
    if (profilePictureUrl && !profilePictureUrl.startsWith('/')) profilePictureUrl = '/' + profilePictureUrl;
    
    const baseHtml = `<div id="page-profile" class="page space-y-8"><div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left reveal"><div class="relative flex-shrink-0"><img id="profile-pic-img" src="${profilePictureUrl}" alt="Profile Picture" class="w-24 h-24 rounded-full border-4 border-blue-500/50 object-cover shadow-lg"><label for="avatar-upload" class="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500 transition shadow-md"><i class="fa-solid fa-camera text-white"></i><input type="file" id="avatar-upload" class="hidden" accept="image/*"></label></div><div class="flex-grow"><h2 class="text-3xl font-bold font-['Orbitron'] text-white">${user.username}</h2><p class="text-gray-400">${user.email}</p><div id="plan-info-container" class="text-xs sm:text-sm mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2"></div></div></div><div id="user-status-content" class="reveal"><div class="flex flex-col items-center justify-center min-h-[40vh]"><div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-3xl text-blue-400"></i><p class="mt-4 text-lg font-semibold text-blue-300 animate-pulse">Loading Your Data...</p><p class="text-sm text-gray-500 mt-1">Please wait while we fetch your profile information.</p></div></div></div></div> ${modalHtml}`;
    
    renderFunc(pageStyles + baseHtml);
    const statusContainer = document.getElementById("user-status-content");
    qrModalLogic.init();

    const setupEventListeners = () => {
        const helpModal = document.getElementById('help-modal');
        if (helpModal) {
            const openModal = () => { helpModal.classList.add('visible'); document.body.classList.add('modal-open'); };
            const closeModal = () => { helpModal.classList.remove('visible'); document.body.classList.remove('modal-open'); };
            document.querySelector('.open-help-modal-link')?.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
            document.getElementById('help-modal-close')?.addEventListener('click', closeModal);
            helpModal.addEventListener('click', (e) => { if (e.target === helpModal) closeModal(); });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && helpModal.classList.contains('visible')) closeModal(); });
            document.getElementById('lang-toggle-btn')?.addEventListener('click', () => {
                document.querySelector('.lang-content.lang-en')?.classList.toggle('hidden');
                document.querySelector('.lang-content.lang-si')?.classList.toggle('hidden');
            });
        }

        document.getElementById("profile-update-form")?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const newPassword = document.getElementById("new-password").value;
            if (!newPassword) return showToast({ title: "No Change", message: "Password field was empty.", type: "info" });
            if (newPassword.length < 6) return showToast({ title: "Error", message: "Password must be at least 6 characters.", type: "error" });
            
            const btn = e.target.querySelector('button');
            btn.disabled = true;
            showToast({ title: "Updating...", message: "Please wait.", type: "info" });
            try {
                const res = await apiFetch('/api/user/update-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword }) });
                const result = await res.json();
                if (!res.ok) throw new Error(result.message);
                showToast({ title: "Success!", message: result.message, type: "success" });
                document.getElementById("new-password").value = "";
            } catch (error) {
                showToast({ title: "Update Failed", message: error.message, type: "error" });
            } finally {
                btn.disabled = false;
            }
        });

        document.getElementById('profile-password-toggle')?.addEventListener('click', () => togglePassword('new-password', 'profile-password-toggle'));
        
        document.getElementById("link-account-form-profile")?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const v2rayUsername = document.getElementById("existing-v2ray-username-profile").value;
            if (!v2rayUsername) return showToast({ title: "Error", message: "Please enter your V2Ray username.", type: "error" });

            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Linking...", message: "Please wait...", type: "info" });
            const res = await apiFetch("/api/user/link-v2ray", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v2rayUsername }) });
            const result = await res.json();
            btn.disabled = false;
            if (res.ok) {
                showToast({ title: "Success!", message: result.message, type: "success" });
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showToast({ title: "Linking Failed", message: result.message, type: "error" });
            }
        });
    };

    document.getElementById("avatar-upload")?.addEventListener("change", async(e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("avatar", file);
        showToast({ title: "Uploading...", message: "Please wait.", type: "info" });
        const res = await apiFetch("/api/user/profile-picture", { method: "POST", body: formData });
        const result = await res.json();
        if (res.ok) {
            showToast({ title: "Success!", message: result.message, type: "success" });
            const newPath = result.filePath;
            document.getElementById("profile-pic-img").src = newPath;
            document.getElementById("profile-pic-nav-desktop").src = newPath;
            document.getElementById("profile-pic-nav-mobile").src = newPath;
            let localUser = JSON.parse(localStorage.getItem("nexguard_user"));
            localUser.profilePicture = `public/${newPath}`;
            localStorage.setItem("nexguard_user", JSON.stringify(localUser));
        } else {
            showToast({ title: "Upload Failed", message: result.message, type: "error" });
        }
    });

    let planMenuInstance = null;
    const renderPlanSelector = (activePlans, activePlanIndex = 0) => {
        const planListItems = activePlans.map((plan, index) => 
            `<li><a href="#" data-plan-index="${index}">${plan.v2rayUsername}</a></li>`
        ).join('');

        const containerHtml = `
            <div class="plan-selector-container">
                <label class="plan-selector-label custom-radius">Viewing Plan:</label>
                <ul class="fmenu custom-radius" id="plan-menu">
                    <li class="fmenu-item custom-radius">
                        <div class="trigger-menu custom-radius">
                            <i class="fa-solid fa-server"></i>
                            <span class="text">${activePlans[activePlanIndex]?.v2rayUsername || 'Select Plan'}</span>
                            <i class="fa-solid fa-chevron-down arrow"></i>
                        </div>
                        <ul class="floating-menu">
                            ${planListItems}
                        </ul>
                    </li>
                </ul>
            </div>
            <div id="plan-details-container"></div>`;
        
        if (!document.getElementById("plan-menu")) {
             statusContainer.innerHTML = containerHtml;
        } else {
             const menuContainer = document.querySelector('.plan-selector-container');
             if(menuContainer) menuContainer.outerHTML = `
                <div class="plan-selector-container">
                    <label class="plan-selector-label custom-radius">Viewing Plan:</label>
                    <ul class="fmenu custom-radius" id="plan-menu">
                        <li class="fmenu-item custom-radius">
                            <div class="trigger-menu custom-radius">
                                <i class="fa-solid fa-server"></i>
                                <span class="text">${activePlans[activePlanIndex]?.v2rayUsername || 'Select Plan'}</span>
                                <i class="fa-solid fa-chevron-down arrow"></i>
                            </div>
                            <ul class="floating-menu">${planListItems}</ul>
                        </li>
                    </ul>
                </div>`;
        }

        planMenuInstance = new SikFloatingMenu("#plan-menu");
        
        const floatingMenu = document.querySelector('#plan-menu .floating-menu');
        if (floatingMenu) {
            floatingMenu.addEventListener('click', (e) => {
                const link = e.target.closest('a');
                if (link) {
                    e.preventDefault();
                    const index = parseInt(link.dataset.planIndex);
                    document.querySelector('#plan-menu .trigger-menu .text').textContent = activePlans[index].v2rayUsername;
                    // When switching plans manually, reset cache so we fetch fresh data for the new plan
                    cachedUsageData = null; 
                    window.renderPlanDetails(index); 
                    planMenuInstance.closeAll();
                }
            });
        }
    };

    const loadProfileData = async () => {
        try {
            const res = await apiFetch("/api/user/status");
            if (!res.ok) throw new Error("Auth failed");
            const data = await res.json();

            const currentPlansStr = JSON.stringify(data.activePlans || []);
            const plansChanged = currentPlansStr !== lastKnownPlansStr;

            if (plansChanged) {
                lastKnownPlansStr = currentPlansStr;

                if (data.status === "approved" && data.activePlans?.length > 0) {
                    let currentIndex = 0;
                    const currentViewedName = document.querySelector('#plan-menu .trigger-menu .text')?.textContent;
                    
                    if (currentViewedName) {
                        const foundIndex = data.activePlans.findIndex(p => p.v2rayUsername === currentViewedName);
                        if (foundIndex !== -1) {
                            currentIndex = foundIndex;
                        } else {
                            if (document.getElementById("plan-menu")) {
                                showToast({ title: "Plan Removed", message: "The plan you were viewing is no longer active.", type: "info" });
                            }
                        }
                    }

                    renderPlanSelector(data.activePlans, currentIndex);

                    window.renderPlanDetails = (planIndex) => {
                        const plan = data.activePlans[planIndex];
                        const container = document.getElementById("plan-details-container");
                        if(!plan) return;
                        
                        // Reset cache if username changes
                        if (lastFetchedUsername !== plan.v2rayUsername) {
                            cachedUsageData = null;
                            lastFetchedUsername = plan.v2rayUsername;
                        }

                        const connectionName = appData.connections.find(c => c.name === plan.connId)?.name || plan.connId || 'N/A';
                        const planName = appData.plans[plan.planId]?.name || plan.planId;
                        document.getElementById("plan-info-container").innerHTML = `<span class="bg-blue-500/10 text-blue-300 px-2 py-1 rounded-full"><i class="fa-solid fa-rocket fa-fw mr-2"></i>${planName}</span><span class="bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded-full"><i class="fa-solid fa-wifi fa-fw mr-2"></i>${connectionName}</span>`;

                        if(!document.getElementById('profile-tabs')) {
                            container.innerHTML = `
                            <div id="profile-tabs" class="flex items-center gap-4 sm:gap-6 border-b border-white/10 mb-6 overflow-x-auto"><button data-tab="config" class="tab-btn active">V2Ray Config</button><button data-tab="usage" class="tab-btn">Usage Stats</button><button data-tab="orders" class="tab-btn">My Orders</button><button data-tab="settings" class="tab-btn">Account Settings</button></div>
                            <div id="tab-config" class="tab-panel active"><div class="card-glass p-6 sm:p-8 custom-radius"><div class="grid md:grid-cols-2 gap-8 items-center"><div class="flex flex-col items-center text-center"><h3 class="text-lg font-semibold text-white mb-3">Scan with your V2Ray App</h3><div id="qrcode-container" class="w-44 h-44 p-3 bg-white rounded-lg cursor-pointer flex items-center justify-center shadow-lg shadow-blue-500/20"></div></div><div class="space-y-6"><div class="w-full"><label class="text-sm text-gray-400">V2Ray Config Link</label><div class="flex items-center gap-2 mt-2"><input type="text" readonly value="${plan.v2rayLink}" class="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300"><button id="copy-config-btn" class="ai-button secondary !text-sm !font-semibold flex-shrink-0 px-4 py-2 rounded-md">Copy</button></div></div><div class="w-full text-center border-t border-white/10 pt-6"><div id="renew-button-container"></div></div></div></div></div></div>
                            <div id="tab-usage" class="tab-panel"></div><div id="tab-orders" class="tab-panel"></div><div id="tab-settings" class="tab-panel">
                                <div class="card-glass p-6 sm:p-8 custom-radius">
                                    <div class="max-w-md mx-auto">
                                        <h3 class="text-xl font-bold text-white mb-6 font-['Orbitron'] text-center">Account Settings</h3>
                                        <form id="profile-update-form" class="space-y-6">
                                            <div class="form-group"><input type="text" class="form-input" readonly value="${user.username}" title="Website username cannot be changed."><label class="form-label">Website Username</label></div>
                                            <div class="form-group relative"><input type="password" id="new-password" class="form-input pr-10" placeholder=" "><label for="new-password" class="form-label">New Password (leave blank to keep)</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i></div>
                                            <button type="submit" class="ai-button w-full rounded-lg !mt-8">Save Changes</button>
                                        </form>
                                    </div>
                                </div>
                            </div>`;
                            
                            document.getElementById('profile-tabs').addEventListener('click', (e) => { 
                                if (e.target.tagName === 'BUTTON') {
                                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                                    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                                    e.target.classList.add('active');
                                    document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
                                    
                                    const tabId = e.target.dataset.tab;
                                    if(tabId === 'config') updateRenewButton(plan);
                                    if(tabId === 'usage') {
                                        // CHECK CACHE FIRST
                                        if (cachedUsageData) {
                                            renderUsageHTML(cachedUsageData);
                                            loadUsageStats(true); // Silent background refresh
                                        } else {
                                            loadUsageStats(false); // Show spinner
                                        }
                                    }
                                    if(tabId === 'orders') {
                                        // CHECK CACHE FIRST
                                        if (cachedOrdersData) {
                                            renderOrdersHTML(cachedOrdersData);
                                            loadMyOrders(true); // Silent background refresh
                                        } else {
                                            loadMyOrders(false); // Show spinner
                                        }
                                    }
                                }
                            });
                            
                            setupEventListeners();
                        }

                        const qrContainer = document.getElementById("qrcode-container");
                        if(qrContainer) {
                            qrContainer.innerHTML = "";
                            try {
                                new QRCode(qrContainer, { text: plan.v2rayLink, width: 140, height: 140, correctLevel: QRCode.CorrectLevel.L });
                                qrContainer.onclick = () => { const img = qrContainer.querySelector('img'); if(img) qrModalLogic.show(img.src, plan.v2rayUsername); };
                            } catch(e) { qrContainer.innerHTML = "Error generating QR"; }
                        }
                        
                        const linkInput = document.querySelector('input[readonly]');
                        if(linkInput) linkInput.value = plan.v2rayLink;

                        const copyBtn = document.getElementById('copy-config-btn');
                        if(copyBtn) {
                            const newBtn = copyBtn.cloneNode(true);
                            copyBtn.parentNode.replaceChild(newBtn, copyBtn);
                            newBtn.addEventListener('click', () => { navigator.clipboard.writeText(plan.v2rayLink); showToast({ title: 'Copied!', type: 'success' }); });
                        }

                        updateRenewButton(plan);
                    };

                    window.renderPlanDetails(currentIndex);

                } else if (data.status === "pending") {
                    statusContainer.innerHTML = `<div class="card-glass p-8 rounded-xl text-center"><i class="fa-solid fa-clock text-4xl text-amber-400 mb-4 animate-pulse"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Order Pending Approval</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">Your order is currently being reviewed. Your profile will update here once approved.</p></div>`;
                } else {
                    const settingsHtml = `<div class="card-glass p-6 custom-radius"><h3 class="text-xl font-bold text-white mb-4 font-['Orbitron']">Account Settings</h3><form id="profile-update-form" class="space-y-6"><div class="form-group"><input type="text" class="form-input" readonly value="${user.username}" title="Website username cannot be changed."><label class="form-label">Website Username</label></div><div class="form-group relative"><input type="password" id="new-password" class="form-input pr-10" placeholder=" "><label for="new-password" class="form-label">New Password (leave blank to keep)</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i></div><button type="submit" class="ai-button w-full rounded-lg !mt-8">Save Changes</button></form></div>`;
                    const linkAccountHtml = `<div class="card-glass p-6 custom-radius"><h3 class="text-xl font-bold text-white mb-2 font-['Orbitron']">Link Existing V2Ray Account</h3><p class="text-sm text-gray-400 mb-6">If you have an old account, link it here to manage renewals.</p><form id="link-account-form-profile" class="space-y-6"><div class="form-group"><input type="text" id="existing-v2ray-username-profile" class="form-input" required placeholder=" "><label for="existing-v2ray-username-profile" class="form-label">Your Old V2Ray Username</label><span class="focus-border"><i></i></span></div><button type="submit" class="ai-button secondary w-full rounded-lg">Link Account</button><div class="text-center text-sm mt-4"><span class="open-help-modal-link text-blue-400 cursor-pointer hover:underline">How to find your username?</span></div></form></div>`;
                    statusContainer.innerHTML = `<div class="card-glass p-8 custom-radius text-center"><i class="fa-solid fa-rocket text-4xl text-blue-400 mb-4"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Get Started</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">You do not have any active plans yet. Purchase a new plan or link an existing account below.</p><a href="/plans" class="nav-link-internal ai-button inline-block rounded-lg mt-6">Purchase a Plan</a></div><div class="grid md:grid-cols-2 gap-8 mt-8">${settingsHtml}${linkAccountHtml}</div>`;
                    setupEventListeners();
                }
            }

            if (data.status === "approved" && data.activePlans?.length > 0) {
                const activePlanUsername = document.querySelector('#plan-menu .trigger-menu .text')?.textContent;
                const activePlan = data.activePlans.find(p => p.v2rayUsername === activePlanUsername);

                const updateRenewButton = async (plan, isSilent = false) => {
                    const container = document.getElementById("renew-button-container");
                    if (!container) return;
                    if (!isSilent) container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Checking status...</button>`;
                    try {
                        const res = await apiFetch(`/api/check-usage/${plan.v2rayUsername}`);
                        const result = await res.json();
                        if (result.success) {
                            const expiryTime = result.data.expiryTime;
                            if (expiryTime > 0) {
                                const now = new Date();
                                const renewalPeriodDays = 5;
                                const canRenew = now >= new Date(new Date(expiryTime).getTime() - renewalPeriodDays * 86400000);
                                if (canRenew) {
                                    if (!document.getElementById('renew-profile-btn')) {
                                        container.innerHTML = `<button id="renew-profile-btn" class="ai-button inline-block rounded-lg"><i class="fa-solid fa-arrows-rotate mr-2"></i>Renew / Change Plan</button>`;
                                        document.getElementById('renew-profile-btn')?.addEventListener('click', () => handleRenewalChoice(data.activePlans, plan));
                                    }
                                } else {
                                    if (!container.innerHTML.includes('disabled')) {
                                        container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed">Renew / Change Plan</button>`;
                                    }
                                }
                            } else {
                                container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed">Does not expire</button>`;
                            }
                        }
                    } catch (e) { if(!isSilent) container.innerHTML = `<p class="text-xs text-red-400">Error</p>`; }
                };

                // --- Helper: Render Usage HTML ---
                const renderUsageHTML = (d) => {
                    const usageContainer = document.getElementById("tab-usage");
                    if (!usageContainer) return;

                    const total = d.down + d.up;
                    const percent = d.total > 0 ? Math.min((total / d.total) * 100, 100) : 0;
                    
                    const formatBytes = (b = 0, d = 2) => {
                        const k = 1024;
                        const s = ['B', 'KB', 'MB', 'GB', 'TB'];
                        if (b === 0) return '0 B';
                        const i = Math.floor(Math.log(b) / Math.log(k));
                        return `${parseFloat((b / k ** i).toFixed(d))} ${s[i]}`;
                    };

                    const expiry = d.expiryTime > 0 ? new Date(d.expiryTime).toLocaleDateString('en-CA') : 'Unlimited';
                    const status = d.enable ? `<span class="font-semibold text-green-400">ONLINE</span>` : `<span class="font-semibold text-red-400">OFFLINE</span>`;

                    const html = `
                        <div class="result-card p-4 sm:p-6 card-glass custom-radius space-y-5 reveal is-visible">
                            <div class="flex justify-between items-center pb-3 border-b border-white/10">
                                <h3 class="text-lg font-semibold text-white flex items-center min-w-0">
                                    <i class="fa-solid fa-satellite-dish mr-3 text-blue-400 flex-shrink-0"></i>
                                    <span class="truncate" title="${activePlan.v2rayUsername}">Client: ${activePlan.v2rayUsername}</span>
                                </h3>
                                <div id="rt-status">${status}</div>
                            </div>
                            ${d.total > 0 ? `<div class="space-y-2"><div class="flex justify-between items-baseline text-sm"><span class="font-medium text-gray-300">Data Quota Usage</span><span id="rt-percent" class="font-bold text-white">${percent.toFixed(1)}%</span></div><div class="w-full bg-black/30 rounded-full h-2.5"><div id="rt-bar" class="progress-bar-inner bg-gradient-to-r from-sky-500 to-blue-500 h-2.5 rounded-full" style="width: ${percent}%"></div></div></div>` : ''}
                            <div class="space-y-4 text-sm sm:hidden">
                                <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-down text-sky-400 text-lg w-5 text-center"></i><span>Download</span></div><p id="rt-down-mob" class="font-semibold text-white text-base">${formatBytes(d.down)}</p></div>
                                <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-up text-violet-400 text-lg w-5 text-center"></i><span>Upload</span></div><p id="rt-up-mob" class="font-semibold text-white text-base">${formatBytes(d.up)}</p></div>
                                <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-database text-green-400 text-lg w-5 text-center"></i><span>Total Used</span></div><p id="rt-total-mob" class="font-semibold text-white text-base">${formatBytes(total)}</p></div>
                                <div class="flex justify-between items-center"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-calendar-xmark text-red-400 text-lg w-5 text-center"></i><span>Expires On</span></div><p id="rt-expiry-mob" class="font-medium text-white text-base">${expiry}</p></div>
                            </div>
                            <div class="hidden sm:grid sm:grid-cols-2 gap-4 text-sm">
                                <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-down text-sky-400 mr-2"></i><span>Download</span></div><p id="rt-down-desk" class="text-2xl font-bold text-white mt-1">${formatBytes(d.down)}</p></div>
                                <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-up text-violet-400 mr-2"></i><span>Upload</span></div><p id="rt-up-desk" class="text-2xl font-bold text-white mt-1">${formatBytes(d.up)}</p></div>
                                <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-database text-green-400 mr-2"></i><span>Total Used</span></div><p id="rt-total-desk" class="text-2xl font-bold text-white mt-1">${formatBytes(total)}</p></div>
                                <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-calendar-xmark text-red-400 mr-2"></i><span>Expires On</span></div><p id="rt-expiry-desk" class="text-xl font-medium text-white mt-1">${expiry}</p></div>
                            </div>
                        </div>`;
                    
                    usageContainer.innerHTML = html;
                };

                const loadUsageStats = (isSilent = false) => {
                    const usageContainer = document.getElementById("tab-usage");
                    if (!usageContainer) return;
                    if (!isSilent) usageContainer.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-400"></i></div>`;
                    
                    apiFetch(`/api/check-usage/${activePlan.v2rayUsername}`).then(res => res.json()).then(result => {
                        if (result.success) {
                            cachedUsageData = result.data; // UPDATE CACHE
                            renderUsageHTML(result.data);
                        } else {
                             if (!isSilent) usageContainer.innerHTML = `<div class="card-glass p-4 rounded-xl text-center text-amber-400"><p>${result.message}</p></div>`;
                        }
                    }).catch(() => {
                        if (!isSilent) usageContainer.innerHTML = `<div class="card-glass p-4 rounded-xl text-center text-red-400"><p>Could not load usage statistics.</p></div>`;
                    });
                };

                // --- Helper: Render Orders HTML ---
                const renderOrdersHTML = (orders) => {
                    const container = document.getElementById("tab-orders");
                    if (!container) return;

                    const html = (orders.length > 0) ? orders.map(order => {
                        const displayStatus = order.status === 'queued_for_renewal' ? 'Queued' : order.status;
                        const statusColors = { pending: "text-amber-400", approved: "text-green-400", rejected: "text-red-400", queued_for_renewal: "text-blue-300" };
                        const statusIcons = { pending: "fa-solid fa-clock", approved: "fa-solid fa-check-circle", rejected: "fa-solid fa-times-circle", queued_for_renewal: "fa-solid fa-hourglass-half" };
                        
                        return `<div class="card-glass p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 custom-radius">
                            <div>
                                <p class="font-bold text-white">${appData.plans[order.plan_id]?.name || order.plan_id} <span class="text-gray-400 font-normal">for</span> ${appData.connections.find(c => c.name === order.conn_id)?.name || order.conn_id}</p>
                                <p class="text-xs text-gray-400 mt-1">Ordered on: ${new Date(order.created_at).toLocaleDateString()} ${order.status === 'approved' && order.final_username ? `| V2Ray User: <strong class="text-blue-300">${order.final_username}</strong>` : ''}</p>
                            </div>
                            <div class="text-sm font-semibold capitalize flex items-center gap-2 ${statusColors[order.status] || 'text-gray-400'}">
                                <i class="${statusIcons[order.status] || 'fa-solid fa-question-circle'}"></i><span>${displayStatus}</span>
                            </div>
                        </div>`;
                    }).join('') : `<div class="card-glass p-8 custom-radius text-center"><i class="fa-solid fa-box-open text-4xl text-gray-400 mb-4"></i><h3 class="font-bold text-white">No Orders Found</h3><p class="text-gray-400 text-sm mt-2">You have not placed any orders yet.</p></div>`;
                    
                    container.innerHTML = `<div class="space-y-3">${html}</div>`;
                }

                const loadMyOrders = async (isSilent = false) => {
                    const container = document.getElementById("tab-orders");
                    if (!container) return;
                    if (!isSilent) container.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-400"></i></div>`;
                    try {
                        const res = await apiFetch("/api/user/orders");
                        const { orders } = await res.json();
                        cachedOrdersData = orders; // UPDATE CACHE
                        renderOrdersHTML(orders);
                    } catch (err) {
                        if (!isSilent) container.innerHTML = `<div class="card-glass p-4 rounded-xl text-center text-red-400"><p>Could not load your orders.</p></div>`;
                    }
                };

                if (activePlan) {
                    // Update: Only load if active AND NOT CACHED, or forcing refresh
                    if (document.getElementById('tab-usage')?.classList.contains('active')) {
                        // Polling update (silent)
                        loadUsageStats(true); 
                    }
                    if (document.getElementById('tab-orders')?.classList.contains('active')) {
                        // Polling update (silent)
                        loadMyOrders(true);
                    }
                    if (document.getElementById('tab-config')?.classList.contains('active')) updateRenewButton(activePlan, true);
                }
            }

        } catch (e) { console.error(e); }
    };

    // Initial Load
    loadProfileData();

    // Polling Interval (Every 5 Seconds)
    profilePollingInterval = setInterval(loadProfileData, 5000);
}