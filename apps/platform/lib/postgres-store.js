const { createId, createRequestReference } = require("./db");
const { getPool } = require("./postgres");

function verificationStatus(state = "REGISTERED") {
  return state
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}

function asIso(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function categoryFromRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    icon: row.icon,
    description: row.description,
    enabled: row.enabled,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function customerFromRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function providerFromRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    passwordHash: row.password_hash,
    profileImage: row.profile_image_url,
    profilePhoto: row.profile_image_url,
    skills: row.skills || [],
    services: row.services || [],
    serviceArea: row.service_area,
    description: row.description,
    experienceYears: row.experience_years,
    qualifications: row.qualifications,
    state: row.state,
    verificationStatus: verificationStatus(row.state),
    rating: row.rating === null ? null : Number(row.rating),
    completedJobs: row.completed_jobs || 0,
    verificationSubmittedAt: asIso(row.verification_submitted_at),
    reviewedAt: asIso(row.reviewed_at),
    reviewedByAdminId: row.reviewed_by_admin_id,
    disabledAt: asIso(row.disabled_at),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function requestFromRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    reference: row.reference,
    customerId: row.customer_id,
    serviceId: row.service_category_code || null,
    service: row.service_name_snapshot,
    title: row.title,
    description: row.description,
    customerName: row.contact_name,
    phone: row.contact_phone,
    email: row.contact_email,
    address: row.service_address,
    preferredDate: row.preferred_date ? asIso(row.preferred_date).slice(0, 10) : null,
    preferredTime: row.preferred_time ? String(row.preferred_time).slice(0, 5) : null,
    photos: row.photos || [],
    status: row.status,
    providerId: row.provider_id,
    scheduledAt: asIso(row.scheduled_at),
    assignedByAdminId: row.assigned_by_admin_id,
    assignedAt: asIso(row.assigned_at),
    submittedAt: asIso(row.submitted_at),
    completedAt: asIso(row.completed_at),
    confirmedAt: asIso(row.confirmed_at),
    cancelledAt: asIso(row.cancelled_at),
    cancelledByAdminId: row.cancelled_by_admin_id,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function reviewFromRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    requestId: row.request_id,
    customerId: row.customer_id,
    providerId: row.provider_id,
    rating: row.rating,
    comment: row.comment,
    submittedAt: asIso(row.submitted_at),
    hidden: Boolean(row.hidden),
    moderation: row.moderation || []
  };
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

async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw duplicateError("unknown", "Record already exists.");
    }
    throw error;
  } finally {
    client.release();
  }
}

class PostgresStore {
  constructor(pool = getPool()) {
    this.pool = pool;
    this.path = "postgres";
    this.admin = null;
  }

  async query(text, params) {
    try {
      return await this.pool.query(text, params);
    } catch (error) {
      if (error.code === "23505") {
        throw duplicateError("unknown", "Record already exists.");
      }
      throw new Error("Database operation failed.");
    }
  }

  async read() {
    const [customers, requests, reviews, providers, categories] = await Promise.all([
      this.listCustomers(),
      this.listRequests(),
      this.listReviews(),
      this.listProviders(),
      this.listCategories()
    ]);
    return {
      customers,
      requests,
      reviews,
      providers,
      admins: [],
      categories
    };
  }

  async write() {
    throw new Error("PostgreSQL store does not support replacing the full database snapshot.");
  }

  async update() {
    throw new Error("PostgreSQL store does not support synchronous JSON-style mutation updates.");
  }

  async ensureConfiguredAdmin(credentials, helpers) {
    if (!credentials) {
      this.admin = null;
      return null;
    }
    this.admin = {
      id: "admin-env",
      name: "TIKKA Admin",
      email: credentials.email,
      passwordHash: helpers.hashPassword(credentials.password),
      role: "admin",
      createdAt: null
    };
    return this.admin;
  }

  async findAdminByEmail(email) {
    return this.admin && this.admin.email === email ? this.admin : null;
  }

  async findAdminById(id) {
    return this.admin && this.admin.id === id ? this.admin : null;
  }

  async listCategories({ enabledOnly = false } = {}) {
    const result = await this.query(
      `SELECT * FROM service_categories WHERE ($1::boolean = false OR enabled = true) ORDER BY name`,
      [enabledOnly]
    );
    return result.rows.map(categoryFromRow);
  }

  async findCategoryById(id) {
    const result = await this.query("SELECT * FROM service_categories WHERE id = $1", [id]);
    return categoryFromRow(result.rows[0]);
  }

