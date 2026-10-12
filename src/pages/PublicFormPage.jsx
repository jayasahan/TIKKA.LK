import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formService } from "../services/forms.js";

const initial = { customerName: "", phone: "", service: "", description: "", location: "", preferredDate: "" };

export default function PublicFormPage() {
  const { formId } = useParams();
  const [data, setData] = useState(null); const [values, setValues] = useState(initial); const [errors, setErrors] = useState({});
  const [editToken, setEditToken] = useState(() => sessionStorage.getItem(`tikka-form-${formId}`) || "");
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [submitted, setSubmitted] = useState(false);
  useEffect(() => { formService.publicForm(formId).then(setData).catch((error) => setMessage(error.message)).finally(() => setLoading(false)); }, [formId]);
  const update = (event) => { const { name, value } = event.target; setValues((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: "" })); };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setErrors({}); setMessage("");
    try { const payload = await formService.submit(formId, { ...values, ...(editToken ? { editToken } : {}) }); const token = payload.submission.editToken; setEditToken(token); sessionStorage.setItem(`tikka-form-${formId}`, token); setSubmitted(true); setMessage(payload.message); }
    catch (error) { setErrors(error.payload?.errors || {}); setMessage(error.message); }
    finally { setBusy(false); }
  };
  if (loading) return <main className="public-form-page"><div className="form-card"><p>Loading form…</p></div></main>;
  if (!data) return <main className="public-form-page"><div className="form-card"><p className="eyebrow">TIKKA</p><h1>This form is unavailable</h1><p>{message || "The link may be invalid, disabled, or expired."}</p></div></main>;
  return <main className="public-form-page"><section className="public-form-card form-card"><a className="brand public-form-brand" href="/"><img src="/public/brand/tikka-logo.jpg" alt="TIKKA" width="1600" height="1200" /></a><p className="eyebrow">{data.form.formNumber}</p><h1>{data.form.title}</h1><p>Tell TIKKA what you need. No account is required.</p>{submitted && <div className="alert alert--success" role="status">{message} You can return to this link to update your details.</div>}<form onSubmit={submit} noValidate><label className="field"><span>Full name <em>required</em></span><input name="customerName" value={values.customerName} onChange={update} required aria-invalid={Boolean(errors.customerName)} />{errors.customerName && <small className="field__error">{errors.customerName}</small>}</label><label className="field"><span>Phone <em>required</em></span><input name="phone" type="tel" value={values.phone} onChange={update} required aria-invalid={Boolean(errors.phone)} />{errors.phone && <small className="field__error">{errors.phone}</small>}</label><label className="field"><span>Service category <em>required</em></span><select name="service" value={values.service} onChange={update} required><option value="">Choose a service</option>{data.services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}</select>{errors.service && <small className="field__error">{errors.service}</small>}</label><label className="field"><span>What do you need help with? <em>required</em></span><textarea name="description" value={values.description} onChange={update} required rows="5" />{errors.description && <small className="field__error">{errors.description}</small>}</label><label className="field"><span>Job location or area <em>required</em></span><input name="location" value={values.location} onChange={update} required />{errors.location && <small className="field__error">{errors.location}</small>}</label><label className="field"><span>Preferred date</span><input name="preferredDate" type="date" value={values.preferredDate} onChange={update} min={new Date().toISOString().slice(0, 10)} />{errors.preferredDate && <small className="field__error">{errors.preferredDate}</small>}</label><p className="field__hint">By submitting, you agree that TIKKA may contact you about this service request.</p><div className="form-message" role="alert" hidden={!message || submitted}>{message}</div><button className="button button--primary" type="submit" disabled={busy}>{busy ? "Submitting…" : editToken ? "Update request" : "Submit request"}</button></form></section></main>;
}
