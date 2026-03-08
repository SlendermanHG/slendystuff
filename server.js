const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.set("trust proxy", true);

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const LOG_DIR_FALLBACK = path.join(ROOT_DIR, "logs");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const SECRETS_PATH = path.join(DATA_DIR, "secrets.json");
const ACCOUNTS_PATH = path.join(DATA_DIR, "accounts.json");
const ADMINS_PATH = path.join(DATA_DIR, "admins.json");

const SESSION_COOKIE = "slendy_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const USER_SESSION_COOKIE = "slendy_user_session";
const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const userSessions = new Map();

const DEFAULT_ADMIN_EMAIL = "slender@slendystuff.com";
const ADMIN_EMAIL = safeString(process.env.ADMIN_EMAIL, DEFAULT_ADMIN_EMAIL).trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234567890";
const PORT = Number(process.env.PORT || 4173);

let settingsCache = null;
let secretsCache = null;
let accountsCache = null;
let adminsCache = null;
let writeQueue = Promise.resolve();
let anydeskRefreshTimer = null;

const defaultSettings = {
  brand: {
    name: "Slendy Stuff",
    tagline: "Programs and bots built for real tasks",
    heroTitle: "Tools, Bots, and Support That Scale With Your Next Idea",
    heroSubtitle: "Launch different niche products fast with one versatile storefront and support flow."
  },
  theme: {
    accentHex: "#ff2ea6"
  },
  stripeLinks: {
    starter: "https://buy.stripe.com/test_cNi7sNeB7fiW0Ni80g0gw05",
    pro: "https://buy.stripe.com/test_6oU14pfFbb2G0Ni0xO0gw06",
    reset: "https://buy.stripe.com/test_6oU8wRcsZc6K9jO3K00gw07"
  },
  support: {
    supportEmail: "Help@slendystuff.com",
    anydeskSourceUrl: "https://download.anydesk.com/AnyDesk.exe",
    anydeskDownloadUrl: "https://download.anydesk.com/AnyDesk.exe",
    anydeskLastCheckedAt: null,
    anydeskLastModified: null,
    anydeskContentLength: null,
    refreshIntervalHours: 12,
    intro: "Request a remote cleanup/support session through AnyDesk with minimal steps."
  },
  analytics: {
    customTrackingEnabled: true
  },
  aiAssistant: {
    enabled: true,
    hardwiredRules:
      "You are Slendy Stuff Idea Assistant. Produce high-detail, implementation-ready concepts with sections for offer, audience, feature scope, technical plan, delivery phases, pricing model, launch plan, and operational risks. Keep suggestions practical, legal, and ethically safe."
  },
  products: [
    {
      id: "pos-suite",
      title: "POS Suite",
      category: "Programs",
      summary: "High-control point-of-sale platform with role permissions, inventory sync, reporting pipelines, and workflow tuning for real-world operations.",
      priceLabel: "Custom Pricing",
      ctaLabel: "Request Details",
      ctaUrl: "mailto:admin@slendystuff.com?subject=POS%20Suite%20Inquiry",
      requires18Plus: false
    },
    {
      id: "system-optimizer",
      title: "System Optimizer",
      category: "Programs",
      summary: "Deep system optimization stack with startup/process tuning, maintenance automation, and performance baselines for repeatable speed gains.",
      priceLabel: "Custom Pricing",
      ctaLabel: "Request Details",
      ctaUrl: "mailto:admin@slendystuff.com?subject=System%20Optimizer%20Inquiry",
      requires18Plus: false
    },
    {
      id: "discord-bot-kit",
      title: "Discord Bot Kit",
      category: "Bots",
      summary: "Production-ready Discord automation with moderation workflows, utility command systems, ticketing hooks, and growth-focused engagement tooling.",
      priceLabel: "From $19.99",
      ctaLabel: "View Options",
      ctaUrl: "mailto:admin@slendystuff.com?subject=Discord%20Bot%20Inquiry",
      requires18Plus: false
    },
    {
      id: "dnd5e-campaign-scribe",
      title: "D&D 5e Campaign Scribe Bot",
      category: "Bots",
      summary: "Dual-mode Discord campaign assistant for both Dungeon Masters and players with recap generation, quest tracking, initiative support, and campaign memory tooling.",
      priceLabel: "From $24.99",
      ctaLabel: "View Options",
      ctaUrl: "mailto:admin@slendystuff.com?subject=D%26D%205e%20Campaign%20Scribe%20Bot%20Inquiry",
      requires18Plus: false
    },
    {
      id: "remote-control-limited",
      title: "Remote Control Bot (Limited)",
      category: "Bots",
      summary: "Bounded remote automation service with strict permission layers, auditability controls, and deployment guardrails for managed operations.",
      priceLabel: "Custom Pricing",
      ctaLabel: "View Details",
      ctaUrl: "mailto:admin@slendystuff.com?subject=Remote%20Control%20Bot%20Inquiry",
      requires18Plus: true
    }
  ]
};