  async findCategoryByName(name) {
    const result = await this.query("SELECT * FROM service_categories WHERE name = $1", [name]);
    return categoryFromRow(result.rows[0]);
  }

  async findCategoryByCode(code) {
    const result = await this.query("SELECT * FROM service_categories WHERE code = $1", [code]);
    return categoryFromRow(result.rows[0]);
  }

  async createCategory(value) {
    const code = value.code || value.name.slice(0, 2).toUpperCase();
    const [existingName, existingCode] = await Promise.all([
      this.findCategoryByName(value.name),
      this.findCategoryByCode(code)
    ]);
    if (existingName) {
      throw duplicateError("name", "This category already exists.");
    }
    if (existingCode) {
      throw duplicateError("code", "This category already exists.");
    }
    try {
      const result = await this.query(
        `
          INSERT INTO service_categories (id, name, code, icon, description, enabled)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          createId("category"),
          value.name,
          code,
          value.icon || code,
          value.description,
          value.enabled
        ]
      );
      return categoryFromRow(result.rows[0]);
    } catch (error) {
      if (error.code === "DUPLICATE") {
        throw duplicateError("category", "This category already exists.");
      }
      throw error;
    }
  }

  async updateCategory(id, value, options = {}) {
    const current = await this.findCategoryById(id);
    if (!current) {
      throw notFoundError("Category not found.");
    }
    const code = value.code || current.code;
    const [existingName, existingCode] = await Promise.all([
      this.findCategoryByName(value.name),
      this.findCategoryByCode(code)
    ]);
    if (existingName && existingName.id !== id) {
      throw duplicateError("name", "This category already exists.");
    }
    if (existingCode && existingCode.id !== id) {
      throw duplicateError("code", "This category already exists.");
    }
    const result = await this.query(
      `
        UPDATE service_categories
        SET name = $2,
            code = $3,
            icon = $4,
            description = $5,
            enabled = $6,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        value.name,
        code,
        value.icon || current.icon,
        value.description,
        options.hasEnabled ? value.enabled : current.enabled
      ]
    );
    return categoryFromRow(result.rows[0]);
  }

  async toggleCategory(id) {
    const result = await this.query(
      "UPDATE service_categories SET enabled = NOT enabled, updated_at = now() WHERE id = $1 RETURNING *",
      [id]
    );
    return categoryFromRow(result.rows[0]);
  }

