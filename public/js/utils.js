// File: public/js/utils.js

export function showToast({ title, message, type = "info", duration = 5000 }) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    // Container එකේ පිහිටීම (දකුණු පස පහළ හෝ ඉහළ) CSS මගින් පාලනය වේ
    document.body.appendChild(container);
  }

  const icons = {
    success: "fa-solid fa-check-circle",
    error: "fa-solid fa-times-circle",
    warning: "fa-solid fa-exclamation-triangle",
    info: "fa-solid fa-info-circle",
  };

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;

  // --- මෙන්න වෙනස්කම: Icons මැදට ගන්න Inline Styles භාවිතා කළා ---
  // Flexbox භාවිතා කර Icons සහ Content එක පේළියට සහ මැදට (Center) ගෙන ඇත.
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.justifyContent = "space-between"; // Content සහ Close button දෙපැත්තට

  toast.innerHTML = `
        <div class="toast-icon" style="display: flex; align-items: center; justify-content: center; height: 100%;">
            <i class="${icons[type] || icons.info}"></i>
        </div>
        <div class="toast-content" style="flex-grow: 1; margin: 0 12px;">
            <p class="toast-title" style="margin: 0; font-weight: bold;">${title}</p>
            <p class="toast-message" style="margin: 4px 0 0;">${message}</p>
        </div>
        <button class="toast-close-btn" type="button" style="display: flex; align-items: center; justify-content: center; height: 100%; cursor: pointer;">
            &times;
        </button>
    `;

  container.appendChild(toast);

  // Animation Show
  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  // --- Stuck Fix Logic ---
  const removeToast = () => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 500);
  };

  let dismissTimeout;
  if (duration > 0) {
    dismissTimeout = setTimeout(removeToast, duration);
  }

  const closeBtn = toast.querySelector(".toast-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (dismissTimeout) clearTimeout(dismissTimeout);
      removeToast();
    });
  }
}

// --- අනිත් Functions (Animation, Toggle Password etc.) ---

export function initAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll(".reveal").forEach((el) => {
    observer.observe(el);
  });
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
    this.menuEl =
      typeof _menu === "string" ? document.querySelector(_menu) : _menu;
    this.attachHandlers();
  }
  attachHandlers() {
    if (this.menuEl) {
      this._on(this.menuEl, "click", ".trigger-menu", this._handler.bind(this));
      document.addEventListener("click", (e) => {
        if (this.menuEl && !this.menuEl.contains(e.target)) {
          this.closeAll();
        }
      });
    }
  }
  _open(item) {
    this.closeAll();
    item.classList.add("open");
    let list = item.closest("li").querySelector(".floating-menu");
    list.style.setProperty("max-height", this._measureExpandableList(list));
    list.style.setProperty("opacity", "1");
  }
  _close(item) {
    let list = item.closest("li").querySelector(".floating-menu");
    item.classList.remove("open");
    list.style.removeProperty("max-height");
    list.style.removeProperty("opacity");
  }
  closeAll() {
    let opened = this.menuEl.querySelectorAll(".trigger-menu.open");
    for (const ele of opened) {
      this._close(ele);
    }
  }
  _measureExpandableList(list) {
    const items = list.querySelectorAll("li");
    if (items.length === 0) return "0px";
    return items.length * this._getHeight(items[0], "outer") + 10 + "px";
  }
  _getHeight(el, type) {
    if (type === "inner") return el.clientHeight;
    else if (type === "outer") return el.offsetHeight;
    return 0;
  }
  _handler(el, ev) {
    ev.stopPropagation();
    if (el.classList.contains("open")) {
      this._close(el);
    } else {
      this._open(el);
    }
  }
  _on(ele, type, selector, handler) {
    ele.addEventListener(type, function (ev) {
      let el = ev.target.closest(selector);
      if (el) handler.call(this, el, ev);
    });
  }
}

export const qrModalLogic = {
  show: (qrDataUrl, connectionName) => {
    const qrModal = document.getElementById("qr-modal");
    const qrModalContent = document.getElementById("modal-qr-code");
    const qrModalConnectionName = document.getElementById(
      "modal-connection-name"
    );

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
  },
};
