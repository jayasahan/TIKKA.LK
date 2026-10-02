import React, { useEffect, useRef, useState } from "react";
import { customerService } from "../../services/customer.js";
import RequestProgress from "./RequestProgress.jsx";
import StatusBadge from "./StatusBadge.jsx";

const date = (value, empty = "Not set yet") => value ? new Date(value).toLocaleString() : empty;

function ConfirmDialog({ open, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
    return undefined;
  }, [open]);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby="customer-confirm-title" aria-describedby="customer-confirm-description" onCancel={(event) => { event.preventDefault(); onCancel(); }}><form method="dialog" className="confirm-dialog__surface" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}><h2 id="customer-confirm-title">Confirm completed work</h2><p id="customer-confirm-description">Confirm only if the TIKKA job has been completed and you are satisfied with the work.</p><div className="confirm-dialog__actions"><button className="button button--secondary" type="button" onClick={onCancel}>Cancel</button><button className="button button--danger" type="submit">Confirm completion</button></div></form></dialog>;
}

export default function RequestDetail({ request, onChanged, onMessage }) {
  const headingRef = useRef(null);
  const triggerRef = useRef(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewErrors, setReviewErrors] = useState({});
  useEffect(() => { if (request?.__explicit) headingRef.current?.focus({ preventScroll: true }); }, [request?.id, request?.__explicit]);
  if (!request) return <aside className="customer-detail-panel card card--detail"><p className="muted">Select a request to view details.</p></aside>;
  const confirm = async () => {
    setBusy(true);
    try { await customerService.confirm(request.id); setConfirmOpen(false); await onChanged(request.id, "Completion confirmed. You can now review the service."); }
    catch (error) { onMessage(error.message, "error"); }
    finally { setBusy(false); }
  };
  const cancelConfirm = () => {
    setConfirmOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const review = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    setReviewBusy(true); setReviewMessage(""); setReviewErrors({});
    try { await customerService.review(request.id, Object.fromEntries(new FormData(form).entries())); await onChanged(request.id, "Thank you. Your review was submitted."); setReviewMessage(""); }
    catch (error) { setReviewErrors(error.payload?.errors || {}); setReviewMessage(error.payload?.errors ? "Please correct the highlighted fields." : error.message); }
    finally { setReviewBusy(false); }
  };
  return <aside className="customer-detail-panel card card--detail" aria-label="Request details"><p className="eyebrow">{request.reference}</p><h2 ref={headingRef} id="customer-request-detail-title" tabIndex="-1">{request.title}</h2><StatusBadge status={request.status} /><section className="customer-detail-section"><h3>Request</h3><dl className="request-meta"><div><dt>Service</dt><dd>{request.service}</dd></div><div><dt>Submitted</dt><dd>{date(request.submittedAt)}</dd></div><div><dt>Preferred</dt><dd>{[request.preferredDate, request.preferredTime].filter(Boolean).join(" ") || "Not recorded"}</dd></div></dl><p>{request.description}</p></section><RequestProgress status={request.status} /><section className="customer-detail-section"><h3>Location</h3><p>{request.address || "Recorded with your submitted request."}</p></section><section className="customer-detail-section"><h3>Scheduling</h3><p>{date(request.scheduledAt, "TIKKA has not scheduled this job yet.")}</p></section><section className="customer-detail-section"><h3>Assigned TIKKA technician/team</h3>{request.assignedWorker ? <div className="technician-card card card--standard"><strong>{request.assignedWorker.name || "TIKKA Team"}</strong>{request.assignedWorker.phone && <p>{request.assignedWorker.phone}</p>}{request.assignedWorker.serviceArea && <p>{request.assignedWorker.serviceArea}</p>}{request.assignedWorker.skills?.length ? <p>{request.assignedWorker.skills.join(", ")}</p> : null}</div> : <p className="muted">TIKKA has not assigned a technician yet.</p>}</section>{request.status === "COMPLETED" && <section className="customer-action-panel"><h3>The work has been marked complete by TIKKA.</h3><p>Please confirm only after you are satisfied that the job is complete.</p><button ref={triggerRef} className="button button--primary" type="button" disabled={busy} onClick={() => setConfirmOpen(true)}>{busy ? "Confirming..." : "Confirm completion"}</button></section>}{request.review ? <section className="customer-action-panel"><h3>Your review</h3><p>{request.review.rating}/5 - {request.review.comment}</p></section> : request.status === "CONFIRMED" && <form className="review-form customer-action-panel" onSubmit={review} noValidate><h3>Review your TIKKA service</h3><label className="field"><span>Rating <em>required</em></span><select name="rating" required defaultValue="" aria-invalid={Boolean(reviewErrors.rating)} aria-describedby={reviewErrors.rating ? "review-rating-error" : undefined}><option value="">Choose rating</option><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select>{reviewErrors.rating && <span className="field__error" id="review-rating-error">{reviewErrors.rating}</span>}</label><label className="field"><span>Comment <em>required</em></span><textarea name="comment" rows="3" maxLength="600" required aria-invalid={Boolean(reviewErrors.comment)} aria-describedby={reviewErrors.comment ? "review-comment-error" : undefined} />{reviewErrors.comment && <span className="field__error" id="review-comment-error">{reviewErrors.comment}</span>}</label><button className="button button--secondary" type="submit" disabled={reviewBusy}>{reviewBusy ? "Submitting..." : "Submit review"}</button><div className="form-message" role="status" aria-live="polite">{reviewMessage}</div></form>}<ConfirmDialog open={confirmOpen} onCancel={cancelConfirm} onConfirm={confirm} /></aside>;
}
