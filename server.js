const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const app = express();
const trustProxyRaw = String(process.env.TRUST_PROXY_HOPS || "1").trim();
const trustProxyHops = Number(trustProxyRaw);
app.set("trust proxy", Number.isFinite(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1);
app.disable("x-powered-by");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const IS_RENDER = String(process.env.RENDER || "").toLowerCase() === "true";
const PERSIST_ROOT = process.env.PERSIST_ROOT || (IS_RENDER ? "/var/data/websitemanbot" : ROOT_DIR);
const DATA_DIR = process.env.DATA_DIR || path.join(PERSIST_ROOT, "data");
const LOG_DIR_FALLBACK = process.env.LOG_DIR || path.join(PERSIST_ROOT, "logs");
const MANAGED_REPO_PATH = process.env.MANAGED_REPO_PATH || ROOT_DIR;
const IS_OCI_DEPLOY = os.platform() !== "win32" && Boolean(process.env.MANAGED_REPO_PATH);
const SETTINGS_PATH = process.env.SETTINGS_PATH || path.join(DATA_DIR, "settings.json");
const SECRETS_PATH = process.env.SECRETS_PATH || path.join(DATA_DIR, "secrets.json");
const SUPPORT_REQUESTS_PATH = process.env.SUPPORT_REQUESTS_PATH || path.join(DATA_DIR, "support-requests.json");
const CONTACT_MESSAGES_PATH = process.env.CONTACT_MESSAGES_PATH || path.join(DATA_DIR, "contact-messages.json");
const ACCOUNTS_PATH = process.env.ACCOUNTS_PATH || path.join(DATA_DIR, "accounts.json");
const FORUM_TOPICS_PATH = process.env.FORUM_TOPICS_PATH || path.join(DATA_DIR, "forum-topics.json");

const SESSION_COOKIE = "slendy_admin_session";
const ACCOUNT_SESSION_COOKIE = "slendy_account_session";
const OWNER_BROWSER_COOKIE = "slendy_owner_browser";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OWNER_BROWSER_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const sessions = new Map();
const accountSessions = new Map();
const rateLimiterStore = new Map();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-admin-password";
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || "slender@slendystuff.com");
const ADMIN_PASSWORD_MIN_LENGTH = Number(process.env.ADMIN_PASSWORD_MIN_LENGTH || 12);
const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || (IS_PRODUCTION ? "true" : "false")).toLowerCase() === "true";
const ENFORCE_STRONG_ADMIN_PASSWORD =
  String(process.env.ENFORCE_STRONG_ADMIN_PASSWORD || (IS_PRODUCTION ? "true" : "false")).toLowerCase() === "true";
const CSRF_HEADER_NAME = "x-csrf-token";
const LOGIN_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 10 };
const SUPPORT_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 8 };
const TRACK_RATE_LIMIT = { windowMs: 60 * 1000, max: 120 };
const ACCOUNT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 15 };
const CHECKOUT_RATE_LIMIT = { windowMs: 60 * 1000, max: 30 };
const PORT = Number(process.env.PORT || 4173);
const RW_COV_BASE_URL = "https://rwcov.org";
const RW_COV_CACHE_TTL_MS = 30 * 60 * 1000;
const IP_GEO_CACHE_TTL_MS = Number(process.env.IP_GEO_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const IP_GEO_ERROR_TTL_MS = Number(process.env.IP_GEO_ERROR_TTL_MS || 60 * 60 * 1000);
const IP_GEO_LOOKUP_TIMEOUT_MS = Number(process.env.IP_GEO_LOOKUP_TIMEOUT_MS || 3500);
const IP_GEO_LOOKUP_CONCURRENCY = Math.min(10, Math.max(1, Number(process.env.IP_GEO_LOOKUP_CONCURRENCY || 6)));

let settingsCache = null;
let secretsCache = null;
let supportRequestsCache = [];
let contactMessagesCache = [];
let accountsCache = [];
let forumTopicsCache = [];
let writeQueue = Promise.resolve();
let anydeskRefreshTimer = null;
let securityScanTimer = null;
let rwcovInfoCache = null;
const ipGeoCache = new Map();
const ipGeoInFlight = new Map();
const execFileAsync = promisify(execFile);
const managerActivityCache = [];
let securityFindingsCache = [];
let managerStatusCache = {
  repoStatus: null,
  siteHealth: null,
  lastSecurityScanAt: null,
  lastSecurityScanTrigger: null,
  lastSecurityScanSummary: null,
  lastOperatorRunAt: null,
  lastOperatorSummary: null
};

const defaultSettings = {
  brand: {
    name: "slendystuff",
    tagline: "Software help you can use right away",
    heroTitle: "Simple Tools, Smart Automation, and Real Support",
    heroSubtitle: "Pick what you need, get clear options, and get help quickly when you want it."
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
    supportEmail: "admin@slendystuff.com",
    anydeskSourceUrl: "https://download.anydesk.com/AnyDesk.exe",
    anydeskDownloadUrl: "https://download.anydesk.com/AnyDesk.exe",
    anydeskLastCheckedAt: null,
    anydeskLastModified: null,
    anydeskContentLength: null,
    refreshIntervalHours: 12,
    intro: "Need help with cleanup, troubleshooting, or setup? Request support in a few quick steps."
  },
  analytics: {
    customTrackingEnabled: true
  },
  opsManager: {
    enabled: true,
    githubRepo: "SlendermanHG/slendystuff.com",
    defaultBranch: "main",
    managedRepoPath: MANAGED_REPO_PATH,
    domainName: "slendystuff.com",
    apiSubdomain: "api.slendystuff.com",
    opsSubdomain: "ops.slendystuff.com",
    domainProvider: "Squarespace",
    dnsNotes: "Squarespace is managing the DNS zone for slendystuff.com.",
    alertEmail: "siteadmin@slendystuff.com",
    nativeWindowsNotifications: true,
    browserNotifications: true,
    securityScanIntervalMinutes: 60,
    criticalReminderMinutes: 15,
    normalReminderMinutes: 60,
    autoFixCritical: true,
    cloudflareEnabled: true,
    localOwnerConsoleEnabled: true,
    sensitiveTextApprovalsRequireCode: true,
    operatorBaseUrl: "https://api.openai.com/v1",
    operatorModel: "gpt-5",
    operatorFullAccess: true,
    operatorSystemPrompt:
      "You are the Slendy Stuff website operator. Prefer minimal, production-safe changes. If asked to write files, return complete file contents."
  },
  coupons: [
    {
      code: "SLENDERFAM",
      percentOff: 100,
      active: true
    },
    {
      code: "SHEETZFAM",
      percentOff: 50,
      active: true
    }
  ],
  products: [
    {
      id: "pos-suite",
      title: "POS Suite",
      category: "Programs",
      summary: "Speed up checkout and daily operations with a cleaner point-of-sale experience.",
      priceLabel: "$29/mo launch price",
      priceCents: 2900,
      ctaLabel: "Start POS Build",
      ctaUrl: "/support.html?plan=pos-suite",
      requires18Plus: false
    },
    {
      id: "system-optimizer",
      title: "System Optimizer",
      category: "Programs",
      summary: "Improve speed and stability on your Windows system with focused optimization tools.",
      priceLabel: "$49 one-time reset",
      priceCents: 4900,
      ctaLabel: "Book Optimizer",
      ctaUrl: "/support.html?plan=system-optimizer",
      requires18Plus: false
    },
    {
      id: "discord-bot-kit",
      title: "Discord Bot Kit",
      category: "Bots",
      summary: "Automate moderation, alerts, and routine tasks so your community runs smoothly.",
      priceLabel: "$99 one-time build",
      priceCents: 9900,
      ctaLabel: "Launch Bot Kit",
      ctaUrl: "/support.html?plan=discord-bot-kit",
      requires18Plus: false
    },
    {
      id: "remote-control-limited",
      title: "Remote Control Bot (Limited)",
      category: "Bots",
      summary: "Managed remote automation for approved use cases with defined safeguards.",
      priceLabel: "$59/mo managed",
      priceCents: 5900,
      ctaLabel: "Apply for Access",
      ctaUrl: "/support.html?plan=remote-control-limited",
      requires18Plus: true
    }
  ]
};

const defaultSecrets = {
  protonDriveLogPath: process.env.PROTON_LOG_DIR || LOG_DIR_FALLBACK,
  ownerBrowserToken: "",
  gaMeasurementId: "",
  metaPixelId: "",
  customWebhookUrl: "",
  discordRemodelCode: process.env.DISCORD_REMODEL_CODE || "",
  discordRemodelDiscountPercent: Number(process.env.DISCORD_REMODEL_DISCOUNT_PERCENT || 40),
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
    ownerPhone: process.env.TWILIO_OWNER_PHONE || ""
  },
  protonSmtp: {
    host: process.env.PROTON_SMTP_HOST || "",
    port: Number(process.env.PROTON_SMTP_PORT || 587),
    username: process.env.PROTON_SMTP_USER || "",
    password: process.env.PROTON_SMTP_PASSWORD || "",
    fromEmail: process.env.PROTON_SMTP_FROM_EMAIL || "siteadmin@slendystuff.com"
  },
  oci: {
    sshHost: "",
    sshUser: "ubuntu",
    sshKeyPath: "",
    backupMountPath: "/srv/slendystuff-backups"
  },
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN || "",
    zoneId: process.env.CLOUDFLARE_ZONE_ID || "",
    accountEmail: process.env.CLOUDFLARE_EMAIL || ""
  },
  ownerApproval: {
    textApprovalSecret: process.env.OWNER_TEXT_APPROVAL_SECRET || ""
  },
  apiKeys: {
    openai: process.env.OPENAI_API_KEY || "",
    discord: "",
    stripeSecret: process.env.STRIPE_SECRET_KEY || ""
  }
};

const defaultSupportRequests = [];
const defaultContactMessages = [];
const defaultAccounts = [];
const defaultForumTopics = [];

function nowIso() {
  return new Date().toISOString();
}

function dayStamp() {
  return nowIso().slice(0, 10);
}

