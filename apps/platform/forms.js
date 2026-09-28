(function setupTikkaForms(global) {
  let generatedId = 0;

  function controlId(control) {
    if (!control.id) {
      generatedId += 1;
      const name = String(control.name || "field").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
      control.id = `field-${name}-${generatedId}`;
    }
    return control.id;
  }

  function descriptionIds(control) {
    return new Set(String(control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  }

  function fieldContainer(control) {
    return control.closest(".field, label") || control.parentElement;
  }

  function clearFieldError(control) {
    if (!control) return;
    const errorId = `${controlId(control)}-error`;
    const error = document.getElementById(errorId);
    if (error) error.remove();
    const ids = descriptionIds(control);
    ids.delete(errorId);
    if (ids.size) control.setAttribute("aria-describedby", Array.from(ids).join(" "));
    else control.removeAttribute("aria-describedby");
    control.removeAttribute("aria-invalid");
  }

  function setFieldError(control, message) {
    if (!control || !message) return;
    clearFieldError(control);
    const errorId = `${controlId(control)}-error`;
    const error = document.createElement("span");
    error.className = "field__error";
    error.id = errorId;
    error.dataset.fieldError = "";
    error.textContent = message;
    fieldContainer(control)?.append(error);
    const ids = descriptionIds(control);
    ids.add(errorId);
    control.setAttribute("aria-describedby", Array.from(ids).join(" "));
    control.setAttribute("aria-invalid", "true");
  }

  function clear(form) {
    if (!form) return;
    form.querySelectorAll("input, select, textarea").forEach(clearFieldError);
    form.querySelectorAll("[data-error-summary]").forEach((summary) => {
      summary.textContent = "";
      summary.hidden = true;
    });
  }

  function invalidControls(form) {
    return Array.from(form.elements).filter((control) => (
      control instanceof HTMLElement &&
      typeof control.checkValidity === "function" &&
      control.willValidate &&
      !control.checkValidity()
    ));
  }

  function showSummary(form, count) {
    const summary = form.querySelector("[data-error-summary]");
    if (!summary) return;
    summary.textContent = count === 1
      ? "Please correct the highlighted field."
      : `Please correct the ${count} highlighted fields.`;
    summary.hidden = false;
  }

  function validate(form, options = {}) {
    clear(form);
    const invalid = invalidControls(form);
    invalid.forEach((control) => setFieldError(control, control.validationMessage));
    if (!invalid.length) return true;
    showSummary(form, invalid.length);
    if (options.focus !== false) invalid[0].focus();
    return false;
  }

  function applyServerErrors(form, errors, options = {}) {
    if (!form || !errors || typeof errors !== "object") return false;
    clear(form);
    let first = null;
    let count = 0;
    Object.entries(errors).forEach(([name, message]) => {
      const control = form.elements.namedItem(name);
      if (!(control instanceof HTMLElement)) return;
      setFieldError(control, String(message));
      if (!first) first = control;
      count += 1;
    });
    if (!count) return false;
    showSummary(form, count);
    if (options.focus !== false) first.focus();
    return true;
  }

  function bind(form) {
    if (!form || form.dataset.validationBound === "true") return;
    form.dataset.validationBound = "true";
    const clearForEvent = (event) => {
      const control = event.target.closest("input, select, textarea");
      if (control) clearFieldError(control);
    };
    form.addEventListener("input", clearForEvent);
    form.addEventListener("change", clearForEvent);
  }

  function setBusy(button, busy, label = "Working...") {
    if (!button) return;
    const form = button.form;
    if (busy) {
      if (button.dataset.busy === "true") return;
      button.dataset.busy = "true";
      button.dataset.idleLabel = button.textContent.trim();
      button.style.minWidth = `${Math.ceil(button.getBoundingClientRect().width)}px`;
      button.textContent = label;
      button.classList.add("is-busy");
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      if (form) form.setAttribute("aria-busy", "true");
      return;
    }
    if (button.dataset.busy !== "true") return;
    button.textContent = button.dataset.idleLabel || button.textContent;
    delete button.dataset.busy;
    delete button.dataset.idleLabel;
    button.style.minWidth = "";
    button.classList.remove("is-busy");
    button.removeAttribute("aria-busy");
    button.disabled = false;
    if (form) form.removeAttribute("aria-busy");
  }

  global.TikkaForms = {
    applyServerErrors,
    bind,
    clear,
    clearFieldError,
    setBusy,
    setFieldError,
    validate
  };
}(window));
