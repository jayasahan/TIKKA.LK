import React from "react";
import { closedStatuses, normalLifecycle, statusLabel } from "../../features/customer/status.js";

export default function RequestProgress({ status }) {
  if (closedStatuses.includes(status)) return <div className="customer-progress customer-progress--closed"><strong>{statusLabel(status)}</strong></div>;
  const index = Math.max(normalLifecycle.indexOf(status), 0);
  return <ol className="customer-progress" aria-label="Request progress">{normalLifecycle.map((item, itemIndex) => <li key={item} className={`${itemIndex <= index ? "is-done" : ""} ${item === status ? "is-current" : ""}`} aria-current={item === status ? "step" : undefined}>{statusLabel(item)}</li>)}</ol>;
}
