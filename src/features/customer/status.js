export const normalLifecycle = ["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"];
export const activeStatuses = ["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"];
export const completedStatuses = ["COMPLETED", "CONFIRMED"];
export const closedStatuses = ["CANCELLED", "REJECTED"];

const labels = {
  NEW: "Request Received",
  REVIEWING: "Under review",
  SCHEDULED: "Scheduled",
  ASSIGNED: "Technician Assigned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected"
};

const adminLabels = { NEW: "New", REVIEWING: "Under review", SCHEDULED: "Scheduled", ASSIGNED: "Assigned", IN_PROGRESS: "In progress", COMPLETED: "Completed", CONFIRMED: "Confirmed", CANCELLED: "Cancelled", REJECTED: "Rejected", ACTIVE: "Active", INACTIVE: "Inactive", AVAILABLE: "Available", BUSY: "Busy", UNAVAILABLE: "Unavailable" };

export function statusLabel(status, audience = "customer") {
  const dictionary = audience === "admin" ? adminLabels : labels;
  return dictionary[status] || String(status || "Unknown").replaceAll("_", " ");
}

export function statusTone(status) {
  if (["COMPLETED", "CONFIRMED", "ACTIVE", "AVAILABLE"].includes(status)) return "success";
  if (["CANCELLED", "REJECTED"].includes(status)) return "danger";
  if (["REVIEWING", "IN_PROGRESS"].includes(status)) return "info";
  if (["SCHEDULED", "ASSIGNED", "BUSY"].includes(status)) return "scheduled";
  return "neutral";
}
