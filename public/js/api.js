// File: public/js/api.js
import { showToast } from './utils.js';
import { navigateTo } from './router.js';

export let userSession = null;
export const appData = {
    plans: {},
    connections: [],
    bankDetails: `Name: N.R Lekamge\nBank: BOC Bank\nBranch: Eheliyagoda\nAccount Number: 93129972`.trim(),
};

export const updateNavUI = (isLoggedIn) => {
    const htmlElement = document.documentElement;
    if (isLoggedIn && userSession) {
        htmlElement.classList.remove('logged-out');
        htmlElement.classList.add('logged-in');
        const profilePicDesktop = document.getElementById("profile-pic-nav-desktop");
        const profilePicMobile = document.getElementById("profile-pic-nav-mobile");
        let profilePicturePath = (userSession.profilePicture || "/assets/profilePhoto.jpg").replace("public/", "");
        if (profilePicturePath && !profilePicturePath.startsWith('/')) {
            profilePicturePath = '/' + profilePicturePath;
        }
        if (profilePicDesktop) profilePicDesktop.src = profilePicturePath;
        if (profilePicMobile) profilePicMobile.src = profilePicturePath;
    } else {
        htmlElement.classList.remove('logged-in');
        htmlElement.classList.add('logged-out');
    }
};

export const saveSession = (data) => {
    localStorage.setItem("nexguard_token", data.token);
    localStorage.setItem("nexguard_user", JSON.stringify(data.user));
    userSession = data.user;
    updateNavUI(true);
};

export const clearSession = () => {
    localStorage.removeItem("nexguard_token");
    localStorage.removeItem("nexguard_user");
    userSession = null;
    updateNavUI(false);
    navigateTo("/home");
};

export const loadSession = () => {
    const token = localStorage.getItem("nexguard_token");
    const user = localStorage.getItem("nexguard_user");
    if (token && user) {
        try {
            userSession = JSON.parse(user);
            updateNavUI(true);
        } catch (error) {
            console.error('Error parsing user session:', error);
            clearSession();
        }
    } else {
        userSession = null;
        updateNavUI(false);
    }
};

export const apiFetch = async (url, options = {}) => {
    const token = localStorage.getItem("nexguard_token");
    if (!options.headers) {
        options.headers = {};
    }
    if (!(options.body instanceof FormData)) {
        // Only set Content-Type if NOT FormData (browser sets it automatically for FormData)
        // Note: You usually pass JSON string in body, so headers need checking
    }
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(url, options);
        if ((response.status === 401 || response.status === 403) && url !== '/api/auth/login') {
            showToast({
                title: "Session Expired",
                message: "Login Expired. Please Login Again.",
                type: "warning"
            });
            setTimeout(() => {
                clearSession();
                navigateTo('/login');
            }, 2000);
            return Promise.reject(new Error("Token expired or invalid"));
        }
        return response;
    } catch (error) {
        return Promise.reject(error);
    }
};

export const loadPlans = async () => {
    try {
        const res = await apiFetch('/api/public/plans');
        const result = await res.json();
        if (result.success) {
            appData.plans = result.data;
        }
    } catch (error) {
        console.error("Error fetching plans:", error);
    }
};

export const loadConnections = async () => {
    try {
        const res = await apiFetch('/api/public/connections');
        const result = await res.json();
        if (result.success) {
            appData.connections = result.data;
        }
    } catch (error) {
        console.error("Error fetching connections:", error);
    }
};