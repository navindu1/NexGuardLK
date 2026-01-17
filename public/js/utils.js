// File: public/js/utils.js

// --- 1. Updated showToast Function (Fixes stuck issue & centers close button) ---
export function showToast({ title, message, type = "info", duration = 3000 }) {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        // Top-Right placement
        container.className = "fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none"; 
        document.body.appendChild(container);
    }

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

    const toast = document.createElement("div");
    // self-center ensures items align nicely
    toast.className = `
        pointer-events-auto relative flex items-center gap-4 p-4 rounded-xl border ${borderColors[type] || borderColors.info}
        bg-[#1e283c]/95 backdrop-blur-xl shadow-2xl transform transition-all duration-500 ease-out translate-x-10 opacity-0
        w-80 sm:w-96 overflow-hidden group
    `;

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

    let timerId;
    let remaining = duration;
    let startTime = Date.now();
    const progressBar = toast.querySelector(".absolute.bottom-0");
    const closeBtn = toast.querySelector("button");

    const removeToast = () => {
        clearTimeout(timerId); 
        toast.style.transform = "translateX(100%)";
        toast.style.opacity = "0";
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 500);
    };

    closeBtn.onclick = removeToast;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.transform = "translateX(0)";
        toast.style.opacity = "1";
    });

    if (duration > 0) {
        progressBar.style.transition = `transform ${duration}ms linear`;
        
        const startTimer = () => {
            startTime = Date.now();
            timerId = setTimeout(removeToast, remaining);
            progressBar.style.transitionDuration = `${remaining}ms`;
            progressBar.style.transform = "scaleX(0)"; 
        };

        const pauseTimer = () => {
            clearTimeout(timerId);
            const elapsed = Date.now() - startTime;
            remaining -= elapsed;
            progressBar.style.transitionDuration = '0ms';
            const currentScale = remaining / duration;
            progressBar.style.transform = `scaleX(${currentScale})`; 
        };

        const resumeTimer = () => {
            if (remaining > 0) startTimer();
            else removeToast();
        };

        startTimer();
        toast.addEventListener("mouseenter", pauseTimer);
        toast.addEventListener("mouseleave", resumeTimer);
    }
}

// --- 2. Restored initAnimations Function ---
export function initAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.2
    });
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
}

// --- 3. Restored togglePassword Function ---
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

// --- 4. Restored SikFloatingMenu Class ---
export class SikFloatingMenu {
    menuEl = null;
    constructor(_menu) {
        this.menuEl = typeof _menu === 'string' ? document.querySelector(_menu) : _menu;
        this.attachHandlers();
    }
    attachHandlers() {
        if (this.menuEl) {
            this._on(this.menuEl, 'click', '.trigger-menu', this._handler.bind(this));
            document.addEventListener('click', (e) => {
                if (this.menuEl && !this.menuEl.contains(e.target)) {
                    this.closeAll();
                }
            });
        }
    }
    _open(item) {
        this.closeAll();
        item.classList.add('open');
        let list = item.closest('li').querySelector(".floating-menu");
        list.style.setProperty("max-height", this._measureExpandableList(list));
        list.style.setProperty("opacity", "1");
    }
    _close(item) {
        let list = item.closest('li').querySelector(".floating-menu");
        item.classList.remove('open');
        list.style.removeProperty("max-height");
        list.style.removeProperty("opacity");
    }
    closeAll() {
        let opened = this.menuEl.querySelectorAll('.trigger-menu.open');
        for (const ele of opened) {
            this._close(ele);
        }
    }
    _measureExpandableList(list) {
        const items = list.querySelectorAll('li');
        if (items.length === 0) return '0px';
        return (items.length * this._getHeight(items[0], "outer") + 10) + 'px';
    }
    _getHeight(el, type) {
        if (type === 'inner') return el.clientHeight;
        else if (type === 'outer') return el.offsetHeight;
        return 0;
    }
    _handler(el, ev) {
        ev.stopPropagation();
        if (el.classList.contains('open')) {
            this._close(el);
        } else {
            this._open(el);
        }
    }
    _on(ele, type, selector, handler) {
        ele.addEventListener(type, function(ev) {
            let el = ev.target.closest(selector);
            if (el) handler.call(this, el, ev);
        });
    }
}

// --- 5. Restored qrModalLogic Object ---
export const qrModalLogic = {
    show: (qrDataUrl, connectionName) => {
        const qrModal = document.getElementById("qr-modal");
        const qrModalContent = document.getElementById("modal-qr-code");
        const qrModalConnectionName = document.getElementById("modal-connection-name");
        
        qrModalContent.innerHTML = "";
        const img = document.createElement("img");
        img.src = qrDataUrl;
        qrModalContent.appendChild(img);
        qrModalConnectionName.textContent = connectionName;
        qrModal.style.display = "flex";
        document.body.classList.add("modal-open");
    },
    close: () => {
        const qrModal = document.getElementById("qr-modal");
        qrModal.style.display = "none";
        document.body.classList.remove("modal-open");
    },
    init: () => {
        const qrModal = document.getElementById("qr-modal");
        const qrModalCloseBtn = document.getElementById("qr-modal-close-btn");
        
        qrModalCloseBtn?.addEventListener("click", qrModalLogic.close);
        qrModal?.addEventListener("click", (e) => {
            if (e.target === qrModal) qrModalLogic.close();
        });
    }
};