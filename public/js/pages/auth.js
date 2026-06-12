// File: public/js/pages/auth.js
import { apiFetch, saveSession } from '../api.js';
import { showToast, togglePassword } from '../utils.js';
import { navigateTo } from '../router.js';

export function renderAuthPage(renderFunc, params, initialPanel = "signin") {
    const resetToken = params.get("token");
    if (resetToken) {
        initialPanel = "reset-password";
    }

    if (!document.getElementById("google-gsi-script")) {
        const script = document.createElement("script");
        script.id = "google-gsi-script";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    }

    const pageStyles = `<style>
        .help-modal-overlay {
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease-out, visibility 0.3s ease-out;
            background: rgba(0, 0, 0, 0.2); 
            z-index: 9999;
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        .help-modal-overlay.visible { opacity: 1; visibility: visible; }
        .help-modal-content {
            opacity: 0; transform: scale(0.90);
            transition: opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .help-modal-overlay.visible .help-modal-content { opacity: 1; transform: scale(1); }
        .grease-glass {
            background: rgba(30, 40, 60, 0.4); backdrop-filter: blur(20px) saturate(200%);
            -webkit-backdrop-filter: blur(20px) saturate(200%); border-radius: 35px;
            border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5);
        }
        .auth-form { display: none; }
        .auth-form.active { display: block; }
        .auth-toggle-link { color: var(--brand-blue); cursor: pointer; font-weight: 500; }
        #auth-container { max-width: 380px; }
        #page-login .form-input { height: 56px; padding: 20px 12px 8px 12px; }
        #page-login .form-label { position: absolute; top: 50%; left: 13px; transform: translateY(-50%); color: #9ca3af; pointer-events: none; transition: all 0.2s ease-out; font-size: 14px; background: none; padding: 0; }
        #page-login .form-input:focus ~ .form-label, #page-login .form-input:not(:placeholder-shown) ~ .form-label { top: 10px; transform: translateY(0); font-size: 11px; color: var(--brand-blue); }
        #link-account-form .form-group { margin-top: 0; }
        
        .divider {
            display: flex;
            align-items: center;
            text-align: center;
            margin: 1.25rem 0;
            color: rgba(255, 255, 255, 0.5);
            font-size: 0.8rem;
            font-weight: 600;
        }
        .divider::before, .divider::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        }
        .divider:not(:empty)::before { margin-right: 1rem; }
        .divider:not(:empty)::after { margin-left: 1rem; }

        .google-btn-wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 44px; 
            margin-top: 10px;
        }
    </style>`;

    const modalHtml = `<div id="help-modal" class="help-modal-overlay">
        <div class="help-modal-content grease-glass p-6 space-y-4 w-full max-w-md">
            <div class="flex justify-between items-start">
                <div>
                    <h2 class="text-xl font-bold text-white font-['Orbitron'] drop-shadow-md">Help Matrix</h2>
                    <button id="lang-toggle-btn" class="text-xs text-blue-300 hover:text-white mt-1 transition-colors">English / සිංහල</button>
                </div>
                <button id="help-modal-close" class="text-white/80 hover:text-white text-3xl transition-all hover:rotate-90">&times;</button>
            </div>
            <div class="lang-content lang-en">
                <h3 class="text-lg font-semibold text-blue-300 mb-2">How to find your Username?</h3>
                <p class="text-gray-100 text-sm mb-4 font-medium">Your username is the name assigned to your V2ray configuration. Visible in your V2ray client app.</p>
            </div>
            <div class="lang-content lang-si hidden">
                <h3 class="text-lg font-semibold text-blue-300 mb-2">ඔබගේ Username එක සොයාගන්නේ කෙසේද?</h3>
                <p class="text-gray-100 text-sm mb-4 font-medium">ඔබගේ username යනු V2ray config ගොනුවට ලබා දී ඇති නමයි. V2ray client ඇප් එකේ දිස්වේ.</p>
            </div>
            <div class="bg-black/20 border border-white/10 rounded-xl p-2 shadow-inner">
                <img src="/assets/help.jpg" class="rounded-lg w-full h-auto opacity-95">
            </div>
        </div>
    </div>`;

    renderFunc(pageStyles + `
    <div id="page-login" class="page">
        <div id="auth-container" class="mx-auto my-12 card-glass custom-radius p-8 sm:p-10 relative">
            
            <form class="auth-form space-y-5" id="signin-form">
                <div class="text-center mb-2"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Welcome Back</h1><p class="text-sm text-gray-400 mt-1">Sign in to access your dashboard.</p></div>

                <div class="form-group"><input type="text" id="signin-username" class="form-input" required placeholder=" " /><label for="signin-username" class="form-label">Username</label><span class="focus-border"><i></i></span></div>
                <div class="form-group relative"><input type="password" id="signin-password" class="form-input pr-10" required placeholder=" " /><label for="signin-password" class="form-label">Password</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="signin-toggle"></i></div>
                <div class="text-right text-sm -mt-3"><span id="show-forgot-password" class="auth-toggle-link hover:underline">Forgot Password?</span></div>
                
                <button type="submit" class="ai-button w-full rounded-lg mt-2">Sign In</button>
                
                <div class="divider">OR</div>
                <div class="google-btn-wrapper" id="google-login-btn-div"></div>

                <p class="text-center text-sm mt-4">Don't have an account? <span id="show-signup" class="auth-toggle-link">Sign Up</span></p>
            </form>

            <form class="auth-form space-y-5" id="signup-form">
                <div class="text-center mb-2"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Create Account</h1></div>

                <div class="form-group"><input type="text" id="signup-username" class="form-input" required placeholder=" " /><label for="signup-username" class="form-label">Username</label><span class="focus-border"><i></i></span></div>
                <div class="form-group"><input type="email" id="signup-email" class="form-input" required placeholder=" " /><label for="signup-email" class="form-label">Email</label><span class="focus-border"><i></i></span></div>
                <div class="form-group"><input type="tel" id="signup-whatsapp" class="form-input" required placeholder=" " value="94" minlength="11" maxlength="11" /><label for="signup-whatsapp" class="form-label">WhatsApp Number</label><span class="focus-border"><i></i></span></div>
                <div class="form-group relative"><input type="password" id="signup-password" class="form-input pr-10" required placeholder=" " /><label for="signup-password" class="form-label">Password</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="signup-toggle"></i></div>
                
                <button type="submit" class="ai-button w-full rounded-lg mt-2">Create & Continue</button>

                <div class="divider">OR</div>
                <div class="google-btn-wrapper" id="google-signup-btn-div"></div>

                <p class="text-center text-sm mt-4">Already have an account? <span id="show-signin-from-signup" class="auth-toggle-link">Sign In</span></p>
            </form>

            <form class="auth-form space-y-6" id="otp-form">
                <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Verify Email</h1><p class="text-sm text-gray-400 mt-1">Step 2: Enter the 6-digit code we sent you.</p></div>
                <input type="hidden" id="otp-email"><div class="form-group"><input type="text" id="otp-code" class="form-input" required placeholder=" " maxlength="6" /><label for="otp-code" class="form-label">OTP Code</label><span class="focus-border"><i></i></span></div>
                <button type="submit" class="ai-button w-full rounded-lg">Verify & Create Account</button>
                <p class="text-center text-sm">Didn't get the code? <span id="show-signup-again" class="auth-toggle-link">Go Back</span></p>
            </form>

            <form class="auth-form space-y-6" id="whatsapp-update-form">
                <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Almost Done!</h1><p class="text-sm text-gray-400 mt-1">Please provide your WhatsApp number for account security.</p></div>
                <div class="form-group"><input type="tel" id="google-whatsapp-input" class="form-input" required placeholder=" " value="94" minlength="11" maxlength="11" /><label for="google-whatsapp-input" class="form-label">WhatsApp Number</label><span class="focus-border"><i></i></span></div>
                <button type="submit" class="ai-button w-full rounded-lg">Save & Continue</button>
            </form>

            <div class="auth-form" id="link-account-form-container">
                <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Link Account</h1><p class="text-sm text-gray-400 mt-1">Do you have an existing V2Ray account?</p></div>
                <form id="link-account-form" class="mt-8 space-y-6">
                    <div class="form-group"><input type="text" id="existing-v2ray-username" class="form-input" required placeholder=" "><label for="existing-v2ray-username" class="form-label">Your Old V2Ray Username</label><span class="focus-border"><i></i></span></div>
                    <button type="submit" class="ai-button w-full rounded-lg">Link Account & Continue</button>
                    <div class="text-center text-sm mt-4"><span class="open-help-modal-link text-blue-400 cursor-pointer hover:underline">How to find your username?</span></div>
                    <a href="/profile" id="skip-link-btn" class="nav-link-internal block text-center text-sm text-gray-400 hover:text-white !mt-2">Skip for Now</a>
                </form>
            </div>

            <form class="auth-form space-y-6" id="forgot-password-form">
                <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">Reset Password</h1></div>
                <div class="form-group"><input type="email" id="forgot-email" class="form-input" required placeholder=" " /><label for="forgot-email" class="form-label">Account Email</label><span class="focus-border"><i></i></span></div>
                <button type="submit" class="ai-button w-full rounded-lg">Send Link</button>
                <p class="text-center text-sm"><span id="show-signin-from-forgot" class="auth-toggle-link">Back to Sign In</span></p>
            </form>

            <form class="auth-form space-y-6" id="reset-password-form">
                <div class="text-center"><h1 class="text-2xl font-bold text-white font-['Orbitron']">New Password</h1></div>
                <input type="hidden" id="reset-token" value="${resetToken || ""}"><div class="form-group relative"><input type="password" id="new-password" class="form-input pr-10" required placeholder=" " /><label for="new-password" class="form-label">New Password</label><span class="focus-border"><i></i></span><i class="fa-solid fa-eye absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white" id="reset-toggle"></i></div>
                <button type="submit" class="ai-button w-full rounded-lg">Update</button>
            </form>
        </div>
    </div>
    ${modalHtml}`);

    setTimeout(() => {
        const signinForm = document.getElementById("signin-form");
        const signupForm = document.getElementById("signup-form");
        const otpForm = document.getElementById("otp-form");
        const whatsappUpdateForm = document.getElementById("whatsapp-update-form");
        const forgotPasswordForm = document.getElementById("forgot-password-form");
        const resetPasswordForm = document.getElementById("reset-password-form");
        const linkAccountContainer = document.getElementById("link-account-form-container");

        const switchAuthView = (viewToShow) => {
            [signinForm, signupForm, otpForm, whatsappUpdateForm, forgotPasswordForm, resetPasswordForm, linkAccountContainer].forEach(form => form?.classList.remove("active"));
            viewToShow?.classList.add("active");
        };

        window.handleGoogleCredentialResponse = async (response) => {
            showToast({ title: "Google Login", message: "Authenticating securely...", type: "info" });
            try {
                const res = await apiFetch("/api/auth/google-login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ credential: response.credential })
                });

                const result = await res.json();
                if (res.ok) {
                    saveSession(result); 
                    showToast({ title: "Success!", message: "Google account verified.", type: "success" });
                    
                    if (result.user.whatsapp === "94000000000" || !result.user.whatsapp) {
                        switchAuthView(whatsappUpdateForm);
                    } else {
                        switchAuthView(linkAccountContainer);
                    }
                } else {
                    showToast({ title: "Login Failed", message: result.message, type: "error" });
                }
            } catch (err) {
                console.error(err);
                showToast({ title: "Error", message: "Something went wrong.", type: "error" });
            }
        };

        const renderGoogleButtons = () => {
            if (window.google && window.google.accounts) {
                if (!window.googleInitDone) {
                    google.accounts.id.initialize({
                        client_id: "324820496903-er23b2ipeh2hs0fs61dms3flo9aot8jm.apps.googleusercontent.com", 
                        callback: handleGoogleCredentialResponse,
                        ux_mode: "popup", // <-- NEW: Force popup mode to avoid iframe strictness
                        auto_select: false
                    });
                    window.googleInitDone = true;
                }

                const btnOptions = { theme: "filled_blue", size: "large", shape: "rectangular", text: "continue_with", width: 316 };
                
                const loginBtnContainer = document.getElementById("google-login-btn-div");
                if (loginBtnContainer && loginBtnContainer.innerHTML === "") {
                    google.accounts.id.renderButton(loginBtnContainer, btnOptions);
                }

                const signupBtnContainer = document.getElementById("google-signup-btn-div");
                if (signupBtnContainer && signupBtnContainer.innerHTML === "") {
                    google.accounts.id.renderButton(signupBtnContainer, btnOptions);
                }
            } else {
                setTimeout(renderGoogleButtons, 500); 
            }
        };
        renderGoogleButtons();

        // --- WhatsApp Update Form Submit ---
        whatsappUpdateForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const whatsappInputVal = e.target.elements["google-whatsapp-input"].value;
            
            if (whatsappInputVal === "94" || whatsappInputVal.length !== 11) {
                showToast({ title: "Invalid Number", message: "Please enter a valid 11-digit WhatsApp number.", type: "error" });
                return;
            }

            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Saving...", message: "Updating profile...", type: "info" });

            try {
                const sessionStr = localStorage.getItem('nexguard_user');
                const email = sessionStr ? JSON.parse(sessionStr).email : "";

                const res = await apiFetch("/api/auth/update-whatsapp", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: email, whatsapp: whatsappInputVal })
                });

                if (res.ok) {
                    showToast({ title: "Saved!", message: "WhatsApp updated successfully.", type: "success" });
                    if (sessionStr) {
                        let userObj = JSON.parse(sessionStr);
                        userObj.whatsapp = whatsappInputVal;
                        localStorage.setItem('nexguard_user', JSON.stringify(userObj));
                    }
                    switchAuthView(linkAccountContainer); 
                } else {
                    const result = await res.json();
                    showToast({ title: "Error", message: result.message, type: "error" });
                    btn.disabled = false;
                }
            } catch (err) {
                btn.disabled = false;
            }
        });

        document.getElementById("show-signup")?.addEventListener("click", () => switchAuthView(signupForm));
        document.getElementById("show-signin-from-signup")?.addEventListener("click", () => switchAuthView(signinForm));
        document.getElementById("show-forgot-password")?.addEventListener("click", () => switchAuthView(forgotPasswordForm));
        document.getElementById("show-signin-from-forgot")?.addEventListener("click", () => switchAuthView(signinForm));
        document.getElementById("show-signup-again")?.addEventListener("click", () => switchAuthView(signupForm));

        if (initialPanel === "reset-password") switchAuthView(resetPasswordForm);
        else if (initialPanel === "signup") switchAuthView(signupForm);
        else switchAuthView(signinForm);

        // Help Modal logic
        const openHelpModalLink = document.querySelector('.open-help-modal-link');
        const helpModal = document.getElementById('help-modal');
        const helpModalCloseBtn = document.getElementById('help-modal-close');
        if (openHelpModalLink && helpModal && helpModalCloseBtn) {
            const openModal = () => { helpModal.classList.add('visible'); document.body.classList.add('modal-open'); };
            const closeModal = () => { helpModal.classList.remove('visible'); document.body.classList.remove('modal-open'); };
            openHelpModalLink.addEventListener('click', openModal);
            helpModalCloseBtn.addEventListener('click', closeModal);
            helpModal.addEventListener('click', (e) => { if (e.target === helpModal) closeModal(); });
            document.getElementById('lang-toggle-btn')?.addEventListener('click', () => {
                document.querySelector('.lang-content.lang-en')?.classList.toggle('hidden');
                document.querySelector('.lang-content.lang-si')?.classList.toggle('hidden');
            });
        }

        // WhatsApp formatting logic
        ["signup-whatsapp", "google-whatsapp-input"].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener("input", () => {
                    let val = input.value.replace(/\D/g, '');
                    if (!val.startsWith("94")) val = "94" + val;
                    if (val.startsWith("9494")) val = val.substring(2);
                    input.value = val;
                });
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Backspace" && input.value.length <= 2) e.preventDefault();
                });
            }
        });

        // Normal Forms Event Listeners
        signinForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Signing In", message: "Please wait...", type: "info" });
            const payload = { email: e.target.elements["signin-username"].value, password: e.target.elements["signin-password"].value };
            try {
                const res = await apiFetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                if (res.ok) {
                    const result = await res.json();
                    showToast({ title: "Success!", message: "You have logged in successfully.", type: "success" });
                    saveSession(result);
                    navigateTo("/profile");
                } else {
                    const result = await res.json();
                    showToast({ title: "Login Failed", message: result.message, type: "error" });
                }
            } catch (err) { console.error(err); }
            btn.disabled = false;
        });

        signupForm?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const whatsappInputVal = e.target.elements["signup-whatsapp"].value;
            if (whatsappInputVal === "94" || whatsappInputVal.length !== 11) {
                showToast({ title: "Invalid Number", message: "Please enter a valid 11-digit WhatsApp number.", type: "error" });
                return;
            }
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Sending OTP", message: "Please check your email...", type: "info" });
            const payload = { 
                username: e.target.elements["signup-username"].value, 
                email: e.target.elements["signup-email"].value, 
                whatsapp: whatsappInputVal, 
                password: e.target.elements["signup-password"].value 
            };
            try {
                const res = await apiFetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const result = await res.json();
                btn.disabled = false;
                if (res.ok) {
                    showToast({ title: "OTP Sent!", message: result.message, type: "success" });
                    document.getElementById("otp-email").value = payload.email;
                    switchAuthView(otpForm);
                } else {
                    showToast({ title: "Error", message: result.message, type: "error" });
                }
            } catch (error) { btn.disabled = false; }
        });

        otpForm?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Verifying", message: "Checking your OTP code...", type: "info" });
            const payload = { email: document.getElementById("otp-email").value, otp: e.target.elements["otp-code"].value };
            try {
                const res = await apiFetch("/api/auth/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const result = await res.json();
                btn.disabled = false;
                if (res.ok) {
                    showToast({ title: "Verified!", message: result.message, type: "success" });
                    saveSession(result);
                    switchAuthView(linkAccountContainer);
                } else {
                    showToast({ title: "Verification Failed", message: result.message, type: "error" });
                }
            } catch (err) { btn.disabled = false; }
        });

        document.getElementById("link-account-form")?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Linking Account", message: "Please wait...", type: "info" });
            try {
                const res = await apiFetch("/api/user/link-v2ray", { 
                    method: "POST", 
                    headers: { "Content-Type": "application/json" }, 
                    body: JSON.stringify({ v2rayUsername: document.getElementById("existing-v2ray-username").value }) 
                });
                const result = await res.json();
                btn.disabled = false;
                if (res.ok) {
                    showToast({ title: "Success!", message: result.message, type: "success" });
                    setTimeout(() => navigateTo("/profile"), 1500);
                } else showToast({ title: "Failed to Link", message: result.message, type: "error" });
            } catch (err) { btn.disabled = false; }
        });

        ["signin", "signup", "reset"].forEach(prefix => {
            const toggleBtn = document.getElementById(`${prefix}-toggle`);
            const pwdInput = document.getElementById(prefix === "reset" ? "new-password" : `${prefix}-password`);
            if (toggleBtn && pwdInput) {
                toggleBtn.addEventListener("click", () => togglePassword(pwdInput.id, toggleBtn.id));
            }
        });

    }, 100);
}