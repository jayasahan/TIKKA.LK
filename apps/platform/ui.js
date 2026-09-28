(function setupTikkaUI(global) {
  const statusMap = {
    NEW: { label: "New", customerLabel: "Request Received", tone: "neutral" },
    REVIEWING: { label: "Under review", tone: "info" },
    SCHEDULED: { label: "Scheduled", tone: "scheduled" },
    ASSIGNED: { label: "Assigned", customerLabel: "Technician Assigned", tone: "scheduled" },
    IN_PROGRESS: { label: "In progress", tone: "info" },
    COMPLETED: { label: "Completed", tone: "success" },
    CONFIRMED: { label: "Confirmed", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "danger" },
    REJECTED: { label: "Rejected", tone: "danger" },
    AVAILABLE: { label: "Available", tone: "success" },
    BUSY: { label: "Busy", tone: "scheduled" },
    INACTIVE: { label: "Inactive", tone: "neutral" },
    ACTIVE: { label: "Active", tone: "success" },
    ENABLED: { label: "Enabled", tone: "success" },
    DISABLED: { label: "Disabled", tone: "neutral" }
  };
  let toastTimer;
  let dialogSequence = 0;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function statusMeta(status, audience = "admin") {
    const key = String(status || "").toUpperCase();
    const fallback = key.replaceAll("_", " ").toLowerCase();
    const fallbackLabel = fallback ? `${fallback.charAt(0).toUpperCase()}${fallback.slice(1)}` : "Unknown";
    const meta = statusMap[key] || { label: fallbackLabel, tone: "neutral" };
    return {
      label: audience === "customer" && meta.customerLabel ? meta.customerLabel : meta.label,
      tone: meta.tone
    };
  }

  function statusBadge(status, audience = "admin") {
    const meta = statusMeta(status, audience);
    return `<span class="status-badge status-badge--${meta.tone}">${escapeHtml(meta.label)}</span>`;
  }

  function alertMarkup({ tone = "info", heading = "", body, actionLabel, actionAttribute = "", live = false }) {
    const title = heading ? `<h3>${escapeHtml(heading)}</h3>` : "";
    const action = actionLabel
      ? `<button class="button button--secondary" type="button" ${actionAttribute}>${escapeHtml(actionLabel)}</button>`
      : "";
    const liveAttributes = live ? (tone === "error" ? ' role="alert"' : ' role="status"') : "";
    return `<div class="alert alert--${escapeHtml(tone)}"${liveAttributes}>${title}<p>${escapeHtml(body)}</p>${action}</div>`;
  }

  function stateMarkup({ kind = "empty", heading, body, actionLabel, actionAttribute = "" }) {
    const action = actionLabel
      ? `<button class="button button--secondary" type="button" ${actionAttribute}>${escapeHtml(actionLabel)}</button>`
      : "";
    const role = kind === "error" ? ' role="alert"' : "";
    return `<div class="ui-state ui-state--${escapeHtml(kind)}"${role}>
      <h3>${escapeHtml(heading)}</h3>
      <p>${escapeHtml(body)}</p>
      ${action}
    </div>`;
  }

  function skeleton(kind = "card", count = 1) {
    const items = Array.from({ length: count }, () => `<div class="skeleton skeleton--${escapeHtml(kind)}">
      <span class="skeleton__line skeleton__line--short"></span>
      <span class="skeleton__line"></span>
      ${kind === "card" || kind === "detail" ? '<span class="skeleton__line"></span>' : ""}
    </div>`).join("");
    return `<div class="skeleton-group skeleton-group--${escapeHtml(kind)}" aria-hidden="true">${items}</div>`;
  }

  function loadingMarkup(label = "Loading...") {
    return `<div class="region-loading" role="status"><span class="region-loading__indicator" aria-hidden="true"></span>${escapeHtml(label)}</div>`;
  }

  function setRegionBusy(region, busy) {
    if (!region) return;
    region.setAttribute("aria-busy", String(Boolean(busy)));
  }

  function scrollIntoView(element, options = {}) {
    if (!element) return;
    const reducedMotion = global.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({
      ...options,
      behavior: reducedMotion ? "auto" : (options.behavior || "smooth")
    });
  }

  function setupMenu(toggle, menu, options = {}) {
    if (!toggle || !menu) return null;
    const desktopQuery = options.desktopQuery || "(min-width: 760px)";
    const itemSelector = options.itemSelector || "a";
    const media = global.matchMedia(desktopQuery);
    const label = toggle.querySelector(".sr-only");
    let open = false;

    const items = () => Array.from(menu.querySelectorAll(itemSelector));
    const setItemAccess = (enabled) => items().forEach((item) => {
      if (enabled) item.removeAttribute("tabindex");
      else item.setAttribute("tabindex", "-1");
    });
    const setLabel = (isOpen) => {
      if (label) label.textContent = isOpen ? "Close menu" : "Open menu";
    };
    const close = (returnFocus = false) => {
      open = false;
      toggle.setAttribute("aria-expanded", "false");
      menu.setAttribute("aria-hidden", String(!media.matches));
      menu.classList.remove("is-open");
      document.body.classList.remove("nav-open");
      setLabel(false);
      if (!media.matches) setItemAccess(false);
      if (returnFocus) toggle.focus();
    };
    const openMenu = () => {
      if (media.matches || toggle.disabled || toggle.hidden) return;
      open = true;
      toggle.setAttribute("aria-expanded", "true");
      menu.setAttribute("aria-hidden", "false");
      menu.classList.add("is-open");
      document.body.classList.add("nav-open");
      setLabel(true);
      setItemAccess(true);
      items()[0]?.focus();
    };
    const sync = () => {
      if (media.matches) {
        open = false;
        toggle.setAttribute("aria-expanded", "false");
        menu.setAttribute("aria-hidden", "false");
        menu.classList.remove("is-open");
        document.body.classList.remove("nav-open");
        setLabel(false);
        setItemAccess(true);
      } else if (!open) {
        close(false);
      }
    };
    toggle.addEventListener("click", () => (open ? close(true) : openMenu()));
    menu.addEventListener("click", (event) => {
      if (event.target.closest(itemSelector)) close(true);
    });
    document.addEventListener("click", (event) => {
      if (open && !menu.contains(event.target) && !toggle.contains(event.target)) close(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && open) close(true);
    });
    global.addEventListener("resize", sync, { passive: true });
    media.addEventListener?.("change", sync);
    sync();
    return { close, sync };
  }

  function confirmAction({ title, body, confirmLabel = "Confirm", trigger, danger = true }) {
    let dialog = document.querySelector("[data-confirm-dialog]");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "confirm-dialog";
      dialog.dataset.confirmDialog = "";
      const sequence = ++dialogSequence;
      const titleId = `tikka-confirm-title-${sequence}`;
      const descriptionId = `tikka-confirm-description-${sequence}`;
      dialog.setAttribute("aria-labelledby", titleId);
      dialog.setAttribute("aria-describedby", descriptionId);
      dialog.innerHTML = `<form method="dialog" class="confirm-dialog__surface">
        <h2 id="${titleId}" data-confirm-title></h2>
        <p id="${descriptionId}" data-confirm-body></p>
        <div class="confirm-dialog__actions">
          <button class="button button--secondary" type="submit" value="cancel" data-confirm-cancel>Cancel</button>
          <button class="button button--danger" type="submit" value="confirm" data-confirm-accept></button>
        </div>
      </form>`;
      document.body.append(dialog);
    }
    if (dialog.open) return Promise.resolve(false);
    const form = dialog.querySelector("form");
    const accept = dialog.querySelector("[data-confirm-accept]");
    const cancel = dialog.querySelector("[data-confirm-cancel]");
    dialog.querySelector("[data-confirm-title]").textContent = title;
    dialog.querySelector("[data-confirm-body]").textContent = body;
    accept.textContent = confirmLabel;
    accept.classList.toggle("button--danger", danger);
    let settled = false;
    const restoreTarget = trigger instanceof HTMLElement ? trigger : document.activeElement;
    return new Promise((resolve) => {
      const finish = (result) => {
        if (settled) return;
        settled = true;
        dialog.close();
        form.removeEventListener("submit", onSubmit);
        dialog.removeEventListener("cancel", onCancel);
        if (restoreTarget?.isConnected) restoreTarget.focus();
        resolve(result);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        finish(event.submitter === accept);
      };
      const onCancel = (event) => {
        event.preventDefault();
        finish(false);
      };
      form.addEventListener("submit", onSubmit);
      dialog.addEventListener("cancel", onCancel);
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      accept.focus();
    });
  }

  function toast(message, tone = "success") {
    const region = document.querySelector("[data-toast-region]");
    if (!region || !message) return;
    global.clearTimeout(toastTimer);
    region.replaceChildren();
    const item = document.createElement("div");
    item.className = `toast toast--${tone}`;
    item.textContent = message;
    region.append(item);
    requestAnimationFrame(() => item.classList.add("is-visible"));
    toastTimer = global.setTimeout(() => {
      item.classList.remove("is-visible");
      global.setTimeout(() => item.remove(), 220);
    }, 6000);
  }

  global.TikkaUI = {
    alertMarkup,
    confirmAction,
    escapeHtml,
    loadingMarkup,
    setupMenu,
    setRegionBusy,
    scrollIntoView,
    skeleton,
    stateMarkup,
    statusBadge,
    statusMeta,
    toast
  };
}(window));