function dayStampOffset(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date.toISOString().slice(0, 10);
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

function extractPriceCentsFromLabel(priceLabel) {
  const match = String(priceLabel || "").match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.round(amount * 100);
}

function normalizePriceCents(rawValue, fallbackLabel = "", productId = "") {
  const explicit = Number(rawValue);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(50000000, Math.round(explicit));
  }

  const fromLabel = extractPriceCentsFromLabel(fallbackLabel);
  if (fromLabel > 0) {
    return fromLabel;
  }

  const fallbackById = {
    "pos-suite": 2900,
    "system-optimizer": 4900,
    "discord-bot-kit": 9900,
    "remote-control-limited": 5900
  };
  return fallbackById[String(productId || "").trim()] || 0;
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
    opsManager: { ...defaultSettings.opsManager, ...(payload.opsManager || {}) },
    coupons: Array.isArray(payload.coupons) ? payload.coupons : defaultSettings.coupons,
    products: Array.isArray(payload.products) ? payload.products : defaultSettings.products
  };

  merged.brand.name = truncate(merged.brand.name, 80);
  merged.brand.tagline = truncate(merged.brand.tagline, 160);
  merged.brand.heroTitle = truncate(merged.brand.heroTitle, 180);
  merged.brand.heroSubtitle = truncate(merged.brand.heroSubtitle, 400);
  merged.theme.accentHex = /^#[0-9a-fA-F]{6}$/.test(String(merged.theme.accentHex || ""))
    ? merged.theme.accentHex
    : defaultSettings.theme.accentHex;

  merged.stripeLinks.starter = normalizeCtaUrl(merged.stripeLinks.starter);
  merged.stripeLinks.pro = normalizeCtaUrl(merged.stripeLinks.pro);
  merged.stripeLinks.reset = normalizeCtaUrl(merged.stripeLinks.reset);

  merged.support.supportEmail = normalizeEmail(merged.support.supportEmail) || defaultSettings.support.supportEmail;
  merged.support.anydeskSourceUrl = normalizeHttpsUrl(merged.support.anydeskSourceUrl) || defaultSettings.support.anydeskSourceUrl;
  merged.support.refreshIntervalHours = Math.min(168, Math.max(1, Number(merged.support.refreshIntervalHours || 12)));
  merged.support.intro = truncate(merged.support.intro, 400);
  merged.opsManager.enabled = merged.opsManager.enabled !== false;
  merged.opsManager.githubRepo = truncate(safeString(merged.opsManager.githubRepo, defaultSettings.opsManager.githubRepo).trim(), 160);
  merged.opsManager.defaultBranch = truncate(safeString(merged.opsManager.defaultBranch, "main").trim(), 80) || "main";
  merged.opsManager.managedRepoPath =
    truncate(safeString(merged.opsManager.managedRepoPath, MANAGED_REPO_PATH).trim(), 300) || MANAGED_REPO_PATH;
  if (
    (os.platform() !== "win32" && /^[a-zA-Z]:[\\/]/.test(merged.opsManager.managedRepoPath)) ||
    (os.platform() === "win32" && merged.opsManager.managedRepoPath.startsWith("/"))
  ) {
    merged.opsManager.managedRepoPath = MANAGED_REPO_PATH;
  }
  merged.opsManager.domainName = truncate(safeString(merged.opsManager.domainName, "slendystuff.com").trim(), 120);
  merged.opsManager.apiSubdomain = truncate(
    safeString(merged.opsManager.apiSubdomain, `api.${merged.opsManager.domainName}`).trim(),
    160
  );
  merged.opsManager.opsSubdomain = truncate(
    safeString(merged.opsManager.opsSubdomain, `ops.${merged.opsManager.domainName}`).trim(),
    160
  );
  merged.opsManager.domainProvider = truncate(safeString(merged.opsManager.domainProvider, "Squarespace").trim(), 120);
  merged.opsManager.dnsNotes = truncate(safeString(merged.opsManager.dnsNotes, "").trim(), 600);
  merged.opsManager.alertEmail =
    normalizeEmail(merged.opsManager.alertEmail) || normalizeEmail(defaultSettings.opsManager.alertEmail);
  merged.opsManager.nativeWindowsNotifications = merged.opsManager.nativeWindowsNotifications !== false;
  merged.opsManager.browserNotifications = merged.opsManager.browserNotifications !== false;
  merged.opsManager.securityScanIntervalMinutes = Math.min(
    1440,
    Math.max(5, Number(merged.opsManager.securityScanIntervalMinutes || 60))
  );
  merged.opsManager.criticalReminderMinutes = Math.min(
    720,
    Math.max(5, Number(merged.opsManager.criticalReminderMinutes || 15))
  );
  merged.opsManager.normalReminderMinutes = Math.min(
    1440,
    Math.max(15, Number(merged.opsManager.normalReminderMinutes || 60))
  );
  merged.opsManager.autoFixCritical = merged.opsManager.autoFixCritical !== false;
  merged.opsManager.cloudflareEnabled = merged.opsManager.cloudflareEnabled !== false;
  merged.opsManager.localOwnerConsoleEnabled = merged.opsManager.localOwnerConsoleEnabled !== false;
  merged.opsManager.sensitiveTextApprovalsRequireCode = merged.opsManager.sensitiveTextApprovalsRequireCode !== false;
  merged.opsManager.operatorBaseUrl =
    normalizeHttpsUrl(merged.opsManager.operatorBaseUrl) || defaultSettings.opsManager.operatorBaseUrl;
  merged.opsManager.operatorModel =
    truncate(safeString(merged.opsManager.operatorModel, defaultSettings.opsManager.operatorModel).trim(), 120) ||
    defaultSettings.opsManager.operatorModel;
  merged.opsManager.operatorFullAccess = merged.opsManager.operatorFullAccess !== false;
  merged.opsManager.operatorSystemPrompt = truncate(
    safeString(merged.opsManager.operatorSystemPrompt, defaultSettings.opsManager.operatorSystemPrompt).trim(),
    2000
  );

  merged.coupons = merged.coupons
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      code: truncate(String(item.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ""), 40),
      percentOff: Math.min(100, Math.max(0, Math.round(Number(item.percentOff || 0)))),
      active: item.active !== false
    }))
    .filter((item) => item.code && item.percentOff > 0)
    .slice(0, 100);

  if (merged.coupons.length === 0) {
    merged.coupons = structuredClone(defaultSettings.coupons);
  }

  merged.products = merged.products
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const id = truncate(String(item.id || `item-${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]/g, "-"), 80);
      const priceLabel = truncate(String(item.priceLabel || "").trim(), 60);
      return {
        id,
        title: truncate(String(item.title || "Untitled").trim(), 120),
        category: truncate(String(item.category || "Programs").trim(), 80),
        summary: truncate(String(item.summary || "").trim(), 500),
        priceLabel,
        priceCents: normalizePriceCents(item.priceCents, priceLabel, id),
        ctaLabel: truncate(String(item.ctaLabel || "Learn More").trim(), 60),
        ctaUrl: normalizeCtaUrl(item.ctaUrl || "#"),
        requires18Plus: Boolean(item.requires18Plus)
      };
    });

  return merged;
}

function normalizeSecrets(payload) {
  const merged = {
    ...defaultSecrets,
    ...payload,
    twilio: {
      ...defaultSecrets.twilio,
      ...((payload && payload.twilio) || {})
    },
    protonSmtp: {
      ...defaultSecrets.protonSmtp,
      ...((payload && payload.protonSmtp) || {})
    },
    oci: {
      ...defaultSecrets.oci,
      ...((payload && payload.oci) || {})
    },
    cloudflare: {
      ...defaultSecrets.cloudflare,
      ...((payload && payload.cloudflare) || {})
    },
    ownerApproval: {
      ...defaultSecrets.ownerApproval,
      ...((payload && payload.ownerApproval) || {})
    },
    apiKeys: {
      ...defaultSecrets.apiKeys,
      ...((payload && payload.apiKeys) || {})
    }
  };

  merged.protonDriveLogPath = String(merged.protonDriveLogPath || defaultSecrets.protonDriveLogPath).trim();
  merged.ownerBrowserToken = truncate(safeString(merged.ownerBrowserToken, "").trim(), 200);
  merged.gaMeasurementId = truncate(String(merged.gaMeasurementId || "").trim(), 64);
  merged.metaPixelId = truncate(String(merged.metaPixelId || "").trim(), 64);
  merged.customWebhookUrl = normalizeHttpsUrl(merged.customWebhookUrl);
  merged.discordRemodelCode = truncate(safeString(merged.discordRemodelCode, "").trim(), 120);
  merged.discordRemodelDiscountPercent = Math.min(90, Math.max(0, Number(merged.discordRemodelDiscountPercent || 40)));
  merged.twilio.accountSid = truncate(
    safeString(merged.twilio.accountSid, "").trim() || safeString(defaultSecrets.twilio.accountSid, "").trim(),
    120
  );
  merged.twilio.authToken = truncate(
    safeString(merged.twilio.authToken, "").trim() || safeString(defaultSecrets.twilio.authToken, "").trim(),
    200
  );
  merged.twilio.phoneNumber = truncate(
    safeString(merged.twilio.phoneNumber, "").trim() || safeString(defaultSecrets.twilio.phoneNumber, "").trim(),
    40
  );
  merged.twilio.ownerPhone = truncate(
    safeString(merged.twilio.ownerPhone, "").trim() || safeString(defaultSecrets.twilio.ownerPhone, "").trim(),
    40
  );
  merged.protonSmtp.host = truncate(
    safeString(merged.protonSmtp.host, "").trim() || safeString(defaultSecrets.protonSmtp.host, "").trim(),
    160
  );
  merged.protonSmtp.port = Math.min(
    65535,
    Math.max(1, Number(merged.protonSmtp.port || defaultSecrets.protonSmtp.port || 587))
  );
  merged.protonSmtp.username = truncate(
    safeString(merged.protonSmtp.username, "").trim() || safeString(defaultSecrets.protonSmtp.username, "").trim(),
    200
  );
  merged.protonSmtp.password = truncate(
    safeString(merged.protonSmtp.password, "").trim() || safeString(defaultSecrets.protonSmtp.password, "").trim(),
    300
  );
  merged.protonSmtp.fromEmail =
    normalizeEmail(merged.protonSmtp.fromEmail) || normalizeEmail(defaultSecrets.protonSmtp.fromEmail);
  merged.oci.sshHost = truncate(safeString(merged.oci.sshHost, "").trim(), 200);
  merged.oci.sshUser = truncate(safeString(merged.oci.sshUser, "ubuntu").trim(), 80) || "ubuntu";
  merged.oci.sshKeyPath = truncate(safeString(merged.oci.sshKeyPath, "").trim(), 300);
  merged.oci.backupMountPath =
    truncate(safeString(merged.oci.backupMountPath, defaultSecrets.oci.backupMountPath).trim(), 300) ||
    defaultSecrets.oci.backupMountPath;
  merged.cloudflare.apiToken = truncate(
    safeString(merged.cloudflare.apiToken, "").trim() || safeString(defaultSecrets.cloudflare.apiToken, "").trim(),
    300
  );
  merged.cloudflare.zoneId = truncate(
    safeString(merged.cloudflare.zoneId, "").trim() || safeString(defaultSecrets.cloudflare.zoneId, "").trim(),
    120
  );
  merged.cloudflare.accountEmail =
    normalizeEmail(merged.cloudflare.accountEmail) || normalizeEmail(defaultSecrets.cloudflare.accountEmail);
  merged.ownerApproval.textApprovalSecret = truncate(
    safeString(merged.ownerApproval.textApprovalSecret, "").trim() ||
      safeString(defaultSecrets.ownerApproval.textApprovalSecret, "").trim(),
    120
  );
  merged.apiKeys.openai = truncate(
    safeString(merged.apiKeys.openai, "").trim() || safeString(defaultSecrets.apiKeys.openai, "").trim(),
    300
  );
  merged.apiKeys.discord = truncate(safeString(merged.apiKeys.discord, "").trim(), 300);
  merged.apiKeys.stripeSecret = truncate(
    safeString(merged.apiKeys.stripeSecret, "").trim() || safeString(defaultSecrets.apiKeys.stripeSecret, "").trim(),
    300
  );

  return merged;
}

function normalizeSupportRequestStatus(value) {
  const normalized = safeString(value, "").toLowerCase();
  if (normalized === "in_progress") {
    return "in_progress";
  }
  if (normalized === "waiting_on_owner") {
    return "waiting_on_owner";
  }
  if (normalized === "closed") {
    return "closed";
  }
  return "new";
}

function normalizeSupportRequest(item) {
  return {
    id: truncate(safeString(item.id, crypto.randomBytes(8).toString("hex")), 24),
    name: truncate(safeString(item.name, "Anonymous"), 120),
    email: normalizeEmail(item.email),
    issue: truncate(safeString(item.issue, ""), 2000),
    preferredTime: truncate(safeString(item.preferredTime, ""), 120),
    clientTimezone: truncate(safeString(item.clientTimezone, ""), 80),
    status: normalizeSupportRequestStatus(item.status),
    adminNotes: truncate(safeString(item.adminNotes, ""), 1200),
    createdAt: safeString(item.createdAt, nowIso()),
    updatedAt: safeString(item.updatedAt, safeString(item.createdAt, nowIso()))
  };
}

function normalizeSupportRequests(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeSupportRequest(item))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function normalizeContactMessageStatus(value) {
  const normalized = safeString(value, "").toLowerCase();
  if (normalized === "in_progress") {
    return "in_progress";
  }
  if (normalized === "waiting_on_owner") {
    return "waiting_on_owner";
  }
  if (normalized === "closed") {
    return "closed";
  }
  return "new";
}

function normalizeContactMessage(item) {
  return {
    id: truncate(safeString(item.id, crypto.randomBytes(8).toString("hex")), 24),
    name: truncate(safeString(item.name, "Anonymous"), 120),
    email: normalizeEmail(item.email),
    subject: truncate(safeString(item.subject, ""), 200),
    preferredContact: truncate(safeString(item.preferredContact, "email"), 40),
    discordUsername: truncate(safeString(item.discordUsername, ""), 80),
    message: truncate(safeString(item.message, ""), 4000),
    clientTimezone: truncate(safeString(item.clientTimezone, ""), 80),
    status: normalizeContactMessageStatus(item.status),
    adminNotes: truncate(safeString(item.adminNotes, ""), 1200),
    createdAt: safeString(item.createdAt, nowIso()),
    updatedAt: safeString(item.updatedAt, safeString(item.createdAt, nowIso()))
  };
}

function normalizeContactMessages(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeContactMessage(item))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function normalizeForumComment(item) {
  return {
    id: truncate(safeString(item.id, crypto.randomBytes(8).toString("hex")), 24),
    body: truncate(safeString(item.body, "").trim(), 2000),
    authorAccountId: truncate(safeString(item.authorAccountId, ""), 24),
    authorEmail: normalizeEmail(item.authorEmail),
    authorName: truncate(safeString(item.authorName, "Member"), 120),
    createdAt: safeString(item.createdAt, nowIso())
  };
}

function normalizeForumTopic(item) {
  const createdAt = safeString(item.createdAt, nowIso());
  const comments = Array.isArray(item.comments)
    ? item.comments
        .filter((comment) => comment && typeof comment === "object")
        .map((comment) => normalizeForumComment(comment))
        .filter((comment) => comment.body.length >= 2)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    : [];

  return {
    id: truncate(safeString(item.id, crypto.randomBytes(8).toString("hex")), 24),
    title: truncate(safeString(item.title, "").trim(), 140),
    body: truncate(safeString(item.body, "").trim(), 3000),
    authorAccountId: truncate(safeString(item.authorAccountId, ""), 24),
    authorEmail: normalizeEmail(item.authorEmail),
    authorName: truncate(safeString(item.authorName, "Member"), 120),
    createdAt,
    updatedAt: safeString(item.updatedAt, createdAt),
    comments,
    commentCount: comments.length,
    lastCommentAt: comments.length ? comments[comments.length - 1].createdAt : ""
  };
}

function normalizeForumTopics(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeForumTopic(item))
    .filter((topic) => topic.title.length >= 3 && topic.body.length >= 8)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 1000);
}

function sanitizeForumTopic(topic) {
  const comments = Array.isArray(topic.comments) ? topic.comments : [];
  return {
    id: topic.id,
    title: topic.title,
    body: topic.body,
    authorName: topic.authorName || "Member",
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    commentCount: comments.length,
    lastCommentAt: comments.length ? comments[comments.length - 1].createdAt : "",
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorName: comment.authorName || "Member",
      createdAt: comment.createdAt
    }))
  };
}

function normalizeAccountRole(value) {
  const role = safeString(value, "").toLowerCase();
  if (role === "admin") {
    return "admin";
  }
  return "customer";
}

function hashPassword(password, saltHex = crypto.randomBytes(16).toString("hex")) {
  const saltBuffer = Buffer.from(saltHex, "hex");
  const hash = crypto.scryptSync(String(password || ""), saltBuffer, 64).toString("hex");
  return { passwordSalt: saltHex, passwordHash: hash };
}

function verifyPassword(inputPassword, account) {
  const expected = Buffer.from(safeString(account.passwordHash, ""), "hex");
  const computed = Buffer.from(hashPassword(inputPassword, safeString(account.passwordSalt, "")).passwordHash, "hex");
  if (expected.length === 0 || expected.length !== computed.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, computed);
}

function normalizeAccount(item) {
  const now = nowIso();
  const email = normalizeEmail(item.email);
  const name = truncate(safeString(item.name, "").trim(), 120);
  const createdAt = safeString(item.createdAt, now);
  const updatedAt = safeString(item.updatedAt, createdAt);
  const id = truncate(safeString(item.id, crypto.randomBytes(8).toString("hex")), 24);
  const role = normalizeAccountRole(item.role);
  const disabled = Boolean(item.disabled);

  let passwordHash = safeString(item.passwordHash, "");
  let passwordSalt = safeString(item.passwordSalt, "");
  if (!passwordHash || !passwordSalt) {
    const seeded = hashPassword(String(item.password || ""));
    passwordHash = seeded.passwordHash;
    passwordSalt = seeded.passwordSalt;
  }

  return {
    id,
    email,
    name,
    role,
    disabled,
    createdAt,
    updatedAt,
    lastLoginAt: safeString(item.lastLoginAt, ""),
    passwordHash: truncate(passwordHash, 200),
    passwordSalt: truncate(passwordSalt, 200)
  };
}

function normalizeAccounts(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  const seen = new Set();
  return payload
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeAccount(item))
    .filter((item) => {
      if (!item.email || seen.has(item.email)) {
        return false;
      }
      seen.add(item.email);
      return true;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function sanitizeAccountForAdmin(account) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    disabled: account.disabled,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastLoginAt: account.lastLoginAt || null
  };
}

function buildAccountStats(accounts) {
  const now = Date.now();
  const since7d = now - 7 * 24 * 60 * 60 * 1000;
  const since30d = now - 30 * 24 * 60 * 60 * 1000;

  const createdLast7d = accounts.filter((account) => {
    const ts = Date.parse(account.createdAt || "");
    return Number.isFinite(ts) && ts >= since7d;
  }).length;

  const activeLast30d = accounts.filter((account) => {
    const ts = Date.parse(account.lastLoginAt || "");
    return Number.isFinite(ts) && ts >= since30d;
  }).length;

  const adminCount = accounts.filter((account) => account.role === "admin").length;
  const customerCount = accounts.filter((account) => account.role !== "admin").length;

  return {
    total: accounts.length,
    createdLast7d,
    activeLast30d,
    adminCount,
    customerCount
  };
}

async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR_FALLBACK, { recursive: true });

  settingsCache = normalizeSettings(await readJson(SETTINGS_PATH, defaultSettings));
  secretsCache = normalizeSecrets(await readJson(SECRETS_PATH, defaultSecrets));
  supportRequestsCache = normalizeSupportRequests(await readJson(SUPPORT_REQUESTS_PATH, defaultSupportRequests));
  contactMessagesCache = normalizeContactMessages(await readJson(CONTACT_MESSAGES_PATH, defaultContactMessages));
  accountsCache = normalizeAccounts(await readJson(ACCOUNTS_PATH, defaultAccounts));
  forumTopicsCache = normalizeForumTopics(await readJson(FORUM_TOPICS_PATH, defaultForumTopics));

  const ownerEmail = normalizeEmail(process.env.ADMIN_EMAIL || "slender@slendystuff.com");
  if (ownerEmail) {
    const existingOwner = accountsCache.find((account) => account.email === ownerEmail);
    if (!existingOwner) {
      const hashed = hashPassword(ADMIN_PASSWORD);
      accountsCache.unshift(
        normalizeAccount({
          id: crypto.randomBytes(8).toString("hex"),
          email: ownerEmail,
          name: "Owner",
          role: "admin",
          passwordHash: hashed.passwordHash,
          passwordSalt: hashed.passwordSalt,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          lastLoginAt: ""
        })
      );
      await saveJson(ACCOUNTS_PATH, accountsCache);
    }
  }
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

function normalizeIpValue(value) {
  const raw = safeString(value, "").trim();
  if (!raw) {
    return "";
  }

  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function extractClientIps(req) {
  const ips = [];
  const add = (value) => {
    const normalized = normalizeIpValue(value);
    if (!normalized) {
      return;
    }
    if (!ips.includes(normalized)) {
      ips.push(normalized);
    }
  };

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    forwarded
      .split(",")
      .map((part) => part.trim())
      .forEach(add);
  }

  add(req.headers["x-real-ip"]);
  add(req.ip);
  add(req.socket && req.socket.remoteAddress);

  return ips.slice(0, 8);
}

function extractClientIp(req) {
  const ips = extractClientIps(req);
  return ips[0] || "unknown";
}

function isIpv4(value) {
  const ip = safeString(value, "").trim();
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function privateIpLocationLabel(value) {
  const ip = normalizeIpValue(value);
  if (!ip || ip === "unknown") {
    return "Unknown";
  }

  if (ip === "::1" || ip === "localhost") {
    return "Localhost";
  }

  if (isIpv4(ip)) {
    const [a, b] = ip.split(".").map((part) => Number(part));
    if (a === 127) return "Localhost";
    if (a === 10) return "Private Network";
    if (a === 192 && b === 168) return "Private Network";
    if (a === 172 && b >= 16 && b <= 31) return "Private Network";
    if (a === 169 && b === 254) return "Link-Local";
    if (a === 100 && b >= 64 && b <= 127) return "Carrier NAT";
    if (a === 0 || a >= 224) return "Reserved";
    return "";
  }

  const lower = ip.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd")) return "Private IPv6";
  if (lower.startsWith("fe80")) return "Link-Local IPv6";
  if (lower.startsWith("::ffff:127.")) return "Localhost";

  return "";
}

function locationLabelFromLookup(payload) {
  const parts = [
    safeString(payload.city, "").trim(),
    safeString(payload.region, "").trim(),
    safeString(payload.country, "").trim()
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  const continent = safeString(payload.continent, "").trim();
  return continent || "Unknown";
}

async function fetchIpLocation(ip) {
  const normalizedIp = normalizeIpValue(ip);
  if (!normalizedIp) {
    return { ip: "", label: "Unknown", source: "none", resolvedAt: nowIso() };
  }

  const privateLabel = privateIpLocationLabel(normalizedIp);
  if (privateLabel) {
    return { ip: normalizedIp, label: privateLabel, source: "local", resolvedAt: nowIso() };
  }

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), IP_GEO_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(normalizedIp)}?fields=success,message,city,region,country,continent`,
      {
        headers: { "User-Agent": "slendystuff-ip-locator/1.0" },
        signal: timeoutController.signal
      }
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      const fallbackLabel =
        payload && typeof payload.message === "string" && payload.message.toLowerCase().includes("reserved")
          ? "Reserved"
          : "Unknown";
      return { ip: normalizedIp, label: fallbackLabel, source: "ipwho.is", resolvedAt: nowIso() };
    }

    return {
      ip: normalizedIp,
      label: locationLabelFromLookup(payload),
      source: "ipwho.is",
      resolvedAt: nowIso()
    };
  } catch {
    return { ip: normalizedIp, label: "Unknown", source: "error", resolvedAt: nowIso() };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveIpLocation(ip) {
  const normalizedIp = normalizeIpValue(ip);
  if (!normalizedIp) {
    return { ip: "", label: "Unknown", source: "none", resolvedAt: nowIso() };
  }

  const cached = ipGeoCache.get(normalizedIp);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = ipGeoInFlight.get(normalizedIp);
  if (inFlight) {
    return inFlight;
  }

  const lookupPromise = fetchIpLocation(normalizedIp)
    .then((result) => {
      const ttlMs = result.source === "ipwho.is" || result.source === "local" ? IP_GEO_CACHE_TTL_MS : IP_GEO_ERROR_TTL_MS;
      ipGeoCache.set(normalizedIp, { value: result, expiresAt: Date.now() + ttlMs });
      return result;
    })
    .finally(() => {
      ipGeoInFlight.delete(normalizedIp);
    });

  ipGeoInFlight.set(normalizedIp, lookupPromise);
  return lookupPromise;
}

async function resolveIpLocations(ips) {
  const uniqueIps = Array.from(
    new Set(
      (Array.isArray(ips) ? ips : [])
        .map((value) => normalizeIpValue(value))
        .filter(Boolean)
    )
  );

  const locationByIp = {};
  if (uniqueIps.length === 0) {
    return locationByIp;
  }

  let index = 0;
  const workers = new Array(Math.min(IP_GEO_LOOKUP_CONCURRENCY, uniqueIps.length)).fill(0).map(async () => {
    while (index < uniqueIps.length) {
      const currentIndex = index;
      index += 1;
      const currentIp = uniqueIps[currentIndex];
      const location = await resolveIpLocation(currentIp);
      locationByIp[currentIp] = location;
    }
  });

  await Promise.all(workers);
  return locationByIp;
}

function mapIpDetails(ips, locationByIp) {
  const uniqueIps = Array.from(new Set((Array.isArray(ips) ? ips : []).map((value) => normalizeIpValue(value)).filter(Boolean)));
  return uniqueIps.map((ip) => ({
    ip,
    location: (locationByIp[ip] && locationByIp[ip].label) || "Unknown"
  }));
}

function summarizeIpLocations(ipDetails) {
  const uniqueLocations = Array.from(
    new Set((Array.isArray(ipDetails) ? ipDetails : []).map((item) => safeString(item.location, "").trim()).filter(Boolean))
  );
  return uniqueLocations.length > 0 ? uniqueLocations.join(" | ") : "-";
}

function getManagedRepoPath() {
  const configuredPath = safeString(settingsCache && settingsCache.opsManager && settingsCache.opsManager.managedRepoPath, "").trim();
  if (!configuredPath) {
    return MANAGED_REPO_PATH;
  }

  if ((os.platform() !== "win32" && /^[a-zA-Z]:[\\/]/.test(configuredPath)) || (os.platform() === "win32" && configuredPath.startsWith("/"))) {
    return MANAGED_REPO_PATH;
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.join(ROOT_DIR, configuredPath);
}

function pathInside(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
}

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function escapePowerShellSingleQuoted(value) {
  return String(value || "").replace(/'/g, "''");
}

function notifyWindowsDesktop(title, message) {
  if (os.platform() !== "win32") {
    return;
  }
  if (!settingsCache || !settingsCache.opsManager || settingsCache.opsManager.nativeWindowsNotifications === false) {
    return;
  }

  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true
$notify.BalloonTipTitle = '${escapePowerShellSingleQuoted(title)}'
$notify.BalloonTipText = '${escapePowerShellSingleQuoted(message)}'
$notify.ShowBalloonTip(5000)
Start-Sleep -Seconds 6
$notify.Dispose()
`;

  const child = spawn(
    "powershell",
    ["-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", encodePowerShell(script)],
    {
      windowsHide: true,
      stdio: "ignore"
    }
  );
  child.on("error", () => {});
}

async function recordManagerActivity(type, message, details = {}) {
  const entry = {
    id: crypto.randomBytes(8).toString("hex"),
    type: truncate(safeString(type, "info"), 80),
    message: truncate(safeString(message, ""), 240),
    details: sanitizeMeta(details),
    createdAt: nowIso()
  };

  managerActivityCache.unshift(entry);
  managerActivityCache.splice(200);
  await appendLog("manager-activity", entry);
  return entry;
}

function hasSecretValue(value) {
  return Boolean(safeString(value, "").trim());
}

function buildPhaseOneReadiness() {
  const items = [
    {
      id: "oci-ssh",
      label: "OCI SSH host and key path",
      ready: IS_OCI_DEPLOY || (hasSecretValue(secretsCache?.oci?.sshHost) && hasSecretValue(secretsCache?.oci?.sshKeyPath)),
      hint: IS_OCI_DEPLOY ? "This backend is already running on OCI." : "Needed before the first OCI deploy."
    },
    {
      id: "twilio",
      label: "Twilio account, token, and sending number",
      ready:
        hasSecretValue(secretsCache?.twilio?.accountSid) &&
        hasSecretValue(secretsCache?.twilio?.authToken) &&
        hasSecretValue(secretsCache?.twilio?.phoneNumber),
      hint: "Needed for two-way texts and login codes."
    },
    {
      id: "owner-phone",
      label: "Owner destination phone number",
      ready: hasSecretValue(secretsCache?.twilio?.ownerPhone),
      hint: "This is your real cell number that receives alerts."
    },
    {
      id: "proton-smtp",
      label: "Proton send credentials",
      ready:
        hasSecretValue(secretsCache?.protonSmtp?.host) &&
        hasSecretValue(secretsCache?.protonSmtp?.username) &&
        hasSecretValue(secretsCache?.protonSmtp?.password),
      hint: "Needed for verification emails and admin alerts."
    },
    {
      id: "cloudflare",
      label: "Cloudflare zone and API token",
      ready:
        hasSecretValue(secretsCache?.cloudflare?.zoneId) &&
        hasSecretValue(secretsCache?.cloudflare?.apiToken),
      hint: "Needed when routing api/ops subdomains through Cloudflare."
    },
    {
      id: "openai",
      label: "OpenAI API key",
      ready: hasSecretValue(secretsCache?.apiKeys?.openai),
      hint: "Needed for the operator and future moderation assists."
    },
    {
      id: "stripe",
      label: "Stripe secret key",
      ready: hasSecretValue(secretsCache?.apiKeys?.stripeSecret),
      hint: "Needed when checkout moves behind OCI."
    },
    {
      id: "owner-approval",
      label: "Owner text approval secret",
      ready: hasSecretValue(secretsCache?.ownerApproval?.textApprovalSecret),
      hint: "Needed for one-time code approval flows over text."
    }
  ];

  const readyCount = items.filter((item) => item.ready).length;
  const missingItems = items.filter((item) => !item.ready);

  return {
    total: items.length,
    readyCount,
    missingCount: missingItems.length,
    nextMissing: missingItems[0] || null,
    items
  };
}

async function runGit(args, cwd = getManagedRepoPath()) {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      timeout: 15000
    });
    return safeString(result.stdout, "").trim();
  } catch {
    return "";
  }
}

async function collectRepoStatus() {
  const cwd = getManagedRepoPath();
  const [branch, shortStatus, remoteUrl, lastCommit] = await Promise.all([
    runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    runGit(["status", "--short"], cwd),
    runGit(["remote", "get-url", "origin"], cwd),
    runGit(["log", "-1", "--pretty=format:%h %cs %s"], cwd)
  ]);

  const changedFiles = shortStatus
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25);

  return {
    path: cwd,
    branch: branch || "unknown",
    remoteUrl: remoteUrl || "",
    lastCommit: lastCommit || "",
    isDirty: changedFiles.length > 0,
    changedFiles
  };
}

async function walkFiles(directory, options = {}) {
  const results = [];
  const ignoreNames = new Set(options.ignoreNames || []);
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 8;

  async function visit(currentPath, depth) {
    if (depth > maxDepth) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (ignoreNames.has(entry.name)) {
        continue;
      }
      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(nextPath, depth + 1);
      } else if (entry.isFile()) {
        results.push(nextPath);
      }
    }
  }

  await visit(directory, 0);
  return results;
}

async function fetchSiteHealth(url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "slendystuff-ops-bot/1.0" },
      signal: AbortSignal.timeout(10000)
    });
    return {
      url,
      status: response.ok ? "ok" : "error",
      statusCode: response.status,
      responseTimeMs: Date.now() - startedAt,
      checkedAt: nowIso()
    };
  } catch (error) {
    return {
      url,
      status: "error",
      statusCode: null,
      responseTimeMs: Date.now() - startedAt,
      checkedAt: nowIso(),
      error: safeString(error.message, "Site health check failed")
    };
  }
}

async function quarantineFile(filePath) {
  const quarantineRoot = path.join(DATA_DIR, "quarantine", dayStamp());
  const relativePath = path.relative(getManagedRepoPath(), filePath);
  const destinationPath = path.join(quarantineRoot, relativePath);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.rename(filePath, destinationPath);
  return destinationPath;
}

function buildFindingFingerprint(category, target) {
  return `${category}:${target}`;
}

async function runSecurityScan(trigger = "manual") {
  const repoStatus = await collectRepoStatus();
  const priorCriticalFingerprints = new Set(
    (Array.isArray(securityFindingsCache) ? securityFindingsCache : [])
      .filter((finding) => finding.severity === "critical")
      .map((finding) => finding.fingerprint)
  );
  const findings = [];
  const autoFixEnabled = !settingsCache || !settingsCache.opsManager || settingsCache.opsManager.autoFixCritical !== false;
  const requiredGitignoreEntries = [
    "node_modules/",
    "logs/",
    ".env",
    ".env.*",
    "data/secrets.json",
    "data/accounts.json",
    "data/admins.json",
    "data/support-requests.json",
    "data/contact-messages.json"
  ];

  const gitignorePath = path.join(ROOT_DIR, ".gitignore");
  const gitignoreRaw = await fs.readFile(gitignorePath, "utf8").catch(() => "");
  const missingGitignoreEntries = requiredGitignoreEntries.filter((entry) => !gitignoreRaw.split(/\r?\n/).includes(entry));
  if (missingGitignoreEntries.length > 0) {
    let fixed = false;
    if (autoFixEnabled) {
      const nextRaw = `${gitignoreRaw.trimEnd()}\n${missingGitignoreEntries.join("\n")}\n`;
      await fs.writeFile(gitignorePath, nextRaw, "utf8");
      fixed = true;
    }
    findings.push({
      fingerprint: buildFindingFingerprint("gitignore", missingGitignoreEntries.join(",")),
      category: "gitignore",
      severity: "critical",
      status: fixed ? "fixed" : "open",
      title: "Runtime secret files are not fully gitignored",
      target: ".gitignore",
      details: `Missing entries: ${missingGitignoreEntries.join(", ")}`,
      fixed
    });
  }

  if (ADMIN_PASSWORD === "change-this-admin-password" || (ENFORCE_STRONG_ADMIN_PASSWORD === false && !isStrongPassword(ADMIN_PASSWORD))) {
    findings.push({
      fingerprint: buildFindingFingerprint("admin-password", "ADMIN_PASSWORD"),
      category: "credentials",
      severity: "critical",
      status: "open",
      title: "Admin password is default or weak",
      target: "ADMIN_PASSWORD",
      details: "Set a strong ADMIN_PASSWORD before leaving the manager running continuously.",
      fixed: false
    });
  }

  const sensitiveNamePattern =
    /(^|[\\/])(\.env(\..+)?|secrets(\..+)?\.json|accounts(\..+)?\.json|admins(\..+)?\.json|support-requests(\..+)?\.json|contact-messages(\..+)?\.json)$/i;
  const sensitiveExtensionPattern = /\.(sql|bak|db|sqlite|zip)$/i;
  const publicFiles = await walkFiles(PUBLIC_DIR, { ignoreNames: new Set(["node_modules", ".git"]) });
  for (const filePath of publicFiles) {
    const relativePath = path.relative(ROOT_DIR, filePath).replaceAll("\\", "/");
    const lowerRelativePath = relativePath.toLowerCase();
    const isSensitiveName = sensitiveNamePattern.test(lowerRelativePath);
    const isSensitiveExtension = sensitiveExtensionPattern.test(lowerRelativePath);
    if (!isSensitiveName && !isSensitiveExtension) {
      continue;
    }

    let fixed = false;
    let destinationPath = "";
    if (autoFixEnabled) {
      destinationPath = await quarantineFile(filePath);
      fixed = true;
    }
    findings.push({
      fingerprint: buildFindingFingerprint("public-sensitive-file", lowerRelativePath),
      category: "public-data-exposure",
      severity: "critical",
      status: fixed ? "fixed" : "open",
      title: "Sensitive file exposed under public site content",
      target: relativePath,
      details: fixed ? `Moved to ${destinationPath}` : "Move this file out of the public web root.",
      fixed
    });
  }

  const secretPattern = /(gh[op]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,})/;
  for (const filePath of publicFiles) {
    const extension = path.extname(filePath).toLowerCase();
    if (![".js", ".json", ".html", ".txt", ".map", ".css"].includes(extension)) {
      continue;
    }
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || stat.size > 512 * 1024) {
      continue;
    }
    const contents = await fs.readFile(filePath, "utf8").catch(() => "");
    if (!secretPattern.test(contents)) {
      continue;
    }
    const relativePath = path.relative(ROOT_DIR, filePath).replaceAll("\\", "/");
    let fixed = false;
    let destinationPath = "";
    if (autoFixEnabled && [".json", ".txt", ".map"].includes(extension)) {
      destinationPath = await quarantineFile(filePath);
      fixed = true;
    }
    findings.push({
      fingerprint: buildFindingFingerprint("public-secret-pattern", relativePath),
      category: "public-data-exposure",
      severity: "critical",
      status: fixed ? "fixed" : "open",
      title: "Potential secret pattern found in a public asset",
      target: relativePath,
      details: fixed
        ? `Moved suspicious asset to ${destinationPath}`
        : "Review and remove credentials or tokens from this public-facing file.",
      fixed
    });
  }

  const domainName = safeString(settingsCache && settingsCache.opsManager && settingsCache.opsManager.domainName, "").trim();
  const siteUrl = domainName ? `https://${domainName}` : "";
  const siteHealth = siteUrl ? await fetchSiteHealth(siteUrl) : null;
  if (siteHealth && siteHealth.status !== "ok") {
    findings.push({
      fingerprint: buildFindingFingerprint("site-health", siteHealth.url),
      category: "availability",
      severity: "high",
      status: "open",
      title: "Public site health check failed",
      target: siteHealth.url,
      details: siteHealth.error || `HTTP ${siteHealth.statusCode || "unknown"}`,
      fixed: false
    });
  }

  const cnamePath = path.join(ROOT_DIR, "CNAME");
  const cnameValue = (await fs.readFile(cnamePath, "utf8").catch(() => "")).trim();
  if (domainName && cnameValue && cnameValue !== domainName) {
    findings.push({
      fingerprint: buildFindingFingerprint("cname", cnameValue),
      category: "deployment",
      severity: "medium",
      status: "open",
      title: "CNAME does not match configured domain",
      target: "CNAME",
      details: `CNAME=${cnameValue}, expected ${domainName}`,
      fixed: false
    });
  }

  securityFindingsCache = findings;
  managerStatusCache = {
    ...managerStatusCache,
    repoStatus,
    siteHealth,
    lastSecurityScanAt: nowIso(),
    lastSecurityScanTrigger: trigger,
    lastSecurityScanSummary: {
      critical: findings.filter((finding) => finding.severity === "critical").length,
      high: findings.filter((finding) => finding.severity === "high").length,
      fixed: findings.filter((finding) => finding.fixed).length,
      total: findings.length
    }
  };

  await recordManagerActivity("security-scan", `Security scan completed via ${trigger}.`, managerStatusCache.lastSecurityScanSummary);

  for (const finding of findings) {
    if (finding.severity !== "critical") {
      continue;
    }
    if (priorCriticalFingerprints.has(finding.fingerprint)) {
      continue;
    }
    notifyWindowsDesktop("Website Manager Bot", `${finding.title} (${finding.target})`);
  }

  return {
    findings,
    repoStatus,
    siteHealth,
    summary: managerStatusCache.lastSecurityScanSummary
  };
}

function scheduleSecurityScan() {
  if (securityScanTimer) {
    clearInterval(securityScanTimer);
    securityScanTimer = null;
  }

  const intervalMinutes =
    Number(settingsCache && settingsCache.opsManager && settingsCache.opsManager.securityScanIntervalMinutes) || 60;
  securityScanTimer = setInterval(() => {
    runSecurityScan("scheduled").catch((error) => {
      recordManagerActivity("security-error", "Scheduled security scan failed.", {
        error: safeString(error.message, "Unknown scan error")
      }).catch(() => {});
    });
  }, intervalMinutes * 60 * 1000);
}

async function buildOperatorContext(prompt) {
  const repoRoot = getManagedRepoPath();
  const files = await walkFiles(repoRoot, {
    ignoreNames: new Set([".git", "node_modules", "logs", "data", "manager-app"])
  });
  const allowedExtensions = new Set([".js", ".json", ".html", ".css", ".md"]);
  const tokens = Array.from(
    new Set((safeString(prompt, "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []).slice(0, 20))
  );

  const candidates = files
    .filter((filePath) => allowedExtensions.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => {
      const relativePath = path.relative(repoRoot, filePath).replaceAll("\\", "/");
      const lowerPath = relativePath.toLowerCase();
      const score = tokens.reduce((total, token) => total + (lowerPath.includes(token) ? 3 : 0), 0) +
        (/^(server\.js|package\.json|public\/admin\/admin\.js|public\/admin\/index\.html|public\/contact\.js)$/.test(lowerPath) ? 2 : 0);
      return { filePath, relativePath, score };
    })
    .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
    .slice(0, 8);

  const snippets = [];
  for (const item of candidates) {
    const contents = await fs.readFile(item.filePath, "utf8").catch(() => "");
    snippets.push({
      path: item.relativePath,
      content: truncate(contents, 12000)
    });
  }

  return {
    repoStatus: await collectRepoStatus(),
    fileSnippets: snippets
  };
}

function extractOperatorText(payload) {
  if (payload && typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload && payload.output) ? payload.output : [];
  const texts = [];
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const block of content) {
      if (block && typeof block.text === "string") {
        texts.push(block.text);
      }
      if (block && typeof block.output_text === "string") {
        texts.push(block.output_text);
      }
    }
  }

  return texts.join("\n").trim();
}

function parseOperatorPayload(text) {
  const rawText = safeString(text, "").trim();
  if (!rawText) {
    throw new Error("Operator returned an empty response.");
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]+?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : rawText;
  const parsed = safeParseJson(candidate, null);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Operator response was not valid JSON.");
  }

  return {
    summary: truncate(safeString(parsed.summary, ""), 2000),
    plan: Array.isArray(parsed.plan) ? parsed.plan.map((item) => truncate(safeString(item, ""), 400)).filter(Boolean).slice(0, 20) : [],
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.map((item) => truncate(safeString(item, ""), 300)).filter(Boolean).slice(0, 20)
      : [],
    actions: Array.isArray(parsed.actions)
      ? parsed.actions
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            type: truncate(safeString(item.type, "write_file"), 40),
            path: truncate(safeString(item.path, ""), 240),
            content: safeString(item.content, ""),
            reason: truncate(safeString(item.reason, ""), 300)
          }))
          .slice(0, 12)
      : []
  };
}

