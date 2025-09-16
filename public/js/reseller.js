// File Path: public/js/reseller.js
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('nexguard_reseller_token');

    // If no token is found, redirect to the login page
    if (!token) {
        window.location.href = '/reseller/login';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');

    const logout = () => {
        localStorage.removeItem('nexguard_reseller_token');
        window.location.href = '/reseller/login';
    };

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // We will add the function to fetch and display users here in the next step
    console.log("Reseller dashboard loaded.");

});