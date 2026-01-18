// File: public/js/utils.js

// --- 1. RELOAD LOGIC ---
export function reloadWithToast(title, message, type = "success") {
    const toastData = { title, message, type, timestamp: Date.now() };
    localStorage.setItem('nexguard_pending_toast', JSON.stringify(toastData));
    
    if (window.location.pathname !== "/profile") {
        window.location.href = "/profile";
    } else {
        window.location.reload();
    }
}

// --- 2. TOAST SYSTEM (UPDATED DESIGN - TAILWIND VERSION) ---
export function showToast({ title, message, type = "info", duration = 5000 }) {
    // 1. Container Setup
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        // Tailwind classes: Fixed top-right, z-index high, flex column for stacking
        container.className = "fixed top-5 right-5 z-[999999] flex flex-col gap-3 pointer-events-none";
        document.body.appendChild(container);
    }

    // 2. Icons (SVG) & Colors
    const icons = {
        success: `<svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
        error: `<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
        warning: `<svg class="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`,
        info: `<svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
    };

    const borderColors = {
        success: 'border-green-500',
        error: 'border-red-500',
        warning: 'border-yellow-500',
        info: 'border-blue-500'
    };

    // 3. Create Toast Element
    const toast = document.createElement("div");
    
    // Tailwind Styling: 
    // - bg-white: White background
    // - shadow-lg: Nice drop shadow
    // - rounded-lg: Rounded corners
    // - border-l-4: The colored left border
    // - translate-x-full/opacity-0: Starting state for animation
    toast.className = `pointer-events-auto flex items-start w-full max-w-sm p-4 bg-white rounded-lg shadow-xl dark:bg-gray-800 border-l-4 ${borderColors[type] || 'border-blue-500'} transform transition-all duration-300 translate-x-full opacity-0`;
    
    // HTML Structure
    toast.innerHTML = `
        <div class="flex-shrink-0 pt-0.5">
            ${icons[type] || icons.info}
        </div>
        <div class="ml-3 flex-1">
            <p class="text-sm font-bold text-gray-900 dark:text-white leading-5">${title}</p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-5">${message}</p>
        </div>
        <div class="ml-4 flex-shrink-0 flex">
            <button class="toast-close-btn inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                <span class="sr-only">Close</span>
                <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </button>
        </div>
    `;

    // 4. Remove Function (Slide Out)
    const removeToast = () => {
        toast.classList.add("translate-x-full", "opacity-0");
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300); // Matches transition duration
    };

    // Close Button Event
    const closeBtn = toast.querySelector(".toast-close-btn");
    closeBtn.onclick = removeToast;

    // Append to Container
    container.appendChild(toast);
    
    // Show Animation (Slide In)
    requestAnimationFrame(() => {
        toast.classList.remove("translate-x-full", "opacity-0");
    });

    // 5. Auto Dismiss
    if (duration > 0) {
        setTimeout(removeToast, duration);
    }

    return { hide: removeToast };
}

// --- 3. AUTO CHECKER ---
(function checkPendingToast() {
    try {
        const pending = localStorage.getItem('nexguard_pending_toast');
        if (pending) {
            localStorage.removeItem('nexguard_pending_toast');
            const data = JSON.parse(pending);
            setTimeout(() => {
                showToast({
                    title: data.title,
                    message: data.message,
                    type: data.type,
                    duration: 5000
                });
            }, 500);
        }
    } catch (e) {
        localStorage.removeItem('nexguard_pending_toast');
    }
})();

// --- 4. OTHER UTILS (Animation, Password, Menu, QR) ---

export function initAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

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
        if(list) {
            list.style.setProperty("max-height", (list.querySelectorAll('li').length * list.querySelectorAll('li')[0].offsetHeight + 10) + 'px');
            list.style.setProperty("opacity", "1");
        }
    }
    _close(item) {
        let list = item.closest('li').querySelector(".floating-menu");
        item.classList.remove('open');
        if(list) {
            list.style.removeProperty("max-height");
            list.style.removeProperty("opacity");
        }
    }
    closeAll() {
        let opened = this.menuEl.querySelectorAll('.trigger-menu.open');
        for (const ele of opened) { this._close(ele); }
    }
    _handler(el, ev) {
        ev.stopPropagation();
        if (el.classList.contains('open')) { this._close(el); } else { this._open(el); }
    }
    _on(ele, type, selector, handler) {
        ele.addEventListener(type, function(ev) {
            let el = ev.target.closest(selector);
            if (el) handler.call(this, el, ev);
        });
    }
}

export const qrModalLogic = {
    show: (qrDataUrl, connectionName) => {
        const qrModal = document.getElementById("qr-modal");
        const qrModalContent = document.getElementById("modal-qr-code");
        const qrModalConnectionName = document.getElementById("modal-connection-name");
        if(qrModalContent) {
            qrModalContent.innerHTML = "";
            const img = document.createElement("img");
            img.src = qrDataUrl;
            qrModalContent.appendChild(img);
        }
        if(qrModalConnectionName) qrModalConnectionName.textContent = connectionName;
        if(qrModal) {
            qrModal.style.display = "flex";
            document.body.classList.add("modal-open");
        }
    },
    close: () => {
        const qrModal = document.getElementById("qr-modal");
        if(qrModal) {
            qrModal.style.display = "none";
            document.body.classList.remove("modal-open");
        }
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