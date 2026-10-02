import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AdminAuthProvider, useAdminAuth } from "../features/auth/AdminAuthContext.jsx";
import { adminService } from "../services/admin.js";
import useHash from "../hooks/useHash.js";
import BaseStatusBadge from "../components/customer/StatusBadge.jsx";

const areas = ["overview", "requests", "workers", "customers", "reviews", "categories"];
const date = (value) => value ? new Date(value).toLocaleString() : "Not recorded";
const nextAction = { NEW: "Begin review", REVIEWING: "Schedule", SCHEDULED: "Assign worker", ASSIGNED: "Start job", IN_PROGRESS: "Mark completed", COMPLETED: "Await confirmation", CONFIRMED: "Complete", CANCELLED: "Closed", REJECTED: "Closed" };
const StatusBadge = ({ status }) => <BaseStatusBadge status={status} audience="admin" />;

function Table({ caption, headers, rows, empty }) {
  if (!rows.length) return <div className="ui-state"><h3>{empty?.heading || "No records"}</h3><p>{empty?.body || "There is nothing to show here yet."}</p>{empty?.action}</div>;
  return <table className="ops-table"><caption className="sr-only">{caption}</caption><thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{rows}</tbody></table>;
}

function ConfirmDialog({ request, onCancel, onConfirm }) {
  const ref = useRef(null);
  const id = useId();
  const settled = useRef(false);
  useEffect(() => {
    if (!request) return;
    const dialog = ref.current;
    const trigger = request.trigger || document.activeElement;
    settled.current = false;
    dialog.showModal();
    dialog.querySelector("button")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [request]);
  const finish = (confirmed) => {
    if (!request || settled.current) return;
    settled.current = true;
    if (confirmed) onConfirm();
    else onCancel();
  };
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={(event) => { event.preventDefault(); finish(false); }}><form method="dialog" className="confirm-dialog__surface" onSubmit={(event) => { event.preventDefault(); finish(true); }}><h2 id={`${id}-title`}>{request?.title}</h2><p id={`${id}-description`}>{request?.body}</p><div className="confirm-dialog__actions"><button className="button button--secondary" type="button" onClick={() => finish(false)}>Cancel</button><button className="button button--danger" type="submit">{request?.label}</button></div></form></dialog>;
}

// A ref closes the same-tick double-click gap before React commits disabled buttons.
// Effects only restore focus; all mutations begin in explicit event handlers.
function useAdminMutation(refresh, notify) {
  const [pending, setPending] = useState(null);
  const lock = useRef(false);
  const restoreTarget = useRef(null);
  useEffect(() => {
    if (!pending && restoreTarget.current) {
      if (restoreTarget.current.isConnected) restoreTarget.current.focus();
      restoreTarget.current = null;
    }
  }, [pending]);
  const run = async (key, call, success, trigger, onSaved) => {
    if (lock.current) return;
    lock.current = true;
    restoreTarget.current = trigger;
    setPending(key);
    try {
      let payload;
      try { payload = await call(); }
      catch (error) {
        notify(error.payload?.errors ? Object.values(error.payload.errors).join(" ") : error.message, "error");
        return;
      }
      onSaved?.(payload);
      // A saved mutation must never be reported as failed because a later GET failed.
      try {
        const refreshed = await refresh();
        if (refreshed !== false) notify(success, "success");
      } catch {
        notify("The change was saved, but the latest operations data could not be loaded. Refresh and try again.", "warning");
      }
    } finally {
      lock.current = false;
      setPending(null);
    }
  };
  return { pending, run };
}

function OperationsHeader({ admin, area, onLogout }) {
  const [open, setOpen] = useState(false); const [desktop, setDesktop] = useState(false); const toggle = useRef(null); const nav = useRef(null);
  useEffect(() => { const media = window.matchMedia("(min-width: 1040px)"); const update = () => setDesktop(media.matches); update(); media.addEventListener?.("change", update); return () => media.removeEventListener?.("change", update); }, []);
  useEffect(() => { if (!open) { document.body.classList.remove("nav-open"); return undefined; } document.body.classList.add("nav-open"); nav.current?.querySelector("button")?.focus(); const escape = (event) => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } }; document.addEventListener("keydown", escape); return () => { document.removeEventListener("keydown", escape); document.body.classList.remove("nav-open"); }; }, [open]);
  return <><header className="ops-header"><a className="brand" href="/admin.html" aria-label="TIKKA operations home"><img src="/public/brand/tikka-logo.jpg" alt="TIKKA logo" width="1600" height="1200" /></a><p className="ops-header__title">{area[0].toUpperCase() + area.slice(1)}</p><p className="ops-header__user">{admin.name}</p><button ref={toggle} className="button button--ghost ops-nav-toggle" type="button" aria-expanded={open} aria-controls="ops-navigation" onClick={() => setOpen((value) => !value)}><span className="sr-only">{open ? "Close menu" : "Open menu"}</span><span aria-hidden="true">Menu</span></button><button className="button button--secondary" type="button" onClick={onLogout}>Log out</button></header><nav ref={nav} className={`ops-nav${open ? " is-open" : ""}`} id="ops-navigation" aria-label="Operations navigation" aria-hidden={!(desktop || open)} onClick={(event) => { if (event.target.closest("button")) setOpen(false); }}>{areas.map((name) => <button key={name} type="button" className={area === name ? "is-active" : ""} aria-current={area === name ? "location" : undefined} data-area={name} onClick={() => { window.location.hash = name; }}>{name[0].toUpperCase() + name.slice(1)}</button>)}</nav></>;
}

