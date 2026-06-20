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

// --- HELPER: Strip Prefix for Display ---
const getDisplayName = (username) => {
    if (!username) return "";
    return username.replace(/^[A-Za-z0-9]+_/, '');
};

// --- SMART DATA FETCHER ---
const fetchClientData = async (username) => {
    const timestamp = new Date().getTime();
    try {
        const res = await apiFetch(`/api/check-usage/${username}?_=${timestamp}&r=${Math.random()}`, {
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' }
        });
        if (res.status === 404) {
            return { success: false, isRemoved: true }; 
        }
        const result = await res.json();
        if (result.success) {
            usageDataCache[username] = result.data;
            try { localStorage.setItem('nexguard_usage_cache', JSON.stringify(usageDataCache)); } catch(e){}
        }
        return result;
    } catch (err) {
        console.error(`Fetch error for ${username}:`, err);
        return { success: false, isError: true };
    }
};

// --- HELPER: Ensure Orders Loaded ---
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

// --- DYNAMIC LINKS FETCHER ---
const updateDynamicLinks = async () => {
    try {
        // home.js එකේ තියෙන නිවැරදි API endpoint එක
        const res = await apiFetch('/api/user/software-links'); 
        if (res.ok) {
            const data = await res.json();
            
            // Array එකෙන් අරන් අදාළ බොත්තම් වලට ලින්ක් එක සෙට් කරනවා
            if (data.success && data.links && data.links.length > 0) {
                data.links.forEach(link => {
                    const linkName = (link.name || '').toLowerCase();
                    
                    if (linkName.includes('pc') || linkName.includes('windows')) {
                        const pcBtn = document.getElementById('dl-link-pc');
                        if (pcBtn && link.url) pcBtn.href = link.url;
                    } 
                    else if (linkName.includes('ios') || linkName.includes('apple') || linkName.includes('iphone')) {
                        const iosBtn = document.getElementById('dl-link-ios');
                        if (iosBtn && link.url) iosBtn.href = link.url;
                    } 
                    else if (linkName.includes('android') || linkName.includes('play')) {
                        const androidBtn = document.getElementById('dl-link-android');
                        if (androidBtn && link.url) androidBtn.href = link.url;
                    }
                });
            }
        }
    } catch (e) {
        console.warn("Dynamic links could not be loaded. Using defaults.", e);
    }
};

// --- REUSABLE PANELS HTML ---
const accountSettingsFormHtml = (username) => `
    <div class="card-glass p-6 sm:p-8 custom-radius">
        <div class="max-w-md mx-auto">
            <h3 class="text-xl font-bold text-white mb-6 font-['Orbitron'] text-center">Account Settings</h3>
            <form id="profile-update-form" class="space-y-6">
                <div class="form-group"><input type="text" class="form-input" readonly value="${username}"><label class="form-label">Website Username</label></div>
                <div class="form-group relative">
                    <input type="password" id="new-password" class="form-input pr-10" placeholder=" ">
                    <label for="new-password" class="form-label">New Password</label>
                    <span class="focus-border"><i></i></span>
                    <i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i>
                </div>
                <button type="submit" class="ai-button w-full rounded-lg !mt-8">Save Changes</button>
            </form>
        </div>
    </div>`;

// --- UPDATED APPS PANEL (Fixed Button Text Clipping) ---
const appsPanelContent = `
    <div class="pt-1">
        <div class="card-glass p-8 sm:p-14 custom-radius max-w-7xl mx-auto relative overflow-hidden">
            
            <div class="text-center mb-16 relative z-10"> 
                <h2 class="text-3xl font-bold text-white mb-3 font-['Orbitron']">Downloadable Software</h2>
                <p class="text-sm text-gray-400">Download the recommended V2Ray client for your device to get started.</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 justify-center gap-6 lg:gap-8 relative z-10 mt-8">
                
                <a id="dl-link-pc" href="#" target="_blank" 
                   class="card p-8 custom-radius bg-white/5 border border-white/10 hover:bg-white/10 transition flex flex-col items-center text-center group cursor-pointer h-full relative overflow-hidden">
                    
                    <i class="fa-brands fa-windows text-[45px] text-blue-400 mb-4 group-hover:scale-110 transition-transform"></i>
                    <h3 class="font-bold text-white text-xl">PC Client</h3>
                    <p class="text-sm text-gray-400 mt-1">Netmod Syna</p>
                    
                    <div class="w-full border-t border-white/10 my-6"></div>
                    
                    <div class="w-full text-left text-xs text-gray-300 space-y-4 mb-4 mt-4 flex-grow">
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>Optimized for Windows 10/11</span></p>
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>Auto System Proxy support</span></p>
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>High speed VLESS routing</span></p>
                    </div>
                    
                    <span class="mt-auto ai-button rounded-full flex items-center justify-center mx-auto transition-all" style="width: 80%; min-height: 42px; font-size: 14px; font-weight: bold; border: none; padding: 0 15px;">Download</span>
                </a>

                <a id="dl-link-ios" href="#" target="_blank" 
                   class="card p-8 custom-radius bg-white/5 border border-white/10 hover:bg-white/10 transition flex flex-col items-center text-center group cursor-pointer h-full relative overflow-hidden">
                    
                    <i class="fa-brands fa-apple text-[45px] text-gray-200 mb-4 group-hover:scale-110 transition-transform"></i>
                    <h3 class="font-bold text-white text-xl">iOS Client</h3>
                    <p class="text-sm text-gray-400 mt-1">Npv Tunnel</p>
                    
                    <div class="w-full border-t border-white/10 my-6"></div>
                    
                    <div class="w-full text-left text-xs text-gray-300 space-y-4 mb-4 mt-4 flex-grow">
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>Native Apple ecosystem feel</span></p>
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>Highly battery optimized</span></p>
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>One-click QR configuration</span></p>
                    </div>
                    
                    <span class="mt-auto ai-button rounded-full flex items-center justify-center mx-auto transition-all" style="width: 80%; min-height: 42px; font-size: 14px; font-weight: bold; border: none; padding: 0 15px;">Download</span>
                </a>

                <a id="dl-link-android" href="#" target="_blank" 
                   class="card p-8 custom-radius bg-white/5 border border-white/10 hover:bg-white/10 transition flex flex-col items-center text-center group cursor-pointer h-full relative overflow-hidden">
                    
                    <i class="fa-brands fa-android text-[45px] text-green-400 mb-4 group-hover:scale-110 transition-transform"></i>
                    <h3 class="font-bold text-white text-xl">Android Client</h3>
                    <p class="text-sm text-gray-400 mt-1">Netmod Syna</p>
                    
                    <div class="w-full border-t border-white/10 my-6"></div>
                    
                    <div class="w-full text-left text-xs text-gray-300 space-y-4 mb-4 mt-4 flex-grow">
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>Optimized for low-latency</span></p>
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>Always-on background mode</span></p>
                        <p class="flex items-start gap-3"><i class="fa-solid fa-check text-white mt-0.5"></i> <span>QR code scanning config</span></p>
                    </div>
                    
                    <span class="mt-auto ai-button rounded-full flex items-center justify-center mx-auto transition-all" style="width: 80%; min-height: 42px; font-size: 14px; font-weight: bold; border: none; padding: 0 15px;">Download</span>
                </a>
            </div>
        </div>
    </div>`;

