// File: public/js/pages/auth.js
import { apiFetch, saveSession } from '../api.js';
import { showToast, togglePassword } from '../utils.js';
import { navigateTo } from '../router.js';

export function renderAuthPage(renderFunc, params, initialPanel = "signin") {
    const resetToken = params.get("token");
    if (resetToken) {
        initialPanel = "reset-password";
    }

    const modalHtml = `
    <div id="help-modal" class="help-modal-overlay">
        <div class="help-modal-content card-glass rounded-lg p-6 space-y-4 w-full max-w-md">
            <div class="flex justify-between items-start">
                <div>
                    <h2 class="text-xl font-bold text-white font-['Orbitron']">Help & Support Matrix</h2>
                    <button id="lang-toggle-btn" class="text-xs text-blue-400 hover:underline mt-1">English / සිංහල</button>
                </div>
                <button id="help-modal-close" class="text-gray-400 hover:text-white text-3xl">&times;</button>
            </div>
            <div class="lang-content lang-en">
                <div>
                    <h3 class="text-lg font-semibold text-blue-400 mb-2">How to find your Username?</h3>
                    <p class="text-gray-300 text-sm mb-4">Your username is the name assigned to your V2ray configuration. It's often visible in your V2ray client app, usually next to the server connection name.</p>
                </div>
            </div>
            <div class="lang-content lang-si hidden">
                <div>
                    <h3 class="text-lg font-semibold text-blue-400 mb-2">ඔබගේ Username එක සොයාගන්නේ කෙසේද?</h3>
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
            .auth-toggle-link { color: var(--brand-blue); cursor: pointer; font-weight: 500; }
            #auth-container { max-width: 380px; }
            #page-login .form-input { height: 56px; padding: 20px 12px 8px 12px; }
            #page-login .form-label { position: absolute; top: 50%; left: 13px; transform: translateY(-50%); color: #9ca3af; pointer-events: none; transition: all 0.2s ease-out; font-size: 14px; background: none; padding: 0; }
            #page-login .form-input:focus ~ .form-label, #page-login .form-input:not(:placeholder-shown) ~ .form-label { top: 10px; transform: translateY(0); font-size: 11px; color: var(--brand-blue); }
            #link-account-form .form-group { margin-top: 0; }
        </style>
        <div id="auth-container" class="mx-auto my-12 card-glass custom-radius p-8 sm:p-10">
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
                
                // public/js/pages/auth.js තුළ ඇති otp-form HTML කොටස:

<div id="otp-spam-warning" class="hidden mt-6 text-center reveal is-visible">
    <p class="text-blue-400 text-xs font-medium opacity-80 tracking-wide">
        Please check your Spam / Junk Folder.
    </p>
</div>
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
                    <div class="text-center text-sm mt-4"><span class="open-help-modal-link text-blue-400 cursor-pointer hover:underline">How to find your username?</span></div>
                    <a href="/profile" id="skip-link-btn" class="nav-link-internal block text-center text-sm text-gray-400 hover:text-white !mt-2">Skip for Now</a>
                </form>
            </div>
        </div>
    </div>
    ${modalHtml}`);

    setTimeout(() => {
        // --- Modal Logic ---
        const openHelpModalLink = document.querySelector('.open-help-modal-link');
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

        // --- Form Logic ---
        const signinForm = document.getElementById("signin-form");
        const signupForm = document.getElementById("signup-form");
        const otpForm = document.getElementById("otp-form");
        const forgotPasswordForm = document.getElementById("forgot-password-form");
        const resetPasswordForm = document.getElementById("reset-password-form");
        const linkAccountContainer = document.getElementById("link-account-form-container");

        const switchAuthView = (viewToShow) => {
            [signinForm, signupForm, otpForm, forgotPasswordForm, resetPasswordForm, linkAccountContainer].forEach((form) => form?.classList.remove("active"));
            viewToShow?.classList.add("active");
        };

        document.getElementById("show-signup")?.addEventListener("click", () => switchAuthView(signupForm));
        document.getElementById("show-signin-from-signup")?.addEventListener("click", () => switchAuthView(signinForm));
        document.getElementById("show-forgot-password")?.addEventListener("click", () => switchAuthView(forgotPasswordForm));
        document.getElementById("show-signin-from-forgot")?.addEventListener("click", () => switchAuthView(signinForm));
        document.getElementById("show-signup-again")?.addEventListener("click", () => switchAuthView(signupForm));

        if (initialPanel === "reset-password") switchAuthView(resetPasswordForm);
        else if (initialPanel === "signup") switchAuthView(signupForm);
        else switchAuthView(signinForm);

        signinForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Signing In", message: "Please wait...", type: "info" });
            const payload = { username: e.target.elements["signin-username"].value, password: e.target.elements["signin-password"].value };
            const res = await apiFetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            btn.disabled = false;
            if (res.ok) {
                const result = await res.json();
                showToast({ title: "Success!", message: "You have logged in successfully.", type: "success" });
                saveSession(result);
                navigateTo("/profile");
            } else {
                let errorMessage = "An unknown error occurred. Please try again.";
                try {
                    const result = await res.json();
                    if (result.message.toLowerCase().includes('user not found')) errorMessage = `No account found with the username '${payload.username}'.`;
                    else if (result.message.toLowerCase().includes('invalid password')) errorMessage = "The password you entered is incorrect.";
                    else errorMessage = result.message;
                } catch {}
                showToast({ title: "Login Failed", message: errorMessage, type: "error" });
            }
        });

        signupForm?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Sending OTP", message: "Please check your email...", type: "info" });
            const payload = { username: e.target.elements["signup-username"].value, email: e.target.elements["signup-email"].value, whatsapp: e.target.elements["signup-whatsapp"].value, password: e.target.elements["signup-password"].value };
            const res = await apiFetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const result = await res.json();
            btn.disabled = false;
            if (res.ok) {
                showToast({ title: "OTP Sent!", message: result.message, type: "success" });
                document.getElementById("otp-email").value = payload.email;
                
                // Hide warning initially (if it was shown previously)
                const warningBox = document.getElementById("otp-spam-warning");
                if(warningBox) warningBox.classList.add("hidden");

                switchAuthView(otpForm);

                // --- START: Timer to show Spam Warning after 15 Seconds ---
// public/js/pages/auth.js - signupForm event listener එක ඇතුළේ:

// --- START: Timer to show Warning ---
setTimeout(() => {
    // Check if user is still on the OTP form
    if (otpForm.classList.contains("active")) {
        
        // Form එකේ යටින් පොඩි Text එක පෙන්වන්න
        const warningBox = document.getElementById("otp-spam-warning");
        if(warningBox) warningBox.classList.remove("hidden");

        // --- Show Toast Message Warning (10 Seconds) ---
        showToast({
            title: "Still Waiting?",
            message: "Email delivery delays detected. Please check your Spam/Junk folder.",
            type: "warning",
            duration: 10000 // තත්පර 10ක් පෙන්වා තබයි
        });
    }
}, 15000); // ෆෝරම් එක load වෙලා තත්පර 15කට පස්සේ මැසේජ් එක එයි
// --- END: Timer Logic --- // තත්පර 15 කට පසු ක්‍රියාත්මක වේ
// --- END: Timer Logic ---

            } else {
                showToast({ title: "Error", message: result.message || "An unknown error occurred.", type: "error" });
            }
        });

        otpForm?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Verifying", message: "Checking your OTP code...", type: "info" });
            const payload = { email: document.getElementById("otp-email").value, otp: e.target.elements["otp-code"].value };
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
        });

        forgotPasswordForm?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Processing", message: "Sending password reset link...", type: "info" });
            const payload = { email: e.target.elements["forgot-email"].value };
            const res = await apiFetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const result = await res.json();
            btn.disabled = false;
            if (res.ok) {
                showToast({ title: "Check Your Email", message: result.message, type: "success" });
            } else {
                showToast({ title: "Error", message: result.message, type: "error" });
            }
        });

        resetPasswordForm?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Updating", message: "Your password is being updated...", type: "info" });
            const payload = { token: e.target.elements["reset-token"].value, newPassword: e.target.elements["new-password"].value };
            const res = await apiFetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const result = await res.json();
            if (res.ok) {
                showToast({ title: "Success!", message: result.message, type: "success" });
                setTimeout(() => switchAuthView(signinForm), 2000);
            } else {
                btn.disabled = false;
                showToast({ title: "Error", message: result.message, type: "error" });
            }
        });

        document.getElementById("link-account-form")?.addEventListener("submit", async(e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            showToast({ title: "Linking Account", message: "Please wait...", type: "info" });
            const payload = { v2rayUsername: document.getElementById("existing-v2ray-username").value };
            const res = await apiFetch("/api/user/link-v2ray", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const result = await res.json();
            btn.disabled = false;
            if (res.ok) {
                showToast({ title: "Success!", message: result.message, type: "success" });
                setTimeout(() => navigateTo("/profile"), 1500);
            } else {
                showToast({ title: "Failed to Link", message: result.message, type: "error" });
            }
        });

        // WhatsApp number helper - IMPROVED
        const whatsappInput = document.getElementById("signup-whatsapp");
        if (whatsappInput) {
            whatsappInput.addEventListener("input", () => {
                let val = whatsappInput.value.replace(/\D/g, ''); // අංක නොවන දේවල් ඉවත් කරන්න
                
                // 94න් පටන් ගන්නේ නැත්නම් 94 දාන්න
                if (!val.startsWith("94")) {
                    val = "94" + val;
                }
                
                // Copy-Paste නිසා 94 දෙපාරක් වැදුනොත් (9494...) එය හදන්න
                if (val.startsWith("9494")) {
                    val = val.substring(2);
                }

                whatsappInput.value = val;
            });

            whatsappInput.addEventListener("keydown", (e) => {
                // 94 මකන්න බැරි වෙන්න හදන්න
                if (e.key === "Backspace" && whatsappInput.value.length <= 2) {
                    e.preventDefault();
                }
            });
        }

        // Toggles
        document.getElementById("signin-toggle")?.addEventListener("click", () => togglePassword("signin-password", "signin-toggle"));
        document.getElementById("signup-toggle")?.addEventListener("click", () => togglePassword("signup-password", "signup-toggle"));
        document.getElementById("reset-toggle")?.addEventListener("click", () => togglePassword("new-password", "reset-toggle"));
    }, 100);
}