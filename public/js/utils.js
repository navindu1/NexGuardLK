// File: public/js/utils.js

export function showToast({ title, message, type = "info", duration = 5000 }) {
    // 1. Toast Container එක තිබේදැයි බලයි, නැත්නම් හදයි
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        // Container Styles (Inline - ස්ථිරවම වැඩ කිරීමට)
        Object.assign(container.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "9999",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            pointerEvents: "none" // යට තියෙන දේවල් Click කරන්න පුළුවන් වෙන්න
        });
        document.body.appendChild(container);
    }

    // 2. Icons
    const icons = {
        success: "fa-solid fa-check-circle",
        error: "fa-solid fa-times-circle",
        warning: "fa-solid fa-exclamation-triangle",
        info: "fa-solid fa-info-circle"
    };

    // Colors for borders/backgrounds (Optional, used for Old Style feel)
    const typeColors = {
        success: "#22c55e",
        error: "#ef4444",
        warning: "#f59e0b",
        info: "#3b82f6"
    };

    // 3. Toast Element එක හැදීම
    const toast = document.createElement("div");
    
    // Toast Styles (Inline - Animation Stuck නොවෙන්න)
    Object.assign(toast.style, {
        pointerEvents: "auto",
        minWidth: "300px",
        maxWidth: "400px",
        background: "rgba(30, 41, 59, 0.95)", // Dark background
        backdropFilter: "blur(10px)",
        borderLeft: `4px solid ${typeColors[type] || typeColors.info}`,
        borderRadius: "8px",
        padding: "16px",
        color: "white",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center", // හරියටම මැදට (Vertically Center)
        justifyContent: "space-between",
        gap: "12px",
        opacity: "0", // පටන් ගන්නකොට නොපෙනී
        transform: "translateX(50px)", // දකුණේ ඉඳන් එන්න
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)", // Smooth Animation
        marginBottom: "10px"
    });
    
    // HTML Content (Icons Centered)
    toast.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; font-size: 20px; color: ${typeColors[type] || typeColors.info};">
            <i class="${icons[type] || icons.info}"></i>
        </div>
        <div style="flex: 1;">
            <p style="margin: 0; font-weight: 700; font-size: 14px; font-family: 'Orbitron', sans-serif; letter-spacing: 0.5px;">${title}</p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #cbd5e1; line-height: 1.4;">${message}</p>
        </div>
        <button class="toast-close-btn" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
            <i class="fa-solid fa-xmark" style="font-size: 16px;"></i>
        </button>
    `;

    // 4. Remove Function (Stuck නොවෙන්න වගබලා ගනී)
    let isRemoved = false;
    const removeToast = () => {
        if (isRemoved) return;
        isRemoved = true;
        
        // Hide Animation
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)"; // දකුණට යවන්න
        
        // DOM එකෙන් අයින් කිරීම (500ms කට පසු)
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 500);
    };

    // Close Button Event
    const closeBtn = toast.querySelector(".toast-close-btn");
    closeBtn.addEventListener("mouseover", () => closeBtn.style.color = "white");
    closeBtn.addEventListener("mouseleave", () => closeBtn.style.color = "#94a3b8");
    closeBtn.onclick = removeToast;

    // 5. Append & Animate In
    container.appendChild(toast);
    
    // ඊළඟ Frame එකේදී පෙන්වන්න (Animation එක වැඩ කරන්න මේක ඕන)
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(0)";
    });

    // 6. Auto Remove Timer
    if (duration > 0) {
        const timer = setTimeout(removeToast, duration);
        // Mouse එක උඩට ගෙනාවම Timer එක නවත්තන්න ඕන නම් මෙතන Code කරන්න පුළුවන්
        // නමුත් Simpleව තියන්න දැනට ඒක දැම්මේ නෑ.
    }

    // *** වැදගත්ම දේ: අපි Toast Object එක return කරනවා, එතකොට ඕන නම් බලෙන්ම අයින් කරන්න පුළුවන් ***
    return { hide: removeToast };
}

// --- අනිත් Functions (කිසිම වෙනසක් නැත) ---

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
        list.style.setProperty("max-height", (list.querySelectorAll('li').length * list.querySelectorAll('li')[0].offsetHeight + 10) + 'px');
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