// --- UPDATED TUTORIALS PANEL ---
const tutorialsPanelContent = `
    <div id="dynamic-tutorials-container" class="pt-1">
        </div>`;

// --- DYNAMIC TUTORIALS LOADER ---
const loadDynamicTutorials = async () => {
    const container = document.getElementById('tab-tutorials');
    if (!container) return;

    container.innerHTML = `
        <div class="pt-1">
            <div class="card-glass p-8 sm:p-14 custom-radius max-w-7xl mx-auto relative overflow-hidden text-center">
                <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-400 mb-4"></i>
                <p class="text-gray-400">Loading tutorials...</p>
            </div>
        </div>`;

    try {
        const res = await apiFetch('/api/user/tutorials'); 
        const responseData = await res.json();
        const tutorials = responseData.data || responseData.tutorials || responseData || [];

        if (tutorials.length === 0) {
            container.innerHTML = `
                <div class="pt-1">
                    <div class="card-glass p-10 sm:p-16 custom-radius max-w-7xl mx-auto relative overflow-hidden flex flex-col items-center justify-center min-h-[350px]">
                        <i class="fa-solid fa-hourglass-half text-5xl text-blue-400 mb-6 animate-pulse"></i>
                        <h2 class="text-3xl font-bold text-white mb-3 font-['Orbitron']">Coming Soon!</h2>
                        <p class="text-gray-400 max-w-md text-center text-sm">We are currently preparing the video tutorials.</p>
                    </div>
                </div>`;
            return;
        }

        const tutCards = tutorials.map(tut => `
            <div class="card p-5 custom-radius bg-white/5 border border-white/10 hover:bg-white/10 transition flex flex-col group h-full">
                
                <a href="https://www.youtube.com/watch?v=${tut.video_id}" target="_blank" 
                   class="w-full aspect-[16/6] rounded-xl overflow-hidden bg-black/80 mb-5 relative shadow-lg block group/video">
                    
                    <img src="https://img.youtube.com/vi/${tut.video_id}/hqdefault.jpg" 
                         class="w-full h-full object-cover opacity-70 group-hover/video:opacity-100 transition duration-300" 
                         alt="Thumbnail">
                    
                    <div class="absolute inset-0 flex items-center justify-center">
                        <div class="w-12 h-12 bg-red-600/90 text-white rounded-full flex items-center justify-center shadow-lg group-hover/video:scale-110 transition-all duration-300">
                            <i class="fa-solid fa-play text-lg ml-1"></i>
                        </div>
                    </div>
                </a>
                
                <div class="flex items-center gap-3 mb-2">
                    <i class="${tut.icon || 'fa-brands fa-youtube text-red-500'} text-xl"></i>
                    <h3 class="font-bold text-white text-md">${tut.title}</h3>
                </div>
                <p class="text-xs text-gray-400 mt-1 flex-grow line-clamp-2">${tut.description || ''}</p>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="pt-1">
                <div class="card-glass p-8 sm:p-14 custom-radius max-w-7xl mx-auto relative overflow-hidden">
                    <div class="text-center mb-12 relative z-10"> 
                        <h2 class="text-3xl font-bold text-white mb-3 font-['Orbitron']">Video Tutorials</h2>
                        <p class="text-sm text-gray-400">Step-by-step guides on how to setup and connect your devices.</p>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto relative z-10">
                        ${tutCards}
                    </div>
                </div>
            </div>`;

    } catch (err) {
        container.innerHTML = `
            <div class="pt-1">
                <div class="card-glass p-10 text-center text-red-400 max-w-7xl mx-auto custom-radius">
                    Failed to load tutorials. Please try again later.
                </div>
            </div>`;
    }
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
    if (!user) { navigateTo("/login"); return; }

    const PLANS_CACHE_KEY = `nexguard_plans_cache_${user.username}`;
    const LAST_PLAN_KEY = `nexguard_last_plan_${user.username}`;

    // --- HTML Templates ---
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
    
    const pageStyles = `<style>
        #page-profile .form-input { height: 56px; padding: 20px 12px 8px 12px; background-color: rgba(0, 0, 0, 0.4); border-color: rgba(255, 255, 255, 0.2); } 
        #page-profile .form-label { position: absolute; top: 50%; left: 13px; transform: translateY(-50%); color: #9ca3af; pointer-events: none; transition: all 0.2s ease-out; font-size: 14px; } 
        #page-profile .form-input:focus ~ .form-label, #page-profile .form-input:not(:placeholder-shown) ~ .form-label { top: 10px; transform: translateY(0); font-size: 11px; color: var(--brand-blue); } 
        #page-profile .form-input[readonly] { background-color: rgba(0,0,0,0.2); cursor: not-allowed; } 
        .tab-btn { border-bottom: 3px solid transparent; transition: all .3s ease; color: #9ca3af; padding: 0.75rem 1rem; font-weight: 600; white-space: nowrap; font-size: 15px; cursor: pointer; } 
        .tab-btn:hover { color: #d1d5db; }
        .tab-btn.active { border-bottom-color: #3b82f6; color: #ffffff; } 
        .tab-panel { display: none; } 
        .tab-panel.active { display: block; animation: pageFadeIn 0.4s ease-out forwards; }
        @keyframes pageFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .help-modal-overlay { opacity: 0; visibility: hidden; transition: opacity 0.3s ease-out, visibility 0.3s ease-out; background: rgba(0, 0, 0, 0.2); z-index: 9999; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .help-modal-overlay.visible { opacity: 1; visibility: visible; }
        .help-modal-content { opacity: 0; transform: scale(0.90); transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .help-modal-overlay.visible .help-modal-content { opacity: 1; transform: scale(1); }
        .grease-glass { background: rgba(30, 40, 60, 0.4); backdrop-filter: blur(20px) saturate(200%); -webkit-backdrop-filter: blur(20px) saturate(200%); border-radius: 35px; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5); }
        .plan-selector-container { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem; position: relative; z-index: 100; overflow: visible !important; }
        .plan-selector-label { font-size: 0.875rem; font-weight: 600; color: #d1d5db; flex-shrink: 0; }
        ul.fmenu { display: inline-block; list-style: none; padding: 0; margin: 0; white-space: nowrap; position: relative; overflow: visible !important; }
        ul.fmenu > li.fmenu-item { position: relative; overflow: visible !important; }
        ul.fmenu .trigger-menu { display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; height: 40px; padding: 0 1rem; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer; transition: all ease 0.3s; min-width: 170px; overflow: visible !important; }
        ul.fmenu .trigger-menu:hover, ul.fmenu .trigger-menu.open { border-color: var(--brand-blue); box-shadow: 0 0 15px rgba(59, 130, 246, 0.3); }
        ul.fmenu .trigger-menu i { color: #9ca3af; font-size: 0.85rem; transition: color ease 0.3s; }
        ul.fmenu .trigger-menu:hover i, ul.fmenu .trigger-menu.open i { color: #60a5fa; }
        ul.fmenu .trigger-menu .text { display: block; font-size: 0.9rem; color: #ffffff; padding: 0 0.5rem; font-weight: 500; }
        ul.fmenu .trigger-menu .arrow { font-size: 0.75rem; transition: transform ease 0.3s; }
        ul.fmenu .trigger-menu.open .arrow { transform: rotate(180deg); }
        ul.fmenu .floating-menu { display: block; position: absolute; top: 100%; margin-top: 8px; left: 0; width: 100%; min-width: 100%; list-style: none; padding: 0.3rem; background-color: #0f172aab; border: 1px solid rgba(71, 85, 105, 0.6); border-radius: 25px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); z-index: 9999 !important; opacity: 0; visibility: hidden; transform: translateY(-10px); transition: opacity 0.3s, transform 0.3s; }
        ul.fmenu .trigger-menu.open + .floating-menu { opacity: 1 !important; visibility: visible !important; transform: translateY(0) !important; max-height: none !important; overflow: visible !important; }
        
        .plan-row { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; border-radius: 50px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
        .plan-row:hover { background-color: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.3); }
        .plan-name { color: #cbd5e1; font-size: 0.85rem; flex-grow: 1; margin-right: 0.5rem; }
        .plan-row:hover .plan-name { color: #fff; }
        .remove-plan-btn { padding: 3px 7px; font-size: 0.75rem; color: #64748b; border-radius: 50px; transition: all 0.2s; z-index: 10; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); }
        .remove-plan-btn:hover { background-color: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.3); }
        .add-more-row { display: flex; align-items: center; padding: 0.5rem 0.8rem; color: #93c5fd; font-size: 0.85rem; cursor: pointer; transition: color 0.2s; }
        .add-more-row:hover { color: #bfdbfe; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    </style>`;
    
    let profilePictureUrl = (user.profilePicture || "/assets/profilePhoto.jpg").replace("public/", "");
    if (profilePictureUrl && !profilePictureUrl.startsWith('/')) profilePictureUrl = '/' + profilePictureUrl;
    
    const baseHtml = `
    <div id="page-profile" class="page space-y-8">
        <div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left reveal">
            <div class="relative flex-shrink-0">
                <img id="profile-pic-img" src="${profilePictureUrl}" alt="Profile Picture" class="w-24 h-24 rounded-full border-4 border-blue-500/50 object-cover shadow-lg">
                <label for="avatar-upload" class="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500 transition shadow-md">
                    <i class="fa-solid fa-camera text-white"></i>
                    <input type="file" id="avatar-upload" class="hidden" accept="image/*">
                </label>
            </div>
            <div class="flex-grow">
                <div class="flex items-center justify-center sm:justify-start gap-3">
                    <h2 class="text-3xl font-bold font-['Orbitron'] text-white">${user.username}</h2>
                    <button id="manual-data-refresh" class="text-lg text-blue-400 hover:text-white transition-all duration-300 hover:rotate-180" title="Refresh Profile">
                        <i class="fa-solid fa-arrows-rotate"></i>
                    </button>
                </div>
                <p class="text-gray-400">${user.email}</p>
                <div id="plan-info-container" class="text-xs sm:text-sm mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2"></div>
            </div>
        </div>
        
        <div id="user-status-content" class="reveal mt-8">
            <div class="flex flex-col items-center justify-center min-h-[40vh]">
                <div class="text-center p-8">
                    <i class="fa-solid fa-spinner fa-spin text-3xl text-blue-400"></i>
                    <p class="mt-4 text-lg font-semibold text-blue-300 animate-pulse">Loading Your Data...</p>
                </div>
            </div>
        </div>
    </div> 
    ${modalHtml} 
    ${linkAccountModalHtml}`;
    
    renderFunc(pageStyles + baseHtml);
    const statusContainer = document.getElementById("user-status-content");
    qrModalLogic.init();

    const bindUnifiedTabs = (activePlansData) => {
        const tabsContainer = document.getElementById('profile-tabs');
        if(!tabsContainer || tabsContainer.dataset.bound === "true") return;
        tabsContainer.dataset.bound = "true";

        tabsContainer.addEventListener('click', (e) => { 
            const targetBtn = e.target.closest('.tab-btn');
            if (targetBtn) {
                document.querySelectorAll('#profile-tabs .tab-btn').forEach(b => b.classList.remove('active')); 
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                
                targetBtn.classList.add('active'); 
                const tabId = targetBtn.dataset.tab; 
                const panel = document.getElementById(`tab-${tabId}`);
                if(panel) panel.classList.add('active');
                
                // --- හැම ටැබ් එකකටම ලින්ක් එක හැදෙන තැන ---
                let urlPath = '/profile';
                if (tabId !== 'config') {
                    urlPath = `/profile/${tabId}`;
                }
                window.history.pushState({ tabId }, '', urlPath);

                if (tabId === 'tutorials') {
                    const tutContainer = document.getElementById('tab-tutorials');
                    if (tutContainer && !tutContainer.innerHTML.includes('iframe')) {
                        if (typeof loadDynamicTutorials === 'function') {
                            loadDynamicTutorials();
                        }
                    }
                }

                if (currentActivePlan && activePlansData) {
                    if(tabId === 'config') updateRenewButton(currentActivePlan, activePlansData);
                    if(tabId === 'usage') { 
                        if (usageDataCache[currentActivePlan.v2rayUsername]) { 
                            renderUsageHTML(usageDataCache[currentActivePlan.v2rayUsername], currentActivePlan.v2rayUsername); 
                            loadUsageStats(currentActivePlan.v2rayUsername, true); 
                        } else { 
                            loadUsageStats(currentActivePlan.v2rayUsername, false); 
                        } 
                    }
                    if(tabId === 'orders') { 
                        if (ordersCache) { renderOrdersHTML(ordersCache); loadMyOrders(true); } 
                        else { loadMyOrders(false); } 
                    }
                }
            }
        });
    };

    const handleDeepLink = () => {
        if (initialTabCheckDone) return;
        const currentPath = window.location.pathname;
        let targetTab = null;
        
        // --- ලින්ක් එකෙන් එද්දී අදාළ ටැබ් එක අඳුරගන්න තැන ---
        const pathParts = currentPath.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        
        const validTabs = ['config', 'usage', 'orders', 'settings', 'apps', 'tutorials'];
        
        if (validTabs.includes(lastPart)) {
            targetTab = lastPart;
        } else { 
            const tabParam = params?.get ? params.get('tab') : null; 
            if (tabParam) targetTab = tabParam; 
        }
        
        if (targetTab) {
            setTimeout(() => {
                const targetBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
                if (targetBtn) targetBtn.click();
            }, 50);
        }
        initialTabCheckDone = true;
    };

    const unlinkPlanLocal = async (v2rayUsername) => {
        if(!confirm(`Are you sure you want to remove this plan from your dashboard? This cannot be undone.`)) return;
        
        showToast({ title: "Removing...", message: "Processing removal.", type: "info" });
        try {
            const res = await apiFetch("/api/user/unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v2rayUsername }) });
            
            if (res.ok || res.status === 404) {
                showToast({ title: "Success", message: "Plan removed successfully.", type: "success" });
                loadProfileData();
            } else {
                const result = await res.json();
                showToast({ title: "Error", message: result.message || "Failed to remove plan.", type: "error" });
            }
        } catch (e) {
            showToast({ title: "Connection Error", message: "Could not reach server.", type: "error" });
        }
    };

    window.unlinkPlan = unlinkPlanLocal;

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

    const setupEventListeners = () => {
        if (window.profileEventsBound) return;
        window.profileEventsBound = true;

        const helpModal = document.getElementById('help-modal');
        if (helpModal) {
            const openModal = () => { helpModal.classList.add('visible'); document.body.classList.add('modal-open'); };
            const closeModal = () => { helpModal.classList.remove('visible'); document.body.classList.remove('modal-open'); };
            document.addEventListener('click', (e) => {
                if(e.target.closest('.open-help-modal-link')) { e.preventDefault(); openModal(); }
                if(e.target.id === 'help-modal-close' || e.target === helpModal) closeModal();
            });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && helpModal.classList.contains('visible')) closeModal(); });
            document.addEventListener('click', (e) => {
                if(e.target.id === 'lang-toggle-btn') {
                    document.querySelector('.lang-content.lang-en')?.classList.toggle('hidden');
                    document.querySelector('.lang-content.lang-si')?.classList.toggle('hidden');
                }
            });
        }

        const linkModal = document.getElementById('link-account-modal');
        if (linkModal) {
            const closeLinkModal = () => { linkModal.classList.remove('visible'); document.body.classList.remove('modal-open'); };
            document.addEventListener('click', (e) => {
                if(e.target.id === 'link-modal-close' || e.target === linkModal) closeLinkModal();
            });
        }

        const handleLinkAccountSubmit = async (e, inputId, isModal) => {
            e.preventDefault();
            const input = document.getElementById(inputId);
            if(!input) return;
            const v2rayUsername = input.value;
            if (!v2rayUsername) return showToast({ title: "Error", message: "Please enter your V2Ray username.", type: "error" });
            
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Linking...", message: "Please wait...", type: "info", duration: 2000 });
            
            try {
                const res = await apiFetch("/api/user/link-v2ray", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v2rayUsername }) });
                const result = await res.json();
                
                if (res.ok) {
                    showToast({ title: "Success", message: result.message || "Your V2Ray account has been linked!", type: "success" });
                    if (isModal && linkModal) {
                        linkModal.classList.remove('visible'); 
                        document.body.classList.remove('modal-open');
                    }
                    input.value = ""; 
                    loadProfileData(); 
                } else {
                    showToast({ title: "Linking Failed", message: result.message, type: "error" });
                }
            } catch (err) {
                showToast({ title: "Error", message: "Something went wrong.", type: "error" });
            } finally {
                btn.disabled = false;
            }
        };

        document.addEventListener('submit', async (e) => {
            if (e.target && e.target.id === 'link-account-modal-form') {
                handleLinkAccountSubmit(e, "modal-v2ray-username", true);
            }
            if (e.target && e.target.id === 'link-account-form-profile') {
                handleLinkAccountSubmit(e, "existing-v2ray-username-profile", false);
            }
            if (e.target && e.target.id === 'profile-update-form') {
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
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('#manual-data-refresh')) {
                const icon = e.target.closest('#manual-data-refresh').querySelector('i');
                icon.classList.add('fa-spin');
                showToast({ title: "Refreshing...", message: "Updating profile data.", type: "info", duration: 1000 });
                loadProfileData().finally(() => setTimeout(() => icon.classList.remove('fa-spin'), 600));
            }
            if (e.target.id === 'profile-password-toggle') {
                togglePassword('new-password', 'profile-password-toggle');
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

        const displayUsername = d.username || getDisplayName(username);
        const total = d.down + d.up;
        const percent = d.total > 0 ? Math.min((total / d.total) * 100, 100) : 0;
        
        const formatBytes = (b = 0, d = 2) => {
            const k = 1024;
            const s = ['B', 'KB', 'MB', 'GB', 'TB'];
            if (b === 0) return '0 B';
            const i = Math.floor(Math.log(b) / Math.log(k));
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
                const expiryDate = new Date(expiryTimestamp);
                expiryDisplay = expiryDate.toLocaleDateString('en-CA');
            }
        }

        usageContainer.innerHTML = `
            <div class="result-card p-4 sm:p-6 card-glass custom-radius space-y-5 reveal is-visible">
                <div class="flex justify-between items-center pb-3 border-b border-white/10">
                    <h3 class="text-lg font-semibold text-white flex items-center min-w-0">
                        <i class="fa-solid fa-satellite-dish mr-3 text-blue-400 flex-shrink-0"></i>
                        <span class="truncate" title="${username}">Client: ${displayUsername}</span>
                    </h3>
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
        const displayUsername = getDisplayName(username);

        const rejectedHtml = `
            <div class="result-card p-6 card-glass custom-radius space-y-4 reveal is-visible border border-red-500/50 bg-red-900/10">
                <div class="text-center">
                    <i class="fa-solid fa-ban text-4xl text-red-500 mb-3"></i>
                    <h3 class="text-xl font-bold text-white">Your Plan Rejected By Admin</h3>
                    <p class="text-sm text-gray-300 mt-2">Unfortunately, your plan <span class="font-semibold text-red-300">${displayUsername}</span> has been rejected.</p>
                    <p class="text-xs text-gray-400 mt-1">Please check your orders tab or contact support for more details.</p>
                </div>
                <div class="pt-2 text-center">
                    <button id="remove-rejected-btn-cfg" class="ai-button secondary w-auto inline-flex items-center justify-center px-6 py-2 text-sm rounded-lg text-red-400 hover:text-red-300 border-red-500/30 hover:bg-red-900/30">
                        <i class="fa-solid fa-trash-can mr-2"></i>Remove
                    </button>
                </div>
            </div>`;

        if (usageContainer) {
            usageContainer.innerHTML = rejectedHtml;
            document.getElementById('remove-rejected-btn-cfg')?.addEventListener('click', () => unlinkPlanLocal(username));
        }
        if (configContainer) {
            configContainer.innerHTML = rejectedHtml; 
            document.getElementById('remove-rejected-btn-cfg')?.addEventListener('click', () => unlinkPlanLocal(username));
        }
    };

    const renderPlanRemovedHTML = (username) => {
        const usageContainer = document.getElementById("tab-usage");
        if (!usageContainer) return;
        const displayUsername = getDisplayName(username);

        const otherPlansAvailable = globalActivePlans.length > 1;
        const renewalActionHtml = `<button id="renew-removed-plan-btn" class="ai-button w-full rounded-lg mt-2 inline-block"><i class="fa-solid fa-arrows-rotate mr-2"></i>Renew This Plan</button>`;
        const switchHtml = otherPlansAvailable ? `<button id="switch-plan-btn" class="ai-button secondary w-full rounded-lg mt-2"><i class="fa-solid fa-repeat mr-2"></i>Switch Plan</button>` : '';
        const removeHtml = `<div class="text-center mt-3"><button id="remove-expired-btn" class="ai-button secondary w-auto inline-flex items-center justify-center px-6 py-2 text-sm rounded-lg text-red-400 border-red-500/30 hover:bg-red-900/30"><i class="fa-solid fa-trash-can mr-2"></i>Remove</button></div>`;

        usageContainer.innerHTML = `
            <div class="result-card p-6 card-glass custom-radius space-y-4 reveal is-visible border border-amber-500/30">
                <div class="text-center">
                    <i class="fa-solid fa-triangle-exclamation text-4xl text-amber-400 mb-3"></i>
                    <h3 class="text-xl font-bold text-white">Plan Expired / Inactive</h3>
                    <p class="text-sm text-gray-300 mt-1">We couldn't find active data for <span class="font-semibold text-amber-300">${displayUsername}</span>. It may have expired.</p>
                </div>
                <div class="pt-2 flex flex-col gap-2">
                    ${renewalActionHtml}
                    ${switchHtml}
                    ${removeHtml}
                </div>
            </div>`;

        document.getElementById('renew-removed-plan-btn')?.addEventListener('click', () => {
             const plan = globalActivePlans.find(p => p.v2rayUsername === username);
             if (plan) handleRenewalChoice(globalActivePlans, plan);
             else showToast({ title: "Error", message: "Could not identify plan details.", type: "error" });
        });

        document.getElementById('remove-expired-btn')?.addEventListener('click', () => unlinkPlanLocal(username));

        if (otherPlansAvailable) {
            document.getElementById('switch-plan-btn')?.addEventListener('click', () => {
                const currentIndex = globalActivePlans.findIndex(p => p.v2rayUsername === username);
                const nextIndex = (currentIndex + 1) % globalActivePlans.length;
                document.querySelector('#plan-menu .trigger-menu .text').textContent = getDisplayName(globalActivePlans[nextIndex].v2rayUsername);
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
             isKnownRejected = ordersCache.some(o => 
                 (o.final_username === username || (currentActivePlan && o.plan_id === currentActivePlan.planId && o.status === 'rejected')) && 
                 o.status === 'rejected'
             );
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
                    if(ordersCache) {
                         isRejected = ordersCache.some(o => 
                             (o.final_username === username || (o.plan_id === currentActivePlan.planId && o.status === 'rejected')) && 
                             o.status === 'rejected'
                         );
                    }
                    if (isRejected) {
                        renderPlanRejectedHTML(username);
                    } else {
                        renderPlanRemovedHTML(username);
                    }
                } else if (!isSilent) {
                    usageContainer.innerHTML = `
                    <div class="border border-white/5 rounded-xl p-5 text-center bg-[#0a0f18] mt-4 shadow-inner max-w-2xl mx-auto">
                        <p class="text-amber-400 text-sm font-medium">Server error while fetching usage.</p>
                    </div>`;
                }
            }
        });
    };

// --- RENDER ORDERS HTML ---
const renderOrdersHTML = (orders) => {
    const container = document.getElementById("tab-orders");
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="pt-1">
                <div class="card-glass p-8 sm:p-14 custom-radius max-w-7xl mx-auto relative overflow-hidden text-center min-h-[350px] flex flex-col items-center justify-center">
                    <i class="fa-solid fa-box-open text-6xl text-gray-500 mb-6"></i>
                    <h2 class="text-3xl font-bold text-white mb-3 font-['Orbitron']">No Orders Yet</h2>
                    <p class="text-gray-400">You haven't placed any orders or renewals yet.</p>
                </div>
            </div>`;
        return;
    }

    const ordersHtml = orders.map((order, index) => {
        const displayStatus = order.status === 'queued_for_renewal' ? 'Queued' : order.status;
        
        // Status Badge එකට අදාළ Border එක සහ Hover Effect එක (Background Transparent කරලා)
        // Status Colors (Background & Hover effect)
        const statusStyles = { 
            pending: "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30", 
            approved: "bg-green-500/20 text-green-400 hover:bg-green-500/30", 
            rejected: "bg-red-500/20 text-red-400 hover:bg-red-500/30", 
            queued_for_renewal: "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30",
            unconfirmed: "bg-gray-500/20 text-gray-300 hover:bg-gray-500/30"
        };
        const statusIcons = { pending: "fa-clock", approved: "fa-check-circle", rejected: "fa-times-circle", queued_for_renewal: "fa-spinner fa-spin", unconfirmed: "fa-circle-info" };
        
        const currentStatusStyle = statusStyles[order.status] || statusStyles['unconfirmed'];

        return `
        <div class="p-5 sm:p-6 custom-radius bg-white/5 backdrop-blur-xl hover:bg-white/10 transition-all duration-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 relative overflow-hidden group">
            
            <div class="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

            <div class="relative z-10 flex-1 w-full text-left sm:pr-4">
                <h4 class="font-bold text-white text-lg tracking-wide flex flex-wrap items-center gap-2">
                    ${appData.plans[order.plan_id]?.name || order.plan_id} 
                    <span class="text-gray-500 font-medium text-sm">for</span> 
                    <span class="text-blue-400">${appData.connections.find(c => c.name === order.conn_id)?.name || order.conn_id}</span>
                </h4>
                <p class="text-sm text-gray-400 mt-2 flex items-center gap-2">
                    <i class="fa-regular fa-calendar text-gray-500"></i> 
                    Ordered on: <span class="text-gray-300">${new Date(order.created_at).toLocaleDateString()}</span>
                </p>
            </div>
            
            <div class="flex flex-col items-center gap-3 w-full sm:w-auto relative z-10 mt-4 sm:mt-0 sm:ml-auto">
                
                <div class="text-sm font-bold capitalize flex items-center justify-center gap-2 px-4 py-2.5 rounded-full ${currentStatusStyle} whitespace-nowrap w-full sm:w-[170px] transition-colors duration-300 cursor-default">
                    <i class="fa-solid ${statusIcons[order.status] || 'fa-info-circle'}"></i>
                    <span>${displayStatus}</span>
                </div>
                
                <button onclick="window.openInvoice(${index})" class="ai-button px-4 py-2.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap w-full sm:w-[170px] shadow-md">
                    <i class="fa-solid fa-file-invoice"></i> View Invoice
                </button>
                
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="pt-1">
            <div class="card-glass p-8 sm:p-14 custom-radius max-w-7xl mx-auto relative overflow-hidden">
                <div class="text-center mb-10 relative z-10"> 
                    <h2 class="text-3xl font-bold text-white mb-3 font-['Orbitron']">My Orders & Invoices</h2>
                    <p class="text-sm text-gray-400">View your recent purchases and download invoices.</p>
                </div>
                <div class="space-y-4 relative z-10">
                    ${ordersHtml}
                </div>
            </div>
        </div>`;
};

// --- GLOBAL INVOICE TAB FUNCTION ---
window.openInvoice = (index) => {
    if (!ordersCache || !ordersCache[index]) return;
    const order = ordersCache[index];
    const plan = appData.plans[order.plan_id] || { name: order.plan_id, price: 0 };
    const connection = appData.connections.find(c => c.name === order.conn_id) || { name: order.conn_id };
    const price = order.price || plan.price || '0.00';
    const date = new Date(order.created_at).toLocaleDateString();
    const time = new Date(order.created_at).toLocaleTimeString();
    const orderId = order.id || Math.floor(Math.random() * 100000); 
    const status = order.status;
    const formatUsername = (u) => u ? u.replace(/^[A-Za-z0-9]+_/, '') : 'Valued Customer';
    const username = formatUsername(order.final_username || order.website_username);
    
    const newWindow = window.open('', '_blank');
    if(!newWindow) { alert("Please allow popups to view the invoice."); return; }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice #${orderId} - NexGuard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
        <style>
            /* සම්පූර්ණ Background එකම සුදු පාට කළා, කොටු පේන්නේ නෑ */
            body { font-family: 'Inter', sans-serif; background-color: #ffffff; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
            .invoice-box { max-width: 800px; margin: 0 auto; background: #ffffff; padding: 20px; }
            
            /* PC View එකේදී මැදට වෙන්න ගානට Padding හැදුවා */
            @media (min-width: 640px) {
                .invoice-box { padding: 40px; margin-top: 20px; }
            }
            @media print {
                body { background-color: white; margin: 0; padding: 0; }
                .invoice-box { box-shadow: none; margin: 0; padding: 15px; width: 100%; max-width: 100%; }
                .no-print { display: none !important; }
            }
        </style>
    </head>
    <body>
        <div class="invoice-box">
            <!-- Header with Logo (Mobile එකේදී එක යට එක, PC එකේදී දෙපැත්තට එන්න හැදුවා) -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 border-blue-600 pb-6 mb-8 gap-4">
                <div>
                    <img src="/assets/logo.png" alt="NexGuard" class="h-14 sm:h-16 object-contain" onerror="this.src='https://app.nexguardlk.store/assets/logo.png'">
                </div>
                <div class="w-full sm:w-auto sm:text-right">
                    <h2 class="text-2xl sm:text-3xl font-bold text-gray-800">INVOICE</h2>
                    <!-- Order ID එක දිග වැඩි වුණොත් Mobile එකේදී කැඩිලා පේන්න break-all දැම්මා -->
                    <p class="text-gray-500 font-medium mt-1 text-xs sm:text-sm break-all">#${orderId}</p>
                </div>
            </div>

            <!-- Info Section -->
            <div class="flex flex-col sm:flex-row justify-between mb-10 gap-6">
                <div>
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Billed To</p>
                    <p class="text-lg font-bold text-gray-800">${username}</p>
                    <p class="text-sm text-gray-500 mt-1">Date: ${date} | Time: ${time}</p>
                </div>
                <div class="sm:text-right">
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment Status</p>
                    <span class="inline-block px-4 py-1.5 rounded-full text-sm font-bold capitalize 
                        ${status === 'approved' ? 'bg-green-100 text-green-700' : status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">
                        ${status.replace('_', ' ')}
                    </span>
                </div>
            </div>

            <!-- Table -->
            <div class="overflow-x-auto mb-8">
                <table class="w-full text-left min-w-[300px]">
                    <thead>
                        <tr class="bg-gray-50 border-y border-gray-200">
                            <th class="py-3 px-4 font-bold text-gray-600 uppercase text-xs tracking-wider">Description</th>
                            <th class="py-3 px-4 text-right font-bold text-gray-600 uppercase text-xs tracking-wider">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="border-b border-gray-100">
                            <td class="py-5 px-4">
                                <p class="font-bold text-gray-800 text-base sm:text-lg">${plan.name}</p>
                                <p class="text-sm text-gray-500 mt-1">Connection: ${connection.name}</p>
                            </td>
                            <td class="py-5 px-4 text-right font-bold text-gray-800 text-base sm:text-lg">Rs. ${price}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Total -->
            <div class="flex justify-end mb-10">
                <div class="w-full sm:w-1/2 bg-gray-50 p-6 rounded-xl">
                    <div class="flex justify-between border-b border-gray-200 pb-3 mb-3">
                        <span class="text-gray-500 font-medium">Subtotal</span>
                        <span class="text-gray-800 font-medium">Rs. ${price}</span>
                    </div>
                    <div class="flex justify-between items-center mt-4">
                        <span class="text-xl font-bold text-gray-800">Total</span>
                        <span class="text-2xl font-bold text-blue-600">Rs. ${price}</span>
                    </div>
                </div>
            </div>

            <!-- Footer & Print Button -->
            <div class="border-t border-gray-200 pt-8 flex flex-col sm:flex-row justify-between items-center gap-6">
                <p class="text-sm text-gray-500 font-medium text-center sm:text-left">Thank you for choosing NexGuard!</p>
                <button onclick="window.print()" class="no-print bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-full shadow-md transition duration-200 flex items-center justify-center gap-2 w-full sm:w-auto">
                    <i class="fa-solid fa-print"></i> Print / Save PDF
                </button>
            </div>
        </div>
    </body>
    </html>
    `;
    newWindow.document.write(html);
    newWindow.document.close();
};

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
                    if (now > expiryTimestamp) {
                        shouldEnableRenew = true;
                        btnText = "Renew Plan";
                        btnClass = "ai-button bg-amber-500 hover:bg-amber-600 border-none text-white";
                    } else if (now >= (expiryTimestamp - fiveDaysInMs)) {
                        shouldEnableRenew = true;
                        btnText = "Renew Plan (Expiring Soon)";
                    } else {
                        shouldEnableRenew = false;
                    }
                } else {
                    shouldEnableRenew = false;
                    btnText = "Does not expire";
                }
            } else if (result.isRemoved) {
                if (!ordersCache) await ensureOrdersLoaded();
                let isRejected = false;
                if(ordersCache) {
                    isRejected = ordersCache.some(o => o.final_username === plan.v2rayUsername && o.status === 'rejected');
                }
                
                if (isRejected) {
                     container.innerHTML = `<span class="text-red-400 font-bold border border-red-500/50 px-3 py-1 rounded bg-red-900/20">Plan Rejected</span>`;
                     return;
                } else {
                    shouldEnableRenew = true;
                    btnText = "Renew Plan (Inactive/Expired)";
                    btnClass = "ai-button bg-red-600 hover:bg-red-700 border-none text-white"; 
                }
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
            `<li>
                <div class="plan-row" data-plan-index="${index}">
                    <span class="plan-name">${getDisplayName(plan.v2rayUsername)}</span>
                    <button class="remove-plan-btn" data-username="${plan.v2rayUsername}" title="Remove from Dashboard">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </li>`
        ).join('');

        planListItems += `<li class="border-t border-white/10 mt-1 pt-1">
            <div id="link-new-account-option" class="add-more-row">
                <i class="fa-solid fa-plus-circle mr-2"></i>Add More +
            </div>
        </li>`;

        const displayActiveName = activePlans[activePlanIndex] ? getDisplayName(activePlans[activePlanIndex].v2rayUsername) : 'Select Plan';

        const containerHtml = `
            <div class="plan-selector-container">
                <label class="plan-selector-label custom-radius">Viewing Plan:</label>
                <ul class="fmenu custom-radius" id="plan-menu">
                    <li class="fmenu-item custom-radius">
                        <div class="trigger-menu custom-radius">
                            <i class="fa-solid fa-server"></i>
                            <span class="text">${displayActiveName}</span>
                            <i class="fa-solid fa-chevron-down arrow"></i>
                        </div>
                        <ul class="floating-menu">${planListItems}</ul>
                    </li>
                </ul>
            </div><div id="plan-details-container"></div>`;
        
        const existingMenu = document.querySelector('.plan-selector-container');
        if (!existingMenu) {
             statusContainer.innerHTML = containerHtml;
        } else {
             existingMenu.outerHTML = `<div class="plan-selector-container"><label class="plan-selector-label custom-radius">Viewing Plan:</label><ul class="fmenu custom-radius" id="plan-menu"><li class="fmenu-item custom-radius"><div class="trigger-menu custom-radius"><i class="fa-solid fa-server"></i><span class="text">${displayActiveName}</span><i class="fa-solid fa-chevron-down arrow"></i></div><ul class="floating-menu">${planListItems}</ul></li></ul></div>`;
        }

        planMenuInstance = new SikFloatingMenu("#plan-menu");
        
        document.querySelector('#plan-menu .floating-menu')?.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();

            const removeBtn = e.target.closest('.remove-plan-btn');
            if (removeBtn) {
                const username = removeBtn.dataset.username;
                unlinkPlanLocal(username);
                return;
            }

            const addMoreOption = e.target.closest('#link-new-account-option');
            if (addMoreOption) {
                planMenuInstance.closeAll();
                const linkModal = document.getElementById('link-account-modal');
                if(linkModal) { linkModal.classList.add('visible'); document.body.classList.add('modal-open'); }
                return;
            }

            const planRow = e.target.closest('.plan-row');
            if (planRow) {
                const index = parseInt(planRow.dataset.planIndex);
                document.querySelector('#plan-menu .trigger-menu .text').textContent = getDisplayName(activePlans[index].v2rayUsername);
                localStorage.setItem(LAST_PLAN_KEY, activePlans[index].v2rayUsername); 
                if (window.renderPlanDetailsInternal) window.renderPlanDetailsInternal(index); 
                planMenuInstance.closeAll();
            }
        });
    };

    const handleDataUpdate = (data, isFresh) => {
        const currentPlansStr = JSON.stringify(data.activePlans || []);
        
        if (currentPlansStr !== lastKnownPlansStr) {
            lastKnownPlansStr = currentPlansStr;

            if (data.status === "approved" && data.activePlans?.length > 0) {
                ensureOrdersLoaded().then(() => {
                    data.activePlans.forEach(p => fetchClientData(p.v2rayUsername));
                });
                
                globalActivePlans = data.activePlans;

                let currentIndex = 0;
                const storedSelection = localStorage.getItem(LAST_PLAN_KEY);
                if (storedSelection) {
                    const foundIndex = data.activePlans.findIndex(p => p.v2rayUsername === storedSelection);
                    if (foundIndex !== -1) currentIndex = foundIndex;
                }

                renderPlanSelector(data.activePlans, currentIndex);
                
                window.renderPlanDetailsInternal = async (planIndex) => {
                    const plan = data.activePlans[planIndex];
                    currentActivePlan = plan; 
                    
                    const container = document.getElementById("plan-details-container");
                    if(!plan || !container) return; 
                    
                    let isImmediateRejected = false;
                    if(ordersCache) {
                        isImmediateRejected = ordersCache.some(o => o.final_username === plan.v2rayUsername && o.status === 'rejected');
                    }

                    const connectionName = appData.connections.find(c => c.name === plan.connId)?.name || plan.connId || 'N/A';
                    const planName = appData.plans[plan.planId]?.name || plan.planId;
                    
                    const infoContainer = document.getElementById("plan-info-container");
                    if (infoContainer) {
                        infoContainer.innerHTML = `<span class="bg-blue-500/10 text-blue-300 px-2 py-1 rounded-full"><i class="fa-solid fa-rocket fa-fw mr-2"></i>${planName}</span><span class="bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded-full"><i class="fa-solid fa-wifi fa-fw mr-2"></i>${connectionName}</span>`;
                    }

                    // ====== THE UNIFIED TABS BAR ======
                    if(!document.getElementById('profile-tabs')) {
                        container.innerHTML = `
                        <div id="profile-tabs" class="flex items-center gap-4 sm:gap-6 border-b border-white/10 mb-6 pb-2 overflow-x-auto hide-scrollbar scroll-smooth snap-x">
                            <button data-tab="config" class="tab-btn active whitespace-nowrap shrink-0 snap-start">V2Ray Config</button>
                            <button data-tab="usage" class="tab-btn whitespace-nowrap shrink-0 snap-start">Usage Stats</button>
                            <button data-tab="orders" class="tab-btn whitespace-nowrap shrink-0 snap-start">My Orders</button>
                            <button data-tab="settings" class="tab-btn whitespace-nowrap shrink-0 snap-start">Settings</button>
                            <button data-tab="apps" class="tab-btn whitespace-nowrap shrink-0 snap-start">Apps</button>
                            <button data-tab="tutorials" class="tab-btn whitespace-nowrap shrink-0 snap-start">Tutorials</button>
                        </div>
                        <div id="tab-config" class="tab-panel active">
                            <div class="card-glass p-8 text-center custom-radius flex flex-col items-center justify-center min-h-[300px]">
                                <i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-400 mb-4"></i>
                                <h3 class="text-xl font-bold text-white font-['Orbitron'] animate-pulse">Checking Plan Details...</h3>
                                <p class="text-sm text-gray-400 mt-2">Verifying status with server</p>
                            </div>
                        </div>
                        <div id="tab-usage" class="tab-panel"></div>
                        <div id="tab-orders" class="tab-panel"></div>
                        <div id="tab-settings" class="tab-panel">${accountSettingsFormHtml(user.username)}</div>
                        <div id="tab-apps" class="tab-panel">${appsPanelContent}</div>
                        <div id="tab-tutorials" class="tab-panel"></div>`;

                        bindUnifiedTabs(data.activePlans);
                        updateDynamicLinks(); 
                        setupEventListeners();
                    } else {
                         const configTab = document.getElementById("tab-config");
                         if(configTab) {
                             configTab.innerHTML = `<div class="card-glass p-8 text-center custom-radius flex flex-col items-center justify-center min-h-[300px]"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-400 mb-4"></i><h3 class="text-xl font-bold text-white font-['Orbitron'] animate-pulse">Checking Plan Details...</h3><p class="text-sm text-gray-400 mt-2">Verifying status with server</p></div>`;
                         }
                    }

                    if (!ordersCache) await ensureOrdersLoaded();
                    
                    isImmediateRejected = false; 
                    if(ordersCache) {
                        isImmediateRejected = ordersCache.some(o => o.final_username === plan.v2rayUsername && o.status === 'rejected');
                    }

                    const configTab = document.getElementById("tab-config");
                    
                    if (isImmediateRejected) {
                        const rejectedHtml = `
                            <div class="result-card p-6 card-glass custom-radius space-y-4 reveal is-visible border border-red-500/50 bg-red-900/10">
                                <div class="text-center">
                                    <i class="fa-solid fa-ban text-4xl text-red-500 mb-3"></i>
                                    <h3 class="text-xl font-bold text-white">Your Plan Rejected By Admin</h3>
                                    <p class="text-sm text-gray-300 mt-2">Unfortunately, your plan <span class="font-semibold text-red-300">${getDisplayName(plan.v2rayUsername)}</span> has been rejected.</p>
                                    <p class="text-xs text-gray-400 mt-1">Please check your orders tab or contact support for more details.</p>
                                </div>
                                <div class="pt-2 text-center">
                                    <button id="remove-rejected-btn-cfg" class="ai-button secondary w-auto inline-flex items-center justify-center px-6 py-2 text-sm rounded-lg text-red-400 hover:text-red-300 border-red-500/30 hover:bg-red-900/30">
                                        <i class="fa-solid fa-trash-can mr-2"></i>Remove
                                    </button>
                                </div>
                            </div>`;
                        configTab.innerHTML = rejectedHtml;
                        document.getElementById('remove-rejected-btn-cfg')?.addEventListener('click', () => unlinkPlanLocal(plan.v2rayUsername));
                    } else {
                        configTab.innerHTML = `
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
                            </div>`;
                        
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
                            newBtn.addEventListener('click', () => { navigator.clipboard.writeText(plan.v2rayLink); showToast({ title: 'Success', message: 'Link Copied!', type: 'success' }); });
                        }
                        updateRenewButton(plan, data.activePlans);
                    }

                    if (document.getElementById('tab-usage')?.classList.contains('active')) {
                         if (usageDataCache[plan.v2rayUsername]) {
                            renderUsageHTML(usageDataCache[plan.v2rayUsername], plan.v2rayUsername);
                            loadUsageStats(plan.v2rayUsername, true); 
                        } else {
                            loadUsageStats(plan.v2rayUsername, false);
                        }
                    }
                    
                    handleDeepLink();
                };

                window.renderPlanDetailsInternal(currentIndex);

            } else if (data.status === "pending") {
                statusContainer.innerHTML = `<div style="border-radius: 50px;" class="card-glass p-8 text-center"><i class="fa-solid fa-clock text-4xl text-amber-400 mb-4 animate-pulse"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Order Pending Approval</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">Your order is currently being reviewed. Your profile will update here once approved.</p></div>`;
            } else {
                // --- NO PLANS STATE ---
const linkAccountHtml = `<div class="card-glass p-6 custom-radius"><h3 class="text-xl font-bold text-white mb-2 font-['Orbitron']">Link Existing V2Ray Account</h3><p class="text-sm text-gray-400 mb-6">If you have an old account, link it here to manage renewals.</p><form id="link-account-form-profile" class="space-y-6"><div class="form-group"><input type="text" id="existing-v2ray-username-profile" class="form-input" required placeholder=" "><label for="existing-v2ray-username-profile" class="form-label">Your Old V2Ray Username</label><span class="focus-border"><i></i></span></div><button type="submit" class="ai-button secondary w-full rounded-lg">Link Account</button><div class="text-center text-sm mt-4"><span class="open-help-modal-link text-blue-400 cursor-pointer hover:underline">How to find your username?</span></div></form></div>`;

statusContainer.innerHTML = `
                <div id="profile-tabs" class="flex items-center gap-4 sm:gap-6 border-b border-white/10 mb-6 pb-2 overflow-x-auto hide-scrollbar scroll-smooth snap-x">
                    <button data-tab="config" class="tab-btn active whitespace-nowrap shrink-0 snap-start">Dashboard</button>
                    <button data-tab="settings" class="tab-btn whitespace-nowrap shrink-0 snap-start">Settings</button>
                    <button data-tab="apps" class="tab-btn whitespace-nowrap shrink-0 snap-start">Apps</button>
                    <button data-tab="tutorials" class="tab-btn whitespace-nowrap shrink-0 snap-start">Tutorials</button>
                </div>
                <div id="tab-config" class="tab-panel active">
                    <div class="card-glass p-8 custom-radius text-center"><i class="fa-solid fa-rocket text-4xl text-blue-400 mb-4"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Get Started</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">You do not have any active plans yet. Purchase a new plan or link an existing account below.</p><a href="/plans" class="nav-link-internal ai-button inline-block rounded-lg mt-6">Purchase a Plan</a></div>
                    <div class="grid md:grid-cols-2 gap-8 mt-8">${linkAccountHtml}</div>
                </div>
                <div id="tab-settings" class="tab-panel">${accountSettingsFormHtml(user.username)}</div>
                <div id="tab-apps" class="tab-panel">${appsPanelContent}</div>
                <div id="tab-tutorials" class="tab-panel"></div>`;
                
                bindUnifiedTabs(null);
                updateDynamicLinks(); 
                setupEventListeners();
                handleDeepLink();
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
            ensureOrdersLoaded();

            // FIX: Live Fetching Enabled
            const res = await apiFetch("/api/user/status");
            if (!res.ok) {
                console.warn("Skipping update due to server error:", res.status);
                return; 
            }

            const data = await res.json();
            
            if(data.success && data.activePlans) {
                try { localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify(data.activePlans)); } catch(e){}
                handleDataUpdate(data, true);
            } else {
                handleDataUpdate({ activePlans: [] }, true);
            }

        } catch (e) { 
            console.error("Profile load error:", e); 
        }
    };
    loadProfileData();

    profilePollingInterval = setInterval(() => {
        if (!document.hidden) {
            loadProfileData();
        }
    }, 10000);
}