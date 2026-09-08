const fs = require("node:fs");
const path = require("node:path");
const { JOB_STATUSES } = require("./constants");

const serviceData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "data", "services.json"), "utf8")
);

function isString(value) {
  return typeof value === "string";
}

function cleanString(value) {
  return isString(value) ? value.trim() : "";
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value) {
  return /^[0-9+\-\s()]{7,20}$/.test(value);
}

function requireField(errors, body, field, label, maxLength = 200) {
  const value = cleanString(body[field]);
  if (!value) {
    errors[field] = `${label} is required.`;
  } else if (value.length > maxLength) {
    errors[field] = `${label} is too long.`;
  }
  return value;
}

function validateRegistration(body) {
  const errors = {};
  const name = requireField(errors, body, "name", "Name", 120);
  const phone = requireField(errors, body, "phone", "Phone", 30);
  const email = cleanString(body.email).toLowerCase();
  const password = isString(body.password) ? body.password : "";

  if (!email) {
    errors.email = "Email is required.";
  } else if (!isEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (phone && !isPhone(phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  return {
    errors,
    value: {
      name,
      phone,
      email,
      password
    }
  };
}

function validateLogin(body) {
  const errors = {};
  const email = cleanString(body.email).toLowerCase();
  const password = isString(body.password) ? body.password : "";

  if (!email) {
    errors.email = "Email is required.";
  }

  if (!password) {
    errors.password = "Password is required.";
  }

  return {
    errors,
    value: { email, password }
  };
}

function activeServiceNames(categories = serviceData) {
  return categories
    .filter((category) => category.enabled !== false)
    .map((category) => category.name);
}

function validateRequest(body, categories = serviceData) {
  const errors = {};
  const allowedServices = activeServiceNames(categories);
  const service = requireField(errors, body, "service", "Service category", 80);
  const title = requireField(errors, body, "title", "Job title", 140);
  const description = requireField(errors, body, "description", "Job description", 1200);
  const customerName = requireField(errors, body, "customerName", "Customer name", 120);
  const phone = requireField(errors, body, "phone", "Phone", 30);
  const email = cleanString(body.email).toLowerCase();
  const address = requireField(errors, body, "address", "Address or location", 400);
  const preferredDate = requireField(errors, body, "preferredDate", "Preferred date", 40);
  const preferredTime = requireField(errors, body, "preferredTime", "Preferred time", 40);
  const photos = Array.isArray(body.photos)
    ? body.photos.map(cleanString).filter(Boolean).slice(0, 6)
    : [];

  if (service && !allowedServices.includes(service)) {
    errors.service = "Choose one of the available services.";
  }

  if (!email) {
    errors.email = "Email is required.";
  } else if (!isEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (phone && !isPhone(phone)) {
    errors.phone = "Enter a valid phone number.";
  }

  return {
    errors,
    value: {
      service,
      title,
      description,
      customerName,
      phone,
      email,
      address,
      preferredDate,
      preferredTime,
      photos
    }
  };
}

function validateStatus(body) {
  const errors = {};
  const status = requireField(errors, body, "status", "Status", 40);

  if (status && !JOB_STATUSES.includes(status)) {
    errors.status = "Choose a valid request status.";
  }

  return {
    errors,
    value: { status }
  };
}

function validateSchedule(body) {
  const errors = {};
  const scheduledAt = requireField(errors, body, "scheduledAt", "Scheduled date and time", 80);
  const parsed = scheduledAt ? new Date(scheduledAt) : null;
  const hasValidDate = parsed && !Number.isNaN(parsed.getTime());

  if (scheduledAt && !hasValidDate) {
    errors.scheduledAt = "Enter a valid scheduled date and time.";
  } else if (hasValidDate && parsed.getTime() <= Date.now()) {
    errors.scheduledAt = "Choose a future scheduled date and time.";
  }

  return {
    errors,
    value: {
      scheduledAt: hasValidDate ? parsed.toISOString() : scheduledAt
    }
  };
}

function validateReview(body) {
  const errors = {};
  const rating = Number(body.rating);
  const comment = requireField(errors, body, "comment", "Review", 600);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = "Choose a rating from 1 to 5.";
  }

  return {
    errors,
    value: { rating, comment }
  };
}

function cleanStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(cleanString).filter(Boolean);
  }
  if (isString(value)) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function validateCategory(body) {
  const errors = {};
  const name = requireField(errors, body, "name", "Category name", 80);
  const code = cleanString(body.code).toUpperCase();
  const description = requireField(errors, body, "description", "Category description", 240);
  const icon = cleanString(body.icon) || code || name.slice(0, 2).toUpperCase();
  const enabled = body.enabled !== false && body.enabled !== "false";

  if (code && !/^[A-Z0-9]{2,8}$/.test(code)) {
    errors.code = "Use a short category code of 2 to 8 letters or numbers.";
  }

  return {
    errors,
    value: {
      name,
      code,
      description,
      icon,
      enabled
    }
  };
}

function validateModeration(body) {
  const errors = {};
  const action = cleanString(body.action).toLowerCase();
  const note = cleanString(body.note).slice(0, 400);

  if (!["hide", "restore"].includes(action)) {
    errors.action = "Choose hide or restore.";
  }

  return {
    errors,
    value: { action, note }
  };
}

function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

module.exports = {
  hasErrors,
  serviceData,
  validateCategory,
  validateLogin,
  validateModeration,
  validateRegistration,
  validateRequest,
  validateReview,
  validateSchedule,
  validateStatus
};
