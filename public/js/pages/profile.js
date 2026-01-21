// File: public/js/pages/profile.js
import { apiFetch, appData } from '../api.js';
import { showToast, SikFloatingMenu, togglePassword, qrModalLogic } from '../utils.js';
import { navigateTo } from '../router.js';
import { handleRenewalChoice } from './checkout.js';

let profilePollingInterval = null;

// --- GLOBAL STATE ---
let usageDataCache = {};        
let ordersCache = null; 
let activeFetchPromises = {};   
let currentActivePlan = null; 
let lastKnownPlansStr = ""; 
let globalActivePlans = []; 

// --- SMART DATA FETCHER (REAL-TIME UPDATES) ---
const fetchClientData = async (username) => {
    const timestamp = new Date().getTime();
    
    const promise = apiFetch(`/api/check-usage/${username}?_=${timestamp}&r=${Math.random()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' }
    })
    .then(res => {
        if (res.status === 404) {
            return { success: false, isRemoved: true }; 
        }
        return res.json();
    })
    .then(result => {
        if (result.success) {
            usageDataCache[username] = result.data;
            try { 
                localStorage.setItem('nexguard_usage_cache', JSON.stringify(usageDataCache)); 
            } catch(e){}
        }
        return result;
    })
    .catch(err => {
        console.error(`Fetch error for ${username}:`, err);
        return { success: false, isError: true };
    });

    return promise;
};

// --- Helper to ensure orders are loaded ---
const ensureOrdersLoaded = async () => {
    if (ordersCache) return ordersCache;
    try {
        const res = await apiFetch("/api/user/orders");
        const data = await res.json();
        if (data.orders) {
            ordersCache = data.orders;
            return ordersCache;
        }
    } catch (e) {
        console.error("Failed to background fetch orders:", e);
    }
    return [];
};

export function renderProfilePage(renderFunc, params) {
    if (profilePollingInterval) {
        clearInterval(profilePollingInterval);
        profilePollingInterval = null;
    }

    let initialTabCheckDone = false;

    if (window.renderPlanDetailsInternal) window.renderPlanDetailsInternal = null;
    
    lastKnownPlansStr = ""; 

    const user = JSON.parse(localStorage.getItem("nexguard_user"));
    if (!user) {
        navigateTo("/login");
        return;
    }

    const PLANS_CACHE_KEY = `nexguard_plans_cache_${user.username}`;
    const LAST_PLAN_KEY = `nexguard_last_plan_${user.username}`;

    // --- HTML Templates ---
    
    // 1. Help Modal
    const helpModalHtml = `
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

    // 2. Link Account Modal
    const linkAccountModalHtml = `
        <div id="link-account-modal" class="help-modal-overlay">
            <div class="help-modal-content grease-glass p-6 space-y-4 w-full max-w-md">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-xl font-bold text-white font-['Orbitron']">Link Old V2Ray Account</h3>
                    <button id="link-modal-close" class="text-white/80 hover:text-white text-3xl transition-all hover:rotate-90">&times;</button>
                </div>
                <p class="text-sm text-gray-300 mb-4">Enter your previous V2Ray username to link it to this dashboard.</p>
                <form id="link-account-modal-form" class="space-y-4">
                    <div class="form-group">
                        <input type="text" id="modal-v2ray-username" class="form-input" required placeholder=" ">
                        <label for="modal-v2ray-username" class="form-label">Old V2Ray Username</label>
                        <span class="focus-border"><i></i></span>
                    </div>
                    <button type="submit" class="ai-button secondary w-full rounded-lg">Link Now</button>
                </form>
            </div>
        </div>`;
    
    // --- Styles: Fixed Height & Fixed Width Dropdown ---
    const pageStyles = `<style>
        #page-profile .form-input { height: 56px; padding: 20px 12px 8px 12px; background-color: rgba(0, 0, 0, 0.4); border-color: rgba(255, 255, 255, 0.2); } 
        #page-profile .form-label { position: absolute; top: 50%; left: 13px; transform: translateY(-50%); color: #9ca3af; pointer-events: none; transition: all 0.2s ease-out; font-size: 14px; } 
        #page-profile .form-input:focus ~ .form-label, #page-profile .form-input:not(:placeholder-shown) ~ .form-label { top: 10px; transform: translateY(0); font-size: 11px; color: var(--brand-blue); } 
        #page-profile .form-input[readonly] { background-color: rgba(0,0,0,0.2); cursor: not-allowed; } 
        .tab-btn { border-bottom: 3px solid transparent; transition: all .3s ease; color: #9ca3af; padding: 0.75rem 0.25rem; font-weight: 600; white-space: nowrap; } 
        .tab-btn.active { border-bottom-color: var(--brand-blue); color: #fff; } 
        .tab-panel { display: none; } 
        .tab-panel.active { display: block; animation: pageFadeIn 0.5s; }
        
        /* FIXED TAB HEIGHT - Prevents jumping */
        .tab-panel .card-glass { min-height: 500px; display: flex; flex-direction: column; justify-content: flex-start; }

        .help-modal-overlay { opacity: 0; visibility: hidden; transition: opacity 0.3s ease-out, visibility 0.3s ease-out; background: rgba(0, 0, 0, 0.2); z-index: 9999; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .help-modal-overlay.visible { opacity: 1; visibility: visible; }
        .help-modal-content { opacity: 0; transform: scale(0.90); transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .help-modal-overlay.visible .help-modal-content { opacity: 1; transform: scale(1); }
        .grease-glass { background: rgba(30, 40, 60, 0.4); backdrop-filter: blur(20px) saturate(200%); -webkit-backdrop-filter: blur(20px) saturate(200%); border-radius: 35px; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5); }
        .plan-selector-container { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem; position: relative; z-index: 100; overflow: visible !important; }
        .plan-selector-label { font-size: 0.875rem; font-weight: 600; color: #d1d5db; flex-shrink: 0; }
        ul.fmenu { display: inline-block; list-style: none; padding: 0; margin: 0; white-space: nowrap; position: relative; overflow: visible !important; }
        ul.fmenu > li.fmenu-item { position: relative; overflow: visible !important; }
        
        /* FIXED WIDTH DROPDOWN */
        ul.fmenu .trigger-menu { display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; height: 44px; padding: 0 1.2rem; border-radius: 999px; background-color: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer; transition: all ease 0.3s; min-width: 180px; overflow: visible !important; }
        ul.fmenu .trigger-menu:hover, ul.fmenu .trigger-menu.open { border-color: var(--brand-blue); box-shadow: 0 0 15px rgba(59, 130, 246, 0.3); }
        ul.fmenu .trigger-menu i { color: #9ca3af; font-size: 0.9rem; transition: color ease 0.3s; }
        ul.fmenu .trigger-menu:hover i, ul.fmenu .trigger-menu.open i { color: #60a5fa; }
        ul.fmenu .trigger-menu .text { display: block; font-size: 0.95rem; color: #ffffff; padding: 0 0.5rem; font-weight: 500; }
        ul.fmenu .trigger-menu .arrow { font-size: 0.8rem; transition: transform ease 0.3s; }
        ul.fmenu .trigger-menu.open .arrow { transform: rotate(180deg); }
        ul.fmenu .floating-menu { display: block; position: absolute; top: 100%; margin-top: 12px; left: 0; width: 100%; min-width: 100%; list-style: none; padding: 0.5rem; background-color: #0f172a; border: 1px solid rgba(71, 85, 105, 0.6); border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); z-index: 9999 !important; opacity: 0; visibility: hidden; transform: translateY(-10px); transition: opacity 0.3s, transform 0.3s; }
        ul.fmenu .trigger-menu.open + .floating-menu { opacity: 1 !important; visibility: visible !important; transform: translateY(0) !important; max-height: none !important; overflow: visible !important; }
        ul.fmenu .floating-menu > li a { color: #cbd5e1; font-size: 0.9rem; text-decoration: none; display: block; padding: 0.75rem 1.2rem; border-radius: 15px; transition: all 0.2s ease; border: 1px solid transparent; }
        ul.fmenu .floating-menu > li a:hover { background-color: rgba(59, 130, 246, 0.15); color: #ffffff; border-color: rgba(59, 130, 246, 0.3); }
    </style>`;
    
    let profilePictureUrl = (user.profilePicture || "/assets/profilePhoto.jpg").replace("public/", "");
    if (profilePictureUrl && !profilePictureUrl.startsWith('/')) profilePictureUrl = '/' + profilePictureUrl;
    
    const baseHtml = `<div id="page-profile" class="page space-y-8"><div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left reveal"><div class="relative flex-shrink-0"><img id="profile-pic-img" src="${profilePictureUrl}" alt="Profile Picture" class="w-24 h-24 rounded-full border-4 border-blue-500/50 object-cover shadow-lg"><label for="avatar-upload" class="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500 transition shadow-md"><i class="fa-solid fa-camera text-white"></i><input type="file" id="avatar-upload" class="hidden" accept="image/*"></label></div><div class="flex-grow"><h2 class="text-3xl font-bold font-['Orbitron'] text-white">${user.username}</h2><p class="text-gray-400">${user.email}</p><div id="plan-info-container" class="text-xs sm:text-sm mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2"></div></div></div><div id="user-status-content" class="reveal"><div class="flex flex-col items-center justify-center min-h-[40vh]"><div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-3xl text-blue-400"></i><p class="mt-4 text-lg font-semibold text-blue-300 animate-pulse">Loading Your Data...</p></div></div></div></div> ${modalHtml} ${linkAccountModalHtml}`;
    
    renderFunc(pageStyles + baseHtml);
    const statusContainer = document.getElementById("user-status-content");
    qrModalLogic.init();

    const pendingMsg = localStorage.getItem("pendingLinkSuccess");
    if (pendingMsg) {
        setTimeout(() => {
            showToast({ title: "Success!", message: pendingMsg, type: "success", duration: 5000 });
            localStorage.removeItem("pendingLinkSuccess");
        }, 500);
    }

    try {
        const storedCache = localStorage.getItem('nexguard_usage_cache');
        if (storedCache) usageDataCache = JSON.parse(storedCache);
    } catch(e) { console.warn("Cache parse error", e); }

    // --- SETUP EVENT LISTENERS (Includes New Modal Logic) ---
    const setupEventListeners = () => {
        // Help Modal Logic
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

        // Link Account Modal Logic (NEW)
        const linkModal = document.getElementById('link-account-modal');
        if (linkModal) {
            const closeLinkModal = () => { linkModal.classList.remove('visible'); document.body.classList.remove('modal-open'); };
            document.getElementById('link-modal-close')?.addEventListener('click', closeLinkModal);
            linkModal.addEventListener('click', (e) => { if (e.target === linkModal) closeLinkModal(); });

            document.getElementById("link-account-modal-form")?.addEventListener("submit", async(e) => {
                e.preventDefault();
                const v2rayUsername = document.getElementById("modal-v2ray-username").value;
                if (!v2rayUsername) return showToast({ title: "Error", message: "Please enter your V2Ray username.", type: "error" });
                
                const btn = e.target.querySelector("button");
                btn.disabled = true;
                showToast({ title: "Linking...", message: "Please wait...", type: "info", duration: 2000 });
                
                try {
                    const res = await apiFetch("/api/user/link-v2ray", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v2rayUsername }) });
                    const result = await res.json();
                    if (res.ok) {
                        localStorage.setItem("pendingLinkSuccess", result.message || "Your V2Ray account has been linked!");
                        window.location.reload(); 
                    } else {
                        btn.disabled = false;
                        showToast({ title: "Linking Failed", message: result.message, type: "error" });
                    }
                } catch (err) {
                    btn.disabled = false;
                    showToast({ title: "Error", message: "Something went wrong.", type: "error" });
                }
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
            document.querySelectorAll("#profile-pic-img, #profile-pic-nav-desktop, #profile-pic-nav-mobile").forEach(img => {
                if(img) img.src = newPath;
            });
            let localUser = JSON.parse(localStorage.getItem("nexguard_user"));
            localUser.profilePicture = `public/${newPath}`;
            localStorage.setItem("nexguard_user", JSON.stringify(localUser));
        } else {
            showToast({ title: "Upload Failed", message: result.message, type: "error" });
        }
    });

    const renderUsageHTML = (d, username) => {
        const usageContainer = document.getElementById("tab-usage");
        if (!usageContainer) return;

        const total = d.down + d.up;
        const percent = d.total > 0 ? Math.min((total / d.total) * 100, 100) : 0;
        const formatBytes = (b = 0, d = 2) => {
            const k = 1024; const s = ['B', 'KB', 'MB', 'GB', 'TB'];
            if (b === 0) return '0 B'; const i = Math.floor(Math.log(b) / Math.log(k));
            return `${parseFloat((b / k ** i).toFixed(d))} ${s[i]}`;
        };

        const now = Date.now();
        const expiryTimestamp = parseInt(d.expiryTime, 10);
        let expiryDisplay = '<span class="text-300">Unlimited</span>';
        let expiryColorClass = 'text-white';
        let status = d.enable ? `<span class="font-semibold text-green-400">ONLINE</span>` : `<span class="font-semibold text-red-400">OFFLINE</span>`;

        if (expiryTimestamp > 0) {
            if (now > expiryTimestamp) {
                expiryDisplay = `<span class="font-bold text-red-500 tracking-wide">EXPIRED</span>`;
                status = `<span class="font-bold text-red-500">EXPIRED</span>`;
                expiryColorClass = 'text-red-400';
            } else {
                expiryDisplay = new Date(expiryTimestamp).toLocaleDateString('en-CA');
            }
        }

        usageContainer.innerHTML = `
            <div class="result-card p-4 sm:p-6 card-glass custom-radius space-y-5 reveal is-visible">
                <div class="flex justify-between items-center pb-3 border-b border-white/10">
                    <h3 class="text-lg font-semibold text-white flex items-center min-w-0"><i class="fa-solid fa-satellite-dish mr-3 text-blue-400 flex-shrink-0"></i><span class="truncate" title="${username}">Client: ${username}</span></h3>
                    <div id="rt-status">${status}</div>
                </div>
                ${d.total > 0 ? `<div class="space-y-2"><div class="flex justify-between items-baseline text-sm"><span class="font-medium text-gray-300">Data Quota Usage</span><span id="rt-percent" class="font-bold text-white">${percent.toFixed(1)}%</span></div><div class="w-full bg-black/30 rounded-full h-2.5"><div id="rt-bar" class="progress-bar-inner bg-gradient-to-r from-sky-500 to-blue-500 h-2.5 rounded-full" style="width: ${percent}%"></div></div></div>` : ''}
                <div class="space-y-4 text-sm sm:hidden">
                    <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-down text-sky-400 text-lg w-5 text-center"></i><span>Download</span></div><p class="font-semibold text-white text-base">${formatBytes(d.down)}</p></div>
                    <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-up text-violet-400 text-lg w-5 text-center"></i><span>Upload</span></div><p class="font-semibold text-white text-base">${formatBytes(d.up)}</p></div>
                    <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-database text-green-400 text-lg w-5 text-center"></i><span>Total Used</span></div><p class="font-semibold text-white text-base">${formatBytes(total)}</p></div>
                    <div class="flex justify-between items-center"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-calendar-xmark text-red-400 text-lg w-5 text-center"></i><span>Expires On</span></div><p class="font-medium ${expiryColorClass} text-base">${expiryDisplay}</p></div>
                </div>
                <div class="hidden sm:grid sm:grid-cols-2 gap-4 text-sm">
                    <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-down text-sky-400 mr-2"></i><span>Download</span></div><p class="text-2xl font-bold text-white mt-1">${formatBytes(d.down)}</p></div>
                    <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-up text-violet-400 mr-2"></i><span>Upload</span></div><p class="text-2xl font-bold text-white mt-1">${formatBytes(d.up)}</p></div>
                    <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-database text-green-400 mr-2"></i><span>Total Used</span></div><p class="text-2xl font-bold text-white mt-1">${formatBytes(total)}</p></div>
                    <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-calendar-xmark text-red-400 mr-2"></i><span>Expires On</span></div><p class="text-xl font-medium ${expiryColorClass} mt-1">${expiryDisplay}</p></div>
                </div>
            </div>`;
    };

    const renderPlanRejectedHTML = (username) => {
        const usageContainer = document.getElementById("tab-usage");
        const configContainer = document.getElementById("tab-config");
        const rejectedHtml = `
            <div class="result-card p-6 card-glass custom-radius space-y-4 reveal is-visible border border-red-500/50 bg-red-900/10">
                <div class="text-center"><i class="fa-solid fa-ban text-4xl text-red-500 mb-3"></i><h3 class="text-xl font-bold text-white">Your Plan Rejected By Admin</h3><p class="text-sm text-gray-300 mt-2">Unfortunately, your plan <span class="font-semibold text-red-300">${username}</span> has been rejected.</p><p class="text-xs text-gray-400 mt-1">Please check your orders tab or contact support for more details.</p></div>
            </div>`;
        if (usageContainer) usageContainer.innerHTML = rejectedHtml;
        if (configContainer) configContainer.innerHTML = rejectedHtml; 
    };

    const renderPlanRemovedHTML = (username) => {
        const usageContainer = document.getElementById("tab-usage");
        if (!usageContainer) return;
        const otherPlansAvailable = globalActivePlans.length > 1;
        const renewalActionHtml = `<button id="renew-removed-plan-btn" class="ai-button w-full rounded-lg mt-2 inline-block"><i class="fa-solid fa-arrows-rotate mr-2"></i>Renew This Plan</button>`;
        const switchHtml = otherPlansAvailable ? `<button id="switch-plan-btn" class="ai-button secondary w-full rounded-lg mt-2"><i class="fa-solid fa-repeat mr-2"></i>Switch Plan</button>` : '';
        usageContainer.innerHTML = `<div class="result-card p-6 card-glass custom-radius space-y-4 reveal is-visible border border-amber-500/30"><div class="text-center"><i class="fa-solid fa-triangle-exclamation text-4xl text-amber-400 mb-3"></i><h3 class="text-xl font-bold text-white">Plan Expired / Inactive</h3><p class="text-sm text-gray-300 mt-1">We couldn't find active data for <span class="font-semibold text-amber-300">${username}</span>. It may have expired.</p></div><div class="pt-2 flex flex-col gap-2">${renewalActionHtml}${switchHtml}</div></div>`;
        document.getElementById('renew-removed-plan-btn')?.addEventListener('click', () => { const plan = globalActivePlans.find(p => p.v2rayUsername === username); if (plan) handleRenewalChoice(globalActivePlans, plan); else showToast({ title: "Error", message: "Could not identify plan details.", type: "error" }); });
        if (otherPlansAvailable) {
            document.getElementById('switch-plan-btn')?.addEventListener('click', () => {
                const currentIndex = globalActivePlans.findIndex(p => p.v2rayUsername === username);
                const nextIndex = (currentIndex + 1) % globalActivePlans.length;
                document.querySelector('#plan-menu .trigger-menu .text').textContent = globalActivePlans[nextIndex].v2rayUsername;
                localStorage.setItem(`nexguard_last_plan_${user.username}`, globalActivePlans[nextIndex].v2rayUsername);
                if (window.renderPlanDetailsInternal) window.renderPlanDetailsInternal(nextIndex);
            });
        }
    };

    const loadUsageStats = (username, isSilent = false) => {
        const usageContainer = document.getElementById("tab-usage");
        if (!usageContainer) return;
        
        let isKnownRejected = false;
        if(ordersCache) {
             isKnownRejected = ordersCache.some(o => (o.final_username === username || (currentActivePlan && o.plan_id === currentActivePlan.planId && o.status === 'rejected')) && o.status === 'rejected');
        }
        if (isKnownRejected) { renderPlanRejectedHTML(username); return; }

        if (!isSilent && !usageDataCache[username]) {
            usageContainer.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-400"></i></div>`;
        }
        
        fetchClientData(username).then(async result => {
            if (currentActivePlan && currentActivePlan.v2rayUsername === username) {
                if (result.success && result.data) {
                    renderUsageHTML(result.data, username);
                } else if (result.isRemoved) {
                    delete usageDataCache[username];
                    try { localStorage.setItem('nexguard_usage_cache', JSON.stringify(usageDataCache)); } catch(e){}
                    if (!ordersCache) await ensureOrdersLoaded();
                    let isRejected = false;
                    if(ordersCache) { isRejected = ordersCache.some(o => (o.final_username === username || (o.plan_id === currentActivePlan.planId && o.status === 'rejected')) && o.status === 'rejected'); }
                    if (isRejected) renderPlanRejectedHTML(username); else renderPlanRemovedHTML(username);
                } else if (!isSilent) {
                    usageContainer.innerHTML = `<div class="card-glass p-4 rounded-xl text-center text-amber-400"><p>${result.message || 'Error loading usage.'}</p></div>`;
                }
            }
        });
    };

    const renderOrdersHTML = (orders) => {
        const container = document.getElementById("tab-orders");
        if (!container) return;
        const html = (orders.length > 0) ? orders.map(order => {
            const displayStatus = order.status === 'queued_for_renewal' ? 'Queued' : order.status;
            const statusColors = { pending: "text-amber-400", approved: "text-green-400", rejected: "text-red-400", queued_for_renewal: "text-blue-300" };
            return `<div class="card-glass p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 custom-radius"><div><p class="font-bold text-white">${appData.plans[order.plan_id]?.name || order.plan_id} <span class="text-gray-400 font-normal">for</span> ${appData.connections.find(c => c.name === order.conn_id)?.name || order.conn_id}</p><p class="text-xs text-gray-400 mt-1">Ordered on: ${new Date(order.created_at).toLocaleDateString()}</p></div><div class="text-sm font-semibold capitalize flex items-center gap-2 ${statusColors[order.status] || 'text-gray-400'}"><span>${displayStatus}</span></div></div>`;
        }).join('') : `<div class="card-glass p-8 custom-radius text-center"><i class="fa-solid fa-box-open text-4xl text-gray-400 mb-4"></i><h3 class="font-bold text-white">No Orders</h3></div>`;
        container.innerHTML = `<div class="space-y-3">${html}</div>`;
    }

    const loadMyOrders = async (isSilent = false) => {
        const container = document.getElementById("tab-orders");
        if (!container) return;
        if (!isSilent) container.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-400"></i></div>`;
        try {
            const res = await apiFetch("/api/user/orders");
            const { orders } = await res.json();
            ordersCache = orders;
            renderOrdersHTML(orders);
        } catch (err) {
            if (!isSilent) container.innerHTML = `<div class="card-glass p-4 rounded-xl text-center text-red-400"><p>Could not load your orders.</p></div>`;
        }
    };

    const updateRenewButton = async (plan, activePlans) => {
        const container = document.getElementById("renew-button-container");
        if (!container) return;
        
        // --- OPTIMISTIC UI: Show "Renew Plan" immediately (Fix for "Checking..." state) ---
        if (!usageDataCache[plan.v2rayUsername]) {
             container.innerHTML = `<button id="renew-profile-btn" class="ai-button bg-amber-500 hover:bg-amber-600 border-none text-white inline-block rounded-lg"><i class="fa-solid fa-arrows-rotate mr-2"></i>Renew Plan</button>`;
             document.getElementById('renew-profile-btn')?.addEventListener('click', () => handleRenewalChoice(activePlans, plan));
        }
        
        try {
            const result = await fetchClientData(plan.v2rayUsername);
            let shouldEnableRenew = false;
            let btnText = "Renew / Change Plan";
            let btnClass = "ai-button";

            if (result.success) {
                const expiryTimestamp = parseInt(result.data.expiryTime, 10);
                const now = Date.now();
                if (expiryTimestamp > 0) {
                    const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
                    if (now > expiryTimestamp) { shouldEnableRenew = true; btnText = "Renew Plan"; btnClass = "ai-button bg-amber-500 hover:bg-amber-600 border-none text-white"; } 
                    else if (now >= (expiryTimestamp - fiveDaysInMs)) { shouldEnableRenew = true; btnText = "Renew Plan (Expiring Soon)"; }
                } else { btnText = "Does not expire"; }
            } else if (result.isRemoved) {
                if (!ordersCache) await ensureOrdersLoaded();
                let isRejected = false;
                if(ordersCache) { isRejected = ordersCache.some(o => o.final_username === plan.v2rayUsername && o.status === 'rejected'); }
                
                if (isRejected) { container.innerHTML = `<span class="text-red-400 font-bold border border-red-500/50 px-3 py-1 rounded bg-red-900/20">Plan Rejected</span>`; return; } 
                else { shouldEnableRenew = true; btnText = "Renew Plan (Inactive/Expired)"; btnClass = "ai-button bg-red-600 hover:bg-red-700 border-none text-white"; }
            }

            if (shouldEnableRenew) {
                container.innerHTML = `<button id="renew-profile-btn" class="${btnClass} inline-block rounded-lg"><i class="fa-solid fa-arrows-rotate mr-2"></i>${btnText}</button>`;
                document.getElementById('renew-profile-btn')?.addEventListener('click', () => handleRenewalChoice(activePlans, plan));
            } else {
                container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed text-gray-400 border-gray-600">${btnText}</button>`;
            }
        } catch (e) {
             container.innerHTML = `<button id="renew-profile-btn" class="ai-button secondary inline-block rounded-lg"><i class="fa-solid fa-arrows-rotate mr-2"></i>Renew Plan</button>`;
             document.getElementById('renew-profile-btn')?.addEventListener('click', () => handleRenewalChoice(activePlans, plan));
        }
    };

    let planMenuInstance = null;
    const renderPlanSelector = (activePlans, activePlanIndex = 0) => {
        let planListItems = activePlans.map((plan, index) => 
            `<li><a href="#" data-plan-index="${index}">${plan.v2rayUsername}</a></li>`
        ).join('');

        // --- NEW: Add "Link Old Account" Option ---
        planListItems += `<li class="border-t border-white/10 mt-1 pt-1"><a href="#" id="link-new-account-option" class="text-blue-300 hover:text-blue-200"><i class="fa-solid fa-plus-circle mr-2"></i>Link Old Account</a></li>`;

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
                        <ul class="floating-menu">${planListItems}</ul>
                    </li>
                </ul>
            </div><div id="plan-details-container"></div>`;
        
        const existingMenu = document.querySelector('.plan-selector-container');
        if (!existingMenu) statusContainer.innerHTML = containerHtml;
        else existingMenu.outerHTML = `<div class="plan-selector-container"><label class="plan-selector-label custom-radius">Viewing Plan:</label><ul class="fmenu custom-radius" id="plan-menu"><li class="fmenu-item custom-radius"><div class="trigger-menu custom-radius"><i class="fa-solid fa-server"></i><span class="text">${activePlans[activePlanIndex]?.v2rayUsername || 'Select Plan'}</span><i class="fa-solid fa-chevron-down arrow"></i></div><ul class="floating-menu">${planListItems}</ul></li></ul></div>`;

        planMenuInstance = new SikFloatingMenu("#plan-menu");
        
        document.querySelector('#plan-menu .floating-menu')?.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link) {
                e.preventDefault();
                if (link.id === 'link-new-account-option') {
                    planMenuInstance.closeAll();
                    const linkModal = document.getElementById('link-account-modal');
                    if(linkModal) { linkModal.classList.add('visible'); document.body.classList.add('modal-open'); }
                } else {
                    const index = parseInt(link.dataset.planIndex);
                    document.querySelector('#plan-menu .trigger-menu .text').textContent = activePlans[index].v2rayUsername;
                    localStorage.setItem(LAST_PLAN_KEY, activePlans[index].v2rayUsername); 
                    if (window.renderPlanDetailsInternal) window.renderPlanDetailsInternal(index); 
                    planMenuInstance.closeAll();
                }
            }
        });
    };

    const handleDataUpdate = (data, isFresh) => {
        const currentPlansStr = JSON.stringify(data.activePlans || []);
        
        if (currentPlansStr !== lastKnownPlansStr) {
            lastKnownPlansStr = currentPlansStr;

            if (data.status === "approved" && data.activePlans?.length > 0) {
                data.activePlans.forEach(p => fetchClientData(p.v2rayUsername));
                globalActivePlans = data.activePlans;

                let currentIndex = 0;
                const storedSelection = localStorage.getItem(LAST_PLAN_KEY);
                if (storedSelection) {
                    const foundIndex = data.activePlans.findIndex(p => p.v2rayUsername === storedSelection);
                    if (foundIndex !== -1) currentIndex = foundIndex;
                }

                renderPlanSelector(data.activePlans, currentIndex);

                window.renderPlanDetailsInternal = (planIndex) => {
                    const plan = data.activePlans[planIndex];
                    currentActivePlan = plan; 
                    
                    const container = document.getElementById("plan-details-container");
                    if(!plan) return;
                    
                    const connectionName = appData.connections.find(c => c.name === plan.connId)?.name || plan.connId || 'N/A';
                    const planName = appData.plans[plan.planId]?.name || plan.planId;
                    document.getElementById("plan-info-container").innerHTML = `<span class="bg-blue-500/10 text-blue-300 px-2 py-1 rounded-full"><i class="fa-solid fa-rocket fa-fw mr-2"></i>${planName}</span><span class="bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded-full"><i class="fa-solid fa-wifi fa-fw mr-2"></i>${connectionName}</span>`;

                    if(!document.getElementById('profile-tabs')) {
                        container.innerHTML = `
                        <div id="profile-tabs" class="flex items-center gap-4 sm:gap-6 border-b border-white/10 mb-6 overflow-x-auto">
                            <button data-tab="config" class="tab-btn active">V2Ray Config</button>
                            <button data-tab="usage" class="tab-btn">Usage Stats</button>
                            <button data-tab="orders" class="tab-btn">My Orders</button>
                            <button data-tab="settings" class="tab-btn">Settings</button>
                        </div>
                        
                        <div id="tab-config" class="tab-panel active">
                            <div class="card-glass p-6 sm:p-8 custom-radius">
                                <div class="grid md:grid-cols-2 gap-8 items-center">
                                    <div class="flex flex-col items-center text-center">
                                        <h3 class="text-lg font-semibold text-white mb-3">Scan with your V2Ray App</h3>
                                        <div id="qrcode-container" class="w-44 h-44 p-3 bg-white rounded-lg cursor-pointer flex items-center justify-center shadow-lg shadow-blue-500/20"></div>
                                    </div>
                                    <div class="space-y-6">
                                        <div class="w-full">
                                            <label class="text-sm text-gray-400">V2Ray Config Link</label>
                                            <div class="flex items-center gap-2 mt-2">
                                                <input type="text" readonly value="${plan.v2rayLink}" style="border-radius: 50px;" class="w-full bg-slate-800/50 border border-slate-700 px-3 py-2 text-sm text-slate-300">
                                                <button id="copy-config-btn" class="ai-button secondary !text-sm !font-semibold flex-shrink-0 px-4 py-2 rounded-md">Copy</button>
                                            </div>
                                        </div>
                                        <div class="w-full text-center border-t border-white/10 pt-6">
                                            <div id="renew-button-container"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="tab-usage" class="tab-panel"></div>
                        <div id="tab-orders" class="tab-panel"></div>
                        
                        <div id="tab-settings" class="tab-panel">
                            <div class="card-glass p-6 sm:p-8 custom-radius">
                                <div class="max-w-md mx-auto">
                                    <h3 class="text-xl font-bold text-white mb-6 font-['Orbitron'] text-center">Account Settings</h3>
                                    <form id="profile-update-form" class="space-y-6">
                                        <div class="form-group"><input type="text" class="form-input" readonly value="${user.username}"><label class="form-label">Website Username</label></div>
                                        <div class="form-group relative">
                                            <input type="password" id="new-password" class="form-input pr-10" placeholder=" ">
                                            <label for="new-password" class="form-label">New Password</label>
                                            <span class="focus-border"><i></i></span>
                                            <i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i>
                                        </div>
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
                                const tabId = e.target.dataset.tab;
                                document.getElementById(`tab-${tabId}`).classList.add('active');
                                
                                if (!currentActivePlan) return;

                                if(tabId === 'config') updateRenewButton(currentActivePlan, data.activePlans);
                                if(tabId === 'usage') {
                                    if (usageDataCache[currentActivePlan.v2rayUsername]) {
                                        renderUsageHTML(usageDataCache[currentActivePlan.v2rayUsername], currentActivePlan.v2rayUsername);
                                        loadUsageStats(currentActivePlan.v2rayUsername, true); 
                                    } else {
                                        loadUsageStats(currentActivePlan.v2rayUsername, false); 
                                    }
                                }
                                if(tabId === 'orders') {
                                    if (ordersCache) { renderOrdersHTML(ordersCache); loadMyOrders(true); } else { loadMyOrders(false); }
                                }
                            }
                        });
                        
                        setupEventListeners();
                    }

                    if (document.getElementById('tab-usage')?.classList.contains('active')) {
                         if (usageDataCache[plan.v2rayUsername]) {
                            renderUsageHTML(usageDataCache[plan.v2rayUsername], plan.v2rayUsername);
                            loadUsageStats(plan.v2rayUsername, true); 
                        } else {
                            loadUsageStats(plan.v2rayUsername, false);
                        }
                    }
                    
                    const qrContainer = document.getElementById("qrcode-container");
                    if(qrContainer) {
                        qrContainer.innerHTML = "";
                        try {
                            new QRCode(qrContainer, { text: plan.v2rayLink, width: 140, height: 140, correctLevel: QRCode.CorrectLevel.L });
                            qrContainer.onclick = () => { const img = qrContainer.querySelector('img'); if(img) qrModalLogic.show(img.src, plan.v2rayUsername); };
                        } catch(e) {}
                    }
                    const linkInput = document.querySelector('input[readonly]');
                    if(linkInput) linkInput.value = plan.v2rayLink;
                    const copyBtn = document.getElementById('copy-config-btn');
                    if(copyBtn) {
                        const newBtn = copyBtn.cloneNode(true);
                        copyBtn.parentNode.replaceChild(newBtn, copyBtn);
                        newBtn.addEventListener('click', () => { navigator.clipboard.writeText(plan.v2rayLink); showToast({ title: 'Success', message: 'Link Copied Successfully!', type: 'success' }); });
                    }
                    updateRenewButton(plan, data.activePlans);
                };

                window.renderPlanDetailsInternal(currentIndex);

                if (!initialTabCheckDone) {
                            const tabParam = params.get('tab');
                            if (tabParam) {
                                const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabParam}"]`);
                                if (targetBtn) {
                                    targetBtn.click();
                                }
                            }
                            initialTabCheckDone = true;
                        }

            } else if (data.status === "pending") {
                statusContainer.innerHTML = `<div style="border-radius: 50px;" class="card-glass p-8 text-center"><i class="fa-solid fa-clock text-4xl text-amber-400 mb-4 animate-pulse"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Order Pending Approval</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">Your order is currently being reviewed. Your profile will update here once approved.</p></div>`;
            } else {
                const settingsHtml = `<div class="card-glass p-6 custom-radius"><h3 class="text-xl font-bold text-white mb-4 font-['Orbitron']">Account Settings</h3><form id="profile-update-form" class="space-y-6"><div class="form-group"><input type="text" class="form-input" readonly value="${user.username}"><label class="form-label">Website Username</label></div><div class="form-group relative"><input type="password" id="new-password" class="form-input pr-10" placeholder=" "><label for="new-password" class="form-label">New Password</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i></div><button type="submit" class="ai-button w-full rounded-lg !mt-8">Save Changes</button></form></div>`;
                const linkAccountHtml = `<div class="card-glass p-6 custom-radius"><h3 class="text-xl font-bold text-white mb-2 font-['Orbitron']">Link Existing V2Ray Account</h3><p class="text-sm text-gray-400 mb-6">If you have an old account, link it here to manage renewals.</p><form id="link-account-form-profile" class="space-y-6"><div class="form-group"><input type="text" id="existing-v2ray-username-profile" class="form-input" required placeholder=" "><label for="existing-v2ray-username-profile" class="form-label">Your Old V2Ray Username</label><span class="focus-border"><i></i></span></div><button type="submit" class="ai-button secondary w-full rounded-lg">Link Account</button><div class="text-center text-sm mt-4"><span class="open-help-modal-link text-blue-400 cursor-pointer hover:underline">How to find your username?</span></div></form></div>`;
                statusContainer.innerHTML = `<div class="card-glass p-8 custom-radius text-center"><i class="fa-solid fa-rocket text-4xl text-blue-400 mb-4"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Get Started</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">You do not have any active plans yet. Purchase a new plan or link an existing account below.</p><a href="/plans" class="nav-link-internal ai-button inline-block rounded-lg mt-6">Purchase a Plan</a></div><div class="grid md:grid-cols-2 gap-8 mt-8">${settingsHtml}${linkAccountHtml}</div>`;
                setupEventListeners();
            }
        }

        if (data.status === "approved" && data.activePlans?.length > 0) {
            if (currentActivePlan) {
                if (document.getElementById('tab-usage')?.classList.contains('active')) {
                    loadUsageStats(currentActivePlan.v2rayUsername, true); 
                }
                if (document.getElementById('tab-orders')?.classList.contains('active')) {
                    loadMyOrders(true);
                }
                if (document.getElementById('tab-config')?.classList.contains('active')) {
                    updateRenewButton(currentActivePlan, data.activePlans);
                }
            }
        }
    }

    const loadProfileData = async () => {
        try {
            let cachedPlansStr = null;
            try { cachedPlansStr = localStorage.getItem(PLANS_CACHE_KEY); } catch(e){}
            
            if (cachedPlansStr && !currentActivePlan) {
                try {
                    const cachedPlans = JSON.parse(cachedPlansStr);
                    if (Array.isArray(cachedPlans) && cachedPlans.length > 0) {
                        handleDataUpdate({ status: 'approved', activePlans: cachedPlans }, false);
                    }
                } catch(e) { 
                    localStorage.removeItem(PLANS_CACHE_KEY);
                }
            }

            const res = await apiFetch("/api/user/status");
            if (!res.ok) {
                console.warn("Skipping update due to server error:", res.status);
                return; 
            }

            const data = await res.json();
            
            if(data.success && data.activePlans) {
                try { localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify(data.activePlans)); } catch(e){}
                handleDataUpdate(data, true);
            }
            if (data.success || data.activePlans) {
                try { 
                    if(data.activePlans) {
                        localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify(data.activePlans)); 
                    }
                } catch(e){}
                
                handleDataUpdate(data, true);
            } else {
                handleDataUpdate({ activePlans: [] }, true);
            }

        } catch (e) { 
            console.error("Profile load error (Keeping previous state):", e); 
        }
    };
    loadProfileData();

    profilePollingInterval = setInterval(() => {
        if (!document.hidden) {
            loadProfileData();
        }
    }, 10000);
}