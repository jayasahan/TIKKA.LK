import React, { useEffect, useRef, useState } from "react";
import { customerService } from "../../services/customer.js";

export default function AuthPanel({ onAuthenticated, intendedService, authError }) {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState(authError || "");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const formRef = useRef(null);
  useEffect(() => { if (authError) setMessage(authError); }, [authError]);

  const register = mode === "register";
  const submit = async (event) => {
    event.preventDefault();
    const form = formRef.current;
    setFieldErrors({});
    if (!form.checkValidity()) {
      const first = Array.from(form.elements).find((field) => field.willValidate && !field.checkValidity());
      const errors = Object.fromEntries(Array.from(form.elements).filter((field) => field.willValidate && !field.checkValidity()).map((field) => [field.name, field.validationMessage]));
      setFieldErrors(errors);
      first?.focus();
      setMessage("Please correct the highlighted fields.");
      return;
    }
    setBusy(true); setMessage(register ? "Creating account..." : "Logging in...");
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const payload = register ? await customerService.register(body) : await customerService.login(body);
      await onAuthenticated(payload);
    } catch (error) {
      const mapped = error.payload?.errors || {};
      setFieldErrors(mapped);
      setMessage(Object.keys(mapped).length ? "Please correct the highlighted fields." : error.message);
    } finally { setBusy(false); }
  };

  return (
    <section className="customer-auth section">
      <div className="container customer-auth__grid">
        <div className="customer-auth__copy"><p className="eyebrow">Customer Portal</p><h1>Request and track your TIKKA jobs.</h1><p>Sign in to manage service requests, see scheduled visits, confirm completed work, and review your TIKKA service.</p><a className="text-action customer-auth__back" href="/#home">Back to TIKKA home</a></div>
        <section className="form-card" aria-labelledby="auth-title"><p className="eyebrow">Customer Access</p><h2 id="auth-title">{register ? "Create an account" : "Sign in"}</h2>
          <div className="auth-mode" role="group" aria-label="Choose account action"><button className={`button button--ghost${!register ? " is-active" : ""}`} type="button" aria-pressed={!register} onClick={() => { setMode("login"); setMessage(""); }}>Sign in</button><button className={`button button--ghost${register ? " is-active" : ""}`} type="button" aria-pressed={register} onClick={() => { setMode("register"); setMessage(""); }}>Create account</button></div>
          <form ref={formRef} className="auth-form" onSubmit={submit} noValidate><div className="form-error-summary" role="alert" hidden={!message}>{message}</div><div className="form-grid">
            {register && <><label className="field"><span>Name <em>required</em></span><input name="name" autoComplete="name" maxLength="120" required aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "name-error" : undefined} />{fieldErrors.name && <span className="field__error" id="name-error">{fieldErrors.name}</span>}</label><label className="field"><span>Phone <em>required</em></span><input name="phone" type="tel" autoComplete="tel" maxLength="30" required aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "phone-error" : undefined} />{fieldErrors.phone && <span className="field__error" id="phone-error">{fieldErrors.phone}</span>}</label></>}
            <label className="field"><span>Email <em>required</em></span><input name="email" type="email" autoComplete="email" required aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />{fieldErrors.email && <span className="field__error" id="email-error">{fieldErrors.email}</span>}</label>
            <label className="field"><span>Password <em>required</em></span><input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength="8" required aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} />{fieldErrors.password && <span className="field__error" id="password-error">{fieldErrors.password}</span>}</label>
          </div><div className="form-actions"><button className="button button--primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? (register ? "Creating..." : "Signing in...") : (register ? "Create account" : "Sign in")}</button></div><div className="form-message" role="status" aria-live="polite">{message}</div></form>
        </section>
      </div>
    </section>
  );
}
