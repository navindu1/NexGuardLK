// public/js/main.js - FULLY CORRECTED AND COMPLETE

document.addEventListener("DOMContentLoaded", () => {
    // Initialize Vanta.js animated background
    VANTA.WAVES({
        el: "#vanta-bg",
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0x20002f,
        shininess: 25.0,
        waveHeight: 15.0,
        waveSpeed: 0.65,
        zoom: 0.85,
    });

    // Global variables
    const mainContentArea = document.getElementById("app-router");
    const body = document.body;
    const hamburgerBtn = document.getElementById("hamburger-btn");
    const sidebar = document.getElementById("mobile-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    let userSession = null;

    const pageTitles = {
        home: 'Home - NexGuardLK STORE',
        usage: 'Check Usage - NexGuardLK STORE',
        plans: 'Our Plans - NexGuardLK STORE',
        connections: 'Select Connection - NexGuardLK STORE',
        'package-choice': 'Select Package - NexGuardLK STORE',
        about: 'About Us - NexGuardLK STORE',
        privacy: 'Privacy Policy - NexGuardLK STORE',
        login: 'Login / Signup - NexGuardLK STORE',
        signup: 'Login / Signup - NexGuardLK STORE',
        'reset-password': 'Reset Password - NexGuardLK STORE',
        checkout: 'Checkout - NexGuardLK STORE',
        profile: 'My Profile - NexGuardLK STORE'
    };

    const apiFetch = async (url, options = {}) => {
        const token = localStorage.getItem("nexguard_token");

        if (!options.headers) {
            options.headers = {};
        }

        if (options.body instanceof FormData) {
            delete options.headers['Content-Type'];
        }

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, options);

        if (response.status === 401 || response.status === 403) {
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
    };

    const appData = {
        plans: {
            "100GB": { name: "100GB Plan", price: "300", features: ["High-Speed Connection", "Optimal for Streaming", "30-Day Validity"] },
            "200GB": { name: "200GB Plan", price: "500", features: ["Ultra-Fast Speeds", "Perfect for Gaming", "30-Day Validity"] },
            "Unlimited": { name: "Unlimited Plan", price: "800", features: ["No Data Caps", "Ultimate Freedom", "Best for Power Users"] },
        },
        bankDetails: `Name: N.R Lekamge\nBank: BOC Bank\nBranch: Eheliyagoda\nAccount Number: 93129972`.trim(),
    };

    let dynamicConnections = [];

    const loadConnections = async () => {
        try {
            const res = await apiFetch('/api/public/connections');
            const result = await res.json();
            if (result.success) {
                dynamicConnections = result.data;
            } else {
                console.error("Failed to load dynamic connections.");
            }
        } catch (error) {
            console.error("Error fetching connections:", error);
        }
    };

    const connectionsGrid = document.getElementById('connections-grid');
    if (connectionsGrid) {
        const orderModal = new bootstrap.Modal(document.getElementById('orderModal'));
        const orderForm = document.getElementById('order-form');
        const connectionDetails = document.getElementById('connection-details');
        let selectedConnection = null;

        const fetchConnections = async () => {
            try {
                const response = await apiFetch('/api/connections');
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                const connections = await response.json();
                renderConnections(connections);
            } catch (error) {
                console.error('Failed to fetch connections:', error);
                connectionsGrid.innerHTML = '<p class="text-danger">Failed to load connections. Please try again later.</p>';
            }
        };

        const renderConnections = (connections) => {
            connectionsGrid.innerHTML = '';
            if (connections.length === 0) {
                connectionsGrid.innerHTML = '<p>No available connections at the moment.</p>';
                return;
            }

            connections.forEach(connection => {
                const col = document.createElement('div');
                col.className = 'col-lg-4 col-md-6 mb-4'; 

                let packageSelectorHtml = '';
                let packagesData = '[]';

                if (connection.requires_package_choice && connection.package_options) {
                    try {
                        const options = JSON.parse(connection.package_options);
                        if (Array.isArray(options) && options.length > 0) {
                            packagesData = connection.package_options; 
                            packageSelectorHtml = `
                                <select class="form-select form-select-sm mt-2 package-selector">
                                    <option value="" selected disabled>Select a package</option>
                                    ${options.map((pkg, index) => `<option value="${index}">${pkg.name}</option>`).join('')}
                                </select>
                            `;
                        }
                    } catch (e) {
                        console.error('Error parsing package_options for connection:', connection.name, e);
                    }
                } else {
                    const singlePackage = {
                        name: connection.default_package,
                        template: connection.default_vless_template,
                        inbound_id: connection.default_inbound_id
                    };
                    packagesData = JSON.stringify([singlePackage]);
                }

                const card = `
                    <div class="card h-100 text-center connection-card" 
                        data-id="${connection.id}"
                        data-name="${connection.name}"
                        data-requires-package-choice="${connection.requires_package_choice}"
                        data-packages='${packagesData}'>
                        <div class="card-body d-flex flex-column">
                            <i class="${connection.icon} fa-3x mb-3"></i>
                            <h5 class="card-title">${connection.name}</h5>
                            <div class="mt-auto">
                               ${packageSelectorHtml}
                            </div>
                        </div>
                    </div>
                `;
                col.innerHTML = card;
                connectionsGrid.appendChild(col);
            });

            document.querySelectorAll('.connection-card').forEach(card => {
                card.addEventListener('click', (event) => {
                    if (event.target.tagName === 'SELECT') {
                        event.stopPropagation();
                        return;
                    }
                    handleCardClick(card);
                });
            });
        };

        const handleCardClick = (card) => {
            const requiresPackageChoice = card.dataset.requiresPackageChoice === 'true';
            
            let selectedPackage = null;
            let packages = [];
            try {
                packages = JSON.parse(card.dataset.packages);
            } catch(e) {
                console.error("Failed to parse packages data", e);
                alert("Could not process this connection's data.");
                return;
            }

            if (requiresPackageChoice) {
                const selector = card.querySelector('.package-selector');
                if (!selector || selector.value === "") {
                    alert('Please select a package from the dropdown first.');
                    return;
                }
                selectedPackage = packages[parseInt(selector.value)];
            } else {
                selectedPackage = packages[0];
            }

            if (!selectedPackage) {
                alert('Could not determine the selected package. Please try again.');
                return;
            }
            
            selectedConnection = {
                id: card.dataset.id,
                name: card.dataset.name,
                packageName: selectedPackage.name,
                inbound_id: selectedPackage.inbound_id,
                vless_template: selectedPackage.template
            };

            connectionDetails.innerHTML = `
                <p><strong>Connection:</strong> ${selectedConnection.name}</p>
                <p><strong>Package:</strong> ${selectedConnection.packageName}</p>
            `;
            orderModal.show();
        }


        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedConnection) {
                alert('No connection selected.');
                return;
            }

            const formData = new FormData(orderForm);
            const orderData = {
                connection_id: selectedConnection.id,
                inbound_id: selectedConnection.inbound_id,
                name: formData.get('name'),
                email: formData.get('email'),
                remark: formData.get('remark'),
                vless_template: selectedConnection.vless_template
            };
            
            const submitBtn = orderForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Creating...';

            try {
                const response = await apiFetch('/api/order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(orderData),
                });

                const result = await response.json();

                if (response.ok) {
                    document.getElementById('vless-link').value = result.vlessLink;
                    document.getElementById('order-result').classList.remove('d-none');
                    orderForm.classList.add('d-none');
                } else {
                    throw new Error(result.message || 'Failed to create order');
                }
            } catch (error) {
                console.error('Order submission error:', error);
                alert(`Error: ${error.message}`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Create VLESS Link';
            }
        });
        
        document.getElementById('copy-link-btn').addEventListener('click', () => {
            const vlessLink = document.getElementById('vless-link');
            vlessLink.select();
            vlessLink.setSelectionRange(0, 99999); 
            try {
                document.execCommand('copy');
                const copyBtn = document.getElementById('copy-link-btn');
                copyBtn.innerText = 'Copied!';
                setTimeout(() => {
                    copyBtn.innerText = 'Copy Link';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy the link.');
            }
        });

        document.getElementById('orderModal').addEventListener('hidden.bs.modal', () => {
            orderForm.reset();
            orderForm.classList.remove('d-none');
            document.getElementById('order-result').classList.add('d-none');
            document.getElementById('vless-link').value = '';
        });

        fetchConnections();
    }
    
    const updateNavUI = (isLoggedIn) => {
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

    const saveSession = (data) => {
        localStorage.setItem("nexguard_token", data.token);
        localStorage.setItem("nexguard_user", JSON.stringify(data.user));
        userSession = data.user;
        updateNavUI(true);
    };

    const clearSession = () => {
        localStorage.removeItem("nexguard_token");
        localStorage.removeItem("nexguard_user");
        userSession = null;
        updateNavUI(false);
        navigateTo("/home");
    };

    const loadSession = () => {
        const token = localStorage.getItem("nexguard_token");
        const user = localStorage.getItem("nexguard_user");
        if (token && user) {
            try {
                userSession = JSON.parse(user);
                updateNavUI(true);
            } catch (error) {
                console.error('Error parsing user session data from localStorage:', error);
                clearSession();
            }
        } else {
            userSession = null;
            updateNavUI(false);
        }
    };

    document.addEventListener("click", (e) => {
        if (e.target.id === "logout-btn-desktop" || e.target.id === "logout-btn-mobile") {
            clearSession();
        }
    });

    const openSidebar = () => {
        body.classList.add("sidebar-open");
        sidebar.classList.remove("-translate-x-full");
        overlay.classList.remove("opacity-0", "pointer-events-none");
    };

    const closeSidebar = () => {
        body.classList.remove("sidebar-open");
        sidebar.classList.add("-translate-x-full");
        overlay.classList.add("opacity-0", "pointer-events-none");
    };

    hamburgerBtn.addEventListener("click", openSidebar);
    overlay.addEventListener("click", closeSidebar);
    document.querySelectorAll("#mobile-nav a").forEach((link) => link.addEventListener("click", closeSidebar));

    const initAnimations = () => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });
        document.querySelectorAll(".reveal").forEach((el) => {
            observer.observe(el);
        });
        document.querySelectorAll(".card").forEach((card) => {
            card.addEventListener("mousemove", (e) => {
                const rect = card.getBoundingClientRect();
                card.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
                card.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
            });
        });
    };


    const qrModal = document.getElementById("qr-modal");
    const qrModalContent = document.getElementById("modal-qr-code");
    const qrModalCloseBtn = document.getElementById("qr-modal-close-btn");
    const qrModalConnectionName = document.getElementById("modal-connection-name");
    const showQrModal = (qrDataUrl, connectionName) => {
        qrModalContent.innerHTML = "";
        const img = document.createElement("img");
        img.src = qrDataUrl;
        qrModalContent.appendChild(img);
        qrModalConnectionName.textContent = connectionName;
        qrModal.style.display = "flex";
        body.classList.add("modal-open");
    };

    const closeQrModal = () => {
        qrModal.style.display = "none";
        body.classList.remove("modal-open");
    };

    qrModalCloseBtn?.addEventListener("click", closeQrModal);
    qrModal?.addEventListener("click", (e) => {
        if (e.target === qrModal) closeQrModal();
    });

    const togglePassword = (inputId, toggleId) => {
        const passwordInput = document.getElementById(inputId);
        const toggleIcon = document.getElementById(toggleId);
        if (passwordInput && toggleIcon) {
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                toggleIcon.classList.remove("fa-eye");
                toggleIcon.classList.add("fa-eye-slash");
            } else {
                passwordInput.type = "password";
                toggleIcon.classList.remove("fa-eye-slash");
                toggleIcon.classList.add("fa-eye");
            }
        }
    };

    function showToast({ title, message, type = "info", duration = 5000 }) {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }

        const icons = {
            success: "fa-solid fa-check-circle",
            error: "fa-solid fa-times-circle",
            warning: "fa-solid fa-exclamation-triangle",
            info: "fa-solid fa-info-circle",
        };
        const iconClass = icons[type] || icons.info;

        const toast = document.createElement("div");
        toast.className = `toast toast--${type}`;

        toast.innerHTML = `
            <div class="toast-icon">
                <i class="${iconClass}"></i>
            </div>
            <div class="toast-content">
                <p class="toast-title">${title}</p>
                <p class="toast-message">${message}</p>
            </div>
            <button class="toast-close-btn" type="button">&times;</button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("show");
        }, 100);

        const removeToast = () => {
            clearTimeout(dismissTimeout);
            toast.classList.remove("show");
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 500);
        };

        const dismissTimeout = setTimeout(removeToast, duration);
        toast
            .querySelector(".toast-close-btn")
            .addEventListener("click", removeToast);
    }

    function showChoiceModal({ title, message, option1Text, option2Text }) {
        return new Promise((resolve) => {
            const modalId = `choice-modal-${Date.now()}`;
            const modalHtml = `
                <div id="${modalId}" class="fixed inset-0 bg-black/80 justify-center items-center z-[101] flex p-4" style="display: flex;">
                    <div class="glass-panel p-6 rounded-lg max-w-sm w-full text-center reveal is-visible relative">
                        <button id="${modalId}-close" class="absolute top-3 right-4 text-gray-400 hover:text-white text-3xl">&times;</button>
                        <h3 class="text-xl font-bold text-white font-['Orbitron'] mb-3">${title}</h3>
                        <div class="text-gray-300 text-sm mb-6">${message}</div>
                        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <button id="${modalId}-opt1" class="ai-button rounded-lg">${option1Text}</button>
                            <button id="${modalId}-opt2" class="ai-button secondary rounded-lg">${option2Text}</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            const modalElement = document.getElementById(modalId);
            const opt1Button = document.getElementById(`${modalId}-opt1`);
            const opt2Button = document.getElementById(`${modalId}-opt2`);
            const closeButton = document.getElementById(`${modalId}-close`);

            const closeModal = (choice) => {
                modalElement.remove();
                resolve(choice);
            };

            opt1Button.addEventListener('click', () => closeModal('option1'));
            opt2Button.addEventListener('click', () => closeModal('option2'));
            closeButton.addEventListener('click', () => closeModal(null));
        });
    }

    function showPlanSelectorModal(activePlans) {
        return new Promise((resolve) => {
            const modalId = `plan-selector-modal-${Date.now()}`;
            const options = activePlans.map((p, index) => `<option value="${index}">${p.v2rayUsername}</option>`).join('');

            const modalHtml = `
                <div id="${modalId}" class="fixed inset-0 bg-black/80 justify-center items-center z-[101] flex p-4" style="display: flex;">
                    <div class="glass-panel p-6 rounded-lg max-w-sm w-full text-center reveal is-visible relative">
                        <button id="${modalId}-close" class="absolute top-3 right-4 text-gray-400 hover:text-white text-3xl">&times;</button>
                        <h3 class="text-xl font-bold text-white font-['Orbitron'] mb-3">Select a Plan to Renew</h3>
                        <div class="mb-8">
                            <select id="multi-plan-selector" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">${options}</select>
                        </div>
                        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <button id="${modalId}-opt1" class="ai-button rounded-lg">Continue</button>
                            <button id="${modalId}-opt2" class="ai-button secondary rounded-lg">Cancel</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            const modalElement = document.getElementById(modalId);
            const opt1Button = document.getElementById(`${modalId}-opt1`);
            const opt2Button = document.getElementById(`${modalId}-opt2`);
            const closeButton = document.getElementById(`${modalId}-close`);
            const selector = document.getElementById('multi-plan-selector');

            const closeModal = (choice) => {
                let selectedPlan = null;
                if (choice === 'option1') {
                    const selectedIndex = selector.value;
                    selectedPlan = activePlans[selectedIndex];
                }
                modalElement.remove();
                resolve(selectedPlan); 
            };

            opt1Button.addEventListener('click', () => closeModal('option1'));
            opt2Button.addEventListener('click', () => closeModal(null));
            closeButton.addEventListener('click', () => closeModal(null));
        });
    }

    function renderHomePage(renderFunc) {
        renderFunc(`
            <div class="page" id="page-home">
                <div class="text-center py-10 md:py-16 px-4 reveal">
                    <h1 class="text-4xl md:text-5xl font-black text-white leading-tight" style="font-family: 'Orbitron', sans-serif;">
                        Experience <span class="gradient-text">True Internet Freedom</span>
                        <span class="block text-3xl md:text-4xl mt-2">in Sri Lanka.</span>
                    </h1>
                    <p class="max-w-3xl mx-auto mt-5 text-base md:text-lg text-gray-300">
                        Blazing fast, ultra-secure V2Ray connections designed for seamless streaming, gaming, and browsing. Unleash the full potential of your internet with NexGuard.
                    </p>
                    <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <a href="/plans" class="nav-link-internal ai-button rounded-lg">View Plans <i class="fa-solid fa-arrow-right ml-2"></i></a>
                        <a href="/about?scroll=contact-section" class="nav-link-internal ai-button secondary rounded-lg"><i class="fa-solid fa-headset mr-2"></i> Contact Us</a>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                    <div class="card reveal glass-panel p-5 rounded-xl text-center"><i class="fa-solid fa-bolt text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">Unmatched Speed</h3><p class="text-gray-400 mt-2 text-sm">Optimized servers for Sri Lankan networks for the lowest latency and highest speeds.</p></div>
                    <div class="card reveal glass-panel p-5 rounded-xl text-center"><i class="fa-solid fa-shield-halved text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">Rock-Solid Security</h3><p class="text-gray-400 mt-2 text-sm">Advanced V2Ray protocols to keep your online activities private and secure.</p></div>
                    <div class="card reveal glass-panel p-5 rounded-xl text-center"><i class="fa-solid fa-headset text-2xl gradient-text mb-3"></i><h3 class="text-lg font-bold text-white">24/7 Support</h3><p class="text-gray-400 mt-2 text-sm">Dedicated support team available via WhatsApp and Telegram to assist you.</p></div>
                </div>
                <div class="mt-20 flex flex-col lg:flex-row items-center gap-8 lg:gap-12 reveal">
                    <div class="lg:w-1/2">
                        <img src="/assets/image.jpg" alt="V2Ray on a laptop" class="rounded-xl shadow-2xl shadow-purple-500/20 w-full h-auto object-cover">
                    </div>
                    <div class="w-full lg:w-1/2 text-center lg:text-left px-4">
                        <h2 class="text-2xl md:text-3xl font-bold text-white mb-4">How to Get Started?</h2>
                        <p class="text-gray-300 mb-6 text-sm md:text-base">Connecting is simple. Just follow these three easy steps to unlock true internet freedom.</p>
                        <div class="space-y-4">
                            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center font-bold text-purple-300">1</div>
                                <div>
                                    <h3 class="font-semibold text-white text-left sm:text-left">Choose a Plan</h3>
                                    <p class="text-gray-400 text-sm text-left sm:text-left">Select a data plan that fits your needs and pick your internet provider (ISP).</p>
                                </div>
                            </div>
                            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center font-bold text-purple-300">2</div>
                                <div>
                                    <h3 class="font-semibold text-white text-left sm:text-left">Make the Payment</h3>
                                    <p class="text-gray-400 text-sm text-left sm:text-left">Complete the payment via bank transfer and submit the receipt through our checkout page.</p>
                                </div>
                            </div>
                            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center font-bold text-purple-300">3</div>
                                <div>
                                    <h3 class="font-semibold text-white text-left sm:text-left">Get Approved & Connect</h3>
                                    <p class="text-gray-400 text-sm text-left sm:text-left">Your order will be approved by an admin. You'll receive the config link via WhatsApp to connect!</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`);
    }

    function displayUserData(data, name, container) {
        const down = data.down || 0,
            up = data.up || 0,
            totalUsed = down + up,
            totalQuota = data.total || 0;
        const usagePercentage = totalQuota > 0 ? Math.min((totalUsed / totalQuota) * 100, 100) : 0;
        const status = data.enable ? `<span class="font-semibold text-green-400">ONLINE</span>` : `<span class="font-semibold text-red-400">OFFLINE</span>`;
        let expiry = 'N/A';
        if (data.expiryTime && data.expiryTime > 0) {
            const expDate = new Date(data.expiryTime);
            expiry = new Date() > expDate ? `<span class="font-semibold text-red-400">Expired</span>` : expDate.toLocaleDateString('en-CA');
        }

        const html = `
            <div class="result-card p-4 sm:p-6 glass-panel rounded-xl space-y-5 reveal is-visible">
                <div class="flex justify-between items-center pb-3 border-b border-white/10">
                    <h3 class="text-lg font-semibold text-white flex items-center min-w-0">
                        <i class="fa-solid fa-satellite-dish mr-3 text-purple-400 flex-shrink-0"></i>
                        <span class="truncate" title="${name}">Client: ${name}</span>
                    </h3>
                    <div>${status}</div>
                </div>
                ${totalQuota > 0 ? `<div class="space-y-2"><div class="flex justify-between items-baseline text-sm"><span class="font-medium text-gray-300">Data Quota Usage</span><span id="usage-percentage" class="font-bold text-white">0%</span></div><div class="w-full bg-black/30 rounded-full h-2.5"><div class="progress-bar-inner bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-2.5 rounded-full" style="width: ${usagePercentage}%"></div></div></div>` : ''}
                
                <div class="space-y-4 text-sm sm:hidden">
                    <div class="flex justify-between items-center border-b border-white/10 pb-3">
                        <div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-down text-sky-400 text-lg w-5 text-center"></i><span>Download</span></div>
                        <p id="download-value-mobile" class="font-semibold text-white text-base">0 B</p>
                    </div>
                    <div class="flex justify-between items-center border-b border-white/10 pb-3">
                        <div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-circle-up text-violet-400 text-lg w-5 text-center"></i><span>Upload</span></div>
                        <p id="upload-value-mobile" class="font-semibold text-white text-base">0 B</p>
                    </div>
                    <div class="flex justify-between items-center border-b border-white/10 pb-3">
                        <div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-database text-green-400 text-lg w-5 text-center"></i><span>Total Used</span></div>
                        <p id="total-usage-value-mobile" class="font-semibold text-white text-base">0 B</p>
                    </div>
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3 text-gray-300"><i class="fa-solid fa-calendar-xmark text-red-400 text-lg w-5 text-center"></i><span>Expires On</span></div>
                        <p class="font-medium text-white text-base">${expiry}</p>
                    </div>
                </div>

                <div class="hidden sm:grid sm:grid-cols-2 gap-4 text-sm">
                    <div class="bg-black/20 rounded-lg p-4">
                        <div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-down text-sky-400 mr-2"></i><span>Download</span></div>
                        <p id="download-value-desktop" class="text-2xl font-bold text-white mt-1">0 B</p>
                    </div>
                    <div class="bg-black/20 rounded-lg p-4">
                        <div class="flex items-center text-gray-400"><i class="fa-solid fa-circle-up text-violet-400 mr-2"></i><span>Upload</span></div>
                        <p id="upload-value-desktop" class="text-2xl font-bold text-white mt-1">0 B</p>
                    </div>
                    <div class="bg-black/20 rounded-lg p-4">
                        <div class="flex items-center text-gray-400"><i class="fa-solid fa-database text-green-400 mr-2"></i><span>Total Used</span></div>
                        <p id="total-usage-value-desktop" class="text-2xl font-bold text-white mt-1">0 B</p>
                    </div>
                    <div class="bg-black/20 rounded-lg p-4">
                        <div class="flex items-center text-gray-400"><i class="fa-solid fa-calendar-xmark text-red-400 mr-2"></i><span>Expires On</span></div>
                        <p class="text-xl font-medium text-white mt-1">${expiry}</p>
                    </div>
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
                    const k = 1024,
                        s = ['B', 'KB', 'MB', 'GB', 'TB'];
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

    function renderUsagePage(renderFunc) {
        renderFunc(`
            <div class="page" id="page-usage">
                <main class="w-full max-w-md space-y-8 z-10 mx-auto">
                    <header class="text-center space-y-2 reveal is-visible">
                        <i class="fa-solid fa-microchip text-5xl gradient-text"></i>
                        <h1 class="text-3xl sm:text-4xl font-bold text-white" style="font-family: 'Orbitron', sans-serif;">NexGuard <span class="gradient-text">LK</span></h1>
                        <p class="text-gray-400">Enter client identifier for real-time usage matrix.</p>
                    </header>

                    <form id="usage-form" class="space-y-6 reveal is-visible">
                        <div class="form-group">
                            <input type="text" id="username" name="username" class="form-input" placeholder=" " required="">
                            <label for="username" class="form-label">Enter Username</label>
                            <span class="focus-border"><i></i></span>
                        </div>
                        <button type="submit" class="ai-button w-full">
                            <span class="button-text"><i class="fa-solid fa-magnifying-glass-chart mr-2"></i>ANALYZE USAGE</span>
                        </button>
                    </form>

                    <div id="result" class="mt-8"></div>
                    
                    <div id="how-to-find-link-container" class="text-center pt-0 reveal is-visible">
                        <span id="open-help-modal-link" class="text-purple-400 text-sm cursor-pointer hover:underline ">
                            How to find your username?
                        </span>
                    </div>
                </main>

                <div id="help-modal" class="help-modal-overlay">
                    <div class="help-modal-content glass-panel rounded-lg p-6 space-y-4 w-full max-w-md">
                        <div class="flex justify-between items-start">
                            <div>
                                <h2 class="text-xl font-bold text-white font-['Orbitron']">Help & Support Matrix</h2>
                                <button id="lang-toggle-btn" class="text-xs text-purple-400 hover:underline mt-1">English / සිංහල</button>
                            </div>
                            <button id="help-modal-close" class="text-gray-400 hover:text-white text-3xl">&times;</button>
                        </div>
                        <div class="lang-content lang-en">
                            <div>
                                <h3 class="text-lg font-semibold text-purple-400 mb-2">How to find your Username?</h3>
                                <p class="text-gray-300 text-sm mb-4">Your username is the name assigned to your V2ray configuration. It's often visible in your V2ray client app, usually next to the server connection name.</p>
                            </div>
                        </div>
                        <div class="lang-content lang-si hidden">
                            <div>
                                <h3 class="text-lg font-semibold text-purple-400 mb-2">ඔබගේ Username එක සොයාගන්නේ කෙසේද?</h3>
                                <p class="text-gray-300 text-sm mb-4">ඔබගේ username යනු V2ray config ගොනුවට ලබා දී ඇති නමයි. එය බොහෝවිට V2ray client ඇප් එකේ, server සම්බන්ධතාවය අසල දිස්වේ.</p>
                            </div>
                        </div>
                        <div class="bg-black/50 border border-white/10 rounded-lg p-2">
                            <img src="/assets/help.jpg" alt="Example image of where to find the username" class="rounded w-full h-auto">
                        </div>
                    </div>
                </div>
            </div>
        `);

        setTimeout(() => {
            const usageForm = document.getElementById('usage-form');
            if (usageForm) {
                usageForm.addEventListener('submit', async e => {
                    e.preventDefault();
                    const submitButton = usageForm.querySelector('button');
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
                                resultDiv.innerHTML = `<div class="p-4 text-center text-amber-400 glass-panel rounded-lg flex flex-col items-center gap-3"><i class="fa-solid fa-user-slash text-2xl"></i><div><p class="font-semibold">This client name does not exist.`;
                            } else if (res.status === 503) {
                                const errorData = await res.json();
                                resultDiv.innerHTML = `<div class="p-4 text-center text-blue-400 glass-panel rounded-lg">${errorData.message || 'Session renewed. Please try again.'}</div>`;
                            } else {
                                const errorResult = await res.json();
                                resultDiv.innerHTML = `<div class="p-4 text-center text-amber-400 glass-panel rounded-lg">${errorResult.message || `Server error: ${res.status}`}</div>`;
                            }
                            return; 
                        }

                        const result = await res.json();
                        
                        if (result.success) {
                            displayUserData(result.data, username, resultDiv);
                            howToFindLinkContainer.classList.add('hidden'); 
                            usageForm.reset();
                        } else {
                            resultDiv.innerHTML = `<div class="p-4 text-center text-amber-400 glass-panel rounded-lg">${result.message || 'Could not retrieve user data.'}</div>`;
                            howToFindLinkContainer.classList.remove('hidden');
                        }

                    } catch (err) {
                        console.error(err);
                        resultDiv.innerHTML = `<div class="p-4 text-center text-red-400 glass-panel rounded-lg">An error occurred. Please try again later.</div>`;
                        howToFindLinkContainer.classList.remove('hidden');
                    } finally {
                        submitButton.disabled = false;
                        buttonText.innerHTML = `<i class="fa-solid fa-magnifying-glass-chart mr-2"></i>ANALYZE USAGE`;
                    }
                });
            }

            const openHelpModalLink = document.getElementById('open-help-modal-link');
            const helpModal = document.getElementById('help-modal');
            const helpModalCloseBtn = document.getElementById('help-modal-close');
            const langToggleBtn = document.getElementById('lang-toggle-btn');

            if (openHelpModalLink && helpModal && helpModalCloseBtn) {
                const openModal = () => {
                    helpModal.classList.add('visible');
                    document.body.classList.add('modal-open');
                };

                const closeModal = () => {
                    helpModal.classList.remove('visible');
                    document.body.classList.remove('modal-open');
                };

                openHelpModalLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    openModal();
                });
                
                helpModalCloseBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    closeModal();
                });
                
                helpModal.addEventListener('click', (event) => {
                    if (event.target === helpModal) {
                        closeModal();
                    }
                });

                document.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape' && helpModal.classList.contains('visible')) {
                        closeModal();
                    }
                });

                if (langToggleBtn) {
                    langToggleBtn.addEventListener('click', () => {
                        const langEn = document.querySelector('.lang-content.lang-en');
                        const langSi = document.querySelector('.lang-content.lang-si');
                        
                        if (langEn && langSi) {
                            langEn.classList.toggle('hidden');
                            langSi.classList.toggle('hidden');
                        }
                    });
                }
            }
            
        }, 100);
    }
    
    // START: ALL FUNCTIONS BELOW ARE UPDATED FOR "CHANGE PLAN" & UNIFIED BUTTONS

    function renderPlanChoicePage(renderFunc, activePlans) {
        renderFunc(`
            <div id="page-plan-choice" class="page">
                <header class="text-center mb-10 reveal">
                    <h2 class="text-2xl font-bold text-white">Choose Your Path</h2>
                    <p class="text-gray-400 mt-2">You have an active plan. What would you like to do next?</p>
                </header>
                <div id="choice-container" class="flex flex-col sm:flex-row items-center justify-center gap-6">
                    <div id="renew-choice-card" class="card reveal selectable glass-panel p-6 rounded-xl text-center flex flex-col items-center justify-center w-full sm:w-72 cursor-pointer">
                        <i class="fa-solid fa-arrows-rotate text-3xl gradient-text mb-3"></i>
                        <h3 class="text-lg font-bold text-white">Renew / Change Plan</h3>
                        <p class="text-gray-400 mt-1 text-xs">Renew your existing plan or upgrade to a new one.</p>
                    </div>
                    <div id="buy-new-choice-card" class="card reveal selectable glass-panel p-6 rounded-xl text-center flex flex-col items-center justify-center w-full sm:w-72 cursor-pointer">
                        <i class="fa-solid fa-plus text-3xl gradient-text mb-3"></i>
                        <h3 class="text-lg font-bold text-white">Buy a New Plan</h3>
                        <p class="text-gray-400 mt-1 text-xs">Purchase a completely separate, additional plan.</p>
                    </div>
                </div>
            </div>
        `);

        // Event Listeners for the new cards
        document.getElementById('renew-choice-card')?.addEventListener('click', () => {
            handleRenewalChoice(activePlans);
        });
        document.getElementById('buy-new-choice-card')?.addEventListener('click', () => {
            // Navigate to plans page, forcing it to show the plan list
            navigateTo('/plans?new=true');
        });
    }

    async function handleRenewalChoice(activePlans, specificPlan = null) {
        let planToRenew = specificPlan;

        if (!specificPlan && activePlans.length > 1) {
            const chosenPlan = await showPlanSelectorModal(activePlans);
            if (chosenPlan) {
                planToRenew = chosenPlan; 
            } else {
                return; 
            }
        }
        
        if (!planToRenew && activePlans.length === 1) {
             planToRenew = activePlans[0];
        }

        if (planToRenew) {
            const choice = await showChoiceModal({
                title: `Renew: ${planToRenew.v2rayUsername}`,
                message: `Do you want to renew your current '${planToRenew.planId}' plan or change to a different one?`,
                option1Text: 'Renew Current Plan',
                option2Text: 'Change Plan'
            });

            if (choice === 'option1') { // Renew Current Plan
                const checkoutUrl = `/checkout?planId=${planToRenew.planId}&connId=${encodeURIComponent(planToRenew.connId)}&renew=${encodeURIComponent(planToRenew.v2rayUsername)}`;
                navigateTo(checkoutUrl);
            } else if (choice === 'option2') { // Change Plan
                navigateTo(`/plans?change=${encodeURIComponent(planToRenew.v2rayUsername)}`);
            }
        }
    }

    function renderPlansPage(renderFunc, params) {
        const userToChange = params.get("change");
        const changeQuery = userToChange ? `&change=${encodeURIComponent(userToChange)}` : '';

        let plansHtml = Object.entries(appData.plans)
            .map(
                ([key, plan]) => `
                <div class="card reveal glass-panel p-5 rounded-xl text-center flex flex-col">
                    <h3 class="text-xl font-bold gradient-text">${plan.name}</h3>
                    <p class="text-3xl font-bold my-3">LKR. ${
                        plan.price
                    }<span class="text-base font-normal text-gray-400">/ month</span></p>
                    <ul class="space-y-2 text-gray-300 text-sm text-left my-4 flex-grow">${plan.features
                        .map(
                            (f) =>
                                `<li><i class="fa-solid fa-check text-green-400 mr-2"></i>${f}</li>`
                        )
                        .join("")}</ul>
                    <a href="/connections?planId=${key}${changeQuery}" class="nav-link-internal mt-6 inline-block ai-button rounded-lg">Select Plan</a>
                </div>`
            )
            .join("");
        renderFunc(`
            <div id="page-plans" class="page">
                <header class="text-center mb-10 reveal">
                    <h2 class="text-2xl font-bold text-white">${userToChange ? 'Select Your New Plan' : 'Our V2Ray Plans'}</h2>
                    <p class="text-gray-400 mt-2">${userToChange ? `You are changing the plan for ${userToChange}` : 'Step 1: Choose your desired data package.'}</p>
                </header>
                <div id="plans-container" class="grid grid-cols-1 md:grid-cols-3 gap-6">${plansHtml}</div>
            </div>`);
    }

    function renderConnectionsPage(renderFunc, params) {
        const planId = params.get("planId");
        const userToChange = params.get("change");
        const changeQuery = userToChange ? `&change=${encodeURIComponent(userToChange)}` : '';

        if (!planId || !appData.plans[planId]) {
            renderFunc('<div class="page text-center"><p class="text-red-400">Invalid plan selection.</p><a href="/plans" class="nav-link-internal underline mt-2">Go back to plans</a></div>');
            return;
        }

        let connectionsHtml = dynamicConnections.length > 0
            ? dynamicConnections.map(conn => {
                let linkUrl = '';
                let packageInfoHtml = '';

                if (conn.requires_package_choice) {
                    linkUrl = `/package-choice?planId=${planId}&connId=${encodeURIComponent(conn.name)}${changeQuery}`;
                    
                    let packageCount = conn.package_options ? conn.package_options.length : 0;
                    
                    packageInfoHtml = `<p class="text-xs text-purple-300 mt-2 font-semibold">${packageCount} Packages Available</p>`;

                } else {
                    linkUrl = `/checkout?planId=${planId}&connId=${encodeURIComponent(conn.name)}&pkg=${encodeURIComponent(conn.default_package || '')}&inboundId=${conn.default_inbound_id}&vlessTemplate=${encodeURIComponent(conn.default_vless_template)}${changeQuery}`;
                    
                    if (conn.default_package) {
                        packageInfoHtml = `<p class="text-xs text-purple-300 mt-2 font-semibold">${conn.default_package}</p>`;
                    } else {
                        packageInfoHtml = `<p class="text-xs text-purple-300 mt-2 font-semibold">Standard Connection</p>`;
                    }
                }
                
                return `<a href="${linkUrl}" class="nav-link-internal card reveal selectable glass-panel p-5 rounded-xl text-center flex flex-col items-center justify-center w-full sm:w-64">
                            <i class="${conn.icon || 'fa-solid fa-wifi'} text-3xl gradient-text mb-3"></i>
                            <h3 class="text-lg font-bold text-white mb-2">${conn.name}</h3>
                            ${packageInfoHtml}
                        </a>`;
            }).join("")
            : '<div class="text-amber-400 text-center col-span-full"><p>No connection types are currently available. Please check back later.</p></div>';

        renderFunc(`
            <div id="page-connections" class="page">
                <header class="text-center mb-10 reveal">
                    <h2 class="text-2xl font-bold text-white">Select Your Connection</h2>
                    <p class="text-gray-400 mt-2">Step 2: Choose your ISP.</p>
                </header>
                <div class="flex flex-wrap items-center justify-center gap-6">${connectionsHtml}</div>
                <div class="text-center mt-8 reveal"><a href="/plans${changeQuery}" class="nav-link-internal text-purple-400 hover:text-white transition-colors"><i class="fa-solid fa-arrow-left mr-2"></i>Back to Plans</a></div>
            </div>`);
    }

    function renderPackageChoicePage(renderFunc, params) {
        const planId = params.get("planId");
        const connId = decodeURIComponent(params.get("connId"));
        const userToChange = params.get("change");
        const changeQuery = userToChange ? `&change=${encodeURIComponent(userToChange)}` : '';
        
        const conn = dynamicConnections.find(c => c.name === connId);

        if (!planId || !conn || !conn.package_options) {
            navigateTo(`/plans${changeQuery}`);
            return;
        }

        let choiceHtml = conn.package_options.map((option) => {
            const encodedOptionName = encodeURIComponent(option.name);
            const encodedTemplate = encodeURIComponent(option.template);
            return `<a href="/checkout?planId=${planId}&connId=${encodeURIComponent(connId)}&pkg=${encodedOptionName}&inboundId=${option.inbound_id}&vlessTemplate=${encodedTemplate}${changeQuery}" class="nav-link-internal card reveal selectable glass-panel p-8 rounded-xl text-center flex flex-col items-center justify-center">
                <i class="fa-solid fa-box-open text-3xl gradient-text mb-3"></i>
                <h3 class="text-lg font-bold text-white">${option.name}</h3>
            </a>`;
        }).join("");

        renderFunc(`
            <div id="page-package-choice" class="page">
                <header class="text-center mb-10 reveal">
                    <h2 class="text-2xl font-bold text-white">Select Your Add-On Package</h2>
                    <p class="text-gray-400 mt-2">Step 2.5: Choose the required package for your ${conn.name} connection.</p>
                </header>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">${choiceHtml}</div>
                <div class="text-center mt-8 reveal">
                    <a href="/connections?planId=${planId}${changeQuery}" class="nav-link-internal text-purple-400 hover:text-white transition-colors"><i class="fa-solid fa-arrow-left mr-2"></i>Back to Connections</a>
                </div>
            </div>`);
    }

    function renderCheckoutPage(renderFunc, params) {
        const user = JSON.parse(localStorage.getItem("nexguard_user"));
        if (!user) {
            navigateTo("/login");
            return;
        }

        const planId = params.get("planId");
        const connId = decodeURIComponent(params.get("connId"));
        const pkg = decodeURIComponent(params.get("pkg") || "");
        const plan = appData.plans[planId];
        const conn = dynamicConnections.find(c => c.name === connId);

        const userToRenew = params.get("renew");
        const userToChange = params.get("change");
        const isRenewal = !!userToRenew;
        const isChange = !!userToChange;

        const formActionType = isChange ? 'Change Plan' : (isRenewal ? 'Renew Your Plan' : 'Final Step: Checkout');
        
        let summaryHtml;
        if (plan && conn) {
            const finalPackageNameWithPrice = pkg || conn.default_package || '';
            const planPrice = plan.price;
            const cleanPackageName = finalPackageNameWithPrice.split(' - LKR')[0];

            let purchaseInfo = `<p>You are purchasing the <strong class="text-purple-400">${plan.name}</strong> for <strong class="text-purple-400">${conn.name}</strong>.</p>`;
            
            let packageInfo = '';
            if (cleanPackageName) {
                packageInfo = `<div class="text-center"><p class="text-sm m-0"><span class="text-gray-300">Selected Package:</span> <span class="font-semibold text-amber-400">${cleanPackageName} - LKR ${planPrice}</span></p></div>`;
            }

            let renewalInfo = '';
            if (isRenewal) {
                renewalInfo = `<p class="mt-2 text-center">You are renewing for V2Ray user: <strong class="text-purple-400">${userToRenew}</strong>.</p>`;
            }
            
            let changeInfo = '';
            if (isChange) {
                changeInfo = `<p class="mt-2 text-center text-amber-400">You are changing the plan for: <strong class="text-white">${userToChange}</strong>. The old plan will be deleted upon approval.</p>`;
                purchaseInfo = `<p>You are changing to the <strong class="text-purple-400">${plan.name}</strong> for <strong class="text-purple-400">${conn.name}</strong>.</p>`;
            }
            
            summaryHtml = purchaseInfo + packageInfo + renewalInfo + changeInfo;

        } else {
            summaryHtml = `<p class="text-red-400 text-center">Invalid selection. Please <a href="/plans" class="nav-link-internal underline">start over</a>.</p>`;
        }

        renderFunc(`
            <style>
              .renewal-username-field[readonly] { background-color: rgba(30, 41, 59, 0.5); color: #9ca3af; cursor: not-allowed; }
              .renewal-username-field[readonly]:focus ~ .focus-border:before,
              .renewal-username-field[readonly]:focus ~ .focus-border:after { width: 0; }
              .renewal-username-field[readonly]:focus ~ .focus-border i:before,
              .renewal-username-field[readonly]:focus ~ .focus-border i:after { height: 0; }
              .renewal-username-field[readonly]:focus ~ .form-label { color: #9ca3af; }
            </style>
            <div id="page-checkout" class="page">
                <div class="w-full max-w-sm mx-auto glass-panel rounded-xl p-6 reveal">
                    <div id="checkout-view">
                        <h2 class="text-xl font-bold text-center text-white mb-2">${formActionType}</h2>
                        <div id="checkout-summary" class="text-center mb-6 text-gray-300 text-sm space-y-2">${summaryHtml}</div>
                        <form id="checkout-form" class="space-y-4">
                            ${isRenewal ? `<input type="hidden" name="isRenewal" value="true">` : ""}
                            ${isChange ? `<input type="hidden" name="old_v2ray_username" value="${userToChange}">` : ''}

                            <div class="form-group ${isRenewal ? 'pb-2' : ''}">
                                <input type="text" id="checkout-username" name="username" class="form-input ${isRenewal ? 'renewal-username-field' : ''}" required placeholder=" " value="${isRenewal ? userToRenew : (isChange ? '' : user.username)}" ${isRenewal ? 'readonly' : ''}>
                                <label class="form-label">${isChange ? 'New V2Ray Username' : 'V2Ray Username'}</label><span class="focus-border"><i></i></span>
                                ${isRenewal ? '<p class="text-xs text-amber-400 mt-2 px-1">Username cannot be changed during renewal.</p>' : ''}
                            </div>
                            <div class="form-group">
                                <input type="text" name="whatsapp" id="checkout-whatsapp" class="form-input" required placeholder=" " value="${user.whatsapp}">
                                <label class="form-label">WhatsApp Number</label><span class="focus-border"><i></i></span>
                            </div>
                            <div>
                                <p class="text-gray-300 text-sm mb-2">Upload receipt:</p>
                                <div class="text-xs text-gray-400 mb-3 p-3 bg-black/20 rounded-lg border border-white/10 whitespace-pre-wrap">${appData.bankDetails}</div>
                                <input type="file" name="receipt" required class="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100" accept="image/*">
                            </div>
                            <button type="submit" class="ai-button w-full !mt-8 rounded-lg">SUBMIT FOR APPROVAL</button>
                        </form>
                    </div>
                    <div id="success-view" class="hidden text-center">
                        <i class="fas fa-check-circle text-5xl text-green-400 mb-4"></i>
                        <p class="text-lg text-green-400 font-semibold">Order Submitted!</p>
                        <p class="text-gray-300 mt-2 text-sm">Your order is pending approval. You can check the status on your profile.</p>

                        <p class="text-gray-300 mt-6 text-sm">
                            Join our WhatsApp group for the latest updates, support, and special offers!
                        </p>

                        <div class="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                            <a href="/profile?tab=orders" class="nav-link-internal ai-button rounded-lg">View My Orders</a>
                            <a href="https://chat.whatsapp.com/Jaw6FQbQINCE1eMGboSovH" target="_blank" class="ai-button secondary rounded-lg">
                                <i class="fa-brands fa-whatsapp mr-2"></i>Join Premium Group
                            </a>
                        </div>
                    </div>
                </div>
            </div>`);

        document.getElementById("checkout-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            formData.append("planId", params.get("planId"));
            formData.append("connId", params.get("connId"));
            formData.append("inboundId", params.get("inboundId"));
            formData.append("vlessTemplate", params.get("vlessTemplate"));
            if (params.get("pkg")) {
                formData.append("pkg", params.get("pkg"));
            }

            document.querySelector('#checkout-view button[type="submit"]').disabled = true;
            document.querySelector('#checkout-view button[type="submit"]').textContent = "SUBMITTING...";

            const res = await apiFetch("/api/create-order", {
                method: "POST",
                headers: { Authorization: "Bearer " + localStorage.getItem("nexguard_token"), },
                body: formData,
            });
            if (res.ok) {
                document.getElementById("checkout-view").style.display = "none";
                document.getElementById("success-view").classList.remove("hidden");
            } else {
                const result = await res.json();
                alert(`Error: ${result.message}`);
                document.querySelector('#checkout-view button[type="submit"]').disabled = false;
                document.querySelector('#checkout-view button[type="submit"]').textContent = "SUBMIT FOR APPROVAL";
            }
        });
    }

const pageStyles = `
    <style>
      .renewal-username-field[readonly] {
        background-color: rgba(30, 41, 59, 0.5); 
        color: #9ca3af;
        cursor: not-allowed;
      }
      .renewal-username-field[readonly]:focus ~ .focus-border:before,
      .renewal-username-field[readonly]:focus ~ .focus-border:after {
        width: 0;
      }
      .renewal-username-field[readonly]:focus ~ .focus-border i:before,
      .renewal-username-field[readonly]:focus ~ .focus-border i:after {
        height: 0;
      }
      .renewal-username-field[readonly]:focus ~ .form-label {
        color: #9ca3af; 
      }
    </style>
`;


    function renderAboutPage(renderFunc) {
        renderFunc(`
            <div id="page-about" class="page">
                <div class="flex flex-col lg:flex-row gap-8">
                    <div class="flex-grow glass-panel p-8 rounded-lg space-y-5 reveal">
                        <h2 class="text-2xl font-bold">About NexGuard LK</h2>
                        <p class="text-gray-300 text-sm">NexGuard is dedicated to providing secure, fast, and reliable internet freedom in Sri Lanka. Our mission is to deliver top-tier V2Ray services that are both affordable and powerful.</p>
                        <div><h3 class="text-lg font-bold text-white mb-2"><i class="fa-solid fa-rocket text-purple-400 mr-2"></i> Our Mission</h3><p class="text-gray-300 text-sm">To democratize internet access by providing robust, uncensored, and private connectivity solutions to every Sri Lankan.</p></div>
                        <div><h3 class="text-lg font-bold text-white mb-2"><i class="fa-solid fa-server text-purple-400 mr-2"></i> Our Technology</h3><p class="text-gray-300 text-sm">We leverage cutting-edge V2Ray technology with advanced protocols like VLESS and VMess, coupled with optimized routing over Sri Lankan ISPs.</p></div>
                        <div class="pt-4 mt-4 border-t border-white/10">
                            <h3 class="text-lg font-bold text-white mb-3"><i class="fa-solid fa-star text-purple-400 mr-2"></i> Our Core Features</h3>
                            <div class="space-y-3 text-sm">
                                <p><i class="fa-solid fa-shield-virus text-green-400 w-5 text-center"></i> <strong>Strict No-Log Policy:</strong> Your privacy is paramount. We never track or store your online activity.</p>
                                <p><i class="fa-solid fa-mobile-screen-button text-green-400 w-5 text-center"></i> <strong>Multi-Device Support:</strong> Use your single account on your phone, laptop, and tablet simultaneously.</p>
                                <p><i class="fa-solid fa-bolt-lightning text-green-400 w-5 text-center"></i> <strong>Admin-Approved Setup:</strong> Your account is securely created and delivered after payment verification.</p>
                            </div>
                        </div>
                    </div>
                    <div class="lg:w-80 flex-shrink-0 reveal">
                        <div class="glass-panel p-6 rounded-2xl text-center sticky top-28 shadow-xl">
                            
                            <img src="/assets/ceo.jpg" alt="Nexguard Founder" class="w-24 h-24 rounded-full mx-auto border-4 border-purple-500 shadow-md">
                            
                            <h3 class="text-xl font-bold mt-4 text-white">Navindu R.</h3>
                            <p class="text-purple-400 text-sm font-medium">CEO & Founder</p>
                            
                            <p class="text-xs text-gray-300 mt-3 leading-relaxed">A passionate advocate for digital privacy, I founded <span class="text-purple-400 font-semibold">NexGuard</span> to bring world-class, unrestricted connectivity to Sri Lanka.</p>

                            <div class="mt-4 text-sm text-gray-300 space-y-3 text-left">
                                <p class="flex items-center gap-2"><i class="fas fa-map-marker-alt text-purple-400"></i> Based in Eheliyagoda, Sri Lanka</p>
                                <p class="flex items-center gap-2"><i class="fas fa-shield-alt text-purple-400"></i> 2+ Years in Networking & Cybersecurity</p>
                                <p class="flex items-center gap-2"><i class="fas fa-bullseye text-purple-400"></i> Mission: Empowering Digital Freedom</p>
                            </div>

                            <div class="flex justify-center space-x-5 mt-6">
                                <a href="https://wa.me/94770492554" target="_blank" class="text-green-400 hover:text-green-500 transition transform hover:scale-110"><i class="fab fa-whatsapp fa-lg"></i></a>
                                <a href="https://www.facebook.com/nexguardlk" target="_blank" class="text-blue-400 hover:text-blue-500 transition transform hover:scale-110"><i class="fab fa-facebook fa-lg"></i></a>
                                <a href="https://t.me/nexguardusagebot" target="_blank" class="text-gray-400 hover:text-redgray-500 transition transform hover:scale-110"><i class="fab fa-telegram fa-lg"></i></a>
                            </div>

                        </div>
                    </div>

                </div>
                <div id="contact-section" class="mt-20">
                    <header class="text-center mb-10 reveal"><h2 class="text-2xl font-bold text-white">Get In Touch</h2></header>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                        <a href="https://chat.whatsapp.com/DoErFmB8KSW6XLmjmJPWar" target="_blank" class="card reveal glass-panel p-5 rounded-xl text-center flex flex-col items-center justify-center"><i class="fa-brands fa-whatsapp text-3xl text-green-400 mb-3"></i><h3 class="text-lg font-bold text-white">WhatsApp</h3><p class="text-gray-400 mt-1 text-xs">Tap to chat for quick support.</p></a>
                        <a href="https://t.me/nexguardusagebot" target="_blank" class="card reveal glass-panel p-5 rounded-xl text-center flex flex-col items-center justify-center"><i class="fa-brands fa-telegram text-3xl text-sky-400 mb-3"></i><h3 class="text-lg font-bold text-white">Telegram</h3><p class="text-gray-400 mt-1 text-xs">Join our channel or contact our bot.</p></a>
                        <a href="mailto:navindu4000@gmail.com" class="card reveal glass-panel p-5 rounded-xl text-center flex flex-col items-center justify-center"><i class="fa-solid fa-envelope-open-text text-3xl text-red-400 mb-3"></i><h3 class="text-lg font-bold text-white">Email</h3><p class="text-gray-400 mt-1 text-xs">Send us an email for detailed inquiries.</p></a>
                    </div>
                </div>
            </div>`);
    }

    function renderPrivacyPage(renderFunc) {
        renderFunc(`
            <div id="page-privacy" class="page">
                <div class="glass-panel p-8 rounded-lg space-y-5 max-w-4xl mx-auto reveal">
                    <h2 class="text-2xl font-bold">Privacy & Refund Policy</h2>
                    <div>
                        <h3 class="text-lg font-bold text-white mb-2">Our Commitment to Privacy</h3>
                        <p class="text-gray-300 text-sm">Your privacy is critically important to us. We do not store logs of your online activity. We store account information only for service provision. We aim for full transparency on how we handle your data.</p>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-white mb-2">Information We Collect</h3>
                        <p class="text-gray-300 text-sm">We collect the bare minimum information to create and manage your account: your chosen username, WhatsApp number for support, and an encrypted password. We do not track the websites you visit.</p>
                    </div>
                    <div class="pt-4 border-t border-white/10">
                        <h3 class="text-xl font-bold">Refund Policy</h3>
                        <p class="text-gray-300 mt-2 text-sm">We offer a conditional refund for our V2Ray packages. You are eligible for a full refund under the following conditions:</p>
                        <ul class="list-disc list-inside text-gray-300 space-y-2 pl-4 mt-2 text-sm">
                            <li>The request must be made within <strong>2 days (48 hours)</strong> of the purchase.</li>
                            <li>Your total data usage must be less than <strong>10 GB</strong>.</li>
                        </ul>
                        <p class="font-semibold text-amber-400 mt-2 text-sm">If these conditions are not met, you will not be eligible for a refund.</p>
                    </div>
                </div>
            </div>`);
    }


    function renderProfilePage(renderFunc, params) {
    const user = JSON.parse(localStorage.getItem("nexguard_user"));
    if (!user) {
        navigateTo("/login");
        return;
    }

    const modalHtml = `
        <div id="help-modal" class="help-modal-overlay">
            <div class="help-modal-content glass-panel rounded-lg p-6 space-y-4 w-full max-w-md">
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-xl font-bold text-white font-['Orbitron']">Help & Support Matrix</h2>
                        <button id="lang-toggle-btn" class="text-xs text-purple-400 hover:underline mt-1">English / සිංහල</button>
                    </div>
                    <button id="help-modal-close" class="text-gray-400 hover:text-white text-3xl">&times;</button>
                </div>
                <div class="lang-content lang-en">
                    <div>
                        <h3 class="text-lg font-semibold text-purple-400 mb-2">How to find your Username?</h3>
                        <p class="text-gray-300 text-sm mb-4">Your username is the name assigned to your V2ray configuration. It's often visible in your V2ray client app, usually next to the server connection name.</p>
                    </div>
                </div>
                <div class="lang-content lang-si hidden">
                    <div>
                        <h3 class="text-lg font-semibold text-purple-400 mb-2">ඔබගේ Username එක සොයාගන්නේ කෙසේද?</h3>
                        <p class="text-gray-300 text-sm mb-4">ඔබගේ username යනු V2ray config ගොනුවට ලබා දී ඇති නමයි. එය බොහෝවිට V2ray client ඇප් එකේ, server සම්බන්ධතාවය අසල දිස්වේ.</p>
                    </div>
                </div>
                <div class="bg-black/50 border border-white/10 rounded-lg p-2">
                    <img src="/assets/help.jpg" alt="Example image of where to find the username" class="rounded w-full h-auto">
                </div>
            </div>
        </div>`;
    
    const pageStyles = `<style>#page-profile .form-input { height: 56px; padding: 20px 12px 8px 12px; background-color: rgba(0, 0, 0, 0.4); border-color: rgba(255, 255, 255, 0.2); } #page-profile .form-label { position: absolute; top: 50%; left: 13px; transform: translateY(-50%); color: #9ca3af; pointer-events: none; transition: all 0.2s ease-out; font-size: 14px; } #page-profile .form-input:focus ~ .form-label, #page-profile .form-input:not(:placeholder-shown) ~ .form-label { top: 10px; transform: translateY(0); font-size: 11px; color: var(--brand-purple); } #page-profile .form-input[readonly] { background-color: rgba(0,0,0,0.2); cursor: not-allowed; } .tab-btn { border-bottom: 3px solid transparent; transition: all .3s ease; color: #9ca3af; padding: 0.75rem 0.25rem; font-weight: 600; white-space: nowrap; } .tab-btn.active { border-bottom-color: var(--brand-purple); color: #fff; } .tab-panel { display: none; } .tab-panel.active { display: block; animation: pageFadeIn 0.5s; } .plan-selector-wrapper { display: inline-block; width: auto; } #plan-selector { -webkit-appearance: none; -moz-appearance: none; appearance: none; background-color: rgba(49, 23, 82, 0.7); border: 1px solid rgba(168, 85, 247, 0.5); border-radius: 8px; padding: 0.5rem 2.5rem 0.5rem 1rem; color: #ffffff; font-weight: 500; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; width: 100%; } #plan-selector:hover { border-color: #a855f7; background-color: rgba(69, 33, 112, 0.7); } #plan-selector:focus { outline: none; border-color: #a855f7; box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.3); } .plan-selector-wrapper i { transition: color 0.2s ease; }</style>`;

let profilePictureUrl = (user.profilePicture || "/assets/profilePhoto.jpg").replace("public/", "");
if (profilePictureUrl && !profilePictureUrl.startsWith('/')) {
    profilePictureUrl = '/' + profilePictureUrl;
}

const baseHtml = `<div id="page-profile" class="page space-y-8"><div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left reveal"><div class="relative flex-shrink-0"><img id="profile-pic-img" src="${profilePictureUrl}" alt="Profile Picture" class="w-24 h-24 rounded-full border-4 border-purple-500/50 object-cover shadow-lg"><label for="avatar-upload" class="absolute bottom-0 right-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-purple-500 transition shadow-md"><i class="fa-solid fa-camera text-white"></i><input type="file" id="avatar-upload" class="hidden" accept="image/*"></label></div><div class="flex-grow"><h2 class="text-3xl font-bold font-['Orbitron'] text-white">${user.username}</h2><p class="text-gray-400">${user.email}</p><div id="plan-info-container" class="text-xs sm:text-sm mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2"></div></div></div><div id="user-status-content" class="reveal"><div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-3xl text-purple-400"></i></div></div></div> ${modalHtml}`;


    renderFunc(pageStyles + baseHtml);
    
    const statusContainer = document.getElementById("user-status-content");
    const token = localStorage.getItem("nexguard_token");

    document.getElementById("avatar-upload")?.addEventListener("change", async(e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("avatar", file);
        showToast({ title: "Uploading...", message: "Please wait.", type: "info" });
        const res = await apiFetch("/api/user/profile-picture", {
            method: "POST",
            headers: { Authorization: "Bearer " + token },
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

    apiFetch("/api/user/status", {
            headers: { Authorization: "Bearer " + token }
        })
        .then((res) => res.ok ? res.json() : Promise.reject(new Error("Authentication failed")))
        .then((data) => {
            const setupEventListeners = () => {
                
                const openHelpModalLink = document.querySelector('.open-help-modal-link');
                const helpModal = document.getElementById('help-modal');
                const helpModalCloseBtn = document.getElementById('help-modal-close');
                const langToggleBtn = document.getElementById('lang-toggle-btn');

                if (helpModal && helpModalCloseBtn) {
                    const openModal = () => { helpModal.classList.add('visible'); document.body.classList.add('modal-open'); };
                    const closeModal = () => { helpModal.classList.remove('visible'); document.body.classList.remove('modal-open'); };

                    if (openHelpModalLink) { 
                        openHelpModalLink.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
                    }
                    
                    helpModalCloseBtn.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
                    helpModal.addEventListener('click', (event) => { if (event.target === helpModal) closeModal(); });
                    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && helpModal.classList.contains('visible')) closeModal(); });
                    if (langToggleBtn) {
                        langToggleBtn.addEventListener('click', () => {
                            document.querySelector('.lang-content.lang-en')?.classList.toggle('hidden');
                            document.querySelector('.lang-content.lang-si')?.classList.toggle('hidden');
                        });
                    }
                }

                document.getElementById("profile-update-form")?.addEventListener("submit", async(e) => {
                    e.preventDefault();
                    const newPassword = document.getElementById("new-password").value;
                    const btn = e.target.querySelector('button');
                    if (!newPassword) {
                        showToast({ title: "No Change", message: "Password field was empty.", type: "info" });
                        return;
                    }
                    if (newPassword.length < 6) {
                        showToast({ title: "Error", message: "Password must be at least 6 characters.", type: "error" });
                        return;
                    }
                    btn.disabled = true;
                    showToast({ title: "Updating...", message: "Please wait.", type: "info" });
                    try {
                        const res = await apiFetch('/api/user/update-password', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                            body: JSON.stringify({ newPassword })
                        });
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

                document.getElementById('profile-password-toggle')?.addEventListener('click', () => {
                    togglePassword('new-password', 'profile-password-toggle');
                });
                
                document.getElementById("link-account-form-profile")?.addEventListener("submit", async(e) => {
                    e.preventDefault();
                    const btn = e.target.querySelector("button");
                    const v2rayUsername = document.getElementById("existing-v2ray-username-profile").value;
                    if (!v2rayUsername) {
                        showToast({ title: "Error", message: "Please enter your V2Ray username.", type: "error" });
                        return;
                    }
                    btn.disabled = true;
                    showToast({ title: "Linking...", message: "Please wait...", type: "info" });
                    const res = await apiFetch("/api/user/link-v2ray", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                        body: JSON.stringify({ v2rayUsername }),
                    });
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
                const planSelectorOptions = data.activePlans.map((plan, index) => `<option value="${index}">${plan.v2rayUsername}</option>`).join("");
                const planSelectorHtml = `<div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">...</div>`;
                statusContainer.innerHTML = `${planSelectorHtml.replace('...', `<label for="plan-selector" class="font-semibold text-gray-200 flex-shrink-0">Viewing Plan:</label><div class="relative plan-selector-wrapper"><select id="plan-selector">${planSelectorOptions}</select><i class="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i></div>`)}<div id="plan-details-container"></div>`;
                
                const planDetailsContainer = document.getElementById("plan-details-container");
                const planSelector = document.getElementById("plan-selector");

                const displayPlanDetails = (planIndex) => {
                    const plan = data.activePlans[planIndex];
                    if (!plan) return;

                    const connection = dynamicConnections.find(c => c.name === plan.connId);
                        const connectionName = connection ? connection.name : (plan.connId || 'N/A');
                    const planName = appData.plans[plan.planId]?.name || plan.planId;
                    document.getElementById("plan-info-container").innerHTML = `<span class="bg-purple-500/10 text-purple-300 px-2 py-1 rounded-full"><i class="fa-solid fa-rocket fa-fw mr-2"></i>${planName}</span><span class="bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded-full"><i class="fa-solid fa-wifi fa-fw mr-2"></i>${connectionName}</span>`;
                    
planDetailsContainer.innerHTML = `
    <div id="profile-tabs" class="flex items-center gap-4 sm:gap-6 border-b border-white/10 mb-6 overflow-x-auto">
        <button data-tab="config" class="tab-btn">V2Ray Config</button>
        <button data-tab="usage" class="tab-btn">Usage Stats</button>
        <button data-tab="orders" class="tab-btn">My Orders</button>
        <button data-tab="settings" class="tab-btn">Account Settings</button>
    </div>

    <div id="tab-config" class="tab-panel">
        <div class="glass-panel p-6 sm:p-8 rounded-xl">
            <div class="grid md:grid-cols-2 gap-8 items-center">
                <div class="flex flex-col items-center text-center">
                    <h3 class="text-lg font-semibold text-white mb-3">Scan with your V2Ray App</h3>
                    <div id="qrcode-container" class="w-44 h-44 p-3 bg-white rounded-lg cursor-pointer flex items-center justify-center shadow-lg shadow-purple-500/20" title="Click to view larger">
                        </div>
                </div>
                <div class="space-y-6">
                    <div class="w-full">
                        <label class="text-sm text-gray-400">V2Ray Config Link</label>
                        <div class="flex items-center gap-2 mt-2">
                            <input type="text" readonly value="${plan.v2rayLink}" class="w-full bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300">
                            <button id="copy-config-btn" class="ai-button secondary !text-sm !font-semibold flex-shrink-0 px-4 py-2 rounded-md"><i class="fa-solid fa-copy mr-2"></i>Copy</button>
                        </div>
                    </div>
                    <div class="w-full text-center border-t border-white/10 pt-6">
                        <label class="text-sm text-gray-400">Plan Renewal</label>
                        <div id="renew-button-container" class="mt-3">
                            </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="tab-usage" class="tab-panel">
    </div>
    
    <div id="tab-orders" class="tab-panel">
    </div>
    
    <div id="tab-settings" class="tab-panel">
        <div class="glass-panel p-6 sm:p-8 rounded-xl">
            <div class="max-w-md mx-auto">
                <h3 class="text-xl font-bold text-white mb-6 font-['Orbitron'] text-center">Account Settings</h3>
                <form id="profile-update-form" class="space-y-6">
                    <div class="form-group">
                        <input type="text" class="form-input" readonly value="${user.username}" title="Website username cannot be changed.">
                        <label class="form-label">Website Username</label>
                    </div>
                    <div class="form-group relative">
                        <input type="password" id="new-password" class="form-input pr-10" placeholder=" ">
                        <label for="new-password" class="form-label">New Password (leave blank to keep)</label>
                        <span class="focus-border"><i></i></span>
                        <i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i>
                    </div>
                    <button type="submit" class="ai-button w-full rounded-lg !mt-8">Save Changes</button>
                </form>
            </div>
        </div>
    </div>
`;
                    const qrContainer = document.getElementById("qrcode-container");
                    qrContainer.innerHTML = "";
                    let qrLink = plan.v2rayLink;
                    try {
                        const url = new URL(qrLink);
                        url.hash = ''; 
                        qrLink = url.toString();
                    } catch (e) {
                        console.error("Could not parse V2Ray link to shorten for QR Code, using original.", e);
                        qrLink = plan.v2rayLink;
                    }
                    new QRCode(qrContainer, { text: qrLink, width: 140, height: 140 });

                    qrContainer.addEventListener('click', () => showQrModal(qrContainer.querySelector('img').src, plan.v2rayUsername));
                    
                    document.getElementById('copy-config-btn').addEventListener('click', () => {
                        navigator.clipboard.writeText(plan.v2rayLink);
                        showToast({ title: 'Copied!', message: 'Config link copied to clipboard.', type: 'success' });
                    });

                    const tabs = document.getElementById('profile-tabs');
                    const panels = planDetailsContainer.querySelectorAll('.tab-panel');

                    const loadUsageStats = () => {
                        const usageContainer = document.getElementById("tab-usage");  
                        if (!usageContainer) return;
                        
                        usageContainer.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-purple-400"></i></div>`;
                        apiFetch(`/api/check-usage/${plan.v2rayUsername}`).then(res => res.json()).then(result => {
                            if (result.success) {
                                displayUserData(result.data, plan.v2rayUsername, usageContainer);
                            } else {
                                usageContainer.innerHTML = `<div class="glass-panel p-4 rounded-xl text-center text-amber-400"><p>${result.message}</p></div>`;
                            }
                        }).catch(err => {
                            console.error("Failed to load usage stats:", err);
                            usageContainer.innerHTML = `<div class="glass-panel p-4 rounded-xl text-center text-red-400"><p>Could not load usage statistics.</p></div>`;
                        });
                    };

                    const updateRenewButton = async () => {
                        const container = document.getElementById("renew-button-container");
                        if (!container) return;
                        
                        container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Checking status...</button>`;
                        
                        try {
                            const res = await apiFetch(`/api/check-usage/${plan.v2rayUsername}`);
                            if (!res.ok) throw new Error(`API responded with status ${res.status}`);
                            
                            const result = await res.json();
                            
                            if (result.success) {
                                if (result.data.expiryTime > 0) {
                                    const expiryDate = new Date(result.data.expiryTime);
                                    // **MODIFIED LOGIC: Check if plan expires within the next 24 hours**
                                    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
                                    const canRenew = oneDayFromNow > expiryDate;
                                    
                                    if (canRenew) {
                                        // If expired or expiring soon, render an active button
                                        container.innerHTML = `<button id="renew-profile-btn" class="ai-button inline-block rounded-lg"><i class="fa-solid fa-arrows-rotate mr-2"></i>Renew Plan</button>`;
                                        document.getElementById('renew-profile-btn').addEventListener('click', () => {
                                            handleRenewalChoice(data.activePlans, plan);
                                        });
                                    } else {
                                        // If not expiring soon, render a disabled button
                                        container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed">Renew (Available 24h before expiry)</button>`;
                                    }
                                } else {
                                    container.innerHTML = `<button disabled class="ai-button secondary inline-block rounded-lg cursor-not-allowed">Does not expire</button>`;
                                }
                            } else {
                                container.innerHTML = `<p class="text-xs text-amber-400">${result.message || 'Could not verify plan expiry status.'}</p>`;
                            }
                        } catch (error) {
                            console.error('Error fetching plan status for renewal:', error);
                            container.innerHTML = `<p class="text-xs text-red-400">Error checking status. Please refresh.</p>`;
                        }
                    };

                    const loadMyOrders = async () => {
                        const ordersContainer = document.getElementById("tab-orders");
                        if (!ordersContainer) return;

                        ordersContainer.innerHTML = `<div class="text-center p-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-purple-400"></i></div>`;
                        try {
                            const res = await apiFetch("/api/user/orders", { headers: { Authorization: "Bearer " + token } });
                            if (!res.ok) throw new Error("Failed to fetch orders");
                            const { orders } = await res.json();
                            
                            if (orders.length === 0) {
                                ordersContainer.innerHTML = `<div class="glass-panel p-8 rounded-xl text-center"><i class="fa-solid fa-box-open text-4xl text-gray-400 mb-4"></i><h3 class="font-bold text-white">No Orders Found</h3><p class="text-gray-400 text-sm mt-2">You have not placed any orders yet.</p></div>`;
                                return;
                            }

                            const ordersHtml = orders.map(order => {
                                const planName = appData.plans[order.plan_id]?.name || order.plan_id;
                                const connection = dynamicConnections.find(c => c.name === order.conn_id);
                                const connName = connection ? connection.name : order.conn_id;
                                
                                const statusColors = { pending: "text-amber-400", approved: "text-green-400", rejected: "text-red-400" };
                                const statusIcons = { pending: "fa-solid fa-clock", approved: "fa-solid fa-check-circle", rejected: "fa-solid fa-times-circle" };
                                
                                return `
                                <div class="glass-panel p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div>
                                        <p class="font-bold text-white">${planName} <span class="text-gray-400 font-normal">for</span> ${connName}</p>
                                        <p class="text-xs text-gray-400 mt-1">
                                            Ordered on: ${new Date(order.created_at).toLocaleDateString()}
                                            ${order.status === 'approved' && order.final_username ? `| V2Ray User: <strong class="text-purple-300">${order.final_username}</strong>` : ''}
                                        </p>
                                    </div>
                                    <div class="text-sm font-semibold capitalize flex items-center gap-2 ${statusColors[order.status] || 'text-gray-400'}">
                                        <i class="${statusIcons[order.status] || 'fa-solid fa-question-circle'}"></i>
                                        <span>${order.status}</span>
                                    </div>
                                </div>`;
                            }).join('');
                            ordersContainer.innerHTML = `<div class="space-y-3">${ordersHtml}</div>`;

                        } catch (err) {
                            console.error("Failed to load orders:", err);
                            ordersContainer.innerHTML = `<div class="glass-panel p-4 rounded-xl text-center text-red-400"><p>Could not load your orders.</p></div>`;
                        }
                    };

                    const switchTab = (tabId, updateUrl = false) => {
                        tabs.querySelector('.active')?.classList.remove('active');
                        panels.forEach(p => p.classList.remove('active'));
                        
                        const newTabButton = tabs.querySelector(`[data-tab="${tabId}"]`);
                        const newTabPanel = document.getElementById(`tab-${tabId}`);
                        
                        if (newTabButton) newTabButton.classList.add('active');
                        if (newTabPanel) newTabPanel.classList.add('active');
                        
                        if (tabId === 'usage') loadUsageStats();
                        if (tabId === 'orders') loadMyOrders();
                        if (tabId === 'config') updateRenewButton();

                        if (updateUrl) {
                            history.pushState(null, '', `/profile/${tabId}`);
                        }
                    };

                    tabs.addEventListener('click', (e) => {
                        if (e.target.tagName !== 'BUTTON') return;
                        switchTab(e.target.dataset.tab, true);
                    });
                    
                    const urlParams = new URLSearchParams(window.location.search);
                    const tabFromQuery = urlParams.get('tab');
                    const pathParts = window.location.pathname.split('/');
                    const initialTab = tabFromQuery || pathParts[2] || 'config';
                    switchTab(initialTab, false);
                    
                    setupEventListeners();
                };
                planSelector.addEventListener("change", (e) => displayPlanDetails(e.target.value));
                displayPlanDetails(planSelector.value);

            } else if (data.status === "pending") {
                statusContainer.innerHTML = `<div class="glass-panel p-8 rounded-xl text-center"><i class="fa-solid fa-clock text-4xl text-amber-400 mb-4 animate-pulse"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Order Pending Approval</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">Your order is currently being reviewed. Your profile will update here once approved.</p></div>`;
            } else { 
                const settingsHtml = `<div class="glass-panel p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-4 font-['Orbitron']">Account Settings</h3><form id="profile-update-form" class="space-y-6"><div class="form-group"><input type="text" class="form-input" readonly value="${user.username}" title="Website username cannot be changed."><label class="form-label">Website Username</label></div><div class="form-group relative"><input type="password" id="new-password" class="form-input pr-10" placeholder=" "><label for="new-password" class="form-label">New Password (leave blank to keep)</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="profile-password-toggle"></i></div><button type="submit" class="ai-button w-full rounded-lg !mt-8">Save Changes</button></form></div>`;
                const linkAccountHtml = `<div class="glass-panel p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-2 font-['Orbitron']">Link Existing V2Ray Account</h3><p class="text-sm text-gray-400 mb-6">If you have an old account, link it here to manage renewals.</p><form id="link-account-form-profile" class="space-y-6"><div class="form-group"><input type="text" id="existing-v2ray-username-profile" class="form-input" required placeholder=" "><label for="existing-v2ray-username-profile" class="form-label">Your Old V2Ray Username</label><span class="focus-border"><i></i></span></div><button type="submit" class="ai-button secondary w-full rounded-lg">Link Account</button><div class="text-center text-sm mt-4"><span class="open-help-modal-link text-purple-400 cursor-pointer hover:underline">How to find your username?</span></div></form></div>`;
                statusContainer.innerHTML = `<div class="glass-panel p-8 rounded-xl text-center"><i class="fa-solid fa-rocket text-4xl text-purple-400 mb-4"></i><h3 class="text-2xl font-bold text-white font-['Orbitron']">Get Started</h3><p class="text-gray-300 mt-2 max-w-md mx-auto">You do not have any active plans yet. Purchase a new plan or link an existing account below.</p><a href="/plans" class="nav-link-internal ai-button inline-block rounded-lg mt-6">Purchase a Plan</a></div><div class="grid md:grid-cols-2 gap-8 mt-8">${settingsHtml}${linkAccountHtml}</div>`;
                
                setupEventListeners();
            }
        })
        .catch((error) => {
            console.error("Error fetching user status:", error);
            statusContainer.innerHTML = `<div class="glass-panel p-8 rounded-xl text-center"><p class="text-red-400">Could not load profile data. Please try logging in again.</p></div>`;
        });
}

    function renderAuthPage(renderFunc, params, initialPanel = "signin") {
        const resetToken = params.get("token");
        if (resetToken) {
            initialPanel = "reset-password";
        }

        const modalHtml = `
        <div id="help-modal" class="help-modal-overlay">
            <div class="help-modal-content glass-panel rounded-lg p-6 space-y-4 w-full max-w-md">
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-xl font-bold text-white font-['Orbitron']">Help & Support Matrix</h2>
                        <button id="lang-toggle-btn" class="text-xs text-purple-400 hover:underline mt-1">English / සිංහල</button>
                    </div>
                    <button id="help-modal-close" class="text-gray-400 hover:text-white text-3xl">&times;</button>
                </div>
                <div class="lang-content lang-en">
                    <div>
                        <h3 class="text-lg font-semibold text-purple-400 mb-2">How to find your Username?</h3>
                        <p class="text-gray-300 text-sm mb-4">Your username is the name assigned to your V2ray configuration. It's often visible in your V2ray client app, usually next to the server connection name.</p>
                    </div>
                </div>
                <div class="lang-content lang-si hidden">
                    <div>
                        <h3 class="text-lg font-semibold text-purple-400 mb-2">ඔබගේ Username එක සොයාගන්නේ කෙසේද?</h3>
                        <p class="text-gray-300 text-sm mb-4">ඔබගේ username යනු V2ray config ගොනුවට ලබා දී ඇති නමයි. එය බොහෝවිට V2ray client ඇප් එකේ, server සම්බන්ධතාවය අසල දිස්වේ.</p>
                    </div>
                </div>
                <div class="bg-black/50 border border-white/10 rounded-lg p-2">
                    <img src="/assets/help.jpg" alt="Example image of where to find the username" class="rounded w-full h-auto">
                </div>
            </div>
        </div>`;

    renderFunc(`
        <div id="page-login" class="page">
            <style>
                .auth-form { display: none; }
                .auth-form.active { display: block; }
                .auth-toggle-link { color: var(--brand-purple); cursor: pointer; font-weight: 500; }
                #auth-container { max-width: 380px; }
                #page-login .form-input { height: 56px; padding: 20px 12px 8px 12px; }
                #page-login .form-label { position: absolute; top: 50%; left: 13px; transform: translateY(-50%); color: #9ca3af; pointer-events: none; transition: all 0.2s ease-out; font-size: 14px; background: none; padding: 0; }
                #page-login .form-input:focus ~ .form-label, #page-login .form-input:not(:placeholder-shown) ~ .form-label { top: 10px; transform: translateY(0); font-size: 11px; color: var(--brand-purple); }
                #link-account-form .form-group { margin-top: 0; }
            </style>
            <div id="auth-container" class="mx-auto my-12 glass-panel rounded-xl p-8 sm:p-10">
                <form class="auth-form space-y-6" id="signin-form">
                    <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Welcome Back</h1><p class="text-sm text-gray-400 mt-1">Sign in to access your dashboard.</p></div>
                    <div class="form-group"><input type="text" id="signin-username" class="form-input" required placeholder=" " /><label for="signin-username" class="form-label">Username</label><span class="focus-border"><i></i></span></div>
                    <div class="form-group relative"><input type="password" id="signin-password" class="form-input pr-10" required placeholder=" " /><label for="signin-password" class="form-label">Password</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="signin-toggle"></i></div>
                    <div class="text-right text-sm -mt-4"><span id="show-forgot-password" class="auth-toggle-link hover:underline">Forgot Password?</span></div>
                    <button type="submit" class="ai-button w-full rounded-lg">Sign In</button>
                    <p class="text-center text-sm">Don't have an account? <span id="show-signup" class="auth-toggle-link">Sign Up</span></p>
                </form>
                <form class="auth-form space-y-6" id="signup-form">
                    <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Create Account</h1><p class="text-sm text-gray-400 mt-1">Step 1: Your Details</p></div>
                    <div class="form-group"><input type="text" id="signup-username" class="form-input" required placeholder=" " /><label for="signup-username" class="form-label">Username</label><span class="focus-border"><i></i></span></div>
                    <div class="form-group"><input type="email" id="signup-email" class="form-input" required placeholder=" " /><label for="signup-email" class="form-label">Email</label><span class="focus-border"><i></i></span></div>
                    <div class="form-group"><input type="tel" id="signup-whatsapp" class="form-input" required placeholder=" " value="94" /><label for="signup-whatsapp" class="form-label">WhatsApp Number</label><span class="focus-border"><i></i></span></div>
                    <div class="form-group relative"><input type="password" id="signup-password" class="form-input pr-10" required placeholder=" " /><label for="signup-password" class="form-label">Password</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="signup-toggle"></i></div>
                    <button type="submit" class="ai-button w-full rounded-lg">Create & Continue</button>
                    <p class="text-center text-sm">Already have an account? <span id="show-signin-from-signup" class="auth-toggle-link">Sign In</span></p>
                </form>
                <form class="auth-form space-y-6" id="otp-form">
                    <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Verify Email</h1><p class="text-sm text-gray-400 mt-1">Step 2: Enter the 6-digit code we sent you.</p></div>
                    <input type="hidden" id="otp-email"><div class="form-group"><input type="text" id="otp-code" class="form-input" required placeholder=" " maxlength="6" /><label for="otp-code" class="form-label">OTP Code</label><span class="focus-border"><i></i></span></div>
                    <button type="submit" class="ai-button w-full rounded-lg">Verify & Create Account</button>
                    <p class="text-center text-sm">Didn't get the code? <span id="show-signup-again" class="auth-toggle-link">Go Back</span></p>
                </form>
                <form class="auth-form space-y-6" id="forgot-password-form">
                    <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Reset Password</h1><p class="text-sm text-gray-400 mt-1">Enter your email to receive a reset link.</p></div>
                    <div class="form-group"><input type="email" id="forgot-email" class="form-input" required placeholder=" " /><label for="forgot-email" class="form-label">Your Account Email</label><span class="focus-border"><i></i></span></div>
                    <button type="submit" class="ai-button w-full rounded-lg">Send Reset Link</button>
                    <p class="text-center text-sm">Remembered your password? <span id="show-signin-from-forgot" class="auth-toggle-link">Sign In</span></p>
                </form>
                <form class="auth-form space-y-6" id="reset-password-form">
                    <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Set New Password</h1><p class="text-sm text-gray-400 mt-1">Enter your new password below.</p></div>
                    <input type="hidden" id="reset-token" value="${resetToken || ""}"><div class="form-group relative"><input type="password" id="new-password" class="form-input pr-10" required placeholder=" " /><label for="new-password" class="form-label">New Password</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="reset-toggle"></i></div>
                    <button type="submit" class="ai-button w-full rounded-lg">Update Password</button>
                </form>
                <div class="auth-form" id="link-account-form-container">
                    <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Link Account</h1><p class="text-sm text-gray-400 mt-1">Do you have an existing V2Ray account?</p></div>
                    <form id="link-account-form" class="mt-8 space-y-6">
                        <div class="form-group"><input type="text" id="existing-v2ray-username" class="form-input" required placeholder=" "><label for="existing-v2ray-username" class="form-label">Your Old V2Ray Username</label><span class="focus-border"><i></i></span></div>
                        <button type="submit" class="ai-button w-full rounded-lg">Link Account & Continue</button>
                        <div class="text-center text-sm mt-4"><span class="open-help-modal-link text-purple-400 cursor-pointer hover:underline">How to find your username?</span></div>
                        <a href="/profile" id="skip-link-btn" class="nav-link-internal block text-center text-sm text-gray-400 hover:text-white !mt-2">Skip for Now</a>
                    </form>
                </div>
            </div>
        </div>
        ${modalHtml}`);

    setTimeout(() => {
        const openHelpModalLink = document.querySelector('.open-help-modal-link');
        const helpModal = document.getElementById('help-modal');
        const helpModalCloseBtn = document.getElementById('help-modal-close');
        const langToggleBtn = document.getElementById('lang-toggle-btn');

        if (openHelpModalLink && helpModal && helpModalCloseBtn) {
            const openModal = () => { helpModal.classList.add('visible'); document.body.classList.add('modal-open'); };
            const closeModal = () => { helpModal.classList.remove('visible'); document.body.classList.remove('modal-open'); };
            
            openHelpModalLink.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
            helpModalCloseBtn.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
            helpModal.addEventListener('click', (event) => { if (event.target === helpModal) closeModal(); });
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && helpModal.classList.contains('visible')) closeModal(); });

            if (langToggleBtn) {
                langToggleBtn.addEventListener('click', () => {
                    document.querySelector('.lang-content.lang-en')?.classList.toggle('hidden');
                    document.querySelector('.lang-content.lang-si')?.classList.toggle('hidden');
                });
            }
        }
    }, 100);


        const signinForm = document.getElementById("signin-form");
        const signupForm = document.getElementById("signup-form");
        const otpForm = document.getElementById("otp-form");
        const forgotPasswordForm = document.getElementById("forgot-password-form");
        const resetPasswordForm = document.getElementById("reset-password-form");
        const linkAccountContainer = document.getElementById("link-account-form-container");

        const switchAuthView = (viewToShow) => {
            [
                signinForm,
                signupForm,
                otpForm,
                forgotPasswordForm,
                resetPasswordForm,
                linkAccountContainer,
            ].forEach((form) => form?.classList.remove("active"));
            viewToShow?.classList.add("active");
        };

        document.getElementById("show-signup") ?.addEventListener("click", () => switchAuthView(signupForm));
        document.getElementById("show-signin-from-signup") ?.addEventListener("click", () => switchAuthView(signinForm));
        document.getElementById("show-forgot-password") ?.addEventListener("click", () => switchAuthView(forgotPasswordForm));
        document.getElementById("show-signin-from-forgot") ?.addEventListener("click", () => switchAuthView(signinForm));
        document.getElementById("show-signup-again") ?.addEventListener("click", () => switchAuthView(signupForm));

        if (initialPanel === "reset-password") switchAuthView(resetPasswordForm);
        else if (initialPanel === "signup") switchAuthView(signupForm);
        else switchAuthView(signinForm);

        signinForm ?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({
                title: "Signing In",
                message: "Please wait...",
                type: "info",
            });
            const payload = {
                username: e.target.elements["signin-username"].value,
                password: e.target.elements["signin-password"].value,
            };
            const res = await apiFetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            btn.disabled = false;
            if (res.ok) {
                showToast({
                    title: "Success!",
                    message: "You have logged in successfully.",
                    type: "success",
                });
                saveSession(result);
                navigateTo("/profile");
            } else {
                showToast({
                    title: "Login Failed",
                    message: result.message,
                    type: "error",
                });
            }
        });

        signupForm ?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({
                title: "Sending OTP",
                message: "Please check your email...",
                type: "info",
            });
            const payload = {
                username: e.target.elements["signup-username"].value,
                email: e.target.elements["signup-email"].value,
                whatsapp: e.target.elements["signup-whatsapp"].value,
                password: e.target.elements["signup-password"].value,
            };
            const res = await apiFetch("/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            btn.disabled = false;
            if (res.ok) {
                showToast({
                    title: "OTP Sent!",
                    message: result.message,
                    type: "success",
                });
                document.getElementById("otp-email").value = payload.email;
                switchAuthView(otpForm);
            } else if (res.status === 409) {
                showToast({
                    title: "Conflict",
                    message: "Username or Email already exists. Please use a different one.",
                    type: "error",
                });
            } else {
                showToast({
                    title: "Error",
                    message: result.message || "An unknown error occurred.",
                    type: "error",
                });
            }
        });

        otpForm ?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({
                title: "Verifying",
                message: "Checking your OTP code...",
                type: "info",
            });
            const payload = {
                email: document.getElementById("otp-email").value,
                otp: e.target.elements["otp-code"].value,
            };
            const res = await apiFetch("/api/auth/verify-otp", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            btn.disabled = false;
            if (res.ok) {
                showToast({
                    title: "Verified!",
                    message: result.message,
                    type: "success",
                });
                saveSession(result);
                switchAuthView(linkAccountContainer);
            } else {
                showToast({
                    title: "Verification Failed",
                    message: result.message,
                    type: "error",
                });
            }
        });

