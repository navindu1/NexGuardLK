// File: public/js/pages/checkout.js
import { apiFetch, userSession, appData } from '../api.js';
import { showToast } from '../utils.js';
import { navigateTo } from '../router.js';
import { initAnimations } from '../utils.js';

export function renderPlansPage(renderFunc, params) {
    const userToChange = params.get("change");
    const changeQuery = userToChange ? `&change=${encodeURIComponent(userToChange)}` : '';

    let plansHtml = Object.entries(appData.plans).map(([key, plan]) => `
        <div class="card reveal card-glass p-5 rounded-xl text-center flex flex-col">
            <h3 class="text-xl font-bold gradient-text">${plan.name}</h3>
            <p class="text-3xl font-bold my-3">LKR. ${plan.price}<span class="text-base font-normal text-gray-400">/ month</span></p>
            <ul class="space-y-2 text-gray-300 text-sm text-left my-4 flex-grow">${plan.features.map(f => `<li><i class="fa-solid fa-check text-green-400 mr-2"></i>${f}</li>`).join("")}</ul>
            <a href="/connections?planId=${key}${changeQuery}" class="nav-link-internal mt-6 inline-block ai-button rounded-lg">Select Plan</a>
        </div>`).join("");

    renderFunc(`
        <div id="page-plans" class="page">
            <header class="text-center mb-10 reveal">
                <h2 class="text-2xl font-bold text-white">${userToChange ? 'Select Your New Plan' : 'Our V2Ray Plans'}</h2>
                <p class="text-gray-400 mt-2">${userToChange ? `You are changing the plan for ${userToChange}` : 'Step 1: Choose your desired data package.'}</p>
            </header>
            <div id="plans-container" class="grid grid-cols-1 md:grid-cols-3 gap-6">${plansHtml}</div>
        </div>`);
}

export function renderConnectionsPage(renderFunc, params) {
    const planId = params.get("planId");
    const userToChange = params.get("change");
    const changeQuery = userToChange ? `&change=${encodeURIComponent(userToChange)}` : '';

    if (!planId || !appData.plans[planId]) {
        renderFunc('<div class="page text-center"><p class="text-red-400">Invalid plan selection.</p><a href="/plans" class="nav-link-internal underline mt-2">Go back to plans</a></div>');
        return;
    }

    let connectionsHtml = appData.connections.length > 0 ? appData.connections.map(conn => {
        let linkUrl = '';
        let packageInfoHtml = '';
        if (conn.requires_package_choice) {
            linkUrl = `/package-choice?planId=${planId}&connId=${encodeURIComponent(conn.name)}${changeQuery}`;
            packageInfoHtml = `<p class="text-xs text-blue-300 mt-2 font-semibold">${conn.package_options?.length || 0} Packages Available</p>`;
        } else {
            linkUrl = `/checkout?planId=${planId}&connId=${encodeURIComponent(conn.name)}&pkg=${encodeURIComponent(conn.default_package || '')}&inboundId=${conn.default_inbound_id}&vlessTemplate=${encodeURIComponent(conn.default_vless_template)}${changeQuery}`;
            packageInfoHtml = `<p class="text-xs text-blue-300 mt-2 font-semibold">${conn.default_package || 'Standard Connection'}</p>`;
        }
        return `<a href="${linkUrl}" class="nav-link-internal card reveal selectable card-glass p-6 rounded-xl text-center flex flex-col items-center justify-center w-full sm:w-72">
                    <i class="${conn.icon || 'fa-solid fa-wifi'} text-3xl gradient-text mb-3"></i>
                    <h3 class="text-lg font-bold text-white mb-2">${conn.name}</h3>
                    ${packageInfoHtml}
                </a>`;
    }).join("") : '<div class="text-amber-400 text-center col-span-full"><p>No connection types are currently available.</p></div>';

    renderFunc(`
        <div id="page-connections" class="page">
            <header class="text-center mb-10 reveal">
                <h2 class="text-2xl font-bold text-white">Select Your Connection</h2>
                <p class="text-gray-400 mt-2">Step 2: Choose your ISP.</p>
            </header>
            <div class="flex flex-wrap items-center justify-center gap-6">${connectionsHtml}</div>
            <div class="text-center mt-8 reveal"><a href="/plans${changeQuery}" class="nav-link-internal text-blue-400 hover:text-white transition-colors"><i class="fa-solid fa-arrow-left mr-2"></i>Back to Plans</a></div>
        </div>`);
}