const defaultSecrets = {
  protonDriveLogPath: path.join(process.env.USERPROFILE || ROOT_DIR, "Documents", "Proton Drive", "slendystuff-logs"),
  gaMeasurementId: "",
  metaPixelId: "",
  customWebhookUrl: "",
  apiKeys: {
    openai: "",
    discord: "",
    stripeSecret: ""
  }
};

const defaultAccounts = {
  users: []
};

const defaultAdmins = {
  admins: []
};

function nowIso() {
  return new Date().toISOString();
}

function dayStamp() {
  return nowIso().slice(0, 10);
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  const exists = await fileExists(filePath);
  if (!exists) {
    await fs.writeFile(filePath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
    return structuredClone(fallback);
  }

  const raw = await fs.readFile(filePath, "utf8");
  return safeParseJson(raw, structuredClone(fallback));
}

function queueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

async function saveJson(filePath, value) {
  await queueWrite(async () => {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  });
}

function normalizeSettings(payload) {
  const merged = {
    ...defaultSettings,
    ...payload,
    brand: { ...defaultSettings.brand, ...(payload.brand || {}) },
    theme: { ...defaultSettings.theme, ...(payload.theme || {}) },
    stripeLinks: { ...defaultSettings.stripeLinks, ...(payload.stripeLinks || {}) },
    support: { ...defaultSettings.support, ...(payload.support || {}) },
    analytics: { ...defaultSettings.analytics, ...(payload.analytics || {}) },
    aiAssistant: { ...defaultSettings.aiAssistant, ...(payload.aiAssistant || {}) },
    products: Array.isArray(payload.products) ? payload.products : defaultSettings.products
  };

  merged.aiAssistant.enabled = merged.aiAssistant.enabled !== false;
  merged.aiAssistant.hardwiredRules = safeString(
    merged.aiAssistant.hardwiredRules,
    defaultSettings.aiAssistant.hardwiredRules
  ).trim();

  merged.products = merged.products
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      id: String(item.id || `item-${index + 1}`).trim(),
      title: String(item.title || "Untitled").trim(),
      category: String(item.category || "Programs").trim(),
      summary: String(item.summary || "").trim(),
      priceLabel: String(item.priceLabel || "").trim(),
      ctaLabel: String(item.ctaLabel || "Learn More").trim(),
      ctaUrl: String(item.ctaUrl || "#").trim(),
      requires18Plus: Boolean(item.requires18Plus)
    }));

  return merged;
}

function normalizeSecrets(payload) {
  const merged = {
    ...defaultSecrets,
    ...payload,
    apiKeys: {
      ...defaultSecrets.apiKeys,
      ...((payload && payload.apiKeys) || {})
    }
  };

  merged.protonDriveLogPath = String(merged.protonDriveLogPath || defaultSecrets.protonDriveLogPath).trim();
  merged.gaMeasurementId = String(merged.gaMeasurementId || "").trim();
  merged.metaPixelId = String(merged.metaPixelId || "").trim();
  merged.customWebhookUrl = String(merged.customWebhookUrl || "").trim();

  return merged;
}

function normalizeAccounts(payload) {
  const users = Array.isArray(payload && payload.users) ? payload.users : [];
  return {
    users: users
      .filter((user) => user && typeof user === "object")
      .map((user) => ({
        id: safeString(user.id, crypto.randomUUID()),
        email: safeString(user.email, "").trim(),
        emailLower: safeString(user.emailLower, safeString(user.email, "").toLowerCase()).trim().toLowerCase(),
        name: safeString(user.name, "").trim(),
        passwordHash: safeString(user.passwordHash, ""),
        createdAt: safeString(user.createdAt, nowIso()),
        stripeCustomerId: safeString(user.stripeCustomerId, ""),
        purchases: Array.isArray(user.purchases)
          ? user.purchases.map((purchase) => ({
              id: safeString(purchase.id, crypto.randomUUID()),
              productId: safeString(purchase.productId, ""),
              title: safeString(purchase.title, ""),
              amountCents: Number.isFinite(Number(purchase.amountCents)) ? Number(purchase.amountCents) : null,
              currency: safeString(purchase.currency, "USD"),
              purchasedAt: safeString(purchase.purchasedAt, nowIso()),
              paymentRef: safeString(purchase.paymentRef, ""),
              source: safeString(purchase.source, "manual")
            }))
          : [],
        supportRequests: Array.isArray(user.supportRequests)
          ? user.supportRequests.map((request) => ({
              id: safeString(request.id, crypto.randomUUID()),
              createdAt: safeString(request.createdAt, nowIso()),
              issue: safeString(request.issue, ""),
              preferredTime: safeString(request.preferredTime, ""),
              serviceLevel: safeString(request.serviceLevel, ""),
              managementOptions: Array.isArray(request.managementOptions)
                ? request.managementOptions.map((item) => safeString(item, "")).filter(Boolean)
                : [],
              billingStatus: safeString(request.billingStatus, "paid_support_required"),
              billingReason: safeString(request.billingReason, "")
            }))
          : []
      }))
  };
}

function normalizeAdmins(payload) {
  const admins = Array.isArray(payload && payload.admins) ? payload.admins : [];
  return {
    admins: admins
      .filter((admin) => admin && typeof admin === "object")
      .map((admin) => {
        const email = safeString(admin.email, "").trim();
        return {
          id: safeString(admin.id, crypto.randomUUID()),
          email,
          emailLower: safeString(admin.emailLower, email.toLowerCase()).trim().toLowerCase(),
          name: safeString(admin.name, "Admin").trim() || "Admin",
          passwordHash: safeString(admin.passwordHash, ""),
          createdAt: safeString(admin.createdAt, nowIso()),
          lastLoginAt: safeString(admin.lastLoginAt, ""),
          role: safeString(admin.role, "owner")
        };
      })
      .filter((admin) => admin.emailLower && admin.passwordHash)
  };
}

async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR_FALLBACK, { recursive: true });

  settingsCache = normalizeSettings(await readJson(SETTINGS_PATH, defaultSettings));
  secretsCache = normalizeSecrets(await readJson(SECRETS_PATH, defaultSecrets));
  accountsCache = normalizeAccounts(await readJson(ACCOUNTS_PATH, defaultAccounts));
  adminsCache = normalizeAdmins(await readJson(ADMINS_PATH, defaultAdmins));
  await ensureBootstrapAdmin();
}

function resolveLogDir() {
  const configuredPath = String((secretsCache && secretsCache.protonDriveLogPath) || "").trim();
  if (!configuredPath) {
    return LOG_DIR_FALLBACK;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(ROOT_DIR, configuredPath);
}

function extractClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

async function appendLog(logName, payload, req = null) {
  const logDir = resolveLogDir();
  const timestamp = nowIso();
  const filePath = path.join(logDir, `${logName}-${dayStamp()}.jsonl`);
  const entry = {
    timestamp,
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(req
      ? {
          ip: extractClientIp(req),
          userAgent: req.headers["user-agent"] || "unknown"
        }
      : {}),
    ...payload
  };

  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");

  if (secretsCache.customWebhookUrl) {
    fetch(secretsCache.customWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: logName, entry })
    }).catch(() => {
      // No-op: logging should not fail because webhook is unavailable.
    });
  }
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isValidAdminPassword(value) {
  return safeString(value, "").length >= 10;
}

function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plainPassword), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(plainPassword, storedHash) {
  const parts = safeString(storedHash, "").split(":");
  if (parts.length !== 2) {
    return false;
  }

  const [salt, originalHash] = parts;
  const candidate = crypto.scryptSync(String(plainPassword), salt, 64).toString("hex");

  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(originalHash, "hex");
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

async function ensureBootstrapAdmin() {
  const emailLower = ADMIN_EMAIL;
  if (!emailLower) {
    return;
  }

  const existing = findAdminByEmail(emailLower);
  if (existing) {
    return;
  }

  const admin = {
    id: crypto.randomUUID(),
    email: emailLower,
    emailLower,
    name: "Primary Admin",
    passwordHash: hashPassword(ADMIN_PASSWORD),
    createdAt: nowIso(),
    lastLoginAt: "",
    role: "owner"
  };
  adminsCache.admins.push(admin);
  await saveJson(ADMINS_PATH, adminsCache);
}

function findUserByEmail(email) {
  const emailLower = safeString(email, "").trim().toLowerCase();
  if (!emailLower) {
    return null;
  }
  return accountsCache.users.find((user) => user.emailLower === emailLower) || null;
}

function findUserById(userId) {
  return accountsCache.users.find((user) => user.id === userId) || null;
}

function findAdminByEmail(email) {
  const emailLower = safeString(email, "").trim().toLowerCase();
  if (!emailLower) {
    return null;
  }
  return adminsCache.admins.find((admin) => admin.emailLower === emailLower) || null;
}

function findAdminById(adminId) {
  return adminsCache.admins.find((admin) => admin.id === adminId) || null;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    stripeCustomerId: user.stripeCustomerId,
    purchases: [...user.purchases].sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()),
    supportRequests: [...user.supportRequests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  };
}

function sanitizeAdmin(admin) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    createdAt: admin.createdAt,
    lastLoginAt: admin.lastLoginAt
  };
}

function getSupportEligibility(user) {
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const purchases = [...(user.purchases || [])]
    .map((purchase) => ({
      ...purchase,
      purchasedMs: new Date(purchase.purchasedAt).getTime()
    }))
    .filter((purchase) => Number.isFinite(purchase.purchasedMs))
    .sort((a, b) => b.purchasedMs - a.purchasedMs);

  if (purchases.length === 0) {
    return {
      eligible: false,
      billingStatus: "paid_support_required",
      reason: "No purchase found on this account.",
      qualifyingPurchase: null,
      freeSupportUntil: null
    };
  }

  const qualifying = purchases.find((purchase) => purchase.purchasedMs + oneYearMs >= now);
  if (!qualifying) {
    const lastPurchase = purchases[0];
    return {
      eligible: false,
      billingStatus: "paid_support_required",
      reason: "Most recent purchase is older than 365 days.",
      qualifyingPurchase: null,
      freeSupportUntil: new Date(lastPurchase.purchasedMs + oneYearMs).toISOString()
    };
  }

  return {
    eligible: true,
    billingStatus: "free_support",
    reason: "Purchase within 365 days found.",
    qualifyingPurchase: {
      id: qualifying.id,
      productId: qualifying.productId,
      title: qualifying.title,
      purchasedAt: qualifying.purchasedAt
    },
    freeSupportUntil: new Date(qualifying.purchasedMs + oneYearMs).toISOString()
  };
}

function createAdminSession(res, admin) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { adminId: admin.id, expiresAt });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: SESSION_TTL_MS
  });
}

function createUserSession(res, user) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + USER_SESSION_TTL_MS;
  userSessions.set(token, { userId: user.id, expiresAt });

  res.cookie(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: USER_SESSION_TTL_MS
  });
}

function clearExpiredSessions() {
  const now = Date.now();
  for (const [token, value] of sessions.entries()) {
    if (!value || value.expiresAt < now) {
      sessions.delete(token);
    }
  }
}

function clearExpiredUserSessions() {
  const now = Date.now();
  for (const [token, value] of userSessions.entries()) {
    if (!value || value.expiresAt < now) {
      userSessions.delete(token);
    }
  }
}

function requireAdmin(req, res, next) {
  clearExpiredSessions();
  const token = req.cookies[SESSION_COOKIE];
  const session = token ? sessions.get(token) : null;
  if (!session) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const admin = findAdminById(session.adminId);
  if (!admin) {
    sessions.delete(token);
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  req.admin = admin;
  next();
}

function requireUser(req, res, next) {
  clearExpiredUserSessions();
  const token = req.cookies[USER_SESSION_COOKIE];
  const session = token ? userSessions.get(token) : null;
  if (!session) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const user = findUserById(session.userId);
  if (!user) {
    userSessions.delete(token);
    res.clearCookie(USER_SESSION_COOKIE);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  req.user = user;
  next();
}

function getPublicConfig() {
  return {
    generatedAt: nowIso(),
    brand: settingsCache.brand,
    theme: settingsCache.theme,
    stripeLinks: settingsCache.stripeLinks,
    support: settingsCache.support,
    analytics: {
      customTrackingEnabled: settingsCache.analytics.customTrackingEnabled !== false,
      gaMeasurementId: secretsCache.gaMeasurementId,
      metaPixelId: secretsCache.metaPixelId
    },
    aiAssistant: {
      enabled: settingsCache.aiAssistant.enabled !== false,
      hardwiredRules: settingsCache.aiAssistant.hardwiredRules
    },
    account: {
      enabled: true,
      supportPolicy: "Free remote support is available for purchases made within the last 365 days. Otherwise paid support applies."
    },
    products: settingsCache.products
  };
}

async function saveSettingsAndSecrets({ settings, secrets }, actor = "admin") {
  settingsCache = normalizeSettings(settings || settingsCache);
  secretsCache = normalizeSecrets(secrets || secretsCache);

  await saveJson(SETTINGS_PATH, settingsCache);
  await saveJson(SECRETS_PATH, secretsCache);

  await appendLog("settings-change", {
    actor,
    changedAt: nowIso(),
    productCount: settingsCache.products.length,
    logPath: secretsCache.protonDriveLogPath
  });

  scheduleAnydeskRefresh();
}

async function refreshAnydeskLink(trigger = "scheduled") {
  const sourceUrl = safeString(settingsCache.support.anydeskSourceUrl, "https://download.anydesk.com/AnyDesk.exe") || "https://download.anydesk.com/AnyDesk.exe";

  try {
    const response = await fetch(sourceUrl, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    settingsCache.support.anydeskDownloadUrl = response.url || sourceUrl;
    settingsCache.support.anydeskLastCheckedAt = nowIso();
    settingsCache.support.anydeskLastModified = response.headers.get("last-modified");
    settingsCache.support.anydeskContentLength = response.headers.get("content-length");
    settingsCache.support.anydeskLastError = null;

    await saveJson(SETTINGS_PATH, settingsCache);

    await appendLog("anydesk-refresh", {
      trigger,
      sourceUrl,
      resolvedUrl: settingsCache.support.anydeskDownloadUrl,
      lastModified: settingsCache.support.anydeskLastModified,
      contentLength: settingsCache.support.anydeskContentLength
    });

    return { ok: true, sourceUrl, resolvedUrl: settingsCache.support.anydeskDownloadUrl };
  } catch (error) {
    settingsCache.support.anydeskLastCheckedAt = nowIso();
    settingsCache.support.anydeskLastError = safeString(error.message, "Unknown AnyDesk refresh error");
    await saveJson(SETTINGS_PATH, settingsCache);

    await appendLog("anydesk-refresh", {
      trigger,
      sourceUrl,
      error: settingsCache.support.anydeskLastError
    });

    return { ok: false, sourceUrl, error: settingsCache.support.anydeskLastError };
  }
}

function scheduleAnydeskRefresh() {
  if (anydeskRefreshTimer) {
    clearInterval(anydeskRefreshTimer);
  }

  const hours = Number(settingsCache.support.refreshIntervalHours || 12);
  const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;

  anydeskRefreshTimer = setInterval(() => {
    refreshAnydeskLink("scheduled").catch(() => {
      // No-op
    });
  }, intervalMs);
}

function extractResponseText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const pieces = [];
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const node of content) {
      if (node && node.type === "output_text" && typeof node.text === "string") {
        pieces.push(node.text);
      }
    }
  }

  return pieces.join("\n").trim();
}

function buildFallbackIdeaResponse(prompt, rules) {
  const cleanedPrompt = safeString(prompt, "").trim();
  const ideas = [
    "Create a three-phase offer: discovery sprint, implementation package, and managed optimization retainer.",
    "Design a core product plus two paid expansion modules so buyers can scale features over time.",
    "Bundle deployment, training, and maintenance SLA into one conversion-ready service stack.",
    "Build one niche-targeted variant with custom integrations, then clone framework for additional markets.",
    "Pair automation tooling with reporting dashboards to create clear ROI visibility for clients."
  ];

  const shuffled = ideas.sort(() => Math.random() - 0.5).slice(0, 3);
  return [
    "Here are scoped, execution-ready idea directions:",
    ...shuffled.map((idea, index) => `${index + 1}. ${idea}`),
    "",
    `Prompt focus: ${cleanedPrompt || "General product strategy"}`,
    `Hardwired rules in effect: ${safeString(rules, "").slice(0, 180)}`
  ].join("\n");
}

async function generateIdeaAssistantReply({ prompt, history, rules }) {
  const apiKey = safeString(secretsCache && secretsCache.apiKeys && secretsCache.apiKeys.openai, "").trim();
  if (!apiKey) {
    return { text: buildFallbackIdeaResponse(prompt, rules), source: "fallback-no-api-key", model: "local-fallback" };
  }

  const compactHistory = Array.isArray(history)
    ? history
        .filter((entry) => entry && typeof entry === "object")
        .slice(-6)
        .map((entry) => ({
          prompt: safeString(entry.prompt, "").slice(0, 700),
          answer: safeString(entry.answer, "").slice(0, 1200),
          createdAt: safeString(entry.createdAt, "")
        }))
    : [];

  const body = {
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: rules || defaultSettings.aiAssistant.hardwiredRules
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                task: "Generate practical product and automation ideas for Slendy Stuff.",
                prompt: safeString(prompt, "").slice(0, 2000),
                recentIdeaLog: compactHistory
              },
              null,
              2
            )
          }
        ]
      }
    ],
    max_output_tokens: 700
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return {
    text,
    source: "openai",
    model: safeString(payload.model, "gpt-4.1-mini"),
    responseId: safeString(payload.id, "")
  };
}

app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

app.get("/api/public-config", (_req, res) => {
  res.json({ ok: true, config: getPublicConfig() });
});

app.get("/api/support/anydesk", (_req, res) => {
  res.json({
    ok: true,
    anydesk: {
      downloadUrl: settingsCache.support.anydeskDownloadUrl,
      sourceUrl: settingsCache.support.anydeskSourceUrl,
      lastCheckedAt: settingsCache.support.anydeskLastCheckedAt,
      lastModified: settingsCache.support.anydeskLastModified,
      contentLength: settingsCache.support.anydeskContentLength,
      lastError: settingsCache.support.anydeskLastError || null
    }
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = safeString(req.body.name, "").trim();
    const email = safeString(req.body.email, "").trim();
    const password = safeString(req.body.password, "");
    const emailLower = email.toLowerCase();

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "Name, email, and password are required." });
    }
    if (!email.includes("@") || email.length > 180) {
      return res.status(400).json({ ok: false, error: "Invalid email format." });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
    }
    if (findUserByEmail(emailLower)) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists." });
    }

    const user = {
      id: crypto.randomUUID(),
      email,
      emailLower,
      name,
      passwordHash: hashPassword(password),
      createdAt: nowIso(),
      stripeCustomerId: "",
      purchases: [],
      supportRequests: []
    };

    accountsCache.users.push(user);
    await saveJson(ACCOUNTS_PATH, accountsCache);
    createUserSession(res, user);

    await appendLog("account-register", { userId: user.id, email: user.email }, req);

    res.json({
      ok: true,
      user: sanitizeUser(user),
      eligibility: getSupportEligibility(user)
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Account registration failed") });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = safeString(req.body.email, "").trim();
    const password = safeString(req.body.password, "");
    const user = findUserByEmail(email);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    createUserSession(res, user);
    await appendLog("account-login", { userId: user.id, email: user.email }, req);

    res.json({
      ok: true,
      user: sanitizeUser(user),
      eligibility: getSupportEligibility(user)
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Account login failed") });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies[USER_SESSION_COOKIE];
  if (token) {
    userSessions.delete(token);
  }
  res.clearCookie(USER_SESSION_COOKIE);
  res.json({ ok: true });
});

app.get("/api/auth/session", (req, res) => {
  clearExpiredUserSessions();
  const token = req.cookies[USER_SESSION_COOKIE];
  const session = token ? userSessions.get(token) : null;
  if (!session) {
    return res.json({ ok: true, authenticated: false });
  }

  const user = findUserById(session.userId);
  if (!user) {
    userSessions.delete(token);
    res.clearCookie(USER_SESSION_COOKIE);
    return res.json({ ok: true, authenticated: false });
  }

  return res.json({
    ok: true,
    authenticated: true,
    user: sanitizeUser(user),
    eligibility: getSupportEligibility(user)
  });
});

app.get("/api/account/summary", requireUser, (req, res) => {
  res.json({
    ok: true,
    user: sanitizeUser(req.user),
    eligibility: getSupportEligibility(req.user),
    billingPolicy: "If no qualifying purchase exists within 365 days, paid support is required."
  });
});

app.post("/api/track", async (req, res) => {
  try {
    if (settingsCache.analytics.customTrackingEnabled === false) {
      return res.json({ ok: true, skipped: true });
    }

    const eventName = safeString(req.body.eventName, "event").slice(0, 80);
    const meta = req.body.meta && typeof req.body.meta === "object" ? req.body.meta : {};

    await appendLog(
      "analytics",
      {
        eventName,
        path: safeString(req.body.path, ""),
        referrer: safeString(req.body.referrer, ""),
        clientTimezone: safeString(req.body.clientTimezone, ""),
        meta
      },
      req
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Tracking failure") });
  }
});

app.post("/api/idea-assistant/generate", async (req, res) => {
  try {
    if (settingsCache.aiAssistant.enabled === false) {
      return res.status(403).json({ ok: false, error: "Idea assistant is disabled in admin settings." });
    }

    const prompt = safeString(req.body.prompt, "").trim();
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const clientTimezone = safeString(req.body.clientTimezone, "");
    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Prompt is required." });
    }
    if (prompt.length > 3000) {
      return res.status(400).json({ ok: false, error: "Prompt is too long." });
    }

    const rules = safeString(settingsCache.aiAssistant.hardwiredRules, defaultSettings.aiAssistant.hardwiredRules);

    let result;
    try {
      result = await generateIdeaAssistantReply({ prompt, history, rules });
    } catch (error) {
      result = {
        text: buildFallbackIdeaResponse(prompt, rules),
        source: "fallback-error",
        model: "local-fallback",
        error: safeString(error.message, "Unknown generation error")
      };
    }

    await appendLog(
      "idea-assistant",
      {
        prompt,
        promptLength: prompt.length,
        replyLength: result.text.length,
        source: result.source,
        model: result.model,
        responseId: safeString(result.responseId, ""),
        error: safeString(result.error, ""),
        clientTimezone
      },
      req
    );

    res.json({
      ok: true,
      answer: result.text,
      source: result.source,
      model: result.model,
      hardwiredRules: rules
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Idea assistant failure") });
  }
});

app.post("/api/age-verify", async (req, res) => {
  try {
    const answer = safeString(req.body.answer, "unknown").toLowerCase();
    const allowed = answer === "yes";

    await appendLog(
      "age-verification",
      {
        pageKey: safeString(req.body.pageKey, "unknown"),
        answer,
        allowed,
        clientTimezone: safeString(req.body.clientTimezone, ""),
        clientTime: safeString(req.body.clientTime, "")
      },
      req
    );

    res.json({ ok: true, allowed });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Age verification failure") });
  }
});

app.post("/api/support/request", async (req, res) => {
  try {
    clearExpiredUserSessions();
    const token = req.cookies[USER_SESSION_COOKIE];
    const session = token ? userSessions.get(token) : null;
    const sessionUser = session ? findUserById(session.userId) : null;
    const emailUser = findUserByEmail(safeString(req.body.email, "").trim());
    const linkedUser = sessionUser || emailUser;
    const eligibility = linkedUser
      ? getSupportEligibility(linkedUser)
      : {
          eligible: false,
          billingStatus: "paid_support_required",
          reason: "No account purchase record found.",
          qualifyingPurchase: null,
          freeSupportUntil: null
        };

    const requestDetails = {
      name: safeString(req.body.name, "Anonymous"),
      email: safeString(req.body.email, ""),
      issue: safeString(req.body.issue, ""),
      preferredTime: safeString(req.body.preferredTime, ""),
      serviceLevel: safeString(req.body.serviceLevel, ""),
      managementOptions: Array.isArray(req.body.managementOptions)
        ? req.body.managementOptions.map((item) => safeString(item, "")).filter(Boolean)
        : [],
      billingStatus: eligibility.billingStatus,
      billingReason: eligibility.reason,
      freeSupportUntil: eligibility.freeSupportUntil,
      accountUserId: linkedUser ? linkedUser.id : null,
      clientTimezone: safeString(req.body.clientTimezone, "")
    };

    if (linkedUser) {
      linkedUser.supportRequests.push({
        id: crypto.randomUUID(),
        createdAt: nowIso(),
        issue: requestDetails.issue,
        preferredTime: requestDetails.preferredTime,
        serviceLevel: requestDetails.serviceLevel,
        managementOptions: requestDetails.managementOptions,
        billingStatus: requestDetails.billingStatus,
        billingReason: requestDetails.billingReason
      });
      await saveJson(ACCOUNTS_PATH, accountsCache);
    }

    await appendLog("support-request", requestDetails, req);

    res.json({
      ok: true,
      message: "Support request captured.",
      billingStatus: requestDetails.billingStatus,
      billingReason: requestDetails.billingReason,
      freeSupportUntil: requestDetails.freeSupportUntil,
      supportIsFree: requestDetails.billingStatus === "free_support"
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Support request failure") });
  }
});

app.post("/api/tool-request", async (req, res) => {
  try {
    const ideaLog = Array.isArray(req.body.ideaLog)
      ? req.body.ideaLog
          .filter((entry) => entry && typeof entry === "object")
          .slice(-20)
          .map((entry) => ({
            createdAt: safeString(entry.createdAt, nowIso()),
            prompt: safeString(entry.prompt, "").slice(0, 1200),
            answer: safeString(entry.answer, "").slice(0, 4000),
            source: safeString(entry.source, ""),
            model: safeString(entry.model, "")
          }))
      : [];

    const requestDetails = {
      name: safeString(req.body.name, "Anonymous"),
      email: safeString(req.body.email, ""),
      toolType: safeString(req.body.toolType, ""),
      timeline: safeString(req.body.timeline, ""),
      whatWant: safeString(req.body.whatWant, ""),
      howUsed: safeString(req.body.howUsed, ""),
      remoteOptions: Array.isArray(req.body.remoteOptions)
        ? req.body.remoteOptions.map((item) => safeString(item, "")).filter(Boolean)
        : [],
      budget: safeString(req.body.budget, ""),
      notes: safeString(req.body.notes, ""),
      attachIdeaLog: req.body.attachIdeaLog !== false,
      ideaLog,
      clientTimezone: safeString(req.body.clientTimezone, "")
    };

    await appendLog("custom-tool-request", requestDetails, req);
    res.json({ ok: true, message: "Custom tool request captured." });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Custom tool request failure") });
  }
});

app.post("/api/contact-message", async (req, res) => {
  try {
    const requestDetails = {
      name: safeString(req.body.name, "Anonymous"),
      email: safeString(req.body.email, ""),
      subject: safeString(req.body.subject, ""),
      message: safeString(req.body.message, ""),
      clientTimezone: safeString(req.body.clientTimezone, "")
    };

    await appendLog("contact-message", requestDetails, req);
    res.json({ ok: true, message: "Contact message captured." });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Contact message failure") });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const email = safeString(req.body.email, "").trim().toLowerCase();
    const password = safeString(req.body.password, "");

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required." });
    }

    const admin = findAdminByEmail(email);
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    admin.lastLoginAt = nowIso();
    await saveJson(ADMINS_PATH, adminsCache);
    createAdminSession(res, admin);
    return res.json({ ok: true, admin: sanitizeAdmin(admin) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Admin login failure") });
  }
});

app.post("/api/admin/logout", (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }

  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get("/api/admin/session", requireAdmin, (req, res) => {
  res.json({ ok: true, admin: sanitizeAdmin(req.admin) });
});

app.post("/api/admin/change-password", requireAdmin, async (req, res) => {
  try {
    const currentPassword = safeString(req.body.currentPassword, "");
    const newPassword = safeString(req.body.newPassword, "");
    const confirmPassword = safeString(req.body.confirmPassword, "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ ok: false, error: "Current, new, and confirm password are required." });
    }
    if (!verifyPassword(currentPassword, req.admin.passwordHash)) {
      return res.status(401).json({ ok: false, error: "Current password is incorrect." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, error: "New password and confirm password do not match." });
    }
    if (!isValidAdminPassword(newPassword)) {
      return res.status(400).json({ ok: false, error: "New password must be at least 10 characters." });
    }

    req.admin.passwordHash = hashPassword(newPassword);
    await saveJson(ADMINS_PATH, adminsCache);
    await appendLog("admin-password-change", { adminId: req.admin.id, email: req.admin.email }, req);

    return res.json({ ok: true, message: "Admin password updated." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Failed to update admin password") });
  }
});

app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    settings: settingsCache,
    secrets: secretsCache
  });
});

app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const nextSettings = normalizeSettings(req.body.settings || settingsCache);
    const nextSecrets = normalizeSecrets(req.body.secrets || secretsCache);

    await saveSettingsAndSecrets({ settings: nextSettings, secrets: nextSecrets }, req.admin.email || "admin");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Failed to save settings") });
  }
});

app.post("/api/admin/refresh-anydesk", requireAdmin, async (_req, res) => {
  const result = await refreshAnydeskLink("manual");
  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.json(result);
});

app.get("/api/admin/accounts", requireAdmin, (_req, res) => {
  const users = accountsCache.users.map((user) => ({
    ...sanitizeUser(user),
    eligibility: getSupportEligibility(user)
  }));
  res.json({ ok: true, users });
});

app.post("/api/admin/account-purchase", requireAdmin, async (req, res) => {
  try {
    const email = safeString(req.body.email, "").trim();
    const productId = safeString(req.body.productId, "").trim();
    const title = safeString(req.body.title, "").trim();
    const amountCents = Number(req.body.amountCents);
    const currency = safeString(req.body.currency, "USD").toUpperCase();
    const paymentRef = safeString(req.body.paymentRef, "").trim();
    const purchasedAt = safeString(req.body.purchasedAt, nowIso());

    if (!email || !productId) {
      return res.status(400).json({ ok: false, error: "Email and productId are required." });
    }
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      return res.status(400).json({ ok: false, error: "amountCents must be a non-negative number." });
    }

    const user = findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ ok: false, error: "No account found for this email." });
    }

    const purchase = {
      id: crypto.randomUUID(),
      productId,
      title,
      amountCents,
      currency,
      purchasedAt,
      paymentRef,
      source: "manual-admin"
    };
    user.purchases.push(purchase);
    await saveJson(ACCOUNTS_PATH, accountsCache);

    await appendLog("account-purchase", { userId: user.id, email: user.email, purchase }, req);

    res.json({ ok: true, purchase, eligibility: getSupportEligibility(user) });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Failed to add purchase") });
  }
});

app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}` });
});

async function start() {
  await initData();
  scheduleAnydeskRefresh();
  await refreshAnydeskLink("startup");

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Admin bootstrap source: ADMIN_EMAIL (${ADMIN_EMAIL}) + ADMIN_PASSWORD env vars.`);
    if (ADMIN_PASSWORD === "1234567890") {
      console.warn("ADMIN_PASSWORD is using the temporary default. Change it in admin settings or env vars for production.");
    }
    console.log(`Logs currently target: ${resolveLogDir()}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
