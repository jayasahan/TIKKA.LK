import React from "react";
import { statusLabel, statusTone } from "../../features/customer/status.js";

export default function StatusBadge({ status, audience = "customer" }) { return <span className={`status-badge status-badge--${statusTone(status)}`}>{statusLabel(status, audience)}</span>; }