async function askOperator(prompt, mode = "plan") {
  const apiKey = safeString(secretsCache && secretsCache.apiKeys && secretsCache.apiKeys.openai, "").trim();
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured in admin settings.");
  }

  const context = await buildOperatorContext(prompt);
  const systemPrompt = [
    safeString(settingsCache && settingsCache.opsManager && settingsCache.opsManager.operatorSystemPrompt, ""),
    "Return valid JSON only.",
    'Schema: {"summary":"string","plan":["string"],"warnings":["string"],"actions":[{"type":"write_file","path":"relative/path","content":"full file contents","reason":"why"}]}',
    mode === "apply"
      ? "If a file change is needed, include one or more write_file actions with complete final file contents."
      : "Do not include file writes unless the user explicitly asks to prepare them."
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      mode,
      prompt,
      repoStatus: context.repoStatus,
      fileSnippets: context.fileSnippets
    },
    null,
    2
  );

  const baseUrl = safeString(settingsCache && settingsCache.opsManager && settingsCache.opsManager.operatorBaseUrl, "").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: safeString(settingsCache.opsManager.operatorModel, "gpt-5"),
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }]
        }
      ]
    }),
    signal: AbortSignal.timeout(60000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      safeString(payload && payload.error && payload.error.message, "") ||
      safeString(payload && payload.error, "") ||
      "Operator request failed.";
    throw new Error(message);
  }

  return parseOperatorPayload(extractOperatorText(payload));
}

