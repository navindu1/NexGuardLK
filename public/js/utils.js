// File: public/js/utils.js

// --- 1. RELOAD LOGIC (ස්ථිර විසඳුම) ---
// පිටුව Reload වුනාට පස්සේ මැසේජ් එක පෙන්වන්න මේක පාවිච්චි කරන්න
export function reloadWithToast(title, message, type = "success") {
    const toastData = { title, message, type, timestamp: Date.now() };
    localStorage.setItem('nexguard_pending_toast', JSON.stringify(toastData));
    window.location.reload();
}

// --- 2. TOAST UI (OLD DESIGN) ---
export function showToast({ title, message, type = "info", duration = 5000 }) {
    // Container එක තිබේදැයි බලයි, නැත්නම් හදයි
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        // Container Styles (Inline - ස්ථිරවම වැඩ කිරීමට)
        Object.assign(container.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "99999",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            pointerEvents: "none"
        });
        document.body.appendChild(container);
    }

    // Icons (Old Design Icons)
    const icons = {
        success: "fa-solid fa-circle-check",
        error: "fa-solid fa-circle-xmark",
        warning: "fa-solid fa-triangle-exclamation",
        info: "fa-solid fa-circle-info"
    };

    // Colors (Old Design Colors)
    const typeColors = {
        success: "#2ecc71", // Green
        error: "#e74c3c",   // Red
        warning: "#f1c40f", // Yellow
        info: "#3498db"     // Blue
    };

    const toast = document.createElement("div");
    
    // --- OLD DESIGN STYLES ---
    // සුදු පසුබිම, වම් පැත්තේ පාට තීරුව
    Object.assign(toast.style, {
        pointerEvents: "auto",
        minWidth: "300px",
        maxWidth: "400px",
        background: "#ffffff", // සුදු පසුබිම (Old Style)
        borderLeft: `5px solid ${typeColors[type] || typeColors.info}`, // වම් පැත්තේ පාට ඉර
        borderRadius: "4px", // කොටු හැඩය (Old Style)
        padding: "15px 20px",
        boxShadow: "0 5px 15px rgba(0, 0, 0, 0.15)", // සාමාන්‍ය සෙවනැල්ල
        display: "flex",
        alignItems: "center", // මැදට කිරීම
        justifyContent: "space-between",
        gap: "15px",
        opacity: "0",
        transform: "translateX(50px)",
        transition: "all 0.3s ease-out",
        fontFamily: "'Inter', sans-serif"
    });
    
    // HTML Content (Old Layout)
    toast.innerHTML = `
        <div style="font-size: 24px; color: ${typeColors[type] || typeColors.info}; display: flex; align-items: center;">
            <i class="${icons[type] || icons.info}"></i>
        </div>
        <div style="flex: 1;">
            <p style="margin: 0; font-weight: 700; font-size: 16px; color: #333;">${title}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #666; line-height: 1.4;">${message}</p>
        </div>
        <button class="toast-close-btn" style="background: none; border: none; color: #999; cursor: pointer; font-size: 18px; padding: 5px; display: flex; align-items: center;">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    // Remove Logic (Stuck නොවෙන විදිහට JS වලින්ම අයින් කරනවා)
    const removeToast = () => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        setTimeout(() => {
            if (toast.parentElement) toast.parentElement.removeChild(toast);
        }, 300);
    };

    // Close Button Action
    const closeBtn = toast.querySelector(".toast-close-btn");
    closeBtn.addEventListener("mouseover", () => closeBtn.style.color = "#333");
    closeBtn.addEventListener("mouseleave", () => closeBtn.style.color = "#999");
    closeBtn.onclick = removeToast;

    // Append to Container
    container.appendChild(toast);
    
    // Animate In
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(0)";
    });

    // Auto Remove Timer
    if (duration > 0) {
        setTimeout(removeToast, duration);
    }

    return { hide: removeToast };
}

// --- 3. AUTO CHECKER (RELOAD FIX) ---
// Page එක Load වෙන හැම වෙලාවෙම පරණ මැසේජ් තියෙනවද බලනවා
(function checkPendingToast() {
    try {
        const pending = localStorage.getItem('nexguard_pending_toast');
        if (pending) {
            localStorage.removeItem('nexguard_pending_toast'); // මකලා දානවා
            const data = JSON.parse(pending);
            
            // විනාඩියකට වඩා පරණ මැසේජ් පෙන්වන්නේ නෑ
            if (Date.now() - data.timestamp < 60000) {
                setTimeout(() => {
                    showToast({
                        title: data.title,
                        message: data.message,
                        type: data.type,
                        duration: 5000
                    });
                }, 500);
            }
        }
    } catch (e) {
        localStorage.removeItem('nexguard_pending_toast');
    }
})();

// --- 4. OTHER UTILS (UNCHANGED) ---

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