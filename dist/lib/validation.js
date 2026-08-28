const fs = require("node:fs");
const path = require("node:path");
const { JOB_STATUSES, PROVIDER_STATES } = require("./constants");

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

function validateAssignment(body, database) {
  const errors = {};
  const providerId = requireField(errors, body, "providerId", "Provider", 80);
  const scheduledAt = cleanString(body.scheduledAt);

  if (providerId && !database.providers.some((provider) => provider.id === providerId)) {
    errors.providerId = "Choose an existing provider.";
  }

  return {
    errors,
    value: { providerId, scheduledAt }
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

function validateProviderRegistration(body, categories = serviceData) {
  const allowedServices = activeServiceNames(categories);
  const errors = {};
  const name = requireField(errors, body, "name", "Full name", 120);
  const phone = requireField(errors, body, "phone", "Phone", 30);
  const email = cleanString(body.email).toLowerCase();
  const password = isString(body.password) ? body.password : "";
  const profilePhoto = cleanString(body.profilePhoto) || "public/brand/tikka-logo.jpg";
  const skills = cleanStringArray(body.skills).slice(0, 12);
  const services = cleanStringArray(body.services).slice(0, 8);
  const serviceArea = requireField(errors, body, "serviceArea", "Service area", 160);
  const description = requireField(errors, body, "description", "Professional description", 800);
  const experienceYears = Number(body.experienceYears);
  const qualifications = requireField(errors, body, "qualifications", "Qualification or certification information", 800);

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

  if (skills.length === 0) {
    errors.skills = "Add at least one skill.";
  }

  if (services.length === 0) {
    errors.services = "Choose at least one service.";
  } else if (services.some((service) => !allowedServices.includes(service))) {
    errors.services = "Choose only available services.";
  }

  if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80) {
    errors.experienceYears = "Enter valid years of experience.";
  }

  return {
    errors,
    value: {
      name,
      phone,
      email,
      password,
      profilePhoto,
      skills,
      services,
      serviceArea,
      description,
      experienceYears,
      qualifications
    }
  };
}

function validateProviderState(body) {
  const errors = {};
  const state = requireField(errors, body, "state", "Provider state", 40);

  if (state && !PROVIDER_STATES.includes(state)) {
    errors.state = "Choose a valid provider state.";
  }

  return {
    errors,
    value: { state }
  };
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
  validateAssignment,
  validateCategory,
  validateLogin,
  validateModeration,
  validateProviderRegistration,
  validateProviderState,
  validateRegistration,
  validateRequest,
  validateReview,
  validateStatus
};
