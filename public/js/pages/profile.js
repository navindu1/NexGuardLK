// File: public/js/pages/profile.js
import { apiFetch, appData } from '../api.js';
import { showToast, SikFloatingMenu, togglePassword, qrModalLogic } from '../utils.js';
import { navigateTo } from '../router.js';
import { handleRenewalChoice } from './checkout.js';

export function renderProfilePage(renderFunc, params) {
    const user = JSON.parse(localStorage.getItem("nexguard_user"));
    if (!user) {
        navigateTo("/login");
        return;
    }

    // --- START: HELP MODAL HTML (Grease Glass) ---
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
                    <div>
                        <h3 class="text-lg font-semibold text-blue-300 mb-2 drop-shadow-sm">How to find your Username?</h3>
                        <p class="text-gray-100 text-sm mb-4 font-medium leading-relaxed">Your username is the name assigned to your V2ray configuration. It's often visible in your V2ray client app, usually next to the server connection name.</p>
                    </div>
                </div>
                <div class="lang-content lang-si hidden">
                    <div>
                        <h3 class="text-lg font-semibold text-blue-300 mb-2 drop-shadow-sm">ඔබගේ Username එක සොයාගන්නේ කෙසේද?</h3>
                        <p class="text-gray-100 text-sm mb-4 font-medium leading-relaxed">ඔබගේ username යනු V2ray config ගොනුවට ලබා දී ඇති නමයි. එය බොහෝවිට V2ray client ඇප් එකේ, server සම්බන්ධතාවය අසල දිස්වේ.</p>
                    </div>
                </div>
                <div class="bg-black/20 border border-white/10 rounded-xl p-2 shadow-inner">
                    <img src="/assets/help.jpg" alt="Example image of where to find the username" class="rounded-lg w-full h-auto opacity-95 hover:opacity-100 transition-opacity">
                </div>
            </div>
        </div>`;
    // --- END: MODAL HTML ---
    
    // --- START: UPDATED CSS (Fixed Dropdown Issue) ---
    const pageStyles = `<style>
        /* Profile Page Input Fields */
        #page-profile .form-input { height: 56px; padding: 20px 12px 8px 12px; background-color: rgba(0, 0, 0, 0.4); border-color: rgba(255, 255, 255, 0.2); } 
        #page-profile .form-label { position: absolute; top: 50%; left: 13px; transform: translateY(-50%); color: #9ca3af; pointer-events: none; transition: all 0.2s ease-out; font-size: 14px; } 
        #page-profile .form-input:focus ~ .form-label, 
        #page-profile .form-input:not(:placeholder-shown) ~ .form-label { top: 10px; transform: translateY(0); font-size: 11px; color: var(--brand-blue); } 
        #page-profile .form-input[readonly] { background-color: rgba(0,0,0,0.2); cursor: not-allowed; } 
        
        /* Tabs */
        .tab-btn { border-bottom: 3px solid transparent; transition: all .3s ease; color: #9ca3af; padding: 0.75rem 0.25rem; font-weight: 600; white-space: nowrap; } 
        .tab-btn.active { border-bottom-color: var(--brand-blue); color: #fff; } 
        .tab-panel { display: none; } 
        .tab-panel.active { display: block; animation: pageFadeIn 0.5s; }
        
        /* Modal Styles */
        .help-modal-overlay { opacity: 0; visibility: hidden; transition: opacity 0.3s ease-out, visibility 0.3s ease-out; background: rgba(0, 0, 0, 0.2); z-index: 9999; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .help-modal-overlay.visible { opacity: 1; visibility: visible; }
        .help-modal-content { opacity: 0; transform: scale(0.90); transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .help-modal-overlay.visible .help-modal-content { opacity: 1; transform: scale(1); }
        .grease-glass { background: rgba(30, 40, 60, 0.4); backdrop-filter: blur(20px) saturate(200%); -webkit-backdrop-filter: blur(20px) saturate(200%); border-radius: 35px; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5); }

        /* --- UPDATED DROPDOWN STYLES (FIXED) --- */
        .plan-selector-container { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem; position: relative; z-index: 50; }
        .plan-selector-label { font-size: 0.875rem; font-weight: 600; color: #d1d5db; flex-shrink: 0; }
        
        ul.fmenu { display: inline-block; list-style: none; padding: 0; margin: 0; white-space: nowrap; }
        ul.fmenu > li.fmenu-item { position: relative; }
        
        /* Trigger Button Styling */
        ul.fmenu .trigger-menu { 
            display: flex; align-items: center; box-sizing: border-box; 
            height: 40px; /* Fixed height for consistency */
            padding: 0 1rem; 
            border-radius: 999px; /* Fully rounded */
            background-color: rgba(30, 41, 59, 0.8); 
            border: 1px solid #475569; 
            cursor: pointer; 
            transition: all ease 0.3s; 
            min-width: 150px;
            justify-content: space-between;
        }
        ul.fmenu .trigger-menu:hover, ul.fmenu .trigger-menu.open { border-color: var(--brand-blue); box-shadow: 0 0 10px rgba(59, 130, 246, 0.3); }
        ul.fmenu .trigger-menu i { color: #9ca3af; font-size: 0.875rem; transition: color ease 0.3s; }
        ul.fmenu .trigger-menu:hover i, ul.fmenu .trigger-menu.open i { color: #60a5fa; }
        ul.fmenu .trigger-menu .text { display: block; font-size: 0.9rem; color: #e5e7eb; padding: 0 0.5rem; font-weight: 500; }
        ul.fmenu .trigger-menu .arrow { font-size: 0.75rem; transition: transform ease 0.3s; }
        ul.fmenu .trigger-menu.open .arrow { transform: rotate(180deg); }
        
        /* Dropdown List Styling */
        ul.fmenu .floating-menu { 
            display: block; 
            position: absolute; 
            top: 3rem; /* Push it down slightly more */
            left: 0;
            width: auto;
            min-width: 100%; /* Match trigger width at minimum */
            list-style: none; 
            padding: 0.5rem; 
            margin: 0; 
            background-color: #1e293b; 
            border: 1px solid #475569; 
            border-radius: 12px; /* Nicer radius for list */
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); 
            max-height: 0px; 
            z-index: 9999 !important; /* Force on top */
            opacity: 0; 
            overflow: hidden; 
            transition: max-height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease; 
        }
        
        /* Ensure visible when open (handled by JS logic but CSS ensures styling) */
        ul.fmenu .trigger-menu.open + .floating-menu {
            border-color: var(--brand-blue);
        }

        ul.fmenu .floating-menu > li a { 
            color: #cbd5e1; 
            font-size: 0.9rem; 
            text-decoration: none; 
            display: block; 
            padding: 0.6rem 1rem; /* More padding for easier clicking */
            border-radius: 8px; 
            transition: all 0.2s ease; 
        }
        ul.fmenu .floating-menu > li a:hover { 
            background-color: rgba(59, 130, 246, 0.2); 
            color: #ffffff; 
        }
    </style>`;
    // --- END: CSS ---
    
    // (මෙතැන් සිට පහළට ඇති ඉතිරි කේතය එලෙසම තබන්න...)
    let profilePictureUrl = (user.profilePicture || "/assets/profilePhoto.jpg").replace("public/", "");
    if (profilePictureUrl && !profilePictureUrl.startsWith('/')) {
        profilePictureUrl = '/' + profilePictureUrl;
    }
    
    const baseHtml = `<div id="page-profile" class="page space-y-8"><div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left reveal"><div class="relative flex-shrink-0"><img id="profile-pic-img" src="${profilePictureUrl}" alt="Profile Picture" class="w-24 h-24 rounded-full border-4 border-blue-500/50 object-cover shadow-lg"><label for="avatar-upload" class="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500 transition shadow-md"><i class="fa-solid fa-camera text-white"></i><input type="file" id="avatar-upload" class="hidden" accept="image/*"></label></div><div class="flex-grow"><h2 class="text-3xl font-bold font-['Orbitron'] text-white">${user.username}</h2><p class="text-gray-400">${user.email}</p><div id="plan-info-container" class="text-xs sm:text-sm mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2"></div></div></div><div id="user-status-content" class="reveal">
        <div class="flex flex-col items-center justify-center min-h-[40vh]"><div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-3xl text-blue-400"></i><p class="mt-4 text-lg font-semibold text-blue-300 animate-pulse">Loading Your Data...</p><p class="text-sm text-gray-500 mt-1">Please wait while we fetch your profile information.</p></div></div>
    </div></div> ${modalHtml}`;
    
    renderFunc(pageStyles + baseHtml);
    
    const statusContainer = document.getElementById("user-status-content");
    qrModalLogic.init();
    
    // ... (ඉතිරි කේතය එලෙසම පවතී) ...
    
document.getElementById("avatar-upload")?.addEventListener("change", async(e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("avatar", file);
        showToast({ title: "Uploading...", message: "Please wait.", type: "info" });
        const res = await apiFetch("/api/user/profile-picture", {
            method: "POST",
            body: formData,
        });
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
    
    apiFetch("/api/user/status")
        .then((res) => res.ok ? res.json() : Promise.reject(new Error("Authentication failed")))
        .then((data) => {
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
    
            if (data.status === "approved" && data.activePlans?.length > 0) {
                // --- START: NEW HTML FOR CUSTOM DROPDOWN ---
                const planListItems = data.activePlans.map((plan, index) => 
                    `<li><a href="#" data-plan-index="${index}">${plan.v2rayUsername}</a></li>`
                ).join('');

                statusContainer.innerHTML = `
                    <div class="plan-selector-container">
                        <label class="plan-selector-label custom-radius">Viewing Plan:</label>
                        <ul class="fmenu custom-radius" id="plan-menu">
                            <li class="fmenu-item custom-radius">
                                <div class="trigger-menu custom-radius">
                                    <i class="fa-solid fa-server"></i>
                                    <span class="text">${data.activePlans[0].v2rayUsername}</span>
                                    <i class="fa-solid fa-chevron-down arrow"></i>
                                </div>
                                <ul class="floating-menu">
                                    ${planListItems}
                                </ul>
                            </li>
                        </ul>
                    </div>
                    <div id="plan-details-container"></div>`;
                // --- END: NEW HTML FOR CUSTOM DROPDOWN ---
                
                const planDetailsContainer = document.getElementById("plan-details-container");
                
                // Initialize the custom menu
                const planMenuInstance = new SikFloatingMenu("#plan-menu");
                
                const updateRenewButton = async (plan, isSilent = false) => {
                    const container = document.getElementById("renew-button-container");
                    if (!container) return;
    
                    if (!isSilent) {
                        container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Checking status...</button>`;
                    }
    
                    try {
                        const res = await apiFetch(`/api/check-usage/${plan.v2rayUsername}`);
                        if (!res.ok) throw new Error('API request failed to get expiry time');
    
                        const result = await res.json();
                        if (result.success && result.data.expiryTime > 0) {
                            const renewalPeriodDays = 5;
                            const expiryDate = new Date(result.data.expiryTime);
                            const now = new Date();
                            const renewalActivationDate = new Date(expiryDate.getTime() - renewalPeriodDays * 24 * 60 * 60 * 1000);
                            const canRenew = now >= renewalActivationDate;
    
                            if (canRenew) {
                                container.innerHTML = `<button id="renew-profile-btn" class="ai-button inline-block rounded-lg"><i class="fa-solid fa-arrows-rotate mr-2"></i>Renew / Change Plan</button>`;
                                document.getElementById('renew-profile-btn')?.addEventListener('click', () => handleRenewalChoice(data.activePlans, plan));
                            } else {
                                container.innerHTML = `<button disabled title="Renewable within 24 hours of expiry" class="ai-button secondary inline-block rounded-lg cursor-not-allowed">Renew / Change Plan</button>`;
                            }
                        } else {
                            container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed">Does not expire</button>`;
                        }
                    } catch (error) {
                        console.error('Error fetching plan status for renewal button:', error);
                        container.innerHTML = `<p class="text-xs text-red-400">Error checking status.</p>`;
                    }
                };

                const displayPlanDetails = (planIndex) => {
                    // Make sure planIndex is a valid number
                    planIndex = parseInt(planIndex, 10);
                    if (isNaN(planIndex) || planIndex < 0 || planIndex >= data.activePlans.length) {
                        planIndex = 0; // Default to the first plan if index is invalid
                    }
                    
                    const plan = data.activePlans[planIndex];
                    if (!plan) {
                        console.error("Could not display plan details: Invalid plan index or no active plans.");
                        planDetailsContainer.innerHTML = `<div class="card-glass p-8 rounded-xl text-center"><p class="text-amber-400">Could not load plan details. Please refresh.</p></div>`;
                        return;
                    }
    
                    const connectionName = appData.connections.find(c => c.name === plan.connId)?.name || plan.connId || 'N/A';
                    const planName = appData.plans[plan.planId]?.name || plan.planId;
                    document.getElementById("plan-info-container").innerHTML = `<span class="bg-blue-500/10 text-blue-300 px-2 py-1 rounded-full"><i class="fa-solid fa-rocket fa-fw mr-2"></i>${planName}</span><span class="bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded-full"><i class="fa-solid fa-wifi fa-fw mr-2"></i>${connectionName}</span>`;
                    
                    planDetailsContainer.innerHTML = `
                        <div id="profile-tabs" class="flex items-center gap-4 sm:gap-6 border-b border-white/10 mb-6 overflow-x-auto">
                            <button data-tab="config" class="tab-btn">V2Ray Config</button>
                            <button data-tab="usage" class="tab-btn">Usage Stats</button>
                            <button data-tab="orders" class="tab-btn">My Orders</button>
                            <button data-tab="settings" class="tab-btn">Account Settings</button>
                        </div>
                        <div id="tab-config" class="tab-panel"><div class="card-glass p-6 sm:p-8 custom-radius"><div class="grid md:grid-cols-2 gap-8 items-center"><div class="flex flex-col items-center text-center"><h3 class="text-lg font-semibold text-white mb-3">Scan with your V2Ray App</h3><div id="qrcode-container" class="w-44 h-44 p-3 bg-white rounded-lg cursor-pointer flex items-center justify-center shadow-lg shadow-blue-500/20" title="Click to view larger"></div></div><div class="space-y-6"><div class="w-full"><label class="text-sm text-gray-400">V2Ray Config Link</label><div class="flex items-center gap-2 mt-2"><input type="text" readonly value="${plan.v2rayLink}" class="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300"><button id="copy-config-btn" class="ai-button secondary !text-sm !font-semibold flex-shrink-0 px-4 py-2 rounded-md"><i class="fa-solid fa-copy mr-2"></i>Copy</button></div></div><div class="w-full text-center border-t border-white/10 pt-6"><label class="text-sm text-gray-400">Plan Renewal</label><div id="renew-button-container" class="mt-3"></div></div></div></div></div></div>
                        <div id="tab-usage" class="tab-panel"></div>
                        <div id="tab-orders" class="tab-panel"></div>
                        <div id="tab-settings" class="tab-panel"><div class="card-glass p-6 sm:p-8 custom-radius"><div class="max-w-md mx-auto"><h3 class="text-xl font-bold text-white mb-6 font-['Orbitron'] text-center">Account Settings</h3><form id="profile-update-form" class="space-y-6"><div class="form-group"><input type="text" class="form-input" readonly value="${user.username}" title="Website username cannot be changed."><label class="form-label">Website Username</label></div><div class="form-group relative"><input type="password" id="new-password" class="form-input pr-10" placeholder=" "><label for="new-password" class="form-label">New Password (leave blank to keep)</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i></div><button type="submit" class="ai-button w-full rounded-lg !mt-8">Save Changes</button></form></div></div></div>`;
                    
                    const qrContainer = document.getElementById("qrcode-container");
                    qrContainer.innerHTML = "";
                    try {
                        new QRCode(qrContainer, {
                            text: plan.v2rayLink,
                            width: 140,
                            height: 140,
                            correctLevel: QRCode.CorrectLevel.L
                        });
                    } catch (error) {
                        console.error("QR Code generation failed:", error);
                        qrContainer.innerHTML = `<p class="text-xs text-red-500 text-center p-4">QR code could not be generated. The config link is likely too long.</p>`;
                    }

                    qrContainer.addEventListener('click', () => {
                        const img = qrContainer.querySelector('img');
                        if (img) qrModalLogic.show(img.src, plan.v2rayUsername);
                    });

                    document.getElementById('copy-config-btn').addEventListener('click', () => { navigator.clipboard.writeText(plan.v2rayLink); showToast({ title: 'Copied!', message: 'Config link copied to clipboard.', type: 'success' }); });
    
                    const tabs = document.getElementById('profile-tabs');
                    const panels = planDetailsContainer.querySelectorAll('.tab-panel');
    
                    const loadUsageStats = () => {
                        const usageContainer = document.getElementById("tab-usage");
                        if (!usageContainer) return;
                        usageContainer.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-400"></i></div>`;
                        apiFetch(`/api/check-usage/${plan.v2rayUsername}`).then(res => res.json()).then(result => {
                            if (result.success) {
                                // Inline displayUserData function for consistency with main.js block
                                const data = result.data;
                                const down = data.down || 0;
                                const up = data.up || 0;
                                const totalUsed = down + up;
                                const totalQuota = data.total || 0;
                                const usagePercentage = totalQuota > 0 ? Math.min((totalUsed / totalQuota) * 100, 100) : 0;
                                const status = data.enable ? `<span class="font-semibold text-green-400">ONLINE</span>` : `<span class="font-semibold text-red-400">OFFLINE</span>`;
                                let expiry = 'N/A';
                                if (data.expiryTime && data.expiryTime > 0) {
                                    const expDate = new Date(data.expiryTime);
                                    expiry = new Date() > expDate ? `<span class="font-semibold text-red-400">Expired</span>` : expDate.toLocaleDateString('en-CA');
                                }

                                const formatBytes = (b = 0, d = 2) => {
                                    const k = 1024;
                                    const s = ['B', 'KB', 'MB', 'GB', 'TB'];
                                    if (b === 0) return '0 B';
                                    const i = Math.floor(Math.log(b) / Math.log(k));
                                    return `${parseFloat((b / k ** i).toFixed(d))} ${s[i]}`;
                                };

                                const html = `
                                    <div class="result-card p-4 sm:p-6 card-glass custom-radius space-y-5 reveal is-visible">
                                        <div class="flex justify-between items-center pb-3 border-b border-white/10">
                                            <h3 class="text-lg font-semibold text-white flex items-center min-w-0">
                                                <i class="fa-solid fa-satellite-dish mr-3 text-blue-400 flex-shrink-0"></i>
                                                <span class="truncate" title="${plan.v2rayUsername}">Client: ${plan.v2rayUsername}</span>
                                            </h3>
                                            <div>${status}</div>
                                        </div>
                                        ${totalQuota > 0 ? `<div class="space-y-2"><div class="flex justify-between items-baseline text-sm"><span class="font-medium text-gray-300">Data Quota Usage</span><span id="usage-percentage" class="font-bold text-white">0%</span></div><div class="w-full bg-black/30 rounded-full h-2.5"><div class="progress-bar-inner bg-gradient-to-r from-sky-500 to-blue-500 h-2.5 rounded-full" style="width: ${usagePercentage}%"></div></div></div>` : ''}
                                        <div class="space-y-4 text-sm sm:hidden">
                                            <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-down text-sky-400 text-lg w-5 text-center"></i><span>Download</span></div><p class="font-semibold text-white text-base">${formatBytes(down)}</p></div>
                                            <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-up text-violet-400 text-lg w-5 text-center"></i><span>Upload</span></div><p class="font-semibold text-white text-base">${formatBytes(up)}</p></div>
                                            <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-database text-green-400 text-lg w-5 text-center"></i><span>Total Used</span></div><p class="font-semibold text-white text-base">${formatBytes(totalUsed)}</p></div>
                                            <div class="flex justify-between items-center"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-calendar-xmark text-red-400 text-lg w-5 text-center"></i><span>Expires On</span></div><p class="font-medium text-white text-base">${expiry}</p></div>
                                        </div>
                                        <div class="hidden sm:grid sm:grid-cols-2 gap-4 text-sm">
                                            <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-down text-sky-400 mr-2"></i><span>Download</span></div><p class="text-2xl font-bold text-white mt-1">${formatBytes(down)}</p></div>
                                            <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-up text-violet-400 mr-2"></i><span>Upload</span></div><p class="text-2xl font-bold text-white mt-1">${formatBytes(up)}</p></div>
                                            <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-database text-green-400 mr-2"></i><span>Total Used</span></div><p class="text-2xl font-bold text-white mt-1">${formatBytes(totalUsed)}</p></div>
                                            <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-calendar-xmark text-red-400 mr-2"></i><span>Expires On</span></div><p class="text-xl font-medium text-white mt-1">${expiry}</p></div>
                                        </div>
                                    </div>`;
                                usageContainer.innerHTML = html;
                            }
                            else usageContainer.innerHTML = `<div class="card-glass p-4 rounded-xl text-center text-amber-400"><p>${result.message}</p></div>`;
                        }).catch(() => usageContainer.innerHTML = `<div class="card-glass p-4 rounded-xl text-center text-red-400"><p>Could not load usage statistics.</p></div>`);
                    };
    
                    const loadMyOrders = async (isSilent = false) => {
                        const ordersContainer = document.getElementById("tab-orders");
                        if (!ordersContainer) return;
                        if (!isSilent) {
                            ordersContainer.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-400"></i></div>`;
                        }
                        try {
                            const res = await apiFetch("/api/user/orders");
                            if (!res.ok) throw new Error("Failed to fetch orders");
                            const { orders } = await res.json();
                            const ordersHtml = (orders.length > 0) ? orders.map(order => {
                                const statusColors = { pending: "text-amber-400", approved: "text-green-400", rejected: "text-red-400" };
                                const statusIcons = { pending: "fa-solid fa-clock", approved: "fa-solid fa-check-circle", rejected: "fa-solid fa-times-circle" };
                                return `<div class="card-glass p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 custom-radius"><div><p class="font-bold text-white">${appData.plans[order.plan_id]?.name || order.plan_id} <span class="text-gray-400 font-normal">for</span> ${appData.connections.find(c => c.name === order.conn_id)?.name || order.conn_id}</p><p class="text-xs text-gray-400 mt-1">Ordered on: ${new Date(order.created_at).toLocaleDateString()} ${order.status === 'approved' && order.final_username ? `| V2Ray User: <strong class="text-blue-300">${order.final_username}</strong>` : ''}</p></div><div class="text-sm font-semibold capitalize flex items-center gap-2 ${statusColors[order.status] || 'text-gray-400'}"><i class="${statusIcons[order.status] || 'fa-solid fa-question-circle'}"></i><span>${order.status}</span></div></div>`;
                            }).join('') : `<div class="card-glass p-8 custom-radius text-center"><i class="fa-solid fa-box-open text-4xl text-gray-400 mb-4"></i><h3 class="font-bold text-white">No Orders Found</h3><p class="text-gray-400 text-sm mt-2">You have not placed any orders yet.</p></div>`;
                            
                            ordersContainer.innerHTML = `<div class="space-y-3">${ordersHtml}</div>`;
                        } catch (err) {
                            if (!isSilent) {
                                ordersContainer.innerHTML = `<div class="card-glass p-4 rounded-xl text-center text-red-400"><p>Could not load your orders.</p></div>`;
                            }
                        }
                    };
    
                    const switchTab = (tabId) => {
                        tabs.querySelector('.active')?.classList.remove('active');
                        panels.forEach(p => p.classList.remove('active'));
                        tabs.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
                        document.getElementById(`tab-${tabId}`)?.classList.add('active');
                        
                        if (tabId === 'config') updateRenewButton(plan); 
                        if (tabId === 'usage') loadUsageStats();
                        if (tabId === 'orders') loadMyOrders();
                        
                        history.pushState(null, '', `/profile?tab=${tabId}`);
                    };
    
                    tabs.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') switchTab(e.target.dataset.tab); });
                    switchTab(params.get('tab') || 'config');
                    setupEventListeners();
                };
                
                // Add event listener for plan selection
                const floatingMenu = document.querySelector('#plan-menu .floating-menu');
                if (floatingMenu) {
                    floatingMenu.addEventListener('click', (e) => {
                        const link = e.target.closest('a');
                        if (link) {
                            e.preventDefault();
                            const planIndex = link.dataset.planIndex;
                            if (planIndex !== undefined) {
                                // Update trigger text
                                const triggerText = document.querySelector('#plan-menu .trigger-menu .text');
                                triggerText.textContent = data.activePlans[planIndex].v2rayUsername;
                                // Call the main function to re-render details
                                displayPlanDetails(planIndex);
                                // Close the menu
                                planMenuInstance.closeAll();
                            }
                        }
                    });
                }

                // Initial display
                displayPlanDetails(0);
    
            } else if (data.status === "pending") {
                statusContainer.innerHTML = `<div class="card-glass p-8 rounded-xl text-center"><i class="fa-solid fa-clock text-4xl text-amber-400 mb-4 animate-pulse"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Order Pending Approval</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">Your order is currently being reviewed. Your profile will update here once approved.</p></div>`;
            } else {
                const settingsHtml = `<div class="card-glass p-6 custom-radius"><h3 class="text-xl font-bold text-white mb-4 font-['Orbitron']">Account Settings</h3><form id="profile-update-form" class="space-y-6"><div class="form-group"><input type="text" class="form-input" readonly value="${user.username}" title="Website username cannot be changed."><label class="form-label">Website Username</label></div><div class="form-group relative"><input type="password" id="new-password" class="form-input pr-10" placeholder=" "><label for="new-password" class="form-label">New Password (leave blank to keep)</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i></div><button type="submit" class="ai-button w-full rounded-lg !mt-8">Save Changes</button></form></div>`;
                const linkAccountHtml = `<div class="card-glass p-6 custom-radius"><h3 class="text-xl font-bold text-white mb-2 font-['Orbitron']">Link Existing V2Ray Account</h3><p class="text-sm text-gray-400 mb-6">If you have an old account, link it here to manage renewals.</p><form id="link-account-form-profile" class="space-y-6"><div class="form-group"><input type="text" id="existing-v2ray-username-profile" class="form-input" required placeholder=" "><label for="existing-v2ray-username-profile" class="form-label">Your Old V2Ray Username</label><span class="focus-border"><i></i></span></div><button type="submit" class="ai-button secondary w-full rounded-lg">Link Account</button><div class="text-center text-sm mt-4"><span class="open-help-modal-link text-blue-400 cursor-pointer hover:underline">How to find your username?</span></div></form></div>`;
                statusContainer.innerHTML = `<div class="card-glass p-8 custom-radius text-center"><i class="fa-solid fa-rocket text-4xl text-blue-400 mb-4"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Get Started</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">You do not have any active plans yet. Purchase a new plan or link an existing account below.</p><a href="/plans" class="nav-link-internal ai-button inline-block rounded-lg mt-6">Purchase a Plan</a></div><div class="grid md:grid-cols-2 gap-8 mt-8">${settingsHtml}${linkAccountHtml}</div>`;
                setupEventListeners();
            }
        })
        .catch((error) => {
            console.error("Error fetching user status:", error);
            statusContainer.innerHTML = `<div class="card-glass p-8 rounded-xl text-center"><p class="text-red-400">Could not load profile data. Please try logging in again.</p></div>`;
        });
}