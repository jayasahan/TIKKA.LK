const { createId, createRequestReference, createStore } = require("./db");

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

  async createWorker(value) {
    return this.store.update((database) => {
      if (!Array.isArray(database.workers)) database.workers = [];
      const worker = {
        id: value.id || createId("worker"), name: value.name, phone: value.phone,
        serviceArea: value.serviceArea || null, notes: value.notes || null,
        availabilityStatus: value.availabilityStatus || "AVAILABLE", active: value.active !== false,
        skills: value.skills || [], services: value.services || [], rating: value.rating || null,
        completedJobs: value.completedJobs || 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      database.workers.push(worker);
      return worker;
    });
  }

  async findWorkerById(id) { return (this.store.read().workers || []).find((item) => item.id === id) || null; }
  async listWorkers() { return this.store.read().workers || []; }

  async updateWorker(id, value) {
    return this.store.update((database) => {
      const worker = (database.workers || []).find((item) => item.id === id);
      if (!worker) throw notFoundError("Worker not found.");
      for (const key of ["name", "phone", "serviceArea", "notes", "skills", "services", "active", "availabilityStatus"]) {
        if (Object.prototype.hasOwnProperty.call(value, key)) worker[key] = value[key];
      }
      worker.updatedAt = new Date().toISOString();
      return worker;
    });
  }

  async toggleWorkerActive(id) {
    return this.updateWorker(id, { active: !(await this.findWorkerById(id))?.active });
  }

  async updateWorkerAvailability(id, availabilityStatus) { return this.updateWorker(id, { availabilityStatus }); }

  async assignWorkerToRequest(requestId, workerId, scheduledAt, adminId) {
    return this.store.update((database) => {
      const request = database.requests.find((item) => item.id === requestId);
      const worker = (database.workers || []).find((item) => item.id === workerId);
      if (!request) throw notFoundError("Request not found.");
      if (!worker || !worker.active) throw conflictError("Only active workers can be assigned jobs.");
      if (request.status !== "SCHEDULED") throw conflictError("Schedule the request before assigning a worker.", request.status);
      request.assignedWorkerId = workerId; request.scheduledAt = scheduledAt || request.scheduledAt || null; request.status = "ASSIGNED";
      request.assignedByAdminId = adminId; request.assignedAt = new Date().toISOString();
      return request;
    });
  }

  async scheduleRequest(requestId, scheduledAt) {
    return this.store.update((database) => {
      const request = database.requests.find((item) => item.id === requestId);
      if (!request) throw notFoundError("Request not found.");
      if (!["REVIEWING", "SCHEDULED", "ASSIGNED"].includes(request.status)) {
        throw conflictError("This request cannot be scheduled from its current status.", request.status);
      }
      request.scheduledAt = scheduledAt;
      if (request.status === "REVIEWING") {
        request.status = "SCHEDULED";
      }
      request.updatedAt = new Date().toISOString();
      return request;
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
        assignedWorkerId: null,
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
        providerId: serviceRequest.providerId || null,
        workerId: serviceRequest.assignedWorkerId || null,
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
      totalWorkers: (database.workers || []).length,
      activeWorkers: (database.workers || []).filter((item) => item.active !== false).length,
      newJobRequests: requests.filter((item) => item.status === "NEW").length,
      activeJobs: requests.filter((item) => ["REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(item.status)).length,
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