export function renderPackageChoicePage(renderFunc, params) {
    const planId = params.get("planId");
    const connId = decodeURIComponent(params.get("connId"));
    const userToChange = params.get("change");
    const changeQuery = userToChange ? `&change=${encodeURIComponent(userToChange)}` : '';
    const conn = appData.connections.find(c => c.name === connId);

    if (!planId || !conn || !conn.package_options) {
        navigateTo(`/plans${changeQuery}`);
        return;
    }

    let choiceHtml = conn.package_options.map((option) => {
        const encodedOptionName = encodeURIComponent(option.name);
        const encodedTemplate = encodeURIComponent(option.template);
        return `<a href="/checkout?planId=${planId}&connId=${encodeURIComponent(connId)}&pkg=${encodedOptionName}&inboundId=${option.inbound_id}&vlessTemplate=${encodedTemplate}${changeQuery}" class="nav-link-internal card reveal selectable card-glass p-6 rounded-xl text-center flex flex-col items-center justify-center w-full sm:w-72">
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
            <div class="flex flex-wrap items-center justify-center gap-6">${choiceHtml}</div>
            <div class="text-center mt-8 reveal">
                <a href="/connections?planId=${planId}${changeQuery}" class="nav-link-internal text-blue-400 hover:text-white transition-colors"><i class="fa-solid fa-arrow-left mr-2"></i>Back to Connections</a>
            </div>
        </div>`);
}

export function renderCheckoutPage(renderFunc, params) {
    if (!userSession) {
        navigateTo("/login");
        return;
    }

    const planId = params.get("planId");
    const connId = decodeURIComponent(params.get("connId"));
    const pkg = decodeURIComponent(params.get("pkg") || "");
    const plan = appData.plans[planId];
    const conn = appData.connections.find(c => c.name === connId);

    const userToRenew = params.get("renew");
    const userToChange = params.get("change");
    const isRenewal = !!userToRenew;
    const isChange = !!userToChange;

    const formActionType = isChange ? 'Change Plan' : (isRenewal ? 'Renew Your Plan' : 'Final Step: Checkout');
    
    let summaryHtml;
    if (plan && (conn || isRenewal)) {
        const finalPackageNameWithPrice = pkg || conn?.default_package || '';
        const planPrice = plan.price;
        const cleanPackageName = finalPackageNameWithPrice.split(' - LKR')[0];
        const connectionName = conn?.name || decodeURIComponent(params.get("connId"));

        let purchaseInfo = `<p>You are purchasing the <strong class="text-blue-400">${plan.name}</strong> for <strong class="text-blue-400">${connectionName}</strong>.</p>`;
        
        let packageInfo = '';
        if (cleanPackageName) {
            packageInfo = `<div class="text-center"><p class="text-sm m-0"><span class="text-gray-300">Selected Package:</span> <span class="font-semibold text-amber-400">${cleanPackageName} - LKR ${planPrice}</span></p></div>`;
        }

        let renewalInfo = '';
        if (isRenewal) {
            renewalInfo = `<p class="mt-2 text-center">You are renewing for V2Ray user: <strong class="text-blue-400">${userToRenew}</strong>.</p>`;
        }
        
        let changeInfo = '';
        if (isChange) {
            changeInfo = `<p class="mt-2 text-center text-amber-400">You are changing the plan for: <strong class="text-white">${userToChange}</strong>. The old plan will be deleted upon approval.</p>`;
            purchaseInfo = `<p>You are changing to the <strong class="text-blue-400">${plan.name}</strong> for <strong class="text-blue-400">${connectionName}</strong>.</p>`;
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
            <div class="w-full max-w-sm mx-auto card-glass rounded-xl p-6 reveal">
                <div id="checkout-view">
                    <h2 class="text-xl font-bold text-center text-white mb-2">${formActionType}</h2>
                    <div id="checkout-summary" class="text-center mb-6 text-gray-300 text-sm space-y-2">${summaryHtml}</div>
                    <form id="checkout-form" class="space-y-4">
                        ${isRenewal ? `<input type="hidden" name="isRenewal" value="true">` : ""}
                        ${isChange ? `<input type="hidden" name="old_v2ray_username" value="${userToChange}">` : ''}

                        <div class="form-group ${isRenewal ? 'pb-2' : ''}">
                            <input type="text" id="checkout-username" name="username" class="form-input ${isRenewal ? 'renewal-username-field' : ''}" required placeholder=" " value="${isRenewal ? userToRenew : (isChange ? '' : (userSession.username || ''))}" ${isRenewal ? 'readonly' : ''}>
                            <label class="form-label">${isChange ? 'New V2Ray Username' : 'V2Ray Username'}</label><span class="focus-border"><i></i></span>
                            ${isRenewal ? '<p class="text-xs text-amber-400 mt-2 px-1">Username cannot be changed during renewal.</p>' : ''}
                        </div>
                        <div class="form-group">
                            <input type="text" name="whatsapp" id="checkout-whatsapp" class="form-input" required placeholder=" " value="${userSession.whatsapp || ''}">
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

                    <div class="mt-4 flex flex-col items-center justify-center gap-3">
                        <a href="/profile?tab=orders" class="nav-link-internal ai-button rounded-lg w-full flex justify-center items-center">View My Orders</a>
                        <a href="https://chat.whatsapp.com/Jaw6FQbQINCE1eMGboSovH" target="_blank" class="nav-link-internal ai-button secondary rounded-lg w-full flex justify-center items-center">
                            <i class="fa-brands fa-whatsapp mr-2"></i>Join Premium Group
                        </a>
                    </div>
                </div>
            </div>
        </div>`);

    document.getElementById("checkout-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const params = new URLSearchParams(window.location.search); 

        if(params.get("planId")) formData.append("planId", params.get("planId"));
        if(params.get("connId")) formData.append("connId", params.get("connId"));
        if (params.get("pkg")) formData.append("pkg", params.get("pkg"));
        if (params.get("inboundId")) formData.append("inboundId", params.get("inboundId"));
        if (params.get("vlessTemplate")) formData.append("vlessTemplate", params.get("vlessTemplate"));

        const renewUser = params.get("renew");
        if (renewUser) {
            formData.append("isRenewal", "true");
            formData.append("old_v2ray_username", renewUser);
            if (!formData.get("username")) {
                formData.append("username", renewUser);
            }
        }

        const submitBtn = document.querySelector('#checkout-view button[type="submit"]');
        if(submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "SUBMITTING...";
        }

        try {
            const res = await apiFetch("/api/create-order", {
                method: "POST",
                body: formData, 
            });

            if (res.ok) {
                document.getElementById("checkout-view").style.display = "none";
                document.getElementById("success-view").classList.remove("hidden");
            } else {
                const result = await res.json();
                showToast({ title: "Error", message: result.message || "Order failed", type: "error" });
                if(submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "SUBMIT FOR APPROVAL";
                }
            }
        } catch (error) {
            console.error("Checkout Error:", error);
            showToast({ title: "Error", message: "Something went wrong. Please try again.", type: "error" });
            if(submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "SUBMIT FOR APPROVAL";
            }
        }
    });
}

// Renewal Flow Components
export function renderPlanChoicePage(renderFunc, activePlans) {
    renderFunc(`
        <div id="page-plan-choice" class="page">
            <header class="text-center mb-10 reveal">
                <h2 class="text-2xl font-bold text-white">Choose Your Path</h2>
                <p class="text-gray-400 mt-2">You have an active plan. What would you like to do next?</p>
            </header>
            <div class="flex flex-col sm:flex-row items-stretch justify-center gap-6">
                <div id="renew-choice-card" class="card reveal selectable card-glass p-6 rounded-xl text-center flex flex-col w-full sm:w-72 cursor-pointer">
                    <i class="fa-solid fa-arrows-rotate text-3xl gradient-text mb-3"></i>
                    <div class="flex-grow flex flex-col justify-center">
                        <h3 class="text-lg font-bold text-white">Renew / Change Plan</h3>
                        <p class="text-gray-400 mt-1 text-xs">Manage your existing subscription(s).</p>
                    </div>
                </div>
                <div id="buy-new-choice-card" class="card reveal selectable card-glass p-6 rounded-xl text-center flex flex-col w-full sm:w-72 cursor-pointer">
                    <i class="fa-solid fa-plus text-3xl gradient-text mb-3"></i>
                    <div class="flex-grow flex flex-col justify-center">
                        <h3 class="text-lg font-bold text-white">Buy a New Plan</h3>
                        <p class="text-gray-400 mt-1 text-xs">Purchase a completely separate, additional plan.</p>
                    </div>
                </div>
            </div>
        </div>`);

    document.getElementById('renew-choice-card')?.addEventListener('click', () => handleRenewalChoice(activePlans));
    document.getElementById('buy-new-choice-card')?.addEventListener('click', () => navigateTo('/plans?new=true'));
}

export function renderRenewOrChangePage(renderFunc, planToManage) {
    const currentPlanName = appData.plans[planToManage.planId]?.name || planToManage.planId;
    const currentPlanPrice = appData.plans[planToManage.planId]?.price || 'N/A';

    renderFunc(`
        <div id="page-renew-choice" class="page">
            <header class="text-center mb-10 reveal">
                <h2 class="text-2xl font-bold text-white">Manage Plan: <span class="gradient-text">${planToManage.v2rayUsername}</span></h2>
                <p class="text-gray-400 mt-2">Would you like to renew your current plan or change to a different one?</p>
            </header>
            <div class="flex flex-col sm:flex-row items-stretch justify-center gap-6"> 
                <div id="renew-current-card" class="card reveal selectable card-glass p-6 rounded-xl text-center flex flex-col w-full sm:w-72 cursor-pointer">
                    <i class="fa-solid fa-calendar-check text-3xl gradient-text mb-3"></i>
                    <div class="flex-grow flex flex-col justify-center">
                        <h3 class="text-lg font-bold text-white">Renew Current Plan</h3>
                        <div class="text-sm mt-2 bg-black/20 px-3 py-2 rounded-lg">
                            <p class="font-semibold text-blue-300">${currentPlanName}</p>
                            <p class="text-xs text-gray-400">LKR ${currentPlanPrice}/month</p>
                        </div>
                    </div>
                </div>
                <div id="change-plan-card" class="card reveal selectable card-glass p-6 rounded-xl text-center flex flex-col w-full sm:w-72 cursor-pointer">
                    <i class="fa-solid fa-right-left text-3xl gradient-text mb-3"></i>
                    <div class="flex-grow flex flex-col justify-center">
                        <h3 class="text-lg font-bold text-white">Change to a New Plan</h3>
                        <p class="text-gray-400 mt-1 text-xs">Select a different package.<br/>Your old plan will be replaced.</p>
                    </div>
                </div>
            </div>
            <div class="text-center mt-8 reveal"><a href="/plans" class="nav-link-internal text-blue-400 hover:text-white transition-colors"><i class="fa-solid fa-arrow-left mr-2"></i>Back</a></div>
        </div>`);

    document.getElementById('renew-current-card')?.addEventListener('click', () => {
        const pkgParam = planToManage.pkg ? `&pkg=${encodeURIComponent(planToManage.pkg)}` : '';
        const checkoutUrl = `/checkout?planId=${planToManage.planId}&connId=${encodeURIComponent(planToManage.connId)}&renew=${encodeURIComponent(planToManage.v2rayUsername)}${pkgParam}`;
        navigateTo(checkoutUrl);
    });

    document.getElementById('change-plan-card')?.addEventListener('click', () => {
        navigateTo(`/plans?change=${encodeURIComponent(planToManage.v2rayUsername)}`);
    });
}

export async function handleRenewalChoice(activePlans, specificPlan = null) {
    let planToManage = specificPlan;

    if (!specificPlan) {
        const now = new Date();
        const renewalWindowMs = 24 * 60 * 60 * 1000;
        const expiredOrExpiringPlans = activePlans.filter(plan => {
            if (!plan.expiryTime || plan.expiryTime === 0) return false; 
            const expiryDate = new Date(plan.expiryTime);
            return now >= new Date(expiryDate.getTime() - renewalWindowMs);
        });

        if (expiredOrExpiringPlans.length === 1) {
            planToManage = expiredOrExpiringPlans[0];
        } else if (expiredOrExpiringPlans.length > 1) {
            const chosenPlan = await showPlanSelectorModal(expiredOrExpiringPlans);
            if (!chosenPlan) return;
            planToManage = chosenPlan;
        } else {
            if (activePlans.length > 1) {
                const chosenPlan = await showPlanSelectorModal(activePlans);
                if (!chosenPlan) return;
                planToManage = chosenPlan;
            } else {
                planToManage = activePlans[0];
            }
        }
    }

    if (planToManage) {
        renderRenewOrChangePage((html) => {
            const mainContentArea = document.getElementById("app-router");
            mainContentArea.innerHTML = html;
            initAnimations();
        }, planToManage);
    }
}

export function showPlanSelectorModal(plansToShow) {
    return new Promise((resolve) => {
        const modalId = `plan-selector-modal-${Date.now()}`;
        const options = plansToShow.map((p, index) => {
            let statusText = "";
            const now = new Date();
            const expiryDate = new Date(p.expiryTime || 0);
            if (p.expiryTime > 0 && now >= new Date(expiryDate.getTime() - 24 * 60 * 60 * 1000)) {
                statusText = now > expiryDate ? " (Expired)" : " (Expiring Soon)";
            }
            return `<option value="${index}">${p.v2rayUsername}${statusText}</option>`;
        }).join('');

        const modalHtml = `
            <div id="${modalId}" class="fixed inset-0 bg-black/80 justify-center items-center z-[101] flex p-4" style="display: flex;">
                <div class="card-glass p-6 rounded-lg max-w-sm w-full text-center reveal is-visible relative">
                    <button id="${modalId}-close" class="absolute top-3 right-4 text-gray-400 hover:text-white text-3xl">&times;</button>
                    <h3 class="text-xl font-bold text-white font-['Orbitron'] mb-3">Select a Plan</h3>
                    <p class="text-xs text-gray-400 mb-4">Please choose which account you want to manage.</p>
                    <div class="mb-8">
                        <select id="multi-plan-selector" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none">
                            ${options}
                        </select>
                    </div>
                    <div class="flex items-center justify-center gap-3">
                        <button id="${modalId}-opt1" class="ai-button rounded-lg w-full">Continue</button>
                    </div>
                </div>
            </div>`;
            
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalElement = document.getElementById(modalId);
        
        const closeModal = (choice) => {
            let selectedPlan = null;
            if (choice === 'option1') {
                selectedPlan = plansToShow[document.getElementById('multi-plan-selector').value];
            }
            modalElement.remove();
            resolve(selectedPlan);
        };
        
        document.getElementById(`${modalId}-opt1`).addEventListener('click', () => closeModal('option1'));
        document.getElementById(`${modalId}-close`).addEventListener('click', () => closeModal(null));
    });
}