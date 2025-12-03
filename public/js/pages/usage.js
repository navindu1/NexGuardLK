// File: public/js/pages/usage.js
import { apiFetch } from '../api.js';

// --- Helper Function: Display User Data ---
function displayUserData(data, name, container) {
    const down = data.down || 0;
    const up = data.up || 0;
    const totalUsed = down + up;
    const totalQuota = data.total || 0;
    const usagePercentage = totalQuota > 0 ? Math.min((totalUsed / totalQuota) * 100, 100) : 0;
    const status = data.enable ? `<span class="font-semibold text-green-400">ONLINE</span>` : `<span class="font-semibold text-red-400">OFFLINE</span>`;
    
    // --- EXPIRY DATE LOGIC (Time Removed) ---
    let expiry = `<span class="text-blue-300">Unlimited ♾️</span>`; 
    const expiryTimestamp = parseInt(data.expiryTime, 10);

    if (expiryTimestamp > 0) {
        const expDate = new Date(expiryTimestamp);
        const now = new Date();

        if (now > expDate) {
            expiry = `<span class="text-red-500">Expired ⚠️</span>`;
        } else {
            // Shows only Date: YYYY-MM-DD
            expiry = expDate.toLocaleDateString('en-CA');
        }
    }

    const html = `
        <div class="result-card p-4 sm:p-6 card-glass rounded-xl space-y-5 reveal is-visible">
            <div class="flex justify-between items-center pb-3 border-b border-white/10">
                <h3 class="text-lg font-semibold text-white flex items-center min-w-0">
                    <i class="fa-solid fa-satellite-dish mr-3 text-blue-400 flex-shrink-0"></i>
                    <span class="truncate" title="${name}">Client: ${name}</span>
                </h3>
                <div>${status}</div>
            </div>
            ${totalQuota > 0 ? `<div class="space-y-2"><div class="flex justify-between items-baseline text-sm"><span class="font-medium text-gray-300">Data Quota Usage</span><span id="usage-percentage" class="font-bold text-white">0%</span></div><div class="w-full bg-black/30 rounded-full h-2.5"><div class="progress-bar-inner bg-gradient-to-r from-sky-500 to-blue-500 h-2.5 rounded-full" style="width: ${usagePercentage}%"></div></div></div>` : ''}
            <div class="space-y-4 text-sm sm:hidden">
                <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-down text-sky-400 text-lg w-5 text-center"></i><span>Download</span></div><p id="download-value-mobile" class="font-semibold text-white text-base">0 B</p></div>
                <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-up text-violet-400 text-lg w-5 text-center"></i><span>Upload</span></div><p id="upload-value-mobile" class="font-semibold text-white text-base">0 B</p></div>
                <div class="flex justify-between items-center border-b border-white/10 pb-3"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-database text-green-400 text-lg w-5 text-center"></i><span>Total Used</span></div><p id="total-usage-value-mobile" class="font-semibold text-white text-base">0 B</p></div>
                <div class="flex justify-between items-center"><div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-calendar-xmark text-red-400 text-lg w-5 text-center"></i><span>Expires On</span></div><p class="font-semibold text-white text-base">${expiry}</p></div>
            </div>
            <div class="hidden sm:grid sm:grid-cols-2 gap-4 text-sm">
                <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-down text-sky-400 mr-2"></i><span>Download</span></div><p id="download-value-desktop" class="text-2xl font-bold text-white mt-1">0 B</p></div>
                <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-up text-violet-400 mr-2"></i><span>Upload</span></div><p id="upload-value-desktop" class="text-2xl font-bold text-white mt-1">0 B</p></div>
                <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-database text-green-400 mr-2"></i><span>Total Used</span></div><p id="total-usage-value-desktop" class="text-2xl font-bold text-white mt-1">0 B</p></div>
                <div class="bg-black/20 rounded-lg p-4"><div class="flex items-center text-gray-400"><i class="fa-solid fa-calendar-xmark text-red-400 mr-2"></i><span>Expires On</span></div><p class="text-2xl font-bold text-white mt-1">${expiry}</p></div>
            </div>
        </div>`;
    container.innerHTML = html;

    const animateCounter = (el, start, end, duration) => {
        if (!el) return;
        let startTimestamp = null;
        const step = timestamp => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const current = Math.floor(progress * (end - start) + start);
            const formatBytes = (b = 0, d = 2) => {
                const k = 1024;
                const s = ['B', 'KB', 'MB', 'GB', 'TB'];
                if (b === 0) return '0 B';
                const i = Math.floor(Math.log(b) / Math.log(k));
                return `${parseFloat((b / k ** i).toFixed(d))} ${s[i]}`;
            };
            el.innerHTML = el.id.includes('percentage') ? `${current}%` : formatBytes(current);
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    };
    const animDuration = 1500;
    animateCounter(container.querySelector('#download-value-mobile'), 0, down, animDuration);
    animateCounter(container.querySelector('#upload-value-mobile'), 0, up, animDuration);
    animateCounter(container.querySelector('#total-usage-value-mobile'), 0, totalUsed, animDuration);
    animateCounter(container.querySelector('#download-value-desktop'), 0, down, animDuration);
    animateCounter(container.querySelector('#upload-value-desktop'), 0, up, animDuration);
    animateCounter(container.querySelector('#total-usage-value-desktop'), 0, totalUsed, animDuration);
    if (totalQuota > 0) animateCounter(container.querySelector('#usage-percentage'), 0, Math.floor(usagePercentage), animDuration);
}