  async createCustomer(value) {
    const result = await this.query(
      `
        INSERT INTO customers (id, name, phone, email, password_hash)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [createId("customer"), value.name, value.phone, value.email, value.passwordHash]
    );
    return customerFromRow(result.rows[0]);
  }

  async findCustomerByEmail(email) {
    const result = await this.query("SELECT * FROM customers WHERE email = $1", [email]);
    return customerFromRow(result.rows[0]);
  }

  async findCustomerById(id) {
    const result = await this.query("SELECT * FROM customers WHERE id = $1", [id]);
    return customerFromRow(result.rows[0]);
  }

  async getCustomerById(id) {
    return this.findCustomerById(id);
  }

  async listCustomers() {
    const result = await this.query("SELECT * FROM customers ORDER BY created_at DESC");
    return result.rows.map(customerFromRow);
  }

  async createProvider(value) {
    return transaction(this.pool, async (client) => {
      const providerResult = await client.query(
        `
          INSERT INTO providers (
            id, name, phone, email, password_hash, profile_image_url, service_area,
            description, experience_years, qualifications, state, rating, completed_jobs
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'REGISTERED', NULL, 0)
          RETURNING *
        `,
        [
          createId("provider"),
          value.name,
          value.phone,
          value.email,
          value.passwordHash,
          value.profileImage || value.profilePhoto || null,
          value.serviceArea,
          value.description,
          value.experienceYears,
          value.qualifications
        ]
      );
      const provider = providerResult.rows[0];
      await this.replaceProviderSkills(client, provider.id, value.skills || []);
      await this.replaceProviderServices(client, provider.id, value.services || []);
      return this.findProviderById(provider.id, client);
    });
  }

  async providerSelect(client, whereSql = "", params = [], orderSql = "") {
    const result = await client.query(
      `
        SELECT
          p.*,
          COALESCE(array_agg(DISTINCT ps.skill) FILTER (WHERE ps.skill IS NOT NULL), '{}') AS skills,
          COALESCE(array_agg(DISTINCT sc.name) FILTER (WHERE sc.name IS NOT NULL), '{}') AS services
        FROM providers p
        LEFT JOIN provider_skills ps ON ps.provider_id = p.id
        LEFT JOIN provider_services psvc ON psvc.provider_id = p.id
        LEFT JOIN service_categories sc ON sc.id = psvc.service_category_id
        ${whereSql}
        GROUP BY p.id
        ${orderSql}
      `,
      params
    );
    return result.rows.map(providerFromRow);
  }

  async findProviderById(id, client = this.pool) {
    const providers = await this.providerSelect(client, "WHERE p.id = $1", [id]);
    return providers[0] || null;
  }

  async getProviderById(id) {
    return this.findProviderById(id);
  }

  async findProviderByEmail(email) {
    const providers = await this.providerSelect(this.pool, "WHERE p.email = $1", [email]);
    return providers[0] || null;
  }

  async listProviders() {
    return this.providerSelect(this.pool, "", [], "ORDER BY p.created_at DESC");
  }

  async replaceProviderSkills(client, providerId, skills) {
    await client.query("DELETE FROM provider_skills WHERE provider_id = $1", [providerId]);
    for (const skill of skills) {
      await client.query(
        "INSERT INTO provider_skills (provider_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [providerId, skill]
      );
    }
  }

  async replaceProviderServices(client, providerId, services) {
    await client.query("DELETE FROM provider_services WHERE provider_id = $1", [providerId]);
    for (const serviceName of services) {
      await client.query(
        `
          INSERT INTO provider_services (provider_id, service_category_id)
          SELECT $1, id FROM service_categories WHERE name = $2
          ON CONFLICT DO NOTHING
        `,
        [providerId, serviceName]
      );
    }
  }

  async submitProviderVerification(providerId) {
    const result = await this.query(
      `
        UPDATE providers
        SET state = 'PENDING_VERIFICATION',
            verification_submitted_at = now(),
            updated_at = now()
        WHERE id = $1 AND state = 'REGISTERED'
        RETURNING *
      `,
      [providerId]
    );
    if (!result.rows[0]) {
      const provider = await this.findProviderById(providerId);
      if (!provider) {
        throw notFoundError("Provider not found.");
      }
      throw conflictError("Verification has already been submitted.", provider.state);
    }
    return this.findProviderById(providerId);
  }

  async updateProviderState(providerId, state, adminId) {
    const result = await this.query(
      `
        UPDATE providers
        SET state = $2,
            reviewed_at = now(),
            reviewed_by_admin_id = $3,
            disabled_at = CASE WHEN $2 = 'DISABLED' THEN now() WHEN $2 = 'APPROVED' THEN NULL ELSE disabled_at END,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [providerId, state, adminId || null]
    );
    if (!result.rows[0]) {
      throw notFoundError("Provider not found.");
    }
    return this.findProviderById(providerId);
  }

  async createRequest(value) {
    const category = await this.findCategoryByName(value.service);
    const result = await transaction(this.pool, async (client) => {
      const requestResult = await client.query(
        `
          INSERT INTO service_requests (
            id, reference, customer_id, service_category_id, service_name_snapshot,
            title, description, contact_name, contact_phone, contact_email,
            service_address, preferred_date, preferred_time, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'NEW')
          RETURNING id
        `,
        [
          createId("request"),
          createRequestReference(),
          value.customerId,
          category ? category.id : null,
          category ? category.name : value.service,
          value.title,
          value.description,
          value.customerName,
          value.phone,
          value.email,
          value.address,
          value.preferredDate || null,
          value.preferredTime || null
        ]
      );
      const requestId = requestResult.rows[0].id;
      for (const [index, photo] of (value.photos || []).entries()) {
        await client.query(
          `
            INSERT INTO service_request_photos (id, service_request_id, file_name, display_order)
            VALUES ($1, $2, $3, $4)
          `,
          [createId("photo"), requestId, photo, index]
        );
      }
      return requestId;
    });
    return this.findRequestById(result);
  }

  requestSelectSql(whereSql = "") {
    return `
      SELECT
        sr.*,
        sc.code AS service_category_code,
        COALESCE(array_agg(srp.file_name ORDER BY srp.display_order) FILTER (WHERE srp.file_name IS NOT NULL), '{}') AS photos
      FROM service_requests sr
      LEFT JOIN service_categories sc ON sc.id = sr.service_category_id
      LEFT JOIN service_request_photos srp ON srp.service_request_id = sr.id
      ${whereSql}
      GROUP BY sr.id, sc.code
    `;
  }

  async listRequests({ status, query } = {}) {
    const params = [];
    const clauses = [];
    if (status) {
      params.push(status);
      clauses.push(`sr.status = $${params.length}`);
    }
    if (query) {
      params.push(`%${query.toLowerCase()}%`);
      clauses.push(`LOWER(CONCAT_WS(' ', sr.reference, sr.title, sr.service_name_snapshot, sr.status, sr.contact_name, sr.contact_email, sr.contact_phone, sr.service_address)) LIKE $${params.length}`);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.query(`${this.requestSelectSql(whereSql)} ORDER BY sr.submitted_at DESC`, params);
    return result.rows.map(requestFromRow);
  }

  async listCustomerRequests(customerId) {
    const result = await this.query(
      `${this.requestSelectSql("WHERE sr.customer_id = $1")} ORDER BY sr.submitted_at DESC`,
      [customerId]
    );
    return result.rows.map(requestFromRow);
  }

  async findRequestById(id, client = this.pool) {
    const result = await client.query(this.requestSelectSql("WHERE sr.id = $1"), [id]);
    return requestFromRow(result.rows[0]);
  }

  async findCustomerRequestById(id, customerId) {
    const result = await this.query(this.requestSelectSql("WHERE sr.id = $1 AND sr.customer_id = $2"), [id, customerId]);
    return requestFromRow(result.rows[0]);
  }

  async assignProvider(requestId, providerId, scheduledAt, adminId) {
    return transaction(this.pool, async (client) => {
      const provider = await this.findProviderById(providerId, client);
      if (!provider || provider.state !== "APPROVED") {
        throw conflictError("Only approved providers can be assigned jobs.");
      }
      const result = await client.query(
        `
          UPDATE service_requests
          SET provider_id = $2,
              scheduled_at = $3,
              status = 'ASSIGNED',
              assigned_by_admin_id = $4,
              assigned_at = now(),
              updated_at = now()
          WHERE id = $1 AND status IN ('NEW', 'REVIEWING')
          RETURNING *
        `,
        [requestId, providerId, scheduledAt || null, adminId || null]
      );
      if (!result.rows[0]) {
        throw conflictError("This request cannot be assigned from its current status.");
      }
      return this.findRequestById(requestId, client);
    });
  }

  async updateRequestStatus(requestId, status, adminId) {
    const result = await this.query(
      `
        UPDATE service_requests
        SET status = $2,
            cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN now() ELSE cancelled_at END,
            cancelled_by_admin_id = CASE WHEN $2 = 'CANCELLED' THEN $3 ELSE cancelled_by_admin_id END,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [requestId, status, adminId || null]
    );
    if (!result.rows[0]) {
      throw notFoundError("Request not found.");
    }
    return this.findRequestById(requestId);
  }

  async confirmRequest(requestId, customerId) {
    const result = await this.query(
      `
        UPDATE service_requests
        SET status = 'CONFIRMED', confirmed_at = now(), updated_at = now()
        WHERE id = $1 AND customer_id = $2 AND status = 'COMPLETED'
        RETURNING *
      `,
      [requestId, customerId]
    );
    if (!result.rows[0]) {
      throw conflictError("Completion can only be confirmed after the provider marks the job completed.");
    }
    return this.findRequestById(requestId);
  }

  async listProviderJobs(providerId) {
    const result = await this.query(
      `${this.requestSelectSql("WHERE sr.provider_id = $1")} ORDER BY sr.submitted_at DESC`,
      [providerId]
    );
    return result.rows.map(requestFromRow);
  }

  async providerJobAction(requestId, providerId, action) {
    const transitions = {
      accept: ["ASSIGNED", "ACCEPTED"],
      decline: ["ASSIGNED", "REJECTED"],
      start: ["ACCEPTED", "IN_PROGRESS"],
      complete: ["IN_PROGRESS", "COMPLETED"]
    };
    const transition = transitions[action];
    if (!transition) {
      throw conflictError("Invalid provider action.");
    }
    const [from, to] = transition;
    return transaction(this.pool, async (client) => {
      const result = await client.query(
        `
          UPDATE service_requests
          SET status = $4,
              completed_at = CASE WHEN $4 = 'COMPLETED' THEN now() ELSE completed_at END,
              updated_at = now()
          WHERE id = $1 AND provider_id = $2 AND status = $3
          RETURNING *
        `,
        [requestId, providerId, from, to]
      );
      if (!result.rows[0]) {
        const jobResult = await client.query(
          "SELECT id FROM service_requests WHERE id = $1 AND provider_id = $2",
          [requestId, providerId]
        );
        if (!jobResult.rows[0]) {
          throw notFoundError("Assigned job not found.");
        }
        throw conflictError("Invalid job transition for this provider.");
      }
      if (to === "COMPLETED") {
        await this.refreshProviderCompletedJobs(client, providerId);
      }
      return this.findRequestById(requestId, client);
    });
  }

  async createReview(value) {
    return transaction(this.pool, async (client) => {
      const requestResult = await client.query(
        "SELECT * FROM service_requests WHERE id = $1 AND customer_id = $2 AND status = 'CONFIRMED'",
        [value.requestId, value.customerId]
      );
      const request = requestResult.rows[0];
      if (!request) {
        throw conflictError("Reviews are available after completion is confirmed.");
      }
      const reviewResult = await client.query(
        `
          INSERT INTO reviews (id, request_id, customer_id, provider_id, rating, comment)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [createId("review"), request.id, value.customerId, request.provider_id, value.rating, value.comment]
      );
      if (request.provider_id) {
        await this.refreshProviderRating(client, request.provider_id);
      }
      return reviewFromRow({ ...reviewResult.rows[0], moderation: [] });
    });
  }

  async listReviews() {
    const result = await this.query(this.reviewSelectSql(""), []);
    return result.rows.map(reviewFromRow);
  }

  async findReviewByRequestId(requestId) {
    const result = await this.query(this.reviewSelectSql("WHERE r.request_id = $1"), [requestId]);
    return reviewFromRow(result.rows[0]);
  }

  reviewSelectSql(whereSql) {
    return `
      SELECT
        r.*,
        COALESCE(
          json_agg(
            json_build_object(
              'action', rme.action,
              'note', rme.note,
              'adminId', rme.admin_id,
              'at', rme.created_at
            )
            ORDER BY rme.created_at
          ) FILTER (WHERE rme.id IS NOT NULL),
          '[]'
        ) AS moderation
      FROM reviews r
      LEFT JOIN review_moderation_events rme ON rme.review_id = r.id
      ${whereSql}
      GROUP BY r.id
      ORDER BY r.submitted_at DESC
    `;
  }

  async moderateReview(reviewId, action, note, adminId) {
    return transaction(this.pool, async (client) => {
      const reviewResult = await client.query(
        "UPDATE reviews SET hidden = $2, updated_at = now() WHERE id = $1 RETURNING *",
        [reviewId, action === "hide"]
      );
      if (!reviewResult.rows[0]) {
        throw notFoundError("Review not found.");
      }
      await client.query(
        `
          INSERT INTO review_moderation_events (id, review_id, admin_id, action, note)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [createId("moderation"), reviewId, adminId || null, action, note || ""]
      );
      const result = await client.query(this.reviewSelectSql("WHERE r.id = $1"), [reviewId]);
      return reviewFromRow(result.rows[0]);
    });
  }

  async dashboardMetrics() {
    const result = await this.query(
      `
        SELECT
          (SELECT count(*)::int FROM customers) AS total_customers,
          (SELECT count(*)::int FROM providers) AS total_providers,
          (SELECT count(*)::int FROM providers WHERE state = 'PENDING_VERIFICATION') AS pending_provider_approvals,
          (SELECT count(*)::int FROM service_requests WHERE status = 'NEW') AS new_job_requests,
          (SELECT count(*)::int FROM service_requests WHERE status IN ('REVIEWING', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')) AS active_jobs,
          (SELECT count(*)::int FROM service_requests WHERE status IN ('COMPLETED', 'CONFIRMED')) AS completed_jobs,
          (SELECT count(*)::int FROM service_requests WHERE status = 'CANCELLED') AS cancelled_jobs
      `
    );
    const row = result.rows[0];
    return {
      totalCustomers: row.total_customers,
      totalProviders: row.total_providers,
      pendingProviderApprovals: row.pending_provider_approvals,
      newJobRequests: row.new_job_requests,
      activeJobs: row.active_jobs,
      completedJobs: row.completed_jobs,
      cancelledJobs: row.cancelled_jobs
    };
  }

  async refreshProviderCompletedJobs(client, providerId) {
    await client.query(
      `
        UPDATE providers
        SET completed_jobs = (
          SELECT count(*)::int FROM service_requests
          WHERE provider_id = $1 AND status IN ('COMPLETED', 'CONFIRMED')
        ),
        updated_at = now()
        WHERE id = $1
      `,
      [providerId]
    );
  }

  async refreshProviderRating(client, providerId) {
    await client.query(
      `
        UPDATE providers
        SET rating = (
          SELECT round(avg(rating)::numeric, 1)
          FROM reviews
          WHERE provider_id = $1 AND hidden = false
        ),
        updated_at = now()
        WHERE id = $1
      `,
      [providerId]
    );
  }
}

function createPostgresStore(options = {}) {
  return new PostgresStore(options.pool || getPool());
}

module.exports = {
  PostgresStore,
  createPostgresStore
};
