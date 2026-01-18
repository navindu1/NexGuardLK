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

// --- 2. TOAST SYSTEM (UPDATED DESIGN) ---
export function showToast({ title, message, type = "info", duration = 5000 }) {
    // 1. Container Setup
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        Object.assign(container.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "999999",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            pointerEvents: "none"
        });
        document.body.appendChild(container);
    }

    // 2. Icons & Colors
    const icons = {
        success: "fa-solid fa-circle-check",
        error: "fa-solid fa-circle-xmark",
        warning: "fa-solid fa-triangle-exclamation",
        info: "fa-solid fa-circle-info"
    };

    const typeColors = {
        success: "#2ecc71", // Green
        error: "#e74c3c",   // Red
        warning: "#f1c40f", // Yellow
        info: "#3498db"     // Blue
    };

    // 3. Create Toast Element
    const toast = document.createElement("div");
    
    // --- STYLES (White Box + Center Alignment) ---
    Object.assign(toast.style, {
        pointerEvents: "auto",
        minWidth: "320px",
        maxWidth: "450px",
        backgroundColor: "#ffffff",
        borderLeft: `5px solid ${typeColors[type] || typeColors.info}`,
        borderRadius: "4px",
        padding: "12px 20px", // Padding එක තරමක් අඩු කලා ලස්සනට පෙනෙන්න
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        display: "flex",
        alignItems: "center", // *** මෙය තමයි Icon සහ Button මැදට ගන්නේ ***
        justifyContent: "space-between",
        gap: "15px",
        opacity: "0",
        transform: "translateX(50px)",
        transition: "all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)",
        fontFamily: "'Inter', sans-serif",
        marginBottom: "10px"
    });
    
    // HTML Content
    toast.innerHTML = `
        <div style="font-size: 24px; color: ${typeColors[type] || typeColors.info}; display: flex; align-items: center; justify-content: center;">
            <i class="${icons[type] || icons.info}"></i>
        </div>
        
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
            <p style="margin: 0; font-weight: 700; font-size: 16px; color: #333333; line-height: 1.2;">${title}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #666666; line-height: 1.4;">${message}</p>
        </div>
        
        <button class="toast-close-btn" style="
            background: none; 
            border: none; 
            color: #999999; 
            cursor: pointer; 
            font-size: 18px; 
            padding: 5px; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            transition: color 0.2s;
            height: 100%;
        ">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    // 4. Remove Function
    let isRemoved = false;
    const removeToast = () => {
        if (isRemoved) return;
        isRemoved = true;
        
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    };

    // Close Button Events
    const closeBtn = toast.querySelector(".toast-close-btn");
    closeBtn.addEventListener("mouseover", () => closeBtn.style.color = "#333");
    closeBtn.addEventListener("mouseleave", () => closeBtn.style.color = "#999");
    closeBtn.onclick = removeToast;

    // Append to Container
    container.appendChild(toast);
    
    // Show Animation
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(0)";
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