// --- Main Render Function ---
export function renderUsagePage(renderFunc) {
    const pageStyles = `<style>
        /* Overlay styles - Transparent */
        .help-modal-overlay {
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease-out, visibility 0.3s ease-out;
            background: transparent;
        }
        
        .help-modal-overlay.visible {
            opacity: 1;
            visibility: visible;
        }

        /* Modal Animation */
        .help-modal-content {
            opacity: 0;
            transform: scale(0.95);
            transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        
        .help-modal-overlay.visible .help-modal-content {
            opacity: 1;
            transform: scale(1);
        }

        /* NEW "SUPER SMOOTH" BLUR EFFECT (Similar to uploaded image) */
        .grease-glass {
            /* Dark semi-transparent background - Opacity lowered to 0.6 to let blur shine */
            background: rgba(10, 10, 25, 0.6); 
            
            /* High Blur (60px) + Saturation Boost (180%) */
            /* This creates the smooth, liquid/grease look */
            backdrop-filter: blur(60px) saturate(180%);
            -webkit-backdrop-filter: blur(60px) saturate(180%);
            
            /* Very subtle, almost invisible border */
            border: 1px solid rgba(255, 255, 255, 0.08);
            
            /* Deep, soft shadow */
            box-shadow: 0 40px 80px -20px rgba(0, 0, 0, 0.7);
        }
    </style>`;

    renderFunc(pageStyles + `
        <div class="page" id="page-usage">
            <main class="w-full max-w-sm space-y-4 z-10 mx-auto">
                <header class="text-center space-y-1 reveal is-visible">
                    <i class="fa-solid fa-microchip text-4xl gradient-text"></i>
                    <h1 class="text-xl sm:text-2xl font-bold text-white" style="font-family: 'Orbitron', sans-serif;">NexGuard <span class="gradient-text">LK</span></h1>
                    <p class="text-gray-400 text-sm">Enter client identifier for real-time usage.</p>
                </header>
                <form id="usage-form" class="space-y-4 reveal is-visible">
                    <div class="form-group">
                        <input type="text" id="username" name="username" class="form-input" placeholder=" " required="">
                        <label for="username" class="form-label">Enter Username</label>
                        <span class="focus-border"><i></i></span>
                    </div>
                    <button type="submit" class="ai-button w-full">
                        <span class="button-text"><i class="fa-solid fa-magnifying-glass-chart mr-2"></i>ANALYZE USAGE</span>
                    </button>
                </form>
                <div id="result" class="mt-6"></div>
                <div id="how-to-find-link-container" class="text-center pt-0 reveal is-visible">
                    <span id="open-help-modal-link" class="text-blue-400 text-sm cursor-pointer hover:underline ">How to find your username?</span>
                </div>
            </main>
            
            <div id="help-modal" class="help-modal-overlay fixed inset-0 z-[100] flex justify-center items-center p-4">
                
                <div class="help-modal-content grease-glass rounded-3xl p-6 space-y-4 w-full max-w-md">
                    
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="text-xl font-bold text-white font-['Orbitron'] drop-shadow-md">Help & Support Matrix</h2>
                            <button id="lang-toggle-btn" class="text-xs text-blue-300 hover:text-white hover:underline mt-1 transition-colors">English / සිංහල</button>
                        </div>
                        <button id="help-modal-close" class="text-white/70 hover:text-white text-3xl transition-all hover:rotate-90">&times;</button>
                    </div>
                    <div class="lang-content lang-en">
                        <div>
                            <h3 class="text-lg font-semibold text-blue-300 mb-2 drop-shadow-sm">How to find your Username?</h3>
                            <p class="text-gray-200 text-sm mb-4 font-medium leading-relaxed">Your username is the name assigned to your V2ray configuration. It's often visible in your V2ray client app, usually next to the server connection name.</p>
                        </div>
                    </div>
                    <div class="lang-content lang-si hidden">
                        <div>
                            <h3 class="text-lg font-semibold text-blue-300 mb-2 drop-shadow-sm">ඔබගේ Username එක සොයාගන්නේ කෙසේද?</h3>
                            <p class="text-gray-200 text-sm mb-4 font-medium leading-relaxed">ඔබගේ username යනු V2ray config ගොනුවට ලබා දී ඇති නමයි. එය බොහෝවිට V2ray client ඇප් එකේ, server සම්බන්ධතාවය අසල දිස්වේ.</p>
                        </div>
                    </div>
                    <div class="bg-black/20 border border-white/10 rounded-xl p-2 shadow-inner">
                        <img src="/assets/help.jpg" alt="Example image of where to find the username" class="rounded-lg w-full h-auto opacity-95 hover:opacity-100 transition-opacity">
                    </div>
                </div>
            </div>
        </div>`);

    setTimeout(() => {
        document.getElementById('usage-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const submitButton = e.target.querySelector('button');
            const buttonText = submitButton.querySelector('.button-text');
            const username = document.getElementById('username').value.trim();
            const resultDiv = document.getElementById('result');
            const howToFindLinkContainer = document.getElementById('how-to-find-link-container');
            
            submitButton.disabled = true;
            buttonText.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>ANALYZING...`;
            resultDiv.innerHTML = "";
            howToFindLinkContainer.classList.remove('hidden');
            
            try {
                const res = await apiFetch(`/api/check-usage/${username}`);
                if (!res.ok) {
                    howToFindLinkContainer.classList.remove('hidden');
                    if (res.status === 404) {
                        resultDiv.innerHTML = `<div class="p-4 text-center text-amber-400 card-glass rounded-lg flex flex-col items-center gap-3"><i class="fa-solid fa-user-slash text-2xl"></i><div><p class="font-semibold">This client name does not exist.`;
                    } else {
                        const errorResult = await res.json();
                        resultDiv.innerHTML = `<div class="p-4 text-center text-amber-400 card-glass rounded-lg">${errorResult.message || `Server error: ${res.status}`}</div>`;
                    }
                    return;
                }
                const result = await res.json();
                if (result.success) {
                    displayUserData(result.data, username, resultDiv);
                    howToFindLinkContainer.classList.add('hidden');
                    e.target.reset();
                } else {
                    resultDiv.innerHTML = `<div class="p-4 text-center text-amber-400 card-glass rounded-lg">${result.message || 'Could not retrieve user data.'}</div>`;
                    howToFindLinkContainer.classList.remove('hidden');
                }
            } catch (err) {
                resultDiv.innerHTML = `<div class="p-4 text-center text-red-400 card-glass rounded-lg">An error occurred. Please try again later.</div>`;
                howToFindLinkContainer.classList.remove('hidden');
            } finally {
                submitButton.disabled = false;
                buttonText.innerHTML = `<i class="fa-solid fa-magnifying-glass-chart mr-2"></i>ANALYZE USAGE`;
            }
        });

        const openHelpModalLink = document.getElementById('open-help-modal-link');
        const helpModal = document.getElementById('help-modal');
        const helpModalCloseBtn = document.getElementById('help-modal-close');
        
        if (openHelpModalLink && helpModal && helpModalCloseBtn) {
            const openModal = () => { helpModal.classList.add('visible'); document.body.classList.add('modal-open'); };
            const closeModal = () => { helpModal.classList.remove('visible'); document.body.classList.remove('modal-open'); };
            
            openHelpModalLink.addEventListener('click', openModal);
            helpModalCloseBtn.addEventListener('click', closeModal);
            helpModal.addEventListener('click', (e) => { if (e.target === helpModal) closeModal(); });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && helpModal.classList.contains('visible')) closeModal(); });
            document.getElementById('lang-toggle-btn')?.addEventListener('click', () => {
                document.querySelector('.lang-content.lang-en')?.classList.toggle('hidden');
                document.querySelector('.lang-content.lang-si')?.classList.toggle('hidden');
            });
        }
    }, 100);
}