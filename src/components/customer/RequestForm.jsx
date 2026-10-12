import React, { useEffect, useRef, useState } from "react";
import { customerService } from "../../services/customer.js";

function today() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

export default function RequestForm({ services, customer, intendedService, onSuccess, onMessage }) {
  const formRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [photoHint, setPhotoHint] = useState("Up to 6 JPG, PNG, or WebP images. Maximum 8 MB each.");
  const initialService = services.some((item) => item.name === intendedService) ? intendedService : "";
  useEffect(() => {
    if (!formRef.current || !customer) return;
    formRef.current.customerName.value = customer.name || "";
    formRef.current.phone.value = customer.phone || "";
    formRef.current.email.value = customer.email || "";
  }, [customer]);
  const submit = async (event) => {
    event.preventDefault();
    const form = formRef.current;
    setMessage(""); setError(false);
    if (!form.checkValidity()) { form.reportValidity(); setMessage("Please correct the highlighted fields."); setError(true); return; }
    setBusy(true); setMessage("Uploading photos and submitting request...");
    const uploadedIds = [];
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const files = [...(form.photos.files || [])];
      if (files.length > 6) throw new Error("Upload no more than 6 images.");
      files.forEach((file) => {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Only JPG, PNG, and WebP images are allowed.");
        if (file.size > 8 * 1024 * 1024) throw new Error("Each image must be 8 MB or smaller.");
      });
      body.photos = [];
      for (const file of files) {
        const signature = await customerService.uploadSignature();
        uploadedIds.push(signature.uploadId);
        const uploadForm = new FormData();
        Object.entries(signature.uploadParams).forEach(([key, value]) => uploadForm.append(key, value));
        uploadForm.append("api_key", signature.apiKey);
        uploadForm.append("signature", signature.signature);
        uploadForm.append("file", file);
        const cloudinaryResponse = await fetch(signature.uploadUrl, { method: "POST", body: uploadForm });
        const cloudinaryPayload = await cloudinaryResponse.json();
        if (!cloudinaryResponse.ok) throw new Error(cloudinaryPayload.error?.message || "A photo could not be uploaded.");
        const completed = await customerService.completeUpload({
          uploadId: signature.uploadId,
          publicId: cloudinaryPayload.public_id,
          assetId: cloudinaryPayload.asset_id,
          fileName: file.name,
          mimeType: file.type,
          bytes: cloudinaryPayload.bytes,
          width: cloudinaryPayload.width,
          height: cloudinaryPayload.height,
          format: cloudinaryPayload.format
        });
        body.photos.push(completed.attachment);
      }
      const payload = await customerService.createRequest(body);
      form.reset();
      if (customer) { form.customerName.value = customer.name || ""; form.phone.value = customer.phone || ""; form.email.value = customer.email || ""; }
      await onSuccess(payload);
      setMessage("");
    } catch (requestError) {
      if (uploadedIds.length) await customerService.releaseUploads(uploadedIds).catch(() => {});
      setMessage(requestError.payload?.errors ? Object.values(requestError.payload.errors).join(" ") : requestError.message); setError(true);
    } finally { setBusy(false); }
  };
  return <section className="section request-flow" id="request" aria-labelledby="request-form-title"><div className="container request-layout customer-request-layout"><div className="section-heading"><p className="eyebrow">Request a Service</p><h2 id="request-form-title">Tell us what needs to be done.</h2><p className="muted">TIKKA will review your request, schedule the visit, and show your Assigned Technician or team.</p></div><form ref={formRef} className="form-card request-form customer-request-form" onSubmit={submit} noValidate>
    <div className="form-error-summary" role="alert" hidden={!error}>{error ? message : ""}</div>
    <fieldset><legend>1. Service</legend><label className="field"><span>Service category <em>required</em></span><select name="service" defaultValue={initialService} required><option value="">Choose a service</option>{services.map((service) => <option key={service.name} value={service.name}>{service.name}</option>)}</select></label></fieldset>
    <fieldset><legend>2. Job details</legend><div className="form-grid"><label className="field"><span>Job title <em>required</em></span><input name="title" required maxLength="140" placeholder="Kitchen tap leak" /></label><label className="field form-span"><span>Job description <em>required</em></span><textarea name="description" required maxLength="1200" rows="5" placeholder="Tell us what needs to be done." /></label><label className="field form-span"><span>Photos <em>optional</em></span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotoHint(event.target.files.length ? `${event.target.files.length} photo${event.target.files.length === 1 ? "" : "s"} selected. ${event.target.files.length > 6 ? "Choose no more than 6." : ""}` : "Up to 6 JPG, PNG, or WebP images. Maximum 8 MB each.")} aria-describedby="photos-hint" /><small className="field__hint" id="photos-hint">{photoHint} Photos are private and only shared with TIKKA operations for this request.</small></label></div></fieldset>
    <fieldset><legend>3. Location and contact</legend><div className="form-grid"><label className="field"><span>Customer name <em>required</em></span><input name="customerName" required autoComplete="name" /></label><label className="field"><span>Phone <em>required</em></span><input name="phone" type="tel" required autoComplete="tel" maxLength="30" /></label><label className="field"><span>Email <em>required</em></span><input name="email" type="email" required autoComplete="email" /></label><label className="field"><span>Address/location <em>required</em></span><input name="address" required autoComplete="street-address" /></label></div></fieldset>
    <fieldset><legend>4. Preferred date and time</legend><div className="form-grid"><label className="field"><span>Preferred date <em>required</em></span><input name="preferredDate" type="date" min={today()} required /></label><label className="field"><span>Preferred time <em>required</em></span><input name="preferredTime" type="time" required aria-describedby="preferred-time-hint" /><small className="field__hint" id="preferred-time-hint">Choose the time using Sri Lanka local time.</small></label></div></fieldset>
    <fieldset><legend>5. Confirmation</legend><p className="muted">Submitting this request sends the job to TIKKA operations for review and scheduling.</p></fieldset><div className="form-actions"><button className="button button--primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Submitting..." : "Submit request"}</button></div><div className="form-message" data-tone={error ? "error" : "neutral"} role="status" aria-live="polite">{message}</div>
  </form></div></section>;
}
