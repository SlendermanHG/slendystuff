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

const SESSION_COOKIE = "slendy_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-admin-password";
const PORT = Number(process.env.PORT || 4173);

let settingsCache = null;
let secretsCache = null;
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
    supportEmail: "admin@slendystuff.com",
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
  products: [
    {
      id: "pos-suite",
      title: "POS Suite",
      category: "Programs",
      summary: "Point-of-sale workflow with practical controls and cleaner daily operations.",
      priceLabel: "Custom Pricing",
      ctaLabel: "Request Details",
      ctaUrl: "mailto:admin@slendystuff.com?subject=POS%20Suite%20Inquiry",
      requires18Plus: false
    },
    {
      id: "system-optimizer",
      title: "System Optimizer",
      category: "Programs",
      summary: "Performance-focused optimization toolkit for Windows machines.",
      priceLabel: "Custom Pricing",
      ctaLabel: "Request Details",
      ctaUrl: "mailto:admin@slendystuff.com?subject=System%20Optimizer%20Inquiry",
      requires18Plus: false
    },
    {
      id: "discord-bot-kit",
      title: "Discord Bot Kit",
      category: "Bots",
      summary: "Automations and utility features for Discord communities.",
      priceLabel: "From $19.99",
      ctaLabel: "View Options",
      ctaUrl: "mailto:admin@slendystuff.com?subject=Discord%20Bot%20Inquiry",
      requires18Plus: false
    },
    {
      id: "remote-control-limited",
      title: "Remote Control Bot (Limited)",
      category: "Bots",
      summary: "Limited-control remote automation with strict bounds and safeguards.",
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
    products: Array.isArray(payload.products) ? payload.products : defaultSettings.products
  };

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

async function initData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR_FALLBACK, { recursive: true });

  settingsCache = normalizeSettings(await readJson(SETTINGS_PATH, defaultSettings));
  secretsCache = normalizeSecrets(await readJson(SECRETS_PATH, defaultSecrets));
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

function createAdminSession(res) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { expiresAt });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: SESSION_TTL_MS
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
  clearExpiredSessions();
  const token = req.cookies[SESSION_COOKIE];

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

function isPasswordValid(inputPassword) {
  const input = Buffer.from(String(inputPassword || ""));
  const expected = Buffer.from(String(ADMIN_PASSWORD));

  if (input.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(input, expected);
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
    const requestDetails = {
      name: safeString(req.body.name, "Anonymous"),
      email: safeString(req.body.email, ""),
      issue: safeString(req.body.issue, ""),
      preferredTime: safeString(req.body.preferredTime, ""),
      clientTimezone: safeString(req.body.clientTimezone, "")
    };

    await appendLog("support-request", requestDetails, req);

    res.json({ ok: true, message: "Support request captured." });
  } catch (error) {
    res.status(500).json({ ok: false, error: safeString(error.message, "Support request failure") });
  }
});

app.post("/api/admin/login", (req, res) => {
  if (!isPasswordValid(req.body.password)) {
    return res.status(401).json({ ok: false, error: "Invalid password" });
  }

  createAdminSession(res);
  return res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }

  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get("/api/admin/session", requireAdmin, (_req, res) => {
  res.json({ ok: true });
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

    await saveSettingsAndSecrets({ settings: nextSettings, secrets: nextSecrets });
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
    console.log(`Admin password source: ADMIN_PASSWORD env var (current default in use if not set).`);
    console.log(`Logs currently target: ${resolveLogDir()}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});