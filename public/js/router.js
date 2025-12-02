// File: public/js/router.js
import { renderHomePage, renderAboutPage, renderPrivacyPage } from './pages/home.js';
import { renderUsagePage } from './pages/usage.js';
import { renderPlansPage, renderConnectionsPage, renderPackageChoicePage, renderCheckoutPage, renderRenewOrChangePage, renderPlanChoicePage } from './pages/checkout.js';
import { renderProfilePage } from './pages/profile.js';
import { renderAuthPage } from './pages/auth.js';
import { userSession, apiFetch } from './api.js';
import { initAnimations } from './utils.js';

const mainContentArea = document.getElementById("app-router");

const pageTitles = {
    home: 'Home - NexGuardLK STORE',
    usage: 'Check Usage - NexGuardLK STORE',
    plans: 'Our Plans - NexGuardLK STORE',
    connections: 'Select Connection - NexGuardLK STORE',
    'package-choice': 'Select Package - NexGuardLK STORE',
    'renew-choice': 'Renew or Change Plan - NexGuardLK STORE',
    about: 'About Us - NexGuardLK STORE',
    privacy: 'Privacy Policy - NexGuardLK STORE',
    login: 'Login / Signup - NexGuardLK STORE',
    signup: 'Login / Signup - NexGuardLK STORE',
    'reset-password': 'Reset Password - NexGuardLK STORE',
    checkout: 'Checkout - NexGuardLK STORE',
    profile: 'My Profile - NexGuardLK STORE'
};

const allRoutes = {
    home: renderHomePage,
    usage: renderUsagePage,
    plans: renderPlansPage,
    connections: renderConnectionsPage,
    "package-choice": renderPackageChoicePage,
    "renew-choice": renderRenewOrChangePage,
    about: renderAboutPage,
    privacy: renderPrivacyPage,
    login: renderAuthPage,
    signup: renderAuthPage,
    "reset-password": renderAuthPage,
    checkout: renderCheckoutPage,
    profile: renderProfilePage,
};

export const navigateTo = (path) => {
    history.pushState(null, null, path);
    router();
};

export const router = async () => {
    const pathName = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    let pageKey = pathName.substring(1).split('/')[0] || 'home';
    if (pageKey === '') pageKey = 'home';

    document.title = pageTitles[pageKey] || 'NexGuardLK STORE';

    document.querySelectorAll("#main-nav a, #mobile-nav a").forEach((link) => {
        const linkPath = link.getAttribute("href")?.split("?")[0].replace('/', '');
        link.classList.toggle("active", linkPath === pageKey || (linkPath === 'home' && pageKey === ''));
    });
    
    window.scrollTo(0, 0);

    if (userSession && ["login", "signup", "reset-password"].includes(pageKey)) {
        navigateTo("/profile");
        return;
    }

    if (!userSession && ["checkout", "profile", "connections", "package-choice", "renew-choice"].includes(pageKey)) {
        navigateTo("/login");
        return;
    }
    
    // Logic for Plans page renewal flow redirection
    if (pageKey === 'plans' && userSession && !params.has('new') && !params.has('change')) {
        mainContentArea.innerHTML = `<div class="page flex flex-col items-center justify-center min-h-[70vh]"><div class="text-center p-10"><i class="fa-solid fa-spinner fa-spin text-3xl text-blue-400"></i><p class="mt-4 text-lg font-semibold text-blue-300 animate-pulse">Checking Your Active Plans...</p><p class="text-sm text-gray-500 mt-1">Please wait while we fetch your plan information.</p></div></div>`;
        try {
            const res = await apiFetch("/api/user/status");
            if (!res.ok) throw new Error('Failed to fetch user status');
            const data = await res.json();

            if (data.status === "approved" && data.activePlans?.length > 0) {
                const renewalPeriodDays = 1;
                const renewalWindowMs = renewalPeriodDays * 24 * 60 * 60 * 1000;
                const isAnyPlanRenewable = data.activePlans.some(plan => {
                    if (!plan.expiryTime || plan.expiryTime === 0) return false;
                    const expiryDate = new Date(plan.expiryTime);
                    const now = new Date();
                    return now >= new Date(expiryDate.getTime() - renewalWindowMs);
                });

                if (isAnyPlanRenewable) {
                    renderPlanChoicePage((html) => {
                        mainContentArea.innerHTML = html;
                        initAnimations();
                    }, data.activePlans);
                } else {
                    navigateTo('/plans?new=true');
                }
            } else {
                renderPlansPage((html) => { mainContentArea.innerHTML = html; initAnimations(); }, params);
            }
        } catch (error) {
            renderPlansPage((html) => { mainContentArea.innerHTML = html; initAnimations(); }, params);
        }
        return;
    }

    const renderFunction = allRoutes[pageKey] || allRoutes["home"];
    renderFunction((html) => {
        mainContentArea.innerHTML = html;
        initAnimations();
    }, params, pageKey);

    const scrollTargetId = params.get('scroll');
    if (scrollTargetId) {
        setTimeout(() => {
            document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
};

window.addEventListener("popstate", router);