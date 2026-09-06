const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const defaultDbPath = path.resolve(__dirname, "..", "storage", "tikka-db.json");
const seedServices = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "data", "services.json"), "utf8")
);

const defaultProviders = [
  {
    id: "provider-sunil",
    name: "Sunil Perera",
    phone: "+94770000001",
    email: "sunil.provider@example.com",
    passwordHash: null,
    profileImage: "public/brand/tikka-logo.jpg",
    profilePhoto: "public/brand/tikka-logo.jpg",
    skills: ["Repairs", "Handyman", "Furniture assembly"],
    services: ["Repairs", "Handyman"],
    serviceArea: "Colombo and suburbs",
    description: "Experienced repair and handyman support for everyday jobs.",
    experienceYears: 8,
    qualifications: "General maintenance training",
    state: "APPROVED",
    verificationStatus: "Approved",
    rating: 4.7,
    completedJobs: 0,
    createdAt: new Date().toISOString()
  },
  {
    id: "provider-nadeesha",
    name: "Nadeesha Fernando",
    phone: "+94770000002",
    email: "nadeesha.provider@example.com",
    passwordHash: null,
    profileImage: "public/brand/tikka-logo.jpg",
    profilePhoto: "public/brand/tikka-logo.jpg",
    skills: ["Cleaning", "Maintenance"],
    services: ["Cleaning"],
    serviceArea: "Greater Colombo",
    description: "Cleaning and maintenance provider for homes and offices.",
    experienceYears: 5,
    qualifications: "Cleaning operations experience",
    state: "APPROVED",
    verificationStatus: "Approved",
    rating: 4.8,
    completedJobs: 0,
    createdAt: new Date().toISOString()
  }
];

function seedCategories() {
  return seedServices.map((service) => ({
    id: createId("category"),
    name: service.name,
    code: service.code,
    icon: service.icon || service.code,
    description: service.description,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}

function createEmptyDatabase() {
  return {
    customers: [],
    requests: [],
    reviews: [],
    providers: defaultProviders,
    admins: [],
    categories: seedCategories()
  };
}

function normalizeDatabase(database) {
  if (!Array.isArray(database.customers)) {
    database.customers = [];
  }
  if (!Array.isArray(database.requests)) {
    database.requests = [];
  }
  if (!Array.isArray(database.reviews)) {
    database.reviews = [];
  }
  if (!Array.isArray(database.providers) || database.providers.length === 0) {
    database.providers = defaultProviders;
  }
  if (!Array.isArray(database.admins)) {
    database.admins = [];
  }
  if (!Array.isArray(database.categories) || database.categories.length === 0) {
    database.categories = seedCategories();
  }
  return database;
}

function createStore(dbPath = process.env.TIKKA_DB_PATH || defaultDbPath) {
  const resolvedPath = path.resolve(dbPath);

  function ensure() {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    if (!fs.existsSync(resolvedPath)) {
      write(createEmptyDatabase());
    }
  }

  function read() {
    ensure();
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    const needsWrite =
      !Array.isArray(parsed.admins) ||
      !Array.isArray(parsed.categories) ||
      parsed.categories.length === 0;
    const database = normalizeDatabase(parsed);
    if (needsWrite) {
      write(database);
    }
    return database;
  }

  function write(database) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, `${JSON.stringify(database, null, 2)}\n`);
  }

  function update(mutator) {
    const database = read();
    const result = mutator(database);
    write(database);
    return result;
  }

  return {
    path: resolvedPath,
    read,
    write,
    update
  };
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function createRequestReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `TIKKA-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

module.exports = {
  createEmptyDatabase,
  createId,
  createRequestReference,
  createStore,
  seedCategories
};