function RequestDetail({ job, workers, onMutation, onMessage }) {
  const [confirm, setConfirm] = useState(null); const [busy, setBusy] = useState(false);
  if (!job) return <aside className="ops-detail"><p className="muted">Select a request to review, schedule, assign, or update.</p></aside>;
  const mutate = async (action, call, success) => { setBusy(true); try { await call(); const refreshed = await onMutation(); if (refreshed !== false) onMessage(success, "success"); } catch (error) { onMessage(error.message, "error"); } finally { setBusy(false); } };
  const statuses = ({ NEW: ["REVIEWING", "CANCELLED", "REJECTED"], REVIEWING: ["CANCELLED", "REJECTED"], SCHEDULED: ["CANCELLED", "REJECTED"], ASSIGNED: ["IN_PROGRESS", "CANCELLED", "REJECTED"], IN_PROGRESS: ["COMPLETED"] }[job.status] || []);
  return <aside className="ops-detail" aria-labelledby="ops-job-detail-title"><p className="eyebrow">{job.reference}</p><h2 id="ops-job-detail-title">{job.title}</h2><StatusBadge status={job.status} /><section className="ops-detail-section"><h3>Customer and service</h3><dl className="request-meta"><div><dt>Customer</dt><dd>{job.customerName}</dd></div><div><dt>Phone</dt><dd><a href={`tel:${job.phone}`}>{job.phone}</a></dd></div><div><dt>Service</dt><dd>{job.service}</dd></div><div><dt>Submitted</dt><dd>{date(job.submittedAt)}</dd></div></dl></section><section className="ops-detail-section"><h3>Issue and location</h3><p>{job.description}</p><p><strong>Address</strong><br />{job.address}</p></section><section className="ops-detail-section"><h3>Schedule and assignment</h3><dl className="request-meta"><div><dt>Preferred</dt><dd>{job.preferredDate} {job.preferredTime}</dd></div><div><dt>Scheduled</dt><dd>{date(job.scheduledAt)}</dd></div><div><dt>Worker</dt><dd>{job.assignment?.worker?.name || "Not assigned"}</dd></div></dl></section>{["REVIEWING", "SCHEDULED", "ASSIGNED"].includes(job.status) && <form className="ops-detail form-card" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("scheduledAt"); mutate("schedule", () => adminService.schedule(job.id, new Date(value).toISOString()), "Job scheduled."); }}><label className="field"><span>{job.scheduledAt ? "Reschedule date and time" : "Schedule date and time"} <em>required</em></span><input name="scheduledAt" type="datetime-local" min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} required /><small className="field__hint">Sri Lanka local time. Past times are not allowed.</small></label><button className="button button--primary" disabled={busy}>{job.scheduledAt ? "Reschedule job" : "Schedule job"}</button></form>}{job.status === "SCHEDULED" && <form className="ops-detail form-card" onSubmit={(event) => { event.preventDefault(); mutate("assign", () => adminService.assign(job.id, new FormData(event.currentTarget).get("workerId")), "Worker assigned."); }}><label className="field"><span>Assign active worker <em>required</em></span><select name="workerId" required><option value="">Choose worker</option>{workers.filter((worker) => worker.active).map((worker) => <option value={worker.id} key={worker.id}>{worker.name} | {worker.availabilityStatus} | {worker.serviceArea}</option>)}</select></label><button className="button button--primary" disabled={busy}>Assign worker</button></form>}<div className="ops-actions">{statuses.map((status, index) => <button key={status} className={`button ${["CANCELLED", "REJECTED"].includes(status) ? "button--danger" : index === 0 ? "button--primary" : "button--secondary"}`} disabled={busy} onClick={() => ["CANCELLED", "REJECTED"].includes(status) ? setConfirm({ title: `${status === "CANCELLED" ? "Cancel" : "Reject"} request ${job.reference}`, body: `This will mark the customer request as ${status.toLowerCase()}.`, label: `${status === "CANCELLED" ? "Cancel" : "Reject"} request`, action: () => mutate("status", () => adminService.status(job.id, status), "Request status updated.") }) : mutate("status", () => adminService.status(job.id, status), "Request status updated.")}>{status === "REVIEWING" ? "Start review" : status.replaceAll("_", " ")}</button>)}</div><ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm?.action; setConfirm(null); action?.(); }} /></aside>;
}

function Operations({ admin }) {
  const hash = useHash(); const area = areas.includes(hash.slice(1)) ? hash.slice(1) : "overview";
  const [data, setData] = useState({ metrics: null, jobs: [], workers: [], customers: [], reviews: [], categories: [] }); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [selectedJob, setSelectedJob] = useState(null); const [filter, setFilter] = useState({ q: "", status: "" }); const [message, setMessage] = useState(""); const [messageTone, setMessageTone] = useState("neutral"); const [workerEditing, setWorkerEditing] = useState(null); const [categoryEditing, setCategoryEditing] = useState(null);
  const loadSequence = useRef(0);
  const load = async ({ background = false } = {}) => {
    const sequence = ++loadSequence.current;
    if (!background) { setLoading(true); setError(null); }
    try {
      const query = filter.q || filter.status ? `?q=${encodeURIComponent(filter.q)}&status=${encodeURIComponent(filter.status)}` : "";
      const [metrics, jobs, workers, customers, categories, reviews] = await Promise.all([
        adminService.dashboard(), adminService.requests(query), adminService.workers(),
        adminService.customers(), adminService.categories(), adminService.reviews()
      ]);
      if (sequence !== loadSequence.current) return true;
      setData({ metrics: metrics.dashboard || metrics, jobs: jobs.requests || [], workers: workers.workers || [], customers: customers.customers || [], categories: categories.categories || [], reviews: reviews.reviews || [] });
    } catch (loadError) {
      if (sequence === loadSequence.current && !background) setError(loadError);
      throw loadError;
    } finally { if (sequence === loadSequence.current && !background) setLoading(false); }
  };
  const updateWorker = (worker) => {
    if (!worker) return;
    setData((current) => ({ ...current, workers: current.workers.some((item) => item.id === worker.id)
      ? current.workers.map((item) => item.id === worker.id ? worker : item)
      : [...current.workers, worker] }));
  };
  const updateReview = (review) => {
    if (review) setData((current) => ({ ...current, reviews: current.reviews.map((item) => item.id === review.id ? review : item) }));
  };
  useEffect(() => { let active = true; load().catch(() => {}); return () => { active = false; }; }, [filter.q, filter.status]);
  const refreshAfterMutation = async () => { try { await load({ background: true }); return true; } catch { notify("The change was saved, but the latest operations data could not be loaded. Refresh and try again.", "warning"); return false; } };
  const notify = (text, tone = "neutral") => { setMessage(text); setMessageTone(tone); };
  const logout = async () => { try { await adminService.logout(); window.location.replace("/admin-login.html"); } catch (logoutError) { notify(logoutError.message, "error"); } };
  const visibleJobs = data.jobs;
  const metrics = useMemo(() => { const count = (status) => data.jobs.filter((job) => job.status === status).length; return [["New requests", count("NEW"), "Needs review"], ["Under review", count("REVIEWING"), "Needs scheduling"], ["Scheduled jobs", count("SCHEDULED"), "Ready for assignment"], ["Jobs in progress", count("ASSIGNED") + count("IN_PROGRESS"), "Assigned or underway"], ["Awaiting confirmation", count("COMPLETED"), "Customer action pending"], ["Active workers", data.workers.filter((worker) => worker.active).length, "Available internal team"]]; }, [data]);
  if (loading) return <><OperationsHeader admin={admin} area={area} onLogout={logout} /><main id="main" className="ops-main" aria-busy="true"><div className="skeleton-group" aria-hidden="true"><div className="skeleton skeleton--summary" /><div className="skeleton skeleton--card" /></div></main></>;
  if (error) return <><OperationsHeader admin={admin} area={area} onLogout={logout} /><main id="main" className="ops-main"><div className="ui-state ui-state--error" role="alert"><h1>Operations data could not be loaded</h1><p>Check your connection and try again.</p><button className="button button--secondary" onClick={() => { load().catch(() => {}); }}>Try again</button></div></main></>;
  const selected = data.jobs.find((job) => job.id === selectedJob) || null;
  return <><OperationsHeader admin={admin} area={area} onLogout={logout} /><main id="main" className="ops-main"><div className={`alert alert--${messageTone}`} hidden={!message} role={messageTone === "error" ? "alert" : "status"}>{message}</div>{area === "overview" && <section className="ops-panel is-active"><div className="ops-heading"><div><p className="eyebrow">TIKKA operations</p><h1>Overview</h1></div><button className="button button--secondary" onClick={() => { load().catch(() => {}); }}>Refresh</button></div><div className="ops-metrics">{metrics.map(([label, value, hint]) => <article className="ops-metric card card--summary" key={label}><p>{label}</p><strong>{value}</strong><small>{hint}</small></article>)}</div><div className="ops-split"><section><h2>Recent requests</h2><div className="ops-table-wrap"><Table caption="Recent customer requests" headers={["Reference", "Customer", "Service", "Status", "Scheduled", "Next action"]} rows={data.jobs.slice(0, 8).map((job) => <tr key={job.id}><td>{job.reference}</td><td>{job.customerName}</td><td>{job.service}</td><td><StatusBadge status={job.status} /></td><td>{date(job.scheduledAt)}</td><td>{nextAction[job.status]}</td></tr>)} empty={{ heading: "No requests yet", body: "New customer requests will appear here." }} /></div></section><section><h2>Worker availability</h2><div className="ops-table-wrap"><Table caption="Worker availability" headers={["Worker", "Availability", "Area"]} rows={data.workers.filter((worker) => !worker.active || worker.availabilityStatus !== "AVAILABLE").map((worker) => <tr key={worker.id}><td>{worker.name}</td><td><StatusBadge status={worker.active ? worker.availabilityStatus : "INACTIVE"} /></td><td>{worker.serviceArea}</td></tr>)} empty={{ heading: "Everyone is available", body: "No active workers are currently busy or inactive." }} /></div></section></div></section>}{area === "requests" && <section className="ops-panel is-active"><div className="ops-toolbar"><div><p className="eyebrow">Customer work</p><h1>Requests and jobs</h1></div><form className="ops-filters" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setFilter({ q: form.get("q"), status: form.get("status") }); }}><label><span className="sr-only">Search requests</span><input name="q" type="search" defaultValue={filter.q} placeholder="Search reference, customer, service" /></label><label><span className="sr-only">Filter by status</span><select name="status" defaultValue={filter.status}><option value="">All statuses</option>{["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED", "CANCELLED", "REJECTED"].map((status) => <option key={status}>{status}</option>)}</select></label><button className="button button--secondary">Filter</button></form></div><div className="ops-layout"><div className="ops-table-wrap"><Table caption="Customer service requests" headers={["Reference", "Customer", "Service", "Status", "Scheduled", "Worker", "Next action"]} rows={visibleJobs.map((job) => <tr key={job.id}><td><button className={`text-action${selectedJob === job.id ? " is-selected" : ""}`} aria-pressed={selectedJob === job.id} onClick={() => setSelectedJob(job.id)}>{job.reference}</button></td><td>{job.customerName}</td><td>{job.service}</td><td><StatusBadge status={job.status} /></td><td>{date(job.scheduledAt)}</td><td>{job.assignment?.worker?.name || "Unassigned"}</td><td>{nextAction[job.status]}</td></tr>)} empty={{ heading: filter.q || filter.status ? "No matching requests" : "No requests yet", body: "Adjust or clear the current filters." }} /></div><RequestDetail job={selected} workers={data.workers} onMutation={refreshAfterMutation} onMessage={notify} /></div></section>}{area === "workers" && <Workers data={data} editing={workerEditing} setEditing={setWorkerEditing} refresh={refreshAfterMutation} notify={notify} onUpdated={updateWorker} />}{area === "customers" && <section className="ops-panel is-active"><div className="ops-heading"><div><p className="eyebrow">Customer accounts</p><h1>Customers</h1></div></div><div className="ops-table-wrap"><Table caption="Customer accounts" headers={["Name", "Phone", "Email", "Requests", "Created"]} rows={data.customers.map((customer) => <tr key={customer.id}><td>{customer.name}</td><td><a href={`tel:${customer.phone}`}>{customer.phone}</a></td><td><a href={`mailto:${customer.email}`}>{customer.email}</a></td><td>{customer.requestCount || 0}</td><td>{date(customer.createdAt)}</td></tr>)} empty={{ heading: "No customers yet", body: "Customer accounts will appear here." }} /></div></section>}{area === "reviews" && <Reviews data={data} refresh={refreshAfterMutation} notify={notify} onUpdated={updateReview} />}{area === "categories" && <Categories data={data} editing={categoryEditing} setEditing={setCategoryEditing} refresh={refreshAfterMutation} notify={notify} />}</main></>;
}

function Workers({ data, editing, setEditing, refresh, notify, onUpdated }) {
  const [confirm, setConfirm] = useState(null);
  const { pending, run } = useAdminMutation(refresh, notify);
  const busy = pending !== null;
  const updateWorker = (payload) => onUpdated(payload.worker);
  const save = (event) => {
    event.preventDefault();
    const value = Object.fromEntries(new FormData(event.currentTarget).entries());
    run("save", () => adminService.worker(value.id || null, {
      name: value.name, phone: value.phone, serviceArea: value.serviceArea, notes: value.notes,
      skills: value.skills.split(",").map((item) => item.trim()).filter(Boolean),
      services: value.services.split(",").map((item) => item.trim()).filter(Boolean)
    }), "Worker saved.", event.nativeEvent.submitter, (payload) => {
      updateWorker(payload);
      setEditing(null);
    });
  };
  const toggleWorker = (worker, trigger) => {
    if (busy || confirm) return;
    const action = () => run(`active-${worker.id}`, () => adminService.toggleWorker(worker.id), "Worker updated.", trigger, updateWorker);
    if (worker.active) {
      setConfirm({
        title: `Deactivate worker ${worker.name}`,
        body: `${worker.name} will be deactivated and will no longer be available for new assignments.`,
        label: "Deactivate worker", trigger, action
      });
    } else action();
  };
  return <section className="ops-panel is-active">
    <div className="ops-heading"><div><p className="eyebrow">Internal team</p><h1>Workers</h1></div><button className="button button--primary" type="button" disabled={busy} onClick={() => setEditing({})}>Add worker</button></div>
    <div className="ops-table-wrap"><Table caption="Internal workers" headers={["Worker", "Phone", "Skills / services", "Availability", "Jobs", "Status", "Actions"]}
      rows={data.workers.map((worker) => <tr key={worker.id}>
        <td><button className="text-action" type="button" disabled={busy} onClick={() => setEditing(worker)}>{worker.name}</button></td>
        <td><a href={`tel:${worker.phone}`}>{worker.phone}</a></td>
        <td>{[...(worker.skills || []), ...(worker.services || [])].join(", ")}</td>
        <td><StatusBadge status={worker.availabilityStatus} /></td><td>{worker.completedJobs}</td>
        <td><StatusBadge status={worker.active ? "ACTIVE" : "INACTIVE"} /></td>
        <td><div className="ops-actions">
          <button className="button button--secondary" type="button" disabled={busy} aria-busy={pending === `active-${worker.id}`}
            aria-label={`${worker.active ? "Mark inactive" : "Mark active"}: ${worker.name}`}
            onClick={(event) => toggleWorker(worker, event.currentTarget)}>
            {pending === `active-${worker.id}` ? "Updating..." : worker.active ? "Mark inactive" : "Mark active"}
          </button>
          <button className="button button--secondary" type="button" disabled={busy} aria-busy={pending === `availability-${worker.id}`}
            aria-label={`Set ${worker.availabilityStatus === "AVAILABLE" ? "busy" : "available"}: ${worker.name}`}
            onClick={(event) => run(`availability-${worker.id}`, () => adminService.availability(worker.id, worker.availabilityStatus === "AVAILABLE" ? "BUSY" : "AVAILABLE"), "Worker updated.", event.currentTarget, updateWorker)}>
            {pending === `availability-${worker.id}` ? "Updating..." : `Set ${worker.availabilityStatus === "AVAILABLE" ? "busy" : "available"}`}
          </button>
        </div></td>
      </tr>)} empty={{ heading: "No workers yet", body: "Add an internal worker to begin assigning scheduled jobs." }} /></div>
    {editing && <form key={editing.id || "new"} className="ops-form" onSubmit={save}><h2>{editing.id ? "Edit worker" : "Add worker"}</h2>
      <input type="hidden" name="id" defaultValue={editing.id || ""} />
      <label className="field"><span>Name <em>required</em></span><input name="name" defaultValue={editing.name || ""} required /></label>
      <label className="field"><span>Phone <em>required</em></span><input name="phone" defaultValue={editing.phone || ""} required /></label>
      <label className="field"><span>Service area</span><input name="serviceArea" defaultValue={editing.serviceArea || ""} /></label>
      <label className="field"><span>Skills</span><input name="skills" defaultValue={(editing.skills || []).join(", ")} /></label>
      <label className="field"><span>Services</span><input name="services" defaultValue={(editing.services || []).join(", ")} /></label>
      <label className="field"><span>Notes</span><textarea name="notes" defaultValue={editing.notes || ""} /></label>
      <div className="ops-actions"><button className="button button--primary" disabled={busy}>{pending === "save" ? "Saving..." : "Save worker"}</button><button className="button button--secondary" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} onConfirm={() => {
      const action = confirm?.action;
      setConfirm(null);
      action?.();
    }} />
  </section>;
}

function Reviews({ data, refresh, notify, onUpdated }) {
  const [confirm, setConfirm] = useState(null);
  const { pending, run } = useAdminMutation(refresh, notify);
  const moderate = (review, context, trigger) => {
    if (pending || confirm) return;
    const actionName = review.hidden ? "restore" : "hide";
    const action = () => run(`${actionName}-${review.id}`, () => adminService.moderate(review.id, actionName),
      "Review moderation updated.", trigger, (payload) => onUpdated(payload.review));
    if (review.hidden) action();
    else setConfirm({
      title: `Hide review for ${review.reference || review.requestId}`,
      body: `${context}. This review will become hidden and will no longer be visible in the customer-facing experience.`,
      label: "Hide review", trigger, action
    });
  };
  return <section className="ops-panel is-active">
    <div className="ops-heading"><div><p className="eyebrow">Service quality</p><h1>Reviews</h1></div></div>
    <div className="ops-table-wrap"><Table caption="Customer reviews" headers={["Customer", "Request", "Rating", "Comment", "Visibility", "Action"]}
      rows={data.reviews.map((review) => {
        const customer = data.customers.find((item) => item.id === review.customerId)?.name || "Unknown customer";
        const job = data.jobs.find((item) => item.id === review.requestId);
        const context = `${customer}'s ${review.rating}/5 review${job?.service ? ` for ${job.service}` : ""}`;
        return <tr key={review.id}><td>{customer}</td><td>{review.reference || review.requestId}</td><td>{review.rating}/5</td><td data-column="comment">{review.comment}</td><td>{review.hidden ? "Hidden" : "Visible"}</td>
          <td><button className="button button--secondary" type="button" disabled={pending !== null} aria-busy={pending === `hide-${review.id}` || pending === `restore-${review.id}`}
            aria-label={`${review.hidden ? "Restore" : "Hide"} review: ${review.reference || review.requestId}`}
            onClick={(event) => moderate(review, context, event.currentTarget)}>
            {pending === `hide-${review.id}` ? "Hiding..." : pending === `restore-${review.id}` ? "Restoring..." : review.hidden ? "Restore" : "Hide"}
          </button></td></tr>;
      })} empty={{ heading: "No reviews yet", body: "Customer reviews will appear here." }} /></div>
    <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} onConfirm={() => {
      const action = confirm?.action;
      setConfirm(null);
      action?.();
    }} />
  </section>;
}

function Categories({ data, editing, setEditing, refresh, notify }) { const save = async (event) => { event.preventDefault(); const value = Object.fromEntries(new FormData(event.currentTarget).entries()); try { await adminService.category(value.id || null, { name: value.name, code: value.code, description: value.description, enabled: Boolean(value.enabled) }); setEditing(null); await refresh(); notify("Category saved.", "success"); } catch (error) { notify(error.message, "error"); } }; return <section className="ops-panel is-active"><div className="ops-heading"><div><p className="eyebrow">Catalog</p><h1>Service categories</h1></div></div><div className="ops-split"><form className="ops-form" onSubmit={save}><h2>{editing?.id ? "Edit category" : "Create category"}</h2><input type="hidden" name="id" defaultValue={editing?.id || ""} /><label className="field"><span>Name <em>required</em></span><input name="name" defaultValue={editing?.name || ""} required /></label><label className="field"><span>Code</span><input name="code" defaultValue={editing?.code || ""} pattern="[A-Za-z0-9]{2,8}" /></label><label className="field"><span>Description <em>required</em></span><textarea name="description" defaultValue={editing?.description || ""} required /></label><label className="ops-check"><input name="enabled" type="checkbox" defaultChecked={editing ? editing.enabled : true} /><span>Enabled</span></label><div className="ops-actions"><button className="button button--primary">Save category</button><button className="button button--secondary" type="button" onClick={() => setEditing(null)}>New</button></div></form><div className="ops-table-wrap"><Table caption="Service categories" headers={["Name", "Code", "Description", "Status", "Action"]} rows={data.categories.map((category) => <tr key={category.id}><td>{category.name}</td><td>{category.code}</td><td>{category.description}</td><td>{category.enabled ? "Enabled" : "Disabled"}</td><td><button className="button button--secondary" onClick={() => setEditing(category)}>Edit</button></td></tr>)} empty={{ heading: "No categories yet", body: "Create a service category to begin." }} /></div></div></section>; }

function AdminSurface() { const { admin, loading } = useAdminAuth(); useEffect(() => { if (!loading && !admin) window.location.replace("/admin-login.html"); }, [loading, admin]); if (loading) return <main id="main" className="ops-main" aria-busy="true"><div className="skeleton skeleton--card" aria-hidden="true" /></main>; if (!admin) return null; return <Operations admin={admin} />; }
export default function AdminPage() { return <AdminAuthProvider><div className="ops-shell react-operations"><AdminSurface /></div></AdminAuthProvider>; }