async function applyOperatorActions(actions) {
  const repoRoot = getManagedRepoPath();
  const backupRoot = path.join(DATA_DIR, "operator-backups", `${Date.now()}`);
  const applied = [];

  for (const action of actions) {
    if (action.type !== "write_file") {
      continue;
    }
    if (!action.path) {
      continue;
    }
    const targetPath = path.join(repoRoot, action.path);
    if (!pathInside(repoRoot, targetPath)) {
      throw new Error(`Operator attempted to write outside the managed repo: ${action.path}`);
    }

    const existing = await fs.readFile(targetPath, "utf8").catch(() => null);
    if (existing !== null) {
      const backupPath = path.join(backupRoot, action.path);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.writeFile(backupPath, existing, "utf8");
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, action.content, "utf8");
    applied.push({
      path: action.path,
      reason: action.reason || "",
      hadExistingFile: existing !== null
    });
  }

  return applied;
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
          ipChain: extractClientIps(req),
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

async function readJsonLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => safeParseJson(line, null))
      .filter((item) => item && typeof item === "object");
  } catch {
    return [];
  }
}

async function readRecentLogEntries(logName, days = 7) {
  const logDir = resolveLogDir();
  const entries = [];
  for (let offset = 0; offset < days; offset += 1) {
    const stamp = dayStampOffset(offset);
    const filePath = path.join(logDir, `${logName}-${stamp}.jsonl`);
    const fileEntries = await readJsonLines(filePath);
    entries.push(...fileEntries);
  }

  return entries;
}

function entryTimestampMs(entry) {
  const parsed = Date.parse(safeString(entry.timestamp, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function countEntriesSince(entries, sinceMs) {
  return entries.reduce((count, entry) => (entryTimestampMs(entry) >= sinceMs ? count + 1 : count), 0);
}

function visitorKey(entry) {
  const visitorId = safeString(entry.visitorId, "").trim();
  if (visitorId) {
    return `vid:${visitorId}`;
  }
  const ip = safeString(entry.ip, "").trim();
  return ip ? `ip:${ip}` : "";
}

function uniqueVisitorsSince(entries, sinceMs) {
  const visitors = new Set();
  for (const entry of entries) {
    if (entryTimestampMs(entry) < sinceMs) {
      continue;
    }
    const key = visitorKey(entry);
    if (key) {
      visitors.add(key);
    }
  }
  return visitors.size;
}

function uniqueIpsSince(entries, sinceMs) {
  const ips = new Set();
  for (const entry of entries) {
    if (entryTimestampMs(entry) < sinceMs) {
      continue;
    }
    const ip = safeString(entry.ip, "").trim();
    if (ip) {
      ips.add(ip);
    }
  }
  return ips.size;
}

function sessionKey(entry) {
  const visitorId = safeString(entry.visitorId, "").trim() || safeString(entry.ip, "").trim() || "unknown";
  const sessionId = safeString(entry.sessionId, "").trim() || `legacy-${safeString(entry.ip, "unknown")}`;
  return `${visitorId}::${sessionId}`;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildSessionSummaries(entries) {
  const sessionsByKey = new Map();

  for (const entry of entries) {
    const timestampMs = entryTimestampMs(entry);
    if (timestampMs <= 0) {
      continue;
    }

    const key = sessionKey(entry);
    const existing = sessionsByKey.get(key) || {
      key,
      visitorId: safeString(entry.visitorId, "").trim() || `ip:${safeString(entry.ip, "unknown")}`,
      sessionId: safeString(entry.sessionId, "").trim() || `legacy-${safeString(entry.ip, "unknown")}`,
      isOwner: false,
      firstSeenMs: timestampMs,
      lastSeenMs: timestampMs,
      eventCount: 0,
      sessionDurationMs: 0,
      latestPath: safeString(entry.path, ""),
      latestReferrer: safeString(entry.referrer, ""),
      ips: new Set(),
      userAgents: new Set()
    };

    existing.eventCount += 1;
    existing.firstSeenMs = Math.min(existing.firstSeenMs, timestampMs);
    existing.lastSeenMs = Math.max(existing.lastSeenMs, timestampMs);
    existing.isOwner = existing.isOwner || entry.owner === true;
    if (entry.path) existing.latestPath = safeString(entry.path, "");
    if (entry.referrer) existing.latestReferrer = safeString(entry.referrer, "");

    const ip = safeString(entry.ip, "").trim();
    if (ip) existing.ips.add(ip);

    const ua = truncate(safeString(entry.userAgent, "").trim(), 220);
    if (ua) existing.userAgents.add(ua);

    if (safeString(entry.eventName, "") === "session_end") {
      const explicitDuration = safeNumber(entry.sessionElapsedMs, 0);
      if (explicitDuration > 0) {
        existing.sessionDurationMs = Math.max(existing.sessionDurationMs, explicitDuration);
      }
    }

    sessionsByKey.set(key, existing);
  }

  return Array.from(sessionsByKey.values())
    .map((session) => {
      const fallbackDuration = Math.max(0, session.lastSeenMs - session.firstSeenMs);
      const durationMs = Math.max(session.sessionDurationMs, fallbackDuration);
      return {
        visitorId: session.visitorId,
        sessionId: session.sessionId,
        isOwner: session.isOwner,
        firstSeen: new Date(session.firstSeenMs).toISOString(),
        lastSeen: new Date(session.lastSeenMs).toISOString(),
        firstSeenMs: session.firstSeenMs,
        lastSeenMs: session.lastSeenMs,
        eventCount: session.eventCount,
        durationMs,
        latestPath: session.latestPath,
        latestReferrer: session.latestReferrer,
        ips: Array.from(session.ips),
        userAgents: Array.from(session.userAgents).slice(0, 3)
      };
    })
    .sort((left, right) => right.lastSeenMs - left.lastSeenMs);
}

function buildVisitorSummaries(sessionSummaries) {
  const visitors = new Map();

  for (const session of sessionSummaries) {
    const key = safeString(session.visitorId, "").trim() || "unknown";
    const existing = visitors.get(key) || {
      visitorId: key,
      isOwner: false,
      firstSeenMs: session.firstSeenMs,
      lastSeenMs: session.lastSeenMs,
      eventCount: 0,
      sessionCount: 0,
      totalConnectedMs: 0,
      latestPath: session.latestPath,
      latestReferrer: session.latestReferrer,
      ips: new Set(),
      userAgents: new Set()
    };

    existing.isOwner = existing.isOwner || session.isOwner;
    existing.firstSeenMs = Math.min(existing.firstSeenMs, session.firstSeenMs);
    existing.lastSeenMs = Math.max(existing.lastSeenMs, session.lastSeenMs);
    existing.eventCount += safeNumber(session.eventCount, 0);
    existing.sessionCount += 1;
    existing.totalConnectedMs += safeNumber(session.durationMs, 0);
    if (session.lastSeenMs >= existing.lastSeenMs) {
      existing.latestPath = safeString(session.latestPath, existing.latestPath);
      existing.latestReferrer = safeString(session.latestReferrer, existing.latestReferrer);
    }
    for (const ip of Array.isArray(session.ips) ? session.ips : []) {
      existing.ips.add(ip);
    }
    for (const ua of Array.isArray(session.userAgents) ? session.userAgents : []) {
      existing.userAgents.add(ua);
    }

    visitors.set(key, existing);
  }

  return Array.from(visitors.values())
    .map((visitor) => ({
      visitorId: visitor.visitorId,
      label: visitor.isOwner ? "Me" : "Visitor",
      isOwner: visitor.isOwner,
      firstSeen: new Date(visitor.firstSeenMs).toISOString(),
      lastSeen: new Date(visitor.lastSeenMs).toISOString(),
      firstSeenMs: visitor.firstSeenMs,
      lastSeenMs: visitor.lastSeenMs,
      eventCount: visitor.eventCount,
      sessionCount: visitor.sessionCount,
      totalConnectedMs: visitor.totalConnectedMs,
      latestPath: visitor.latestPath,
      latestReferrer: visitor.latestReferrer,
      ips: Array.from(visitor.ips),
      userAgents: Array.from(visitor.userAgents).slice(0, 3)
    }))
    .sort((left, right) => right.lastSeenMs - left.lastSeenMs);
}

function topCounts(values, topN = 5) {
  const counts = new Map();
  for (const value of values) {
    const key = truncate(String(value || "").trim(), 120);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, topN)
    .map(([label, count]) => ({ label, count }));
}

async function buildAdminStats() {
  const analyticsEntries = await readRecentLogEntries("analytics", 7);
  const supportLogEntries = await readRecentLogEntries("support-request", 7);
  const ageEntries = await readRecentLogEntries("age-verification", 7);
  const checkoutSessionEntries = await readRecentLogEntries("checkout-session", 7);
  const checkoutFreeEntries = await readRecentLogEntries("checkout-free", 7);
  const checkoutAttemptEntries = await readRecentLogEntries("checkout-attempt", 7);
  const checkoutEntries = [...checkoutSessionEntries, ...checkoutFreeEntries];
  const couponEvents = [...checkoutEntries, ...checkoutAttemptEntries];
  const sessions = buildSessionSummaries(analyticsEntries);
  const visitors = buildVisitorSummaries(sessions);
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const since24h = now - oneDayMs;
  const since7d = now - oneDayMs * 7;
  const since15m = now - 15 * 60 * 1000;

  const topEvents = topCounts(analyticsEntries.map((entry) => entry.eventName), 6);
  const topProducts = topCounts(
    analyticsEntries
      .map((entry) => (entry.meta && typeof entry.meta === "object" ? entry.meta.productId : ""))
      .filter(Boolean),
    6
  );
  const topIpsRaw = topCounts(analyticsEntries.map((entry) => entry.ip), 10);
  const couponCountMap = new Map();
  for (const entry of couponEvents) {
    const code = safeString(entry.couponCode, "").trim().toUpperCase();
    if (!code) {
      continue;
    }
    couponCountMap.set(code, (couponCountMap.get(code) || 0) + 1);
  }
  for (const coupon of Array.isArray(settingsCache.coupons) ? settingsCache.coupons : []) {
    const code = safeString(coupon && coupon.code, "").trim().toUpperCase();
    if (!code) {
      continue;
    }
    if (!couponCountMap.has(code)) {
      couponCountMap.set(code, 0);
    }
  }
  const topCoupons = Array.from(couponCountMap.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([label, count]) => ({ label, count }));

  const ipLookupSet = new Set();
  for (const item of topIpsRaw) {
    if (item && item.label) {
      ipLookupSet.add(item.label);
    }
  }
  for (const session of sessions.slice(0, 180)) {
    for (const ip of Array.isArray(session.ips) ? session.ips : []) {
      ipLookupSet.add(ip);
    }
  }
  const ipLocationByIp = await resolveIpLocations(Array.from(ipLookupSet).slice(0, 320));

  const enrichedSessions = sessions.map((session) => {
    const ipDetails = mapIpDetails(session.ips, ipLocationByIp);
    return {
      ...session,
      ipDetails,
      primaryIp: ipDetails[0] ? ipDetails[0].ip : "",
      primaryLocation: ipDetails[0] ? ipDetails[0].location : "Unknown",
      locationSummary: summarizeIpLocations(ipDetails)
    };
  });

  const enrichedVisitors = visitors.map((visitor) => {
    const ipDetails = mapIpDetails(visitor.ips, ipLocationByIp);
    return {
      ...visitor,
      ipDetails,
      primaryIp: ipDetails[0] ? ipDetails[0].ip : "",
      primaryLocation: ipDetails[0] ? ipDetails[0].location : "Unknown",
      locationSummary: summarizeIpLocations(ipDetails)
    };
  });

  const topIps = topIpsRaw.map((item) => ({
    ...item,
    location: (ipLocationByIp[item.label] && ipLocationByIp[item.label].label) || "Unknown"
  }));

  const sessions24h = enrichedSessions.filter((item) => item.lastSeenMs >= since24h);
  const activeSessions15m = enrichedSessions.filter((item) => item.lastSeenMs >= since15m);
  const avgSessionMinutes24h =
    sessions24h.length > 0
      ? Number((sessions24h.reduce((sum, item) => sum + safeNumber(item.durationMs, 0), 0) / sessions24h.length / 60000).toFixed(1))
      : 0;
  const totalConnectedHours7d = Number(
    (enrichedSessions.reduce((sum, item) => sum + safeNumber(item.durationMs, 0), 0) / 3600000).toFixed(2)
  );

  return {
    generatedAt: nowIso(),
    traffic: {
      visitors24h: uniqueVisitorsSince(analyticsEntries, since24h),
      visitors7d: uniqueVisitorsSince(analyticsEntries, since7d),
      ips24h: uniqueIpsSince(analyticsEntries, since24h),
      ips7d: uniqueIpsSince(analyticsEntries, since7d),
      events24h: countEntriesSince(analyticsEntries, since24h),
      events7d: countEntriesSince(analyticsEntries, since7d),
      ownerEvents24h: analyticsEntries.filter((entry) => entry.owner === true && entryTimestampMs(entry) >= since24h).length
    },
    connections: {
      sessions24h: sessions24h.length,
      activeSessions15m: activeSessions15m.length,
      avgSessionMinutes24h,
      totalConnectedHours7d
    },
    support: {
      requests24h: countEntriesSince(supportLogEntries, since24h),
      requests7d: countEntriesSince(supportLogEntries, since7d),
      queueTotal: supportRequestsCache.length,
      queueNew: supportRequestsCache.filter((item) => item.status === "new").length,
      queueInProgress: supportRequestsCache.filter((item) => item.status === "in_progress").length,
      queueWaitingOnOwner: supportRequestsCache.filter((item) => item.status === "waiting_on_owner").length,
      queueClosed: supportRequestsCache.filter((item) => item.status === "closed").length
    },
    coupons: {
      attempts24h: countEntriesSince(checkoutAttemptEntries, since24h),
      attempts7d: countEntriesSince(checkoutAttemptEntries, since7d),
      checkouts24h: countEntriesSince(checkoutEntries, since24h),
      checkouts7d: countEntriesSince(checkoutEntries, since7d),
      couponCheckouts7d: checkoutEntries.filter((entry) => safeString(entry.couponCode, "").trim().length > 0).length,
      couponAttempts7d: checkoutAttemptEntries.filter((entry) => safeString(entry.couponCode, "").trim().length > 0).length
    },
    ageGate: {
      approvals7d: ageEntries.filter((entry) => entry.allowed === true).length,
      denied7d: ageEntries.filter((entry) => entry.allowed === false).length
    },
    topEvents,
    topProducts,
    topCoupons,
    topIps,
    recentVisitors: enrichedVisitors.slice(0, 120),
    recentSessions: enrichedSessions.slice(0, 180)
  };
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function truncate(value, maxLength) {
  return String(value || "").slice(0, maxLength);
}

function normalizeUrl(value) {
  const raw = safeString(value, "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeHttpsUrl(value) {
  const parsed = normalizeUrl(value);
  return parsed.startsWith("https://") ? parsed : "";
}

function normalizeCtaUrl(value) {
  const raw = safeString(value, "").trim();
  if (!raw) {
    return "#";
  }

  if (raw.startsWith("#") || raw.startsWith("/")) {
    return raw;
  }

  if (raw.startsWith("mailto:") || raw.startsWith("tel:")) {
    return raw;
  }

  const parsed = normalizeUrl(raw);
  return parsed || "#";
}

function normalizeEmail(value) {
  const email = safeString(value, "").trim().toLowerCase();
  if (!email) {
    return "";
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function resolveRequestOrigin(req) {
  const forwardedProto = safeString(req.headers["x-forwarded-proto"], "").split(",")[0].trim();
  const forwardedHost = safeString(req.headers["x-forwarded-host"], "").split(",")[0].trim();
  const protocol = forwardedProto || (req.secure ? "https" : "http") || "https";
  const host = forwardedHost || safeString(req.get && req.get("host"), "").trim();
  if (!host) {
    return `${protocol}://localhost:${PORT}`;
  }
  return `${protocol}://${host}`;
}

function normalizeCartItemsInput(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: truncate(String(item.id || "").trim(), 80),
      qty: Math.max(1, Math.min(99, Number(item.qty || 1)))
    }))
    .filter((item) => item.id);
}

function buildCheckoutLineItems(cartItems) {
  const productsById = new Map((settingsCache.products || []).map((product) => [product.id, product]));
  const lineItems = [];

  for (const item of normalizeCartItemsInput(cartItems)) {
    const product = productsById.get(item.id);
    if (!product) {
      continue;
    }

    const unitAmount = normalizePriceCents(product.priceCents, product.priceLabel, product.id);
    if (unitAmount <= 0) {
      continue;
    }

    lineItems.push({
      id: product.id,
      title: truncate(safeString(product.title, product.id), 120),
      qty: item.qty,
      unitAmountCents: unitAmount
    });
  }

  return lineItems;
}

function applyDiscordRemodelDiscount(lineItems, upgradeCode) {
  const configuredCode = safeString(secretsCache.discordRemodelCode, "").trim();
  const suppliedCode = safeString(upgradeCode, "").trim();
  const discountPercent = Math.min(90, Math.max(0, Number(secretsCache.discordRemodelDiscountPercent || 40)));

  if (!configuredCode || !suppliedCode || !timingSafeEqualString(suppliedCode, configuredCode)) {
    return {
      lineItems,
      discountApplied: false,
      discountPercent: 0
    };
  }

  const discounted = lineItems.map((item) => {
    if (item.id !== "discord-bot-kit") {
      return item;
    }
    const nextAmount = Math.max(100, Math.round(item.unitAmountCents * (1 - discountPercent / 100)));
    return {
      ...item,
      unitAmountCents: nextAmount
    };
  });

  return {
    lineItems: discounted,
    discountApplied: discounted.some((item, index) => item.unitAmountCents !== lineItems[index].unitAmountCents),
    discountPercent
  };
}

function findActiveCouponByCode(couponCode) {
  const code = truncate(safeString(couponCode, "").trim().toUpperCase(), 40);
  if (!code) {
    return null;
  }

  const coupons = Array.isArray(settingsCache.coupons) ? settingsCache.coupons : [];
  return (
    coupons.find((item) => {
      if (!item || typeof item !== "object" || item.active === false) {
        return false;
      }
      return safeString(item.code, "").trim().toUpperCase() === code;
    }) || null
  );
}

function applyCouponDiscount(lineItems, coupon) {
  const percentOff = Math.min(100, Math.max(0, Number(coupon && coupon.percentOff ? coupon.percentOff : 0)));
  if (!coupon || percentOff <= 0) {
    return {
      lineItems,
      applied: false,
      percentOff: 0
    };
  }

  if (percentOff >= 100) {
    return {
      lineItems,
      applied: true,
      percentOff: 100
    };
  }

  const discounted = lineItems.map((item) => {
    const nextAmount = Math.max(50, Math.round(item.unitAmountCents * (1 - percentOff / 100)));
    return {
      ...item,
      unitAmountCents: nextAmount
    };
  });

  return {
    lineItems: discounted,
    applied: discounted.some((item, index) => item.unitAmountCents !== lineItems[index].unitAmountCents),
    percentOff
  };
}

async function createStripeCartCheckoutSession({ req, lineItems }) {
  const stripeSecret = safeString((secretsCache.apiKeys && secretsCache.apiKeys.stripeSecret) || process.env.STRIPE_SECRET_KEY, "").trim();
  if (!stripeSecret) {
    throw new Error("Stripe secret key is not configured.");
  }

  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error("Cart is empty.");
  }

  const origin = resolveRequestOrigin(req);
  const successUrl = `${origin}/checkout.html?success=1`;
  const cancelUrl = `${origin}/checkout.html?canceled=1`;
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("allow_promotion_codes", "true");
  body.set("billing_address_collection", "auto");
  body.set("submit_type", "pay");

  lineItems.forEach((item, index) => {
    body.set(`line_items[${index}][quantity]`, String(item.qty));
    body.set(`line_items[${index}][price_data][currency]`, "usd");
    body.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmountCents));
    body.set(`line_items[${index}][price_data][product_data][name]`, item.title);
    body.set(`line_items[${index}][price_data][product_data][metadata][product_id]`, item.id);
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload || !payload.url) {
    const message = safeString(payload && payload.error && payload.error.message, "Stripe checkout session failed.");
    throw new Error(message);
  }

  return {
    id: safeString(payload.id, ""),
    url: safeString(payload.url, "")
  };
}

function timingSafeEqualString(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""));
  const right = Buffer.from(String(rightValue || ""));

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function isStrongPassword(value) {
  const password = String(value || "");
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return false;
  }

  const rules = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  return rules.every((rule) => rule.test(password));
}

function applySecurityHeaders(req, res, next) {
  const cspDirectives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'self' https://www.zeffy.com https://zeffy.com https://rwcov.org https://www.rwcov.org",
    "child-src 'self' https://www.zeffy.com https://zeffy.com https://rwcov.org https://www.rwcov.org",
    "form-action 'self'",
    "script-src 'self' https://www.googletagmanager.com",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://stats.g.doubleclick.net"
  ];

  if (IS_PRODUCTION) {
    cspDirectives.push("upgrade-insecure-requests");
  }

  res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  if (COOKIE_SECURE && req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  next();
}

function isAllowedCorsOrigin(origin) {
  const raw = safeString(origin, "").trim();
  if (!raw) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      return false;
    }
    if (host === "slendystuff.com" || host === "www.slendystuff.com" || host === "api.slendystuff.com" || host === "ops.slendystuff.com") {
      return true;
    }
    if ((host === "localhost" || host === "127.0.0.1") && parsed.port === String(PORT)) {
      return true;
    }
    return host.endsWith(".github.io");
  } catch {
    return false;
  }
}

function applyCors(req, res, next) {
  const origin = safeString(req.headers.origin, "").trim();
  if (isAllowedCorsOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-csrf-token");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
}

function createRateLimiter({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const now = Date.now();

    if (rateLimiterStore.size > 5000) {
      for (const [entryKey, entryValue] of rateLimiterStore.entries()) {
        if (!entryValue || entryValue.resetAt <= now) {
          rateLimiterStore.delete(entryKey);
        }
      }
    }

    const key = `${keyPrefix}:${extractClientIp(req)}`;
    const bucket = rateLimiterStore.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimiterStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ ok: false, error: "Too many requests. Try again shortly." });
    }

    bucket.count += 1;
    return next();
  };
}

function createAdminSession(req, res) {
  const token = crypto.randomBytes(24).toString("hex");
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, {
    expiresAt,
    csrfToken,
    createdAt: nowIso(),
    ip: extractClientIp(req)
  });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: COOKIE_SECURE,
    maxAge: SESSION_TTL_MS
  });

  return { csrfToken };
}

function createAccountSession(req, res, account) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + ACCOUNT_SESSION_TTL_MS;
  accountSessions.set(token, {
    expiresAt,
    createdAt: nowIso(),
    ip: extractClientIp(req),
    accountId: account.id,
    email: account.email
  });

  res.cookie(ACCOUNT_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: COOKIE_SECURE,
    maxAge: ACCOUNT_SESSION_TTL_MS
  });
}

function clearAccountSession(req, res) {
  const token = safeString(req.cookies[ACCOUNT_SESSION_COOKIE], "");
  if (token) {
    accountSessions.delete(token);
  }

  res.clearCookie(ACCOUNT_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: COOKIE_SECURE
  });
}

function getAdminSessionFromRequest(req) {
  clearExpiredSessions();
  const token = req.cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  return sessions.get(token) || null;
}

function clearExpiredAccountSessions() {
  const now = Date.now();
  for (const [token, value] of accountSessions.entries()) {
    if (!value || value.expiresAt < now) {
      accountSessions.delete(token);
    }
  }
}

function getAccountSessionFromRequest(req) {
  clearExpiredAccountSessions();
  const token = safeString(req.cookies[ACCOUNT_SESSION_COOKIE], "");
  if (!token) {
    return null;
  }
  const session = accountSessions.get(token);
  if (!session) {
    return null;
  }
  const account = accountsCache.find((entry) => entry.id === session.accountId && entry.email === session.email && !entry.disabled);
  if (!account) {
    accountSessions.delete(token);
    return null;
  }
  return { session, account };
}

function hasOwnerBrowser(req) {
  const cookieValue = safeString(req.cookies[OWNER_BROWSER_COOKIE], "").trim();
  const expected = safeString(secretsCache.ownerBrowserToken, "").trim();
  if (!cookieValue || !expected) {
    return false;
  }
  return timingSafeEqualString(cookieValue, expected);
}

function isOwnerRequest(req) {
  return Boolean(getAdminSessionFromRequest(req)) || hasOwnerBrowser(req);
}

function setOwnerBrowserCookie(res, token) {
  res.cookie(OWNER_BROWSER_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: COOKIE_SECURE,
    maxAge: OWNER_BROWSER_TTL_MS
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

function requireAdmin(req, res, next) {
  const session = getAdminSessionFromRequest(req);

  if (!session) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  req.adminSession = session;
  next();
}

function requireAccount(req, res, next) {
  const payload = getAccountSessionFromRequest(req);
  if (!payload || !payload.account) {
    return res.status(401).json({ ok: false, error: "Sign in required." });
  }

  req.accountSession = payload.session;
  req.account = payload.account;
  return next();
}

function isPasswordValid(inputPassword) {
  return timingSafeEqualString(inputPassword, ADMIN_PASSWORD);
}

function requireAdminCsrf(req, res, next) {
  const rawHeader = req.headers[CSRF_HEADER_NAME];
  const token = Array.isArray(rawHeader) ? safeString(rawHeader[0], "") : safeString(rawHeader, "");
  if (!token || !req.adminSession || !timingSafeEqualString(token, req.adminSession.csrfToken)) {
    return res.status(403).json({ ok: false, error: "CSRF token invalid or missing." });
  }

  return next();
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }

  const out = {};
  const keys = Object.keys(meta).slice(0, 20);
  for (const key of keys) {
    const safeKey = truncate(key, 80);
    const value = meta[key];
    if (typeof value === "string") {
      out[safeKey] = truncate(value, 500);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[safeKey] = value;
      continue;
    }
    out[safeKey] = truncate(JSON.stringify(value), 500);
  }

  return out;
}

function sanitizeClientContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return {
    pageTitle: truncate(safeString(value.pageTitle, ""), 200),
    viewport: truncate(safeString(value.viewport, ""), 40),
    screen: truncate(safeString(value.screen, ""), 40),
    dpr: safeNumber(value.dpr, 0),
    colorDepth: safeNumber(value.colorDepth, 0),
    language: truncate(safeString(value.language, ""), 40),
    platform: truncate(safeString(value.platform, ""), 80),
    doNotTrack: truncate(safeString(value.doNotTrack, ""), 20),
    touchPoints: safeNumber(value.touchPoints, 0),
    cookiesEnabled: Boolean(value.cookiesEnabled)
  };
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
    offers: {
      discordRemodelDiscountPercent: Math.min(90, Math.max(0, Number(secretsCache.discordRemodelDiscountPercent || 40)))
    },
    coupons: (Array.isArray(settingsCache.coupons) ? settingsCache.coupons : [])
      .filter((item) => item && item.active !== false)
      .map((item) => ({
        code: truncate(String(item.code || "").trim().toUpperCase(), 40),
        percentOff: Math.min(100, Math.max(0, Number(item.percentOff || 0)))
      })),
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

function decodeHtmlEntities(value) {
  return safeString(value, "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(parseInt(hex, 16) || 32))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeText(value) {
  return decodeHtmlEntities(safeString(value, ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pickMatch(source, pattern, index = 1) {
  const match = safeString(source, "").match(pattern);
  if (!match || typeof match[index] !== "string") {
    return "";
  }
  return normalizeText(match[index]);
}

function firstPopulated(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function defaultRwcovInfo() {
  return {
    source: RW_COV_BASE_URL,
    churchName: "Relevant Worship Center",
    mission:
      "A multigenerational church family devoted to loving God, loving people, and sharing the hope of Jesus throughout the Ohio Valley.",
    address: "52901 National Road East, St. Clairsville, OH 43950",
    mailingAddress: "PO Box 241, St. Clairsville, OH 43950",
    phone: "740-695-7099",
    email: "info@relevantworshipcenter.org",
    sundayWorship: "Sunday worship at 10:30 am",
    serviceTimes: "Sundays: 10:30 am | Bible Study: 9:30 am | Kids Zone (ages 5-12) and Teens Group: 9:30 am",
    links: {
      home: `${RW_COV_BASE_URL}/`,
      about: `${RW_COV_BASE_URL}/about/`,
      worshipEvents: `${RW_COV_BASE_URL}/worship-events/`,
      contact: `${RW_COV_BASE_URL}/contact/`,
      prayerRequests: `${RW_COV_BASE_URL}/prayer-requests/`,
      giving: `${RW_COV_BASE_URL}/giving/`,
      youtube: "https://www.youtube.com/@rwcministries",
      facebook: "https://www.facebook.com/relevantworshipcenter",
      instagram: "https://www.instagram.com/explore/locations/709312128/relevant-worship-center/",
      radio: "https://wwovfm.com/",
      zeffyEmbed: "https://www.zeffy.com/embed/donation-form/donate-to-change-lives-3160"
    }
  };
}

async function fetchRemoteText(url) {
  const timeoutMs = 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "slendystuff-site/1.0 (+https://slendystuff.com)"
      }
    });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseRwcovInfo({ homeHtml, contactHtml, givingHtml }) {
  const fallback = defaultRwcovInfo();

  const churchName = firstPopulated(
    pickMatch(homeHtml, /<meta property="og:site_name" content="([^"]+)"/i),
    pickMatch(homeHtml, /<title>\s*([^<]+?)\s*<\/title>/i),
    fallback.churchName
  );

  const mission = firstPopulated(
    pickMatch(homeHtml, /Relevant Worship Center is ([\s\S]*?)<\/div>/i),
    fallback.mission
  );

  const address = firstPopulated(
    pickMatch(contactHtml, /Address:\s*<\/h6>\s*<p>([\s\S]*?)<\/p>/i),
    fallback.address
  );

  const mailingAddress = firstPopulated(
    pickMatch(contactHtml, /Mailing Address:\s*<\/h6>\s*<p>([\s\S]*?)<\/p>/i),
    fallback.mailingAddress
  );

  const phone = firstPopulated(
    pickMatch(contactHtml, /href=["']tel:([^"']+)["']/i),
    fallback.phone
  );

  const email = firstPopulated(
    pickMatch(contactHtml, /Email:\s*<\/h6>\s*<p>([\s\S]*?)<\/p>/i),
    pickMatch(contactHtml, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i),
    fallback.email
  );

  const serviceTimes = firstPopulated(
    pickMatch(contactHtml, /service times:\s*<\/h6>\s*<p>([\s\S]*?)<\/p>/i),
    fallback.serviceTimes
  );

  const sundayWorship = firstPopulated(
    pickMatch(homeHtml, /Join Us Every Sunday\s*<br[^>]*>\s*Worship at\s*([^<]+)/i),
    pickMatch(contactHtml, /Sundays:\s*([0-9:\sapm]+)/i),
    fallback.sundayWorship
  );

  const zeffyEmbed = firstPopulated(
    pickMatch(givingHtml, /<iframe[^>]+src=['"]([^'"]*zeffy[^'"]+)['"]/i),
    fallback.links.zeffyEmbed
  );

  const links = {
    home: firstPopulated(pickMatch(homeHtml, /href=["'](https:\/\/rwcov\.org\/)["']/i), fallback.links.home),
    about: firstPopulated(pickMatch(homeHtml, /href=["'](https:\/\/rwcov\.org\/about\/)["']/i), fallback.links.about),
    worshipEvents: firstPopulated(
      pickMatch(homeHtml, /href=["'](https:\/\/rwcov\.org\/worship-events\/)["']/i),
      fallback.links.worshipEvents
    ),
    contact: firstPopulated(
      pickMatch(homeHtml, /href=["'](https:\/\/rwcov\.org\/contact\/)["']/i),
      fallback.links.contact
    ),
    prayerRequests: firstPopulated(
      pickMatch(homeHtml, /href=["'](https:\/\/rwcov\.org\/prayer-requests\/)["']/i),
      fallback.links.prayerRequests
    ),
    giving: firstPopulated(
      pickMatch(givingHtml, /<link rel="canonical" href="([^"]*\/giving\/)"/i),
      fallback.links.giving
    ),
    youtube: firstPopulated(
      pickMatch(homeHtml, /href=["'](https:\/\/www\.youtube\.com\/@rwcministries[^"']*)["']/i),
      fallback.links.youtube
    ),
    facebook: firstPopulated(
      pickMatch(homeHtml, /href=["'](https:\/\/www\.facebook\.com\/relevantworshipcenter[^"']*)["']/i),
      fallback.links.facebook
    ),
    instagram: firstPopulated(
      pickMatch(homeHtml, /href=["'](https:\/\/www\.instagram\.com\/explore\/locations\/709312128\/relevant-worship-center\/[^"']*)["']/i),
      fallback.links.instagram
    ),
    radio: firstPopulated(
      pickMatch(homeHtml, /href=["'](https:\/\/wwovfm\.com\/[^"']*)["']/i),
      fallback.links.radio
    ),
    zeffyEmbed
  };

  return {
    source: RW_COV_BASE_URL,
    churchName: truncate(churchName, 120),
    mission: truncate(mission, 420),
    address: truncate(address, 180),
    mailingAddress: truncate(mailingAddress, 180),
    phone: truncate(phone.replace(/[^\d-]/g, ""), 40),
    email: truncate(email.replace(/^mailto:/i, ""), 120),
    sundayWorship: truncate(sundayWorship, 120),
    serviceTimes: truncate(serviceTimes, 320),
    links
  };
}

async function getRwcovInfo(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && rwcovInfoCache && now < rwcovInfoCache.expiresAt) {
    return rwcovInfoCache;
  }

  try {
    const [homeHtml, contactHtml, givingHtml] = await Promise.all([
      fetchRemoteText(`${RW_COV_BASE_URL}/`),
      fetchRemoteText(`${RW_COV_BASE_URL}/contact/`),
      fetchRemoteText(`${RW_COV_BASE_URL}/giving/`)
    ]);

    const data = parseRwcovInfo({ homeHtml, contactHtml, givingHtml });
    rwcovInfoCache = {
      data,
      fetchedAt: nowIso(),
      expiresAt: now + RW_COV_CACHE_TTL_MS,
      stale: false,
      warning: null
    };
    return rwcovInfoCache;
  } catch (error) {
    const warning = safeString(error.message, "Could not refresh rwcov.org data.");
    if (rwcovInfoCache && rwcovInfoCache.data) {
      rwcovInfoCache = {
        ...rwcovInfoCache,
        stale: true,
        warning
      };
      return rwcovInfoCache;
    }

    rwcovInfoCache = {
      data: defaultRwcovInfo(),
      fetchedAt: nowIso(),
      expiresAt: now + 5 * 60 * 1000,
      stale: true,
      warning
    };
    return rwcovInfoCache;
  }
}

const loginRateLimiter = createRateLimiter({ ...LOGIN_RATE_LIMIT, keyPrefix: "admin-login" });
const supportRateLimiter = createRateLimiter({ ...SUPPORT_RATE_LIMIT, keyPrefix: "support-request" });
const trackRateLimiter = createRateLimiter({ ...TRACK_RATE_LIMIT, keyPrefix: "track" });
const accountRateLimiter = createRateLimiter({ ...ACCOUNT_RATE_LIMIT, keyPrefix: "account-auth" });
const checkoutRateLimiter = createRateLimiter({ ...CHECKOUT_RATE_LIMIT, keyPrefix: "checkout" });

app.use(applySecurityHeaders);
app.use(applyCors);
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));

app.use("/admin", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use("/api/admin", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

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

app.get("/api/church/rwcov", async (req, res) => {
  try {
    const forceRefresh = safeString(req.query.refresh, "") === "1";
    const church = await getRwcovInfo(forceRefresh);
    res.json({
      ok: true,
      church: church.data,
      fetchedAt: church.fetchedAt,
      stale: Boolean(church.stale),
      warning: church.warning || null
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Failed to load church profile") });
  }
});

app.post("/api/track", trackRateLimiter, async (req, res) => {
  try {
    if (settingsCache.analytics.customTrackingEnabled === false) {
      return res.json({ ok: true, skipped: true });
    }

    const eventName = truncate(safeString(req.body.eventName, "event"), 80);
    const meta = sanitizeMeta(req.body.meta);
    const visitorId = truncate(safeString(req.body.visitorId, ""), 80);
    const sessionId = truncate(safeString(req.body.sessionId, ""), 80);
    const sessionStartedAt = truncate(safeString(req.body.sessionStartedAt, ""), 60);
    const sessionElapsedMs = Math.max(0, safeNumber(req.body.sessionElapsedMs, safeNumber(meta.durationMs, 0)));
    const owner = isOwnerRequest(req);

    await appendLog(
      "analytics",
      {
        eventName,
        owner,
        visitorId,
        sessionId,
        sessionStartedAt,
        sessionElapsedMs,
        path: truncate(safeString(req.body.path, ""), 200),
        referrer: truncate(safeString(req.body.referrer, ""), 200),
        clientTimezone: truncate(safeString(req.body.clientTimezone, ""), 80),
        clientContext: sanitizeClientContext(req.body.clientContext),
        meta
      },
      req
    );

    res.json({ ok: true, owner });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Tracking failure") });
  }
});

app.post("/api/age-verify", async (req, res) => {
  try {
    const answer = truncate(safeString(req.body.answer, "unknown").toLowerCase(), 10);
    const allowed = answer === "yes";

    await appendLog(
      "age-verification",
      {
        pageKey: truncate(safeString(req.body.pageKey, "unknown"), 120),
        answer,
        allowed,
        clientTimezone: truncate(safeString(req.body.clientTimezone, ""), 80),
        clientTime: truncate(safeString(req.body.clientTime, ""), 120)
      },
      req
    );

    res.json({ ok: true, allowed });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Age verification failure") });
  }
});

app.post("/api/support/request", supportRateLimiter, async (req, res) => {
  try {
    const requestDetails = normalizeSupportRequest({
      id: crypto.randomBytes(8).toString("hex"),
      name: truncate(safeString(req.body.name, "Anonymous"), 120),
      email: normalizeEmail(req.body.email),
      issue: truncate(safeString(req.body.issue, ""), 2000),
      preferredTime: truncate(safeString(req.body.preferredTime, ""), 120),
      clientTimezone: truncate(safeString(req.body.clientTimezone, ""), 80),
      status: "new",
      adminNotes: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });

    if (requestDetails.issue.length < 8) {
      return res.status(400).json({ ok: false, error: "Issue details are too short." });
    }

    supportRequestsCache = [requestDetails, ...supportRequestsCache].slice(0, 5000);
    await saveJson(SUPPORT_REQUESTS_PATH, supportRequestsCache);
    await appendLog("support-request", requestDetails, req);
    await recordManagerActivity("support-request", `New support request from ${requestDetails.email || requestDetails.name}.`, {
      requestId: requestDetails.id,
      email: requestDetails.email,
      status: requestDetails.status
    });
    notifyWindowsDesktop("New Support Request", `${requestDetails.name || "Anonymous"} sent a support request.`);

    res.json({ ok: true, message: "Support request captured." });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Support request failure") });
  }
});

app.post("/api/contact-message", supportRateLimiter, async (req, res) => {
  try {
    const messageDetails = normalizeContactMessage({
      id: crypto.randomBytes(8).toString("hex"),
      name: truncate(safeString(req.body.name, "Anonymous"), 120),
      email: normalizeEmail(req.body.email),
      subject: truncate(safeString(req.body.subject, ""), 200),
      preferredContact: truncate(safeString(req.body.preferredContact, "email"), 40),
      discordUsername: truncate(safeString(req.body.discordUsername, ""), 80),
      message: truncate(safeString(req.body.message, ""), 4000),
      clientTimezone: truncate(safeString(req.body.clientTimezone, ""), 80),
      status: "new",
      adminNotes: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });

    if (messageDetails.subject.length < 3 || messageDetails.message.length < 8) {
      return res.status(400).json({ ok: false, error: "Subject and message are required." });
    }

    contactMessagesCache = [messageDetails, ...contactMessagesCache].slice(0, 5000);
    await saveJson(CONTACT_MESSAGES_PATH, contactMessagesCache);
    await appendLog("contact-message", messageDetails, req);
    await recordManagerActivity("contact-message", `New contact message from ${messageDetails.email || messageDetails.name}.`, {
      messageId: messageDetails.id,
      email: messageDetails.email,
      subject: messageDetails.subject
    });
    notifyWindowsDesktop("New Contact Message", `${messageDetails.name || "Anonymous"} sent "${messageDetails.subject}".`);

    return res.json({ ok: true, message: "Contact message captured." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Contact message failure") });
  }
});

app.post("/api/account/register", accountRateLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const name = truncate(safeString(req.body.name, "").trim(), 120);
    const password = safeString(req.body.password, "");

    if (!email) {
      return res.status(400).json({ ok: false, error: "A valid email is required." });
    }

    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
    }

    if (accountsCache.some((account) => account.email === email)) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists." });
    }

    const hashed = hashPassword(password);
    const account = normalizeAccount({
      id: crypto.randomBytes(8).toString("hex"),
      email,
      name,
      role: "customer",
      passwordHash: hashed.passwordHash,
      passwordSalt: hashed.passwordSalt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastLoginAt: ""
    });

    account.lastLoginAt = nowIso();
    account.updatedAt = nowIso();
    accountsCache = [account, ...accountsCache].slice(0, 20000);
    await saveJson(ACCOUNTS_PATH, accountsCache);
    await appendLog("account-register", sanitizeAccountForAdmin(account), req);
    createAccountSession(req, res, account);

    return res.json({ ok: true, account: sanitizeAccountForAdmin(account) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Registration failed") });
  }
});

app.post("/api/account/login", accountRateLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = safeString(req.body.password, "");
    const account = accountsCache.find((entry) => entry.email === email);

    if (!account || account.disabled) {
      return res.status(401).json({ ok: false, error: "Invalid account credentials." });
    }

    if (!verifyPassword(password, account)) {
      return res.status(401).json({ ok: false, error: "Invalid account credentials." });
    }

    account.lastLoginAt = nowIso();
    account.updatedAt = nowIso();
    await saveJson(ACCOUNTS_PATH, accountsCache);
    await appendLog("account-login", { accountId: account.id, email: account.email, role: account.role }, req);
    createAccountSession(req, res, account);

    return res.json({ ok: true, account: sanitizeAccountForAdmin(account) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Login failed") });
  }
});

app.get("/api/account/session", (req, res) => {
  const payload = getAccountSessionFromRequest(req);
  if (!payload || !payload.account) {
    return res.status(401).json({ ok: false, error: "Not signed in." });
  }

  return res.json({ ok: true, account: sanitizeAccountForAdmin(payload.account) });
});

app.get("/api/account/summary", (req, res) => {
  const payload = getAccountSessionFromRequest(req);
  if (!payload || !payload.account) {
    return res.status(401).json({ ok: false, error: "Not signed in." });
  }

  const account = payload.account;
  const supportRequests = supportRequestsCache
    .filter((item) => normalizeEmail(item.email) === account.email)
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      serviceLevel: item.serviceLevel || "support",
      billingStatus: item.billingStatus || "paid_support_required",
      status: item.status || "new"
    }))
    .slice(0, 50);

  return res.json({
    ok: true,
    user: {
      ...sanitizeAccountForAdmin(account),
      purchases: [],
      supportRequests
    },
    eligibility: {
      eligible: false,
      reason: "No qualifying purchase recorded on this backend yet.",
      freeSupportUntil: null
    }
  });
});

app.post("/api/account/logout", (req, res) => {
  clearAccountSession(req, res);
  return res.json({ ok: true });
});

app.post("/api/checkout/cart-session", checkoutRateLimiter, async (req, res) => {
  try {
    const cartItems = normalizeCartItemsInput(req.body && req.body.items);
    const couponCode = truncate(safeString(req.body && req.body.couponCode, "").trim().toUpperCase(), 40);
    const upgradeCode = truncate(safeString(req.body && req.body.upgradeCode, "").trim(), 120);
    const initialLineItems = buildCheckoutLineItems(cartItems);
    if (initialLineItems.length === 0) {
      return res.status(400).json({ ok: false, error: "Cart is empty or contains invalid items." });
    }
    const remodeled = applyDiscordRemodelDiscount(initialLineItems, upgradeCode);
    const coupon = findActiveCouponByCode(couponCode);
    const couponResult = applyCouponDiscount(remodeled.lineItems, coupon);
    const lineItems = couponResult.lineItems;
    const subtotalCents = lineItems.reduce((sum, item) => sum + item.unitAmountCents * item.qty, 0);
    const isFreeCheckout = couponResult.applied && couponResult.percentOff >= 100;
    await appendLog(
      "checkout-attempt",
      {
        couponCode: couponCode || null,
        couponRecognized: Boolean(coupon),
        couponApplied: Boolean(couponResult.applied),
        couponPercentOff: couponResult.applied ? couponResult.percentOff : 0,
        remodelDiscountApplied: remodeled.discountApplied,
        remodelDiscountPercent: remodeled.discountApplied ? remodeled.discountPercent : 0,
        subtotalCents,
        lineItemCount: lineItems.length,
        stripeConfigured: Boolean(
          safeString((secretsCache.apiKeys && secretsCache.apiKeys.stripeSecret) || process.env.STRIPE_SECRET_KEY, "").trim()
        )
      },
      req
    );

    if (isFreeCheckout) {
      await appendLog(
        "checkout-free",
        {
          couponCode: coupon ? coupon.code : couponCode,
          couponPercentOff: couponResult.percentOff,
          remodelDiscountApplied: remodeled.discountApplied,
          remodelDiscountPercent: remodeled.discountApplied ? remodeled.discountPercent : 0,
          lineItems: lineItems.map((item) => ({ id: item.id, qty: item.qty, unitAmountCents: item.unitAmountCents })),
          subtotalCents
        },
        req
      );

      return res.json({
        ok: true,
        freeCheckout: true,
        couponCode: coupon ? coupon.code : couponCode,
        couponPercentOff: couponResult.percentOff,
        subtotalCents,
        totalCents: 0
      });
    }

    const session = await createStripeCartCheckoutSession({ req, lineItems });
    await appendLog(
      "checkout-session",
      {
        sessionId: session.id,
        couponCode: coupon ? coupon.code : couponCode || null,
        couponPercentOff: couponResult.applied ? couponResult.percentOff : 0,
        remodelDiscountApplied: remodeled.discountApplied,
        remodelDiscountPercent: remodeled.discountApplied ? remodeled.discountPercent : 0,
        subtotalCents,
        lineItems: lineItems.map((item) => ({ id: item.id, qty: item.qty, unitAmountCents: item.unitAmountCents }))
      },
      req
    );

    return res.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
      subtotalCents,
      totalCents: subtotalCents,
      couponCode: coupon ? coupon.code : null,
      couponPercentOff: couponResult.applied ? couponResult.percentOff : 0,
      remodelDiscountApplied: remodeled.discountApplied,
      remodelDiscountPercent: remodeled.discountApplied ? remodeled.discountPercent : 0
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Could not start Stripe checkout.") });
  }
});

app.get("/api/forum/topics", (_req, res) => {
  return res.json({
    ok: true,
    topics: forumTopicsCache.map((topic) => sanitizeForumTopic(topic))
  });
});

app.post("/api/forum/topics", requireAccount, async (req, res) => {
  try {
    const title = truncate(safeString(req.body.title, "").trim(), 140);
    const body = truncate(safeString(req.body.body, "").trim(), 3000);
    if (title.length < 3) {
      return res.status(400).json({ ok: false, error: "Topic title must be at least 3 characters." });
    }
    if (body.length < 8) {
      return res.status(400).json({ ok: false, error: "Topic message must be at least 8 characters." });
    }

    const topic = normalizeForumTopic({
      id: crypto.randomBytes(8).toString("hex"),
      title,
      body,
      authorAccountId: req.account.id,
      authorEmail: req.account.email,
      authorName: req.account.name || req.account.email.split("@")[0],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      comments: []
    });

    forumTopicsCache = [topic, ...forumTopicsCache].slice(0, 1000);
    await saveJson(FORUM_TOPICS_PATH, forumTopicsCache);
    await appendLog(
      "forum-topic",
      {
        topicId: topic.id,
        accountId: req.account.id,
        title: topic.title
      },
      req
    );

    return res.json({ ok: true, topic: sanitizeForumTopic(topic) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Could not create topic.") });
  }
});

app.post("/api/forum/topics/:id/comments", requireAccount, async (req, res) => {
  try {
    const topicId = truncate(safeString(req.params.id, ""), 24);
    const body = truncate(safeString(req.body.body, "").trim(), 2000);
    if (body.length < 2) {
      return res.status(400).json({ ok: false, error: "Comment must be at least 2 characters." });
    }

    const index = forumTopicsCache.findIndex((entry) => entry.id === topicId);
    if (index < 0) {
      return res.status(404).json({ ok: false, error: "Topic not found." });
    }

    const comment = normalizeForumComment({
      id: crypto.randomBytes(8).toString("hex"),
      body,
      authorAccountId: req.account.id,
      authorEmail: req.account.email,
      authorName: req.account.name || req.account.email.split("@")[0],
      createdAt: nowIso()
    });

    const topic = forumTopicsCache[index];
    const nextTopic = normalizeForumTopic({
      ...topic,
      comments: [...(Array.isArray(topic.comments) ? topic.comments : []), comment].slice(-500),
      updatedAt: nowIso()
    });

    forumTopicsCache[index] = nextTopic;
    forumTopicsCache = normalizeForumTopics(forumTopicsCache);
    await saveJson(FORUM_TOPICS_PATH, forumTopicsCache);
    await appendLog(
      "forum-comment",
      {
        topicId: nextTopic.id,
        commentId: comment.id,
        accountId: req.account.id
      },
      req
    );

    return res.json({ ok: true, topic: sanitizeForumTopic(nextTopic), comment: sanitizeForumTopic(nextTopic).comments.slice(-1)[0] || null });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Could not post comment.") });
  }
});

app.post("/api/admin/login", loginRateLimiter, async (req, res) => {
  try {
    const inputEmail = normalizeEmail(req.body && req.body.email);
    const validEmail = Boolean(ADMIN_EMAIL) && Boolean(inputEmail) && timingSafeEqualString(inputEmail, ADMIN_EMAIL);
    const validPassword = isPasswordValid(req.body && req.body.password);
    if (!validEmail || !validPassword) {
      await appendLog(
        "admin-login-failed",
        {
          reason: "invalid_credentials",
          emailProvided: Boolean(inputEmail),
          email: inputEmail || null
        },
        req
      );
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    if (ADMIN_EMAIL) {
      const ownerAccount = accountsCache.find((account) => account.email === ADMIN_EMAIL);
      if (ownerAccount) {
        ownerAccount.lastLoginAt = nowIso();
        ownerAccount.updatedAt = nowIso();
        await saveJson(ACCOUNTS_PATH, accountsCache);
      }
    }

    const session = createAdminSession(req, res);
    if (!safeString(secretsCache.ownerBrowserToken, "").trim()) {
      secretsCache.ownerBrowserToken = crypto.randomBytes(24).toString("hex");
      await saveJson(SECRETS_PATH, secretsCache);
    }
    setOwnerBrowserCookie(res, secretsCache.ownerBrowserToken);
    await appendLog(
      "admin-login-success",
      {
        email: ADMIN_EMAIL
      },
      req
    );

    return res.json({ ok: true, csrfToken: session.csrfToken, ownerBrowserClaimed: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Login failed") });
  }
});

app.post("/api/admin/logout", requireAdmin, requireAdminCsrf, (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }

  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: COOKIE_SECURE
  });
  res.json({ ok: true });
});

app.get("/api/admin/session", requireAdmin, (req, res) => {
  res.json({ ok: true, csrfToken: req.adminSession.csrfToken });
});

app.post("/api/admin/claim-owner-browser", requireAdmin, requireAdminCsrf, async (req, res) => {
  try {
    const token = crypto.randomBytes(24).toString("hex");
    secretsCache.ownerBrowserToken = token;
    await saveJson(SECRETS_PATH, secretsCache);
    setOwnerBrowserCookie(res, token);

    await appendLog(
      "owner-browser-claim",
      {
        claimedAt: nowIso(),
        actor: "admin"
      },
      req
    );

    return res.json({ ok: true, message: "This browser is now labeled as Me in site statistics." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Failed to claim owner browser") });
  }
});

app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    settings: settingsCache,
    secrets: secretsCache
  });
});

app.get("/api/admin/accounts", requireAdmin, (_req, res) => {
  const accounts = accountsCache.map((account) => sanitizeAccountForAdmin(account));
  const stats = buildAccountStats(accounts);
  res.json({ ok: true, stats, accounts });
});

app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const stats = await buildAdminStats();
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Failed to load stats") });
  }
});

app.get("/api/admin/support-requests", requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    requests: supportRequestsCache
  });
});

app.patch("/api/admin/support-requests/:id", requireAdmin, requireAdminCsrf, async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const requestId = truncate(safeString(req.params.id, ""), 24);
    const index = supportRequestsCache.findIndex((item) => item.id === requestId);
    if (index < 0) {
      return res.status(404).json({ ok: false, error: "Support request not found." });
    }

    const current = supportRequestsCache[index];
    const updated = normalizeSupportRequest({
      ...current,
      status: normalizeSupportRequestStatus(body.status || current.status),
      adminNotes: truncate(safeString(body.adminNotes, current.adminNotes), 1200),
      updatedAt: nowIso()
    });

    supportRequestsCache[index] = updated;
    await saveJson(SUPPORT_REQUESTS_PATH, supportRequestsCache);
    await appendLog(
      "support-request-admin-update",
      {
        requestId,
        status: updated.status,
        hasAdminNotes: Boolean(updated.adminNotes)
      },
      req
    );

    return res.json({ ok: true, request: updated });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Failed to update request") });
  }
});

app.get("/api/admin/contact-messages", requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    messages: contactMessagesCache
  });
});

app.patch("/api/admin/contact-messages/:id", requireAdmin, requireAdminCsrf, async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const messageId = truncate(safeString(req.params.id, ""), 24);
    const index = contactMessagesCache.findIndex((item) => item.id === messageId);
    if (index < 0) {
      return res.status(404).json({ ok: false, error: "Contact message not found." });
    }

    const current = contactMessagesCache[index];
    const updated = normalizeContactMessage({
      ...current,
      status: normalizeContactMessageStatus(body.status || current.status),
      adminNotes: truncate(safeString(body.adminNotes, current.adminNotes), 1200),
      updatedAt: nowIso()
    });

    contactMessagesCache[index] = updated;
    await saveJson(CONTACT_MESSAGES_PATH, contactMessagesCache);
    await appendLog("contact-message-admin-update", {
      messageId,
      status: updated.status,
      hasAdminNotes: Boolean(updated.adminNotes)
    });

    return res.json({ ok: true, message: updated });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Failed to update contact message") });
  }
});

app.get("/api/admin/manager/status", requireAdmin, async (_req, res) => {
  try {
    const repoStatus = managerStatusCache.repoStatus || (await collectRepoStatus());
    const siteHealth =
      managerStatusCache.siteHealth ||
      (settingsCache.opsManager.domainName ? await fetchSiteHealth(`https://${settingsCache.opsManager.domainName}`) : null);

    return res.json({
      ok: true,
      manager: {
        repoStatus,
        siteHealth,
        recentActivity: managerActivityCache.slice(0, 50),
        securityFindings: securityFindingsCache.slice(0, 50),
        lastSecurityScanAt: managerStatusCache.lastSecurityScanAt,
        lastSecurityScanTrigger: managerStatusCache.lastSecurityScanTrigger,
        lastSecurityScanSummary: managerStatusCache.lastSecurityScanSummary,
        lastOperatorRunAt: managerStatusCache.lastOperatorRunAt,
        lastOperatorSummary: managerStatusCache.lastOperatorSummary,
        queues: {
          supportTotal: supportRequestsCache.length,
          supportNew: supportRequestsCache.filter((item) => item.status === "new").length,
          supportWaitingOnOwner: supportRequestsCache.filter((item) => item.status === "waiting_on_owner").length,
          contactTotal: contactMessagesCache.length,
          contactNew: contactMessagesCache.filter((item) => item.status === "new").length,
          contactWaitingOnOwner: contactMessagesCache.filter((item) => item.status === "waiting_on_owner").length
        },
        readiness: buildPhaseOneReadiness()
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Failed to load manager status") });
  }
});

app.post("/api/admin/manager/security-scan", requireAdmin, requireAdminCsrf, async (_req, res) => {
  try {
    const result = await runSecurityScan("manual");
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Security scan failed") });
  }
});

app.post("/api/admin/operator/ask", requireAdmin, requireAdminCsrf, async (req, res) => {
  try {
    const prompt = truncate(safeString(req.body && req.body.prompt, "").trim(), 5000);
    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Prompt is required." });
    }

    const result = await askOperator(prompt, "plan");
    managerStatusCache.lastOperatorRunAt = nowIso();
    managerStatusCache.lastOperatorSummary = result.summary;
    await recordManagerActivity("operator-plan", "Operator generated a plan.", {
      hasActions: result.actions.length > 0,
      planSteps: result.plan.length
    });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Operator request failed") });
  }
});

app.post("/api/admin/operator/apply", requireAdmin, requireAdminCsrf, async (req, res) => {
  try {
    const prompt = truncate(safeString(req.body && req.body.prompt, "").trim(), 5000);
    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Prompt is required." });
    }
    if (!settingsCache.opsManager.operatorFullAccess) {
      return res.status(403).json({ ok: false, error: "Operator full access is disabled in settings." });
    }

    const result = await askOperator(prompt, "apply");
    const applied = await applyOperatorActions(result.actions);
    managerStatusCache.lastOperatorRunAt = nowIso();
    managerStatusCache.lastOperatorSummary = result.summary;
    await recordManagerActivity("operator-apply", "Operator applied file changes.", {
      appliedCount: applied.length
    });
    notifyWindowsDesktop("Operator Applied Changes", `${applied.length} file(s) were updated in the managed repo.`);
    return res.json({ ok: true, result, applied });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error.message, "Operator apply failed") });
  }
});

app.put("/api/admin/settings", requireAdmin, requireAdminCsrf, async (req, res) => {
  try {
    const nextSettings = normalizeSettings(req.body.settings || settingsCache);
    const nextSecrets = normalizeSecrets(req.body.secrets || secretsCache);

    await saveSettingsAndSecrets({ settings: nextSettings, secrets: nextSecrets });
    scheduleSecurityScan();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Failed to save settings") });
  }
});

app.post("/api/admin/refresh-anydesk", requireAdmin, requireAdminCsrf, async (_req, res) => {
  const result = await refreshAnydeskLink("manual");
  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.json(result);
});

app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

app.use((err, _req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: "Request payload is too large." });
  }

  if (err instanceof SyntaxError && err.message.includes("JSON")) {
    return res.status(400).json({ ok: false, error: "Malformed JSON payload." });
  }

  return res.status(500).json({ ok: false, error: "Unexpected server error." });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}` });
});

async function start() {
  if (ENFORCE_STRONG_ADMIN_PASSWORD && !isStrongPassword(ADMIN_PASSWORD)) {
    throw new Error(
      `ADMIN_PASSWORD is too weak. Use at least ${ADMIN_PASSWORD_MIN_LENGTH} chars with upper/lower/digit/symbol.`
    );
  }

  await initData();
  scheduleAnydeskRefresh();
  scheduleSecurityScan();
  await refreshAnydeskLink("startup");
  await runSecurityScan("startup");

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Admin password source: ADMIN_PASSWORD env var.`);
    if (!ENFORCE_STRONG_ADMIN_PASSWORD) {
      console.warn("ENFORCE_STRONG_ADMIN_PASSWORD is disabled. Enable it for production hardening.");
    }
    console.log(`Logs currently target: ${resolveLogDir()}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
