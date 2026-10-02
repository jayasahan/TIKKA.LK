import React, { useState } from "react";
import { adminService } from "../services/admin.js";

export default function AdminLoginPage() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [errors, setErrors] = useState({});
  const submit = async (event) => {
    event.preventDefault(); const form = event.currentTarget; setErrors({});
    if (!form.checkValidity()) { form.reportValidity(); setMessage("Please correct the highlighted fields."); return; }
    setBusy(true); setMessage("Signing in...");
    try { await adminService.login(Object.fromEntries(new FormData(form).entries())); window.location.replace("/admin.html"); }
    catch (error) { setErrors(error.payload?.errors || {}); setMessage(Object.keys(error.payload?.errors || {}).length ? "Please correct the highlighted fields." : error.message); }
    finally { setBusy(false); }
  };
  return <main id="main" className="ops-login"><section className="ops-login__card"><a className="brand" href="/#home" aria-label="TIKKA home"><img src="/public/brand/tikka-logo.jpg" alt="TIKKA logo" width="1600" height="1200" /></a><p className="eyebrow">TIKKA Operations</p><h1>Admin sign in</h1><p>Secure access for TIKKA operations.</p><form onSubmit={submit} noValidate><div className="form-error-summary" role="alert" hidden={!message}>{message}</div><label className="field"><span>Email <em>required</em></span><input name="email" type="email" autoComplete="username" required aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "admin-email-error" : undefined} />{errors.email && <span className="field__error" id="admin-email-error">{errors.email}</span>}</label><label className="field"><span>Password <em>required</em></span><input name="password" type="password" autoComplete="current-password" required minLength="8" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "admin-password-error" : undefined} />{errors.password && <span className="field__error" id="admin-password-error">{errors.password}</span>}</label><button className="button button--primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Signing in..." : "Sign in"}</button><div className="form-message" role="status" aria-live="polite">{message}</div></form><a className="text-action ops-login__back" href="/#home">Back to TIKKA home</a></section></main>;
}