forgotPasswordForm?.addEventListener("submit", async(e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    showToast({
        title: "Processing",
        message: "Sending password reset link...",
        type: "info",
    });
    const payload = {
        email: e.target.elements["forgot-email"].value
    };
    const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
    });
    const result = await res.json();
    btn.disabled = false;

    if (res.ok) {
        showToast({
            title: "Check Your Email",
            message: result.message,
            type: "success",
        });
    } else {
        showToast({
            title: "Error",
            message: result.message, 
            type: "error",
        });
    }
});

        resetPasswordForm ?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({
                title: "Updating",
                message: "Your password is being updated...",
                type: "info",
            });
            const payload = {
                token: e.target.elements["reset-token"].value,
                newPassword: e.target.elements["new-password"].value,
            };
            const res = await apiFetch("/api/auth/reset-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (res.ok) {
                showToast({
                    title: "Success!",
                    message: result.message,
                    type: "success",
                });
                setTimeout(() => switchAuthView(signinForm), 2000);
            } else {
                btn.disabled = false;
                showToast({
                    title: "Error",
                    message: result.message,
                    type: "error"
                });
            }
        });

        document.getElementById("link-account-form") ?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({
                title: "Linking Account",
                message: "Please wait...",
                type: "info",
            });
            const payload = {
                v2rayUsername: document.getElementById("existing-v2ray-username").value,
            };
            const res = await apiFetch("/api/user/link-v2ray", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + localStorage.getItem("nexguard_token"),
                },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            btn.disabled = false;
            if (res.ok) {
                showToast({
                    title: "Success!",
                    message: result.message,
                    type: "success",
                });
                setTimeout(() => navigateTo("/profile"), 1500);
            } else {
                showToast({
                    title: "Failed to Link",
                    message: result.message,
                    type: "error",
                });
            }
        });

        const whatsappInput = document.getElementById("signup-whatsapp");
        if (whatsappInput) {
            whatsappInput.addEventListener("input", () => {
                if (!whatsappInput.value.startsWith("94")) {
                    whatsappInput.value = "94";
                }
            });
            whatsappInput.addEventListener("keydown", (e) => {
                if (e.key === "Backspace" && whatsappInput.value.length <= 2) {
                    e.preventDefault();
                }
            });
        }

        document.getElementById("signin-toggle") ?.addEventListener("click", () => togglePassword("signin-password", "signin-toggle"));
        document.getElementById("signup-toggle") ?.addEventListener("click", () => togglePassword("signup-password", "signup-toggle"));
        document.getElementById("reset-toggle") ?.addEventListener("click", () => togglePassword("new-password", "reset-toggle"));
    }

        const allRoutes = {
        home: renderHomePage,
        usage: renderUsagePage,
        plans: renderPlansPage,
        connections: renderConnectionsPage,
        "package-choice": renderPackageChoicePage,
        about: renderAboutPage,
        privacy: renderPrivacyPage,
        login: renderAuthPage,
        signup: renderAuthPage,
        "reset-password": renderAuthPage,
        checkout: renderCheckoutPage,
        profile: renderProfilePage,
    };

    const navigateTo = (path) => {
        history.pushState(null, null, path);
        router();
    };

    const router = async () => {
        const pathName = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        const pathParts = pathName.substring(1).split('/');
        let pageKey = pathParts[0] || 'home';
        if (pageKey === '') pageKey = 'home';

        document.title = pageTitles[pageKey] || 'NexGuardLK STORE';

        // Immediately update active nav link
        document.querySelectorAll("#main-nav a, #mobile-nav a").forEach((link) => {
            const linkPath = link.getAttribute("href")?.split("?")[0].replace('/', '');
            const currentPath = pageKey.split('/')[0];
            const isActive = linkPath === currentPath || (linkPath === 'home' && currentPath === '');
            link.classList.toggle("active", isActive);
        });
        
        // Scroll to top by default
        window.scrollTo(0, 0);

        if (userSession && ["login", "signup", "reset-password"].includes(pageKey)) {
            navigateTo("/profile");
            return;
        }

        if (["checkout", "profile", "connections", "package-choice"].includes(pageKey) && !userSession) {
            navigateTo("/login");
            return;
        }
        
        // START: CORRECTED LOGIC FOR RENEWAL/CHANGE FLOW
        if (pageKey === 'plans' && userSession && !params.has('new') && !params.has('change')) {
            // Step 1: Immediately render a loading spinner
            mainContentArea.innerHTML = `<div class="text-center p-10"><i class="fa-solid fa-spinner fa-spin text-3xl text-purple-400"></i></div>`;

            try {
                // Step 2: Fetch data in the background
                const res = await apiFetch("/api/user/status");
                if (!res.ok) throw new Error('Failed to fetch user status');
                const data = await res.json();

                // Step 3: Render the correct content based on data
                if (data.status === "approved" && data.activePlans?.length > 0) {
                    renderPlanChoicePage((html) => {
                        mainContentArea.innerHTML = html;
                        initAnimations();
                    }, data.activePlans);
                } else {
                    // If no active plans, render the normal plan list
                    renderPlansPage((html) => {
                        mainContentArea.innerHTML = html;
                        initAnimations();
                    }, params); // <-- FIXED: Added 'params' here
                }
            } catch (error) {
                console.error("Could not check user status for renewal flow:", error);
                // If there's an error, just show the plans page as normal
                renderPlansPage((html) => {
                    mainContentArea.innerHTML = html;
                    initAnimations();
                }, params); // <-- FIXED: Added 'params' here
            }
            return; // Stop further execution
        }
        // END: CORRECTED LOGIC

        const renderFunction = allRoutes[pageKey] || allRoutes["home"];
        if (renderFunction) {
            mainContentArea.innerHTML = "";
            renderFunction((html) => {
                mainContentArea.innerHTML = html;
                initAnimations();
            }, params, pageKey);
        }

        const scrollTargetId = params.get('scroll');
        if (scrollTargetId) {
            setTimeout(() => {
                const targetElement = document.getElementById(scrollTargetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    };
    
    window.addEventListener("popstate", router);
    document.addEventListener("click", (e) => { 
        const link = e.target.closest("a.nav-link-internal"); 
        if (link) { 
            const href = link.getAttribute("href"); 
            if (href) { 
                e.preventDefault(); 
                navigateTo(href); 
            } 
        } 
    });
    window.addEventListener('load', function() {
  const loader = document.getElementById('page-loader');
  loader.style.opacity = '0';
  setTimeout(() => {
    loader.style.display = 'none';
  }, 500);
});

    
    const init = async () => {
        loadSession();
        await loadConnections();
        router();
    };

    init();
});