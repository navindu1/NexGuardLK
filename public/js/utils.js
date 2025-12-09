// File: public/js/utils.js

// 1. මේ variables දෙක function එකට උඩින් (Global) තියෙන්න ඕනේ.
// එවිට අපිට පුළුවන් කලින් notification එක ගැන මතක තියාගන්න.
let activeToast = null;
let activeTimeout = null;

export function showToast({ title, message, type = "info", duration = 5000 }) {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }

    // 2. BUG FIX: කලින් පෙන්වපු Notification එකක් තියෙනවා නම්, අලුත් එක පෙන්වන්න කලින් ඒක අයින් කරන්න.
    if (activeToast) {
        // පරණ Timer එක නවත්තන්න
        if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
        }
        // පරණ Element එක තවමත් තිරයේ තියෙනවා නම් එකපාරම අයින් කරන්න
        if (activeToast.parentNode) {
            activeToast.parentNode.removeChild(activeToast);
        }
        activeToast = null;
    }

    const icons = {
        success: "fa-solid fa-check-circle",
        error: "fa-solid fa-times-circle",
        warning: "fa-solid fa-exclamation-triangle",
        info: "fa-solid fa-info-circle"
    };

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<div class="toast-icon"><i class="${icons[type] || icons.info}"></i></div><div class="toast-content"><p class="toast-title">${title}</p><p class="toast-message">${message}</p></div><button class="toast-close-btn" type="button">&times;</button>`;
    
    container.appendChild(toast);
    
    // 3. අලුත් Notification එක 'active' එක විදිහට සෙට් කරන්න
    activeToast = toast;

    // Show animation
    setTimeout(() => toast.classList.add("show"), 100);

    const removeToast = () => {
        toast.classList.remove("show");
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
            
            // අයින් කරන්නේ දැනට තියෙන active එකම නම් විතරක් variable එක null කරන්න
            if (activeToast === toast) {
                activeToast = null;
                activeTimeout = null;
            }
        }, 500);
    };

    // 4. Timer එක activeTimeout විචල්‍යයට දාගන්න (එතකොට පස්සේ ඕන නම් clear කරන්න පුළුවන්)
    activeTimeout = setTimeout(removeToast, duration);

    toast.querySelector(".toast-close-btn").addEventListener("click", () => {
        if (activeTimeout) clearTimeout(activeTimeout);
        removeToast();
    });
}

// පහල තියෙන අනිත් functions (initAnimations, togglePassword, etc.) එහෙමම තියන්න.
export function initAnimations() {
    // ... (ඔයාගේ කලින් කෝඩ් එකේ තිබුණ ඉතුරු කොටස් මෙතනට පහලින් තියෙන්න ඕනේ) ...
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

export function togglePassword(inputId, toggleId) {
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