// File: public/js/utils.js

export function showToast({ title, message, type = "info", duration = 3000 }) {
    // 1. Toast Container එක තියෙනවද බලන්න, නැත්නම් හදන්න
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        // Top-Right කෙළවරේ පෙන්වන්න
        container.className = "fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none"; 
        document.body.appendChild(container);
    }

    // 2. Icon සහ Colors
    const icons = {
        success: '<i class="fa-solid fa-circle-check text-green-400 text-xl"></i>',
        error: '<i class="fa-solid fa-circle-xmark text-red-400 text-xl"></i>',
        warning: '<i class="fa-solid fa-triangle-exclamation text-yellow-400 text-xl"></i>',
        info: '<i class="fa-solid fa-circle-info text-blue-400 text-xl"></i>'
    };
    const borderColors = {
        success: "border-green-500/30",
        error: "border-red-500/30",
        warning: "border-yellow-500/30",
        info: "border-blue-500/30"
    };

    // 3. Toast Element එක (Glass Effect එක්ක)
    const toast = document.createElement("div");
    // self-center පාවිච්චි කරලා අයිතම මැදට ගත්තා
    toast.className = `
        pointer-events-auto relative flex items-center gap-4 p-4 rounded-xl border ${borderColors[type] || borderColors.info}
        bg-[#1e283c]/95 backdrop-blur-xl shadow-2xl transform transition-all duration-500 ease-out translate-x-10 opacity-0
        w-80 sm:w-96 overflow-hidden group
    `;

    // 4. HTML (Close Button එක දැන් මැදට දාලා තියෙන්නේ - self-center)
    toast.innerHTML = `
        <div class="shrink-0">${icons[type] || icons.info}</div>
        <div class="flex-1 min-w-0 flex flex-col justify-center">
            ${title ? `<h3 class="text-white font-semibold text-sm font-['Orbitron'] mb-0.5 tracking-wide">${title}</h3>` : ''}
            <p class="text-gray-300 text-xs leading-relaxed font-medium">${message}</p>
        </div>
        <button class="shrink-0 self-center text-gray-500 hover:text-white transition-colors p-2 rounded-md hover:bg-white/10 ml-1">
            <i class="fa-solid fa-xmark text-base"></i>
        </button>
        <div class="absolute bottom-0 left-0 h-0.5 bg-current opacity-30 w-full origin-left"></div>
    `;

    // 5. Logic Variables
    let timerId;
    let remaining = duration;
    let startTime = Date.now();
    const progressBar = toast.querySelector(".absolute.bottom-0");
    const closeBtn = toast.querySelector("button");

    // --- Cleanup & Remove Function ---
    const removeToast = () => {
        // Timer එක අයින් කරන්න (හිරවෙන එක නවතී)
        clearTimeout(timerId); 
        
        // අයින් වෙන Animation එක
        toast.style.transform = "translateX(100%)";
        toast.style.opacity = "0";
        
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 500);
    };

    // Close Button Click
    closeBtn.onclick = removeToast;

    // 6. පෙන්වීම (Show)
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.transform = "translateX(0)";
        toast.style.opacity = "1";
    });

    // 7. Timer Logic (Mouse Hover කළාම නවතින විදිහට)
    if (duration > 0) {
        progressBar.style.transition = `transform ${duration}ms linear`;
        
        const startTimer = () => {
            startTime = Date.now();
            timerId = setTimeout(removeToast, remaining);
            progressBar.style.transitionDuration = `${remaining}ms`;
            progressBar.style.transform = "scaleX(0)"; // බාර් එක අඩු වෙනවා
        };

        const pauseTimer = () => {
            clearTimeout(timerId);
            const elapsed = Date.now() - startTime;
            remaining -= elapsed;
            // බාර් එක නතර කරන්න
            progressBar.style.transitionDuration = '0ms';
            const currentScale = remaining / duration;
            progressBar.style.transform = `scaleX(${currentScale})`; 
        };

        const resumeTimer = () => {
            if (remaining > 0) startTimer();
            else removeToast();
        };

        startTimer();

        // Mouse එක උඩට ගෙනාවම Timer නවතී
        toast.addEventListener("mouseenter", pauseTimer);
        toast.addEventListener("mouseleave", resumeTimer);
    }
}

// --- Toggle Password Function (පරණ එකමයි) ---
export function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input && icon) {
        if (input.type === "password") {
            input.type = "text";
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
        } else {
            input.type = "password";
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
        }
    }
}