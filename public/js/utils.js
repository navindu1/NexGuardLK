// File: public/js/utils.js

// --- 1. RELOAD LOGIC (පිටුව මාරු වන විට මැසේජ් පෙන්වීමට) ---
export function reloadWithToast(title, message, type = "success") {
    const toastData = { title, message, type, timestamp: Date.now() };
    localStorage.setItem('nexguard_pending_toast', JSON.stringify(toastData));
    
    if (window.location.pathname !== "/profile") {
        window.location.href = "/profile";
    } else {
        window.location.reload();
    }
}

// --- 2. NEW MODERN TOAST SYSTEM (Glassmorphism Design) ---
export function showToast({ title, message, type = "info", duration = 5000 }) {
    // 1. Container Setup (Container එක සොයාගැනීම හෝ අලුතින් සෑදීම)
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        // සටහන: මෙහි Styles දැන් modern.css ගොනුවෙන් පාලනය වේ.
        // (#toast-container ලෙස CSS එකේ ඇත)
        document.body.appendChild(container);
    }

    // 2. Icon Mapping (FontAwesome අයිකන)
    const icons = {
        success: 'fa-solid fa-circle-check',
        error: 'fa-solid fa-circle-exclamation',
        warning: 'fa-solid fa-triangle-exclamation',
        info: 'fa-solid fa-circle-info'
    };

    // 3. Create Toast Element (modern.css හි ඇති Classes භාවිතා කිරීම)
    const toast = document.createElement("div");
    
    // 'toast' සහ 'toast--[type]' යන පන්ති (Classes) එකතු කිරීම
    toast.className = `toast toast--${type}`;
    
    // HTML Structure (CSS වලට ගැලපෙන ලෙස)
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="${icons[type] || icons.info}"></i>
        </div>
        <div class="toast-content">
            <h3 class="toast-title">${title}</h3>
            <p class="toast-message">${message}</p>
        </div>
        <button class="toast-close-btn">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    // 4. Remove Function (Slide Out Animation)
    const removeToast = () => {
        toast.classList.remove("show"); // CSS Transition මගින් ඉවත් වේ
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 400); // 0.4s කාලයක් රැදී සිට ඉවත් වේ
    };

    // Close Button Event
    const closeBtn = toast.querySelector(".toast-close-btn");
    if (closeBtn) {
        closeBtn.onclick = removeToast;
    }

    // Append to Container
    container.appendChild(toast);
    
    // Show Animation (Slide In)
    // කුඩා කාල පරතරයකට පසු 'show' class එක එකතු කරයි
    requestAnimationFrame(() => {
        setTimeout(() => {
            toast.classList.add("show");
        }, 10);
    });

    // 5. Auto Dismiss (ස්වයංක්‍රීයව ඉවත් වීම)
    if (duration > 0) {
        setTimeout(removeToast, duration);
    }

    return { hide: removeToast };
}

// --- 3. AUTO CHECKER (Sign Up -> Profile Stuck Fix) ---
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

// --- 4. OTHER UTILS (Animation, Floating Menu, QR, Toggle Password) ---

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
        
        if (qrModalContent) {
            qrModalContent.innerHTML = "";
            const img = document.createElement("img");
            img.src = qrDataUrl;
            qrModalContent.appendChild(img);
        }
        
        if (qrModalConnectionName) {
            qrModalConnectionName.textContent = connectionName;
        }

        if (qrModal) {
            qrModal.style.display = "flex";
            document.body.classList.add("modal-open");
        }
    },
    close: () => {
        const qrModal = document.getElementById("qr-modal");
        if (qrModal) {
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