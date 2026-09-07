const { createId, createRequestReference, createStore } = require("./db");

function verificationStatus(state = "REGISTERED") {
  return state
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}

function duplicateError(field, message) {
  const error = new Error(message);
  error.code = "DUPLICATE";
  error.field = field;
  return error;
}

function notFoundError(message) {
  const error = new Error(message);
  error.code = "NOT_FOUND";
  return error;
}

function conflictError(message, current) {
  const error = new Error(message);
  error.code = "CONFLICT";
  error.current = current;
  return error;
}

class JsonStore {
  constructor(dbPath) {
    this.store = createStore(dbPath);
    this.path = this.store.path;
  }

  async read() {
    return this.store.read();
  }

  async write(database) {
    this.store.write(database);
  }

  async update(mutator) {
    return this.store.update(mutator);
  }

  async ensureConfiguredAdmin(credentials, helpers) {
    if (!credentials) {
      return null;
    }
    return this.store.update((database) => {
      const admin = database.admins.find((item) => item.email === credentials.email);
      if (admin) {
        admin.name = admin.name || "TIKKA Admin";
        admin.role = admin.role || "admin";
        if (!admin.passwordHash || !helpers.verifyPassword(credentials.password, admin.passwordHash)) {
          admin.passwordHash = helpers.hashPassword(credentials.password);
        }
        return admin;
      }

      const createdAdmin = {
        id: createId("admin"),
        name: "TIKKA Admin",
        email: credentials.email,
        passwordHash: helpers.hashPassword(credentials.password),
        role: "admin",
        createdAt: new Date().toISOString()
      };
      database.admins.push(createdAdmin);
      return createdAdmin;
    });
  }

  async findAdminByEmail(email) {
    return this.store.read().admins.find((item) => item.email === email) || null;
  }

  async findAdminById(id) {
    return this.store.read().admins.find((item) => item.id === id) || null;
  }

  async listCategories({ enabledOnly = false } = {}) {
    const categories = this.store.read().categories || [];
    return enabledOnly ? categories.filter((category) => category.enabled !== false) : categories;
  }

  async findCategoryById(id) {
    return this.store.read().categories.find((item) => item.id === id) || null;
  }

  async findCategoryByName(name) {
    return this.store.read().categories.find((item) => item.name === name) || null;
  }

  async createCategory(value) {
    return this.store.update((database) => {
      const code = value.code || value.name.slice(0, 2).toUpperCase();
      if (database.categories.some((item) => item.name.toLowerCase() === value.name.toLowerCase())) {
        throw duplicateError("name", "This category already exists.");
      }
      if (database.categories.some((item) => item.code === code)) {
        throw duplicateError("code", "This category already exists.");
      }
      const now = new Date().toISOString();
      const category = {
        id: createId("category"),
        name: value.name,
        code,
        icon: value.icon || code,
        description: value.description,
        enabled: value.enabled,
        createdAt: now,
        updatedAt: now
      };
      database.categories.push(category);
      return category;
    });
  }

  async updateCategory(id, value, options = {}) {
    return this.store.update((database) => {
      const category = database.categories.find((item) => item.id === id);
      if (!category) {
        throw notFoundError("Category not found.");
      }
      const code = value.code || category.code;
      if (database.categories.some((item) => item.id !== category.id && item.name.toLowerCase() === value.name.toLowerCase())) {
        throw duplicateError("name", "This category already exists.");
      }
      if (database.categories.some((item) => item.id !== category.id && item.code === code)) {
        throw duplicateError("code", "This category already exists.");
      }
      category.name = value.name;
      category.code = code;
      category.icon = value.icon || category.icon;
      category.description = value.description;
      if (options.hasEnabled) {
        category.enabled = value.enabled;
      }
      category.updatedAt = new Date().toISOString();
      return category;
    });
  }

  async toggleCategory(id) {
    return this.store.update((database) => {
      const category = database.categories.find((item) => item.id === id);
      if (!category) {
        throw notFoundError("Category not found.");
      }
      category.enabled = category.enabled === false;
      category.updatedAt = new Date().toISOString();
      return category;
    });
  }

  async createCustomer(value) {
    return this.store.update((database) => {
      if (database.customers.some((customer) => customer.email === value.email)) {
        throw duplicateError("email", "An account already exists for this email.");
      }
      const customer = {
        id: createId("customer"),
        name: value.name,
        phone: value.phone,
        email: value.email,
        passwordHash: value.passwordHash,
        createdAt: new Date().toISOString()
      };
      database.customers.push(customer);
      return customer;
    });
  }

  async findCustomerByEmail(email) {
    return this.store.read().customers.find((item) => item.email === email) || null;
  }

  async findCustomerById(id) {
    return this.store.read().customers.find((item) => item.id === id) || null;
  }

  async listCustomers() {
    return this.store.read().customers;
  }

  async createProvider(value) {
    return this.store.update((database) => {
      if (database.providers.some((provider) => provider.email === value.email)) {
        throw duplicateError("email", "A provider account already exists for this email.");
      }
      const provider = {
        id: createId("provider"),
        name: value.name,
        phone: value.phone,
        email: value.email,
        passwordHash: value.passwordHash,
        profileImage: value.profilePhoto || value.profileImage,
        profilePhoto: value.profilePhoto || value.profileImage,
        skills: value.skills,
        services: value.services,
        serviceArea: value.serviceArea,
        description: value.description,
        experienceYears: value.experienceYears,
        qualifications: value.qualifications,
        state: "REGISTERED",
        verificationStatus: "Registered",
        rating: null,
        completedJobs: 0,
        createdAt: new Date().toISOString()
      };
      database.providers.push(provider);
      return provider;
    });
  }

  async findProviderByEmail(email) {
    return this.store.read().providers.find((item) => item.email === email) || null;
  }

  async findProviderById(id) {
    return this.store.read().providers.find((item) => item.id === id) || null;
  }

  async listProviders() {
    return this.store.read().providers;
  }

  async submitProviderVerification(providerId) {
    return this.store.update((database) => {
      const provider = database.providers.find((item) => item.id === providerId);
      if (!provider) {
        throw notFoundError("Provider not found.");
      }
      if (provider.state !== "REGISTERED") {
        throw conflictError("Verification has already been submitted.", provider.state);
      }
      provider.state = "PENDING_VERIFICATION";
      provider.verificationStatus = "Pending verification";
      provider.verificationSubmittedAt = new Date().toISOString();
      return provider;
    });
  }

  async updateProviderState(providerId, state, adminId) {
    return this.store.update((database) => {
      const provider = database.providers.find((item) => item.id === providerId);
      if (!provider) {
        throw notFoundError("Provider not found.");
      }
      provider.state = state;
      provider.verificationStatus = verificationStatus(state);
      provider.reviewedAt = new Date().toISOString();
      provider.reviewedByAdminId = adminId;
      if (state === "DISABLED") {
        provider.disabledAt = provider.reviewedAt;
      }
      if (state === "APPROVED") {
        provider.disabledAt = null;
      }
      return provider;
    });
  }

  async createRequest(value) {
    return this.store.update((database) => {
      const service = (database.categories || []).find((item) => item.name === value.service);
      const serviceRequest = {
        id: createId("request"),
        reference: createRequestReference(),
        customerId: value.customerId,
        serviceId: service ? service.code : null,
        service: service ? service.name : value.service,
        title: value.title,
        description: value.description,
        customerName: value.customerName,
        phone: value.phone,
        email: value.email,
        address: value.address,
        preferredDate: value.preferredDate,
        preferredTime: value.preferredTime,
        photos: value.photos,
        status: "NEW",
        providerId: null,
        scheduledAt: null,
        assignedByAdminId: null,
        assignedAt: null,
        submittedAt: new Date().toISOString()
      };
      database.requests.push(serviceRequest);
      return serviceRequest;
    });
  }

  async listRequests({ status, query } = {}) {
    return this.store.read().requests
      .filter((item) => (status ? item.status === status : true))
      .filter((item) => matchesSearch(item, query));
  }

  async listCustomerRequests(customerId) {
    return this.store.read().requests.filter((item) => item.customerId === customerId);
  }

  async findRequestById(id) {
    return this.store.read().requests.find((item) => item.id === id) || null;
  }

  async findCustomerRequestById(id, customerId) {
    return this.store.read().requests.find((item) => item.id === id && item.customerId === customerId) || null;
  }

  async assignProvider(requestId, providerId, scheduledAt, adminId) {
    return this.store.update((database) => {
      const serviceRequest = database.requests.find((item) => item.id === requestId);
      const provider = database.providers.find((item) => item.id === providerId);
      if (!serviceRequest) {
        throw notFoundError("Request not found.");
      }
      if (!provider || provider.state !== "APPROVED") {
        throw conflictError("Only approved providers can be assigned jobs.");
      }
      if (!["NEW", "REVIEWING"].includes(serviceRequest.status)) {
        throw conflictError("This request cannot be assigned from its current status.", serviceRequest.status);
      }
      serviceRequest.providerId = providerId;
      serviceRequest.scheduledAt = scheduledAt || null;
      serviceRequest.status = "ASSIGNED";
      serviceRequest.assignedByAdminId = adminId;
      serviceRequest.assignedAt = new Date().toISOString();
      return serviceRequest;
    });
  }

  async updateRequestStatus(requestId, status, adminId) {
    return this.store.update((database) => {
      const serviceRequest = database.requests.find((item) => item.id === requestId);
      if (!serviceRequest) {
        throw notFoundError("Request not found.");
      }
      serviceRequest.status = status;
      if (status === "CANCELLED") {
        serviceRequest.cancelledAt = new Date().toISOString();
        serviceRequest.cancelledByAdminId = adminId;
      }
      return serviceRequest;
    });
  }

  async confirmRequest(requestId, customerId) {
    return this.store.update((database) => {
      const serviceRequest = database.requests.find((item) => item.id === requestId && item.customerId === customerId);
      if (!serviceRequest) {
        throw notFoundError("Request not found.");
      }
      serviceRequest.status = "CONFIRMED";
      serviceRequest.confirmedAt = new Date().toISOString();
      return serviceRequest;
    });
  }

  async listProviderJobs(providerId) {
    return this.store.read().requests.filter((item) => item.providerId === providerId);
  }

  async providerJobAction(requestId, providerId, action) {
    return this.store.update((database) => {
      const job = database.requests.find((item) => item.id === requestId && item.providerId === providerId);
      if (!job) {
        throw notFoundError("Assigned job not found.");
      }
      const transitions = {
        accept: ["ASSIGNED", "ACCEPTED"],
        decline: ["ASSIGNED", "REJECTED"],
        start: ["ACCEPTED", "IN_PROGRESS"],
        complete: ["IN_PROGRESS", "COMPLETED"]
      };
      const [from, to] = transitions[action] || [];
      if (!from || job.status !== from) {
        throw conflictError("Invalid job transition for this provider.", job.status);
      }
      job.status = to;
      if (to === "COMPLETED") {
        const provider = database.providers.find((item) => item.id === providerId);
        if (provider) {
          provider.completedJobs = (provider.completedJobs || 0) + 1;
        }
        job.completedAt = new Date().toISOString();
      }
      return job;
    });
  }

  async createReview(value) {
    return this.store.update((database) => {
      const serviceRequest = database.requests.find(
        (item) => item.id === value.requestId && item.customerId === value.customerId
      );
      if (!serviceRequest) {
        throw notFoundError("Request not found.");
      }
      if (database.reviews.some((review) => review.requestId === serviceRequest.id)) {
        throw duplicateError("requestId", "This request already has a review.");
      }
      const review = {
        id: createId("review"),
        requestId: serviceRequest.id,
        customerId: value.customerId,
        providerId: serviceRequest.providerId,
        rating: value.rating,
        comment: value.comment,
        submittedAt: new Date().toISOString(),
        hidden: false,
        moderation: []
      };
      database.reviews.push(review);
      return review;
    });
  }

  async listReviews() {
    return this.store.read().reviews;
  }

  async findReviewByRequestId(requestId) {
    return this.store.read().reviews.find((item) => item.requestId === requestId) || null;
  }

  async moderateReview(reviewId, action, note, adminId) {
    return this.store.update((database) => {
      const review = database.reviews.find((item) => item.id === reviewId);
      if (!review) {
        throw notFoundError("Review not found.");
      }
      if (!Array.isArray(review.moderation)) {
        review.moderation = [];
      }
      review.hidden = action === "hide";
      review.moderation.push({
        action,
        note,
        adminId,
        at: new Date().toISOString()
      });
      return review;
    });
  }

  async dashboardMetrics() {
    const database = this.store.read();
    const requests = database.requests || [];
    return {
      totalCustomers: database.customers.length,
      totalProviders: database.providers.length,
      pendingProviderApprovals: database.providers.filter((item) => item.state === "PENDING_VERIFICATION").length,
      newJobRequests: requests.filter((item) => item.status === "NEW").length,
      activeJobs: requests.filter((item) => ["REVIEWING", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(item.status)).length,
      completedJobs: requests.filter((item) => ["COMPLETED", "CONFIRMED"].includes(item.status)).length,
      cancelledJobs: requests.filter((item) => item.status === "CANCELLED").length
    };
  }
}

function matchesSearch(request, query) {
  if (!query) {
    return true;
  }
  const haystack = [
    request.reference,
    request.title,
    request.service,
    request.status,
    request.customerName,
    request.email,
    request.phone,
    request.address
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function createJsonStore(options = {}) {
  return new JsonStore(options.dbPath);
}

module.exports = {
  JsonStore,
  createJsonStore
};
