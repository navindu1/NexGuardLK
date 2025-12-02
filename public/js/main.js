// File: public/js/main.js
import { loadSession, loadPlans, loadConnections } from './api.js';
import { router, navigateTo } from './router.js';

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize Visuals
    try {
        VANTA.FOG({
            el: "#vanta-bg",
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200.00,
            minWidth: 200.00,
            highlightColor: 0x0,
            midtoneColor: 0x569e8,
            lowlightColor: 0x0,
            baseColor: 0x0,
            blurFactor: 0.90,
            speed: 1.30,
            zoom: 0.60
        });
    } catch(e) { console.warn("Vanta JS error", e); }

    // 2. Load Session & Initial Data
    loadSession();
    
    await Promise.all([loadConnections(), loadPlans()]);

    // 3. Start Router
    router();

    // 4. Global Event Listeners
    document.addEventListener("click", (e) => { 
        const link = e.target.closest("a.nav-link-internal"); 
        if (link) { 
            e.preventDefault(); 
            navigateTo(link.getAttribute("href")); 
        } 
        // Sidebar close on link click (mobile)
        if (e.target.closest("#mobile-nav a")) {
             document.body.classList.remove("sidebar-open");
             document.getElementById("mobile-sidebar").classList.add("-translate-x-full");
             document.getElementById("sidebar-overlay").classList.add("opacity-0", "pointer-events-none");
        }
    });

    // Sidebar Logic
    const hamburgerBtn = document.getElementById("hamburger-btn");
    const sidebar = document.getElementById("mobile-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const body = document.body;

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener("click", () => {
            body.classList.add("sidebar-open");
            sidebar.classList.remove("-translate-x-full");
            overlay.classList.remove("opacity-0", "pointer-events-none");
        });
    }
    if (overlay) {
        overlay.addEventListener("click", () => {
            body.classList.remove("sidebar-open");
            sidebar.classList.add("-translate-x-full");
            overlay.classList.add("opacity-0", "pointer-events-none");
        });
    }

    // Logout Listeners
    document.addEventListener("click", (e) => {
        if (e.target.id === "logout-btn-desktop" || e.target.id === "logout-btn-mobile") {
            import('./api.js').then(module => module.clearSession());
        }
    });

    // Hide loader
    const loader = document.getElementById('page-loader');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 500);
    }
});