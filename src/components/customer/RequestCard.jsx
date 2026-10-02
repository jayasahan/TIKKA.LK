import React from "react";
import { activeStatuses, completedStatuses, closedStatuses, statusLabel } from "../../features/customer/status.js";
import RequestProgress from "./RequestProgress.jsx";
import StatusBadge from "./StatusBadge.jsx";

const date = (value, empty = "Not set yet") => value ? new Date(value).toLocaleString() : empty;
const technician = (request) => request.assignedWorker?.name || "Not assigned yet";

export function RequestCard({ request, compact = false, onSelect }) {
  return <article className="customer-request-card card card--standard"><div className="customer-request-card__top"><div><p className="eyebrow">{request.reference}</p><h3>{request.title}</h3></div><StatusBadge status={request.status} /></div>{!compact && <RequestProgress status={request.status} />}<dl className="request-meta"><div><dt>Service</dt><dd>{request.service}</dd></div><div><dt>Submitted</dt><dd>{date(request.submittedAt)}</dd></div><div><dt>Scheduled</dt><dd>{date(request.scheduledAt)}</dd></div>{!compact && <div><dt>Address</dt><dd>{request.address || "Recorded with request"}</dd></div>}<div><dt>Assigned Technician</dt><dd>{technician(request)}</dd></div></dl><button className="button button--secondary" type="button" onClick={() => onSelect(request.id)}>View details</button></article>;
}

export function MiniRequest({ request, onSelect }) { return <article className="customer-mini-card card card--standard"><div><p className="eyebrow">{request.reference}</p><strong>{request.title}</strong><span>{statusLabel(request.status)} - {date(request.scheduledAt, "No schedule yet")}</span></div><button className="text-action" type="button" onClick={() => onSelect(request.id)}>Details</button></article>; }

export default RequestCard;

export function filterRequests(requests, filter) {
  if (filter === "completed") return requests.filter((request) => completedStatuses.includes(request.status));
  if (filter === "closed") return requests.filter((request) => closedStatuses.includes(request.status));
  if (filter === "all") return requests;
  return requests.filter((request) => activeStatuses.includes(request.status));
}
