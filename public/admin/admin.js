(() => {
  const loginPane = document.querySelector("[data-admin-auth]");
  const contentPane = document.querySelector("[data-admin-content]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginStatus = document.querySelector("[data-login-status]");
  const saveButton = document.querySelector("[data-save-settings]");
  const saveStatus = document.querySelector("[data-save-status]");
  const logoutButton = document.querySelector("[data-logout]");
  const refreshAnydeskButton = document.querySelector("[data-refresh-anydesk]");
  const refreshStatsButton = document.querySelector("[data-refresh-stats]");
  const refreshAccountsButton = document.querySelector("[data-refresh-accounts]");
  const claimOwnerBrowserButton = document.querySelector("[data-claim-owner-browser]");
  const refreshSupportRequestsButton = document.querySelector("[data-refresh-support-requests]");
  const statsStatus = document.querySelector("[data-stats-status]");
  const accountsStatus = document.querySelector("[data-accounts-status]");
  const ownerClaimStatus = document.querySelector("[data-owner-claim-status]");
  const dashboardTabButton = document.querySelector("[data-admin-tab='dashboard']");
  const settingsTabButton = document.querySelector("[data-admin-tab='settings']");
  const dashboardView = document.querySelector("[data-admin-view='dashboard']");
  const settingsView = document.querySelector("[data-admin-view='settings']");
  const queuePill = document.querySelector("[data-queue-pill]");

  const supportRequestsBody = document.querySelector("[data-support-requests-body]");
  const topEventsList = document.querySelector("[data-top-events]");
  const topProductsList = document.querySelector("[data-top-products]");
  const topIpsList = document.querySelector("[data-top-ips]");
  const visitorConnectionsBody = document.querySelector("[data-visitor-connections-body]");
  const sessionActivityBody = document.querySelector("[data-session-activity-body]");
  const accountsBody = document.querySelector("[data-accounts-body]");
  const statVisitors24h = document.querySelector("[data-stat='visitors24h']");
  const statEvents7d = document.querySelector("[data-stat='events7d']");
  const statQueueOpen = document.querySelector("[data-stat='queueOpen']");
  const statIps24h = document.querySelector("[data-stat='ips24h']");
  const statActiveSessions15m = document.querySelector("[data-stat='activeSessions15m']");
  const statAvgSessionMinutes24h = document.querySelector("[data-stat='avgSessionMinutes24h']");
  const accountStatTotal = document.querySelector("[data-account-stat='total']");
  const accountStatNew7d = document.querySelector("[data-account-stat='new7d']");
  const accountStatActive30d = document.querySelector("[data-account-stat='active30d']");

  const productTableBody = document.querySelector("[data-products-body]");
  const addProductButton = document.querySelector("[data-add-product]");

  const formRefs = {
    brandName: document.querySelector("[name='brandName']"),
    brandTagline: document.querySelector("[name='brandTagline']"),
    heroTitle: document.querySelector("[name='heroTitle']"),
    heroSubtitle: document.querySelector("[name='heroSubtitle']"),
    accentHex: document.querySelector("[name='accentHex']"),
    stripeStarter: document.querySelector("[name='stripeStarter']"),
    stripePro: document.querySelector("[name='stripePro']"),
    stripeReset: document.querySelector("[name='stripeReset']"),
    supportEmail: document.querySelector("[name='supportEmail']"),
    anydeskSourceUrl: document.querySelector("[name='anydeskSourceUrl']"),
    refreshIntervalHours: document.querySelector("[name='refreshIntervalHours']"),
    supportIntro: document.querySelector("[name='supportIntro']"),
    customTrackingEnabled: document.querySelector("[name='customTrackingEnabled']"),
    protonDriveLogPath: document.querySelector("[name='protonDriveLogPath']"),
    gaMeasurementId: document.querySelector("[name='gaMeasurementId']"),
    metaPixelId: document.querySelector("[name='metaPixelId']"),
    customWebhookUrl: document.querySelector("[name='customWebhookUrl']"),
    apiKeyOpenai: document.querySelector("[name='apiKeyOpenai']"),
    apiKeyDiscord: document.querySelector("[name='apiKeyDiscord']"),
    apiKeyStripeSecret: document.querySelector("[name='apiKeyStripeSecret']")
  };

  let currentSettings = null;
  let currentSecrets = null;
  let csrfToken = "";
  let supportRequests = [];
  let accounts = [];

  init().catch((error) => {
    setStatus(loginStatus, error.message, "error");
  });

  async function init() {
    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = "slendystuff";
    });

    loginForm.addEventListener("submit", onLogin);
    saveButton.addEventListener("click", onSave);
    addProductButton.addEventListener("click", addProductRow);
    logoutButton.addEventListener("click", onLogout);
    refreshAnydeskButton.addEventListener("click", onRefreshAnydesk);

    if (refreshStatsButton) {
      refreshStatsButton.addEventListener("click", loadDashboardStats);
    }

    if (refreshAccountsButton) {
      refreshAccountsButton.addEventListener("click", loadAccounts);
    }

    if (claimOwnerBrowserButton) {
      claimOwnerBrowserButton.addEventListener("click", onClaimOwnerBrowser);
    }

    if (refreshSupportRequestsButton) {
      refreshSupportRequestsButton.addEventListener("click", loadSupportRequests);
    }

    if (dashboardTabButton) {
      dashboardTabButton.addEventListener("click", () => setAdminView("dashboard"));
    }

    if (settingsTabButton) {
      settingsTabButton.addEventListener("click", () => setAdminView("settings"));
    }

    const authenticated = await checkSession();
    if (authenticated) {
      await loadAdminData();
      await loadDashboardData();
      showContent();
      setAdminView("dashboard");
    } else {
      showLogin();
    }
  }

  async function checkSession() {
    const response = await fetch("/api/admin/session", { credentials: "include" });
    if (!response.ok) {
      csrfToken = "";
      return false;
    }

    const payload = await response.json();
    if (!payload.ok || !payload.csrfToken) {
      csrfToken = "";
      return false;
    }

    csrfToken = payload.csrfToken;
    return true;
  }

  async function onLogin(event) {
    event.preventDefault();
    setStatus(loginStatus, "Signing in...", "");

    const password = String(new FormData(loginForm).get("password") || "");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setStatus(loginStatus, payload.error || "Login failed.", "error");
      return;
    }

    csrfToken = payload.csrfToken || "";
    await loadAdminData();
    await loadDashboardData();
    showContent();
    setStatus(loginStatus, "", "");
    loginForm.reset();
  }

  async function onLogout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
      headers: buildCsrfHeaders()
    });
    csrfToken = "";
    supportRequests = [];
    accounts = [];
    showLogin();
  }

  async function onClaimOwnerBrowser() {
    setStatus(ownerClaimStatus, "Claiming this browser...", "");
    const response = await fetch("/api/admin/claim-owner-browser", {
      method: "POST",
      credentials: "include",
      headers: buildCsrfHeaders()
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setStatus(ownerClaimStatus, payload.error || "Failed to mark this browser.", "error");
      return;
    }
    setStatus(ownerClaimStatus, payload.message || "This browser is now labeled as Me.", "ok");
    await loadDashboardStats();
  }

  async function loadDashboardData() {
    await Promise.all([loadDashboardStats(), loadSupportRequests(), loadAccounts()]);
  }

  async function loadDashboardStats() {
    setStatus(statsStatus, "Refreshing stats...", "");
    const response = await fetch("/api/admin/stats", { credentials: "include" });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      setStatus(statsStatus, payload.error || "Failed to load stats.", "error");
      return;
    }

    renderStats(payload.stats || {});
    const stamp = payload.stats && payload.stats.generatedAt ? new Date(payload.stats.generatedAt) : new Date();
    setStatus(statsStatus, `Updated ${stamp.toLocaleString()}`, "ok");
  }

  function renderStats(stats) {
    const traffic = stats.traffic || {};
    const connections = stats.connections || {};
    const support = stats.support || {};
    const queueOpen = Number(support.queueNew || 0) + Number(support.queueInProgress || 0);

    if (statVisitors24h) {
      statVisitors24h.textContent = String(traffic.visitors24h || 0);
    }

    if (statEvents7d) {
      statEvents7d.textContent = String(traffic.events7d || 0);
    }

    if (statQueueOpen) {
      statQueueOpen.textContent = String(queueOpen);
    }

    if (statIps24h) {
      statIps24h.textContent = String(traffic.ips24h || 0);
    }

    if (statActiveSessions15m) {
      statActiveSessions15m.textContent = String(connections.activeSessions15m || 0);
    }

    if (statAvgSessionMinutes24h) {
      const avg = Number(connections.avgSessionMinutes24h || 0);
      statAvgSessionMinutes24h.textContent = `${avg.toFixed(1)}m`;
    }

    if (queuePill) {
      queuePill.textContent = String(queueOpen);
    }

    renderTopList(topEventsList, stats.topEvents || [], "No event data yet.");
    renderTopList(topProductsList, stats.topProducts || [], "No product click data yet.");
    renderTopIpList(topIpsList, stats.topIps || [], "No IP data yet.");
    renderVisitorConnections(stats.recentVisitors || []);
    renderSessionActivity(stats.recentSessions || []);
  }

  function renderTopList(node, list, emptyLabel) {
    if (!node) {
      return;
    }

    if (!Array.isArray(list) || list.length === 0) {
      node.innerHTML = `<li class="muted">${escapeHtml(emptyLabel)}</li>`;
      return;
    }

    node.innerHTML = list
      .map((item) => `<li>${escapeHtml(item.label || "Unknown")} <span class="muted">(${Number(item.count || 0)})</span></li>`)
      .join("");
  }

  function renderTopIpList(node, list, emptyLabel) {
    if (!node) {
      return;
    }

    if (!Array.isArray(list) || list.length === 0) {
      node.innerHTML = `<li class="muted">${escapeHtml(emptyLabel)}</li>`;
      return;
    }

    node.innerHTML = list
      .map((item) => {
        const ip = escapeHtml(item.label || "Unknown");
        const count = Number(item.count || 0);
        const location = escapeHtml(item.location || "Unknown");
        return `<li><strong>${ip}</strong> <span class="muted">(${count})</span><br><span class="muted">${location}</span></li>`;
      })
      .join("");
  }

  function renderVisitorConnections(list) {
    if (!visitorConnectionsBody) {
      return;
    }

    if (!Array.isArray(list) || list.length === 0) {
      visitorConnectionsBody.innerHTML = "<tr><td colspan='10' class='muted'>No visitor data yet.</td></tr>";
      return;
    }

    visitorConnectionsBody.innerHTML = list
      .map((item) => {
        const label = item.isOwner ? "Me" : "Visitor";
        const ips = Array.isArray(item.ips) && item.ips.length ? item.ips.join(", ") : "-";
        const location = formatLocationSummary(item);
        return `
          <tr>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(item.visitorId || "-")}</td>
            <td>${escapeHtml(ips)}</td>
            <td>${escapeHtml(location)}</td>
            <td>${escapeHtml(formatDate(item.firstSeen))}</td>
            <td>${escapeHtml(formatDate(item.lastSeen))}</td>
            <td>${escapeHtml(formatDuration(item.totalConnectedMs))}</td>
            <td>${escapeHtml(String(item.eventCount || 0))}</td>
            <td>${escapeHtml(String(item.sessionCount || 0))}</td>
            <td>${escapeHtml(item.latestPath || "-")}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderSessionActivity(list) {
    if (!sessionActivityBody) {
      return;
    }

    if (!Array.isArray(list) || list.length === 0) {
      sessionActivityBody.innerHTML = "<tr><td colspan='9' class='muted'>No session data yet.</td></tr>";
      return;
    }

    sessionActivityBody.innerHTML = list
      .map((item) => {
        const label = item.isOwner ? "Me" : "Visitor";
        const ip = Array.isArray(item.ips) && item.ips.length ? item.ips[0] : "-";
        const location = item.primaryLocation || formatLocationSummary(item);
        return `
          <tr>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(item.sessionId || "-")}</td>
            <td>${escapeHtml(ip)}</td>
            <td>${escapeHtml(location || "-")}</td>
            <td>${escapeHtml(formatDate(item.firstSeen))}</td>
            <td>${escapeHtml(formatDate(item.lastSeen))}</td>
            <td>${escapeHtml(formatDuration(item.durationMs))}</td>
            <td>${escapeHtml(String(item.eventCount || 0))}</td>
            <td>${escapeHtml(item.latestPath || "-")}</td>
          </tr>
        `;
      })
      .join("");
  }

  function formatLocationSummary(item) {
    if (!item || typeof item !== "object") {
      return "-";
    }

    const explicit = String(item.locationSummary || "").trim();
    if (explicit) {
      return explicit;
    }

    const details = Array.isArray(item.ipDetails) ? item.ipDetails : [];
    const locations = Array.from(
      new Set(
        details
          .map((entry) => String((entry && entry.location) || "").trim())
          .filter(Boolean)
      )
    );
    if (locations.length > 0) {
      return locations.join(" | ");
    }

    const fallback = String(item.primaryLocation || "").trim();
    return fallback || "-";
  }

  async function loadSupportRequests() {
    if (!supportRequestsBody) {
      return;
    }

    supportRequestsBody.innerHTML = "<tr><td colspan='8' class='muted'>Loading support inbox...</td></tr>";

    const response = await fetch("/api/admin/support-requests", { credentials: "include" });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      supportRequestsBody.innerHTML = `<tr><td colspan='8' class='status error'>${escapeHtml(payload.error || "Failed to load support inbox.")}</td></tr>`;
      return;
    }

    supportRequests = Array.isArray(payload.requests) ? payload.requests : [];
    renderSupportRequests();
  }

  async function loadAccounts() {
    if (!accountsBody) {
      return;
    }

    setStatus(accountsStatus, "Refreshing accounts...", "");
    accountsBody.innerHTML = "<tr><td colspan='6' class='muted'>Loading accounts...</td></tr>";

    const response = await fetch("/api/admin/accounts", { credentials: "include" });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      accountsBody.innerHTML = `<tr><td colspan='6' class='status error'>${escapeHtml(payload.error || "Failed to load accounts.")}</td></tr>`;
      setStatus(accountsStatus, payload.error || "Failed to load accounts.", "error");
      return;
    }

    accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    renderAccounts(accounts, payload.stats || {});
    setStatus(accountsStatus, "Accounts updated.", "ok");
  }

  function renderAccounts(list, stats) {
    if (accountStatTotal) {
      accountStatTotal.textContent = String(stats.total || 0);
    }
    if (accountStatNew7d) {
      accountStatNew7d.textContent = String(stats.createdLast7d || 0);
    }
    if (accountStatActive30d) {
      accountStatActive30d.textContent = String(stats.activeLast30d || 0);
    }

    if (!accountsBody) {
      return;
    }

    if (!Array.isArray(list) || list.length === 0) {
      accountsBody.innerHTML = "<tr><td colspan='6' class='muted'>No accounts created yet.</td></tr>";
      return;
    }

    accountsBody.innerHTML = list
      .map((account) => {
        return `
          <tr>
            <td>${escapeHtml(account.email || "-")}</td>
            <td>${escapeHtml(account.name || "-")}</td>
            <td>${escapeHtml(account.role || "customer")}</td>
            <td>${escapeHtml(formatDate(account.createdAt))}</td>
            <td>${escapeHtml(formatDate(account.lastLoginAt))}</td>
            <td>${account.disabled ? "Disabled" : "Active"}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderSupportRequests() {
    if (!supportRequestsBody) {
      return;
    }

    if (!supportRequests.length) {
      supportRequestsBody.innerHTML = "<tr><td colspan='8' class='muted'>No support requests yet.</td></tr>";
      return;
    }

    supportRequestsBody.innerHTML = supportRequests
      .map((item) => {
        const createdAt = formatDate(item.createdAt);
        return `
          <tr data-request-id="${escapeHtml(item.id)}">
            <td>${escapeHtml(createdAt)}</td>
            <td>${escapeHtml(item.name || "")}</td>
            <td>${item.email ? `<a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a>` : "<span class='muted'>No email</span>"}</td>
            <td>${escapeHtml(item.preferredTime || "-")}</td>
            <td>${escapeHtml(item.issue || "")}</td>
            <td>
              <select data-field="status">
                <option value="new" ${item.status === "new" ? "selected" : ""}>New</option>
                <option value="in_progress" ${item.status === "in_progress" ? "selected" : ""}>In Progress</option>
                <option value="closed" ${item.status === "closed" ? "selected" : ""}>Closed</option>
              </select>
            </td>
            <td><textarea data-field="adminNotes" placeholder="Internal notes for follow-up">${escapeHtml(item.adminNotes || "")}</textarea></td>
            <td>
              <button class="btn btn-ghost" type="button" data-action="save-support-request">Save</button>
              <p class="status" data-row-status></p>
            </td>
          </tr>
        `;
      })
      .join("");

    supportRequestsBody.querySelectorAll("[data-action='save-support-request']").forEach((button) => {
      button.addEventListener("click", async () => {
        const row = button.closest("tr");
        await saveSupportRequestRow(row);
      });
    });
  }

  async function saveSupportRequestRow(row) {
    if (!row) {
      return;
    }

    const requestId = row.dataset.requestId || "";
    const status = row.querySelector("[data-field='status']")?.value || "new";
    const adminNotes = row.querySelector("[data-field='adminNotes']")?.value || "";
    const statusNode = row.querySelector("[data-row-status]");
    setStatus(statusNode, "Saving...", "");

    const response = await fetch(`/api/admin/support-requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        ...buildCsrfHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status, adminNotes })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setStatus(statusNode, payload.error || "Failed to save request.", "error");
      return;
    }

    supportRequests = supportRequests.map((item) => (item.id === requestId ? payload.request : item));
    setStatus(statusNode, "Saved", "ok");
    await loadDashboardStats();
  }

  async function loadAdminData() {
    const response = await fetch("/api/admin/settings", { credentials: "include" });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to load admin settings.");
    }

    currentSettings = payload.settings;
    currentSecrets = payload.secrets;

    applyToForm(currentSettings, currentSecrets);
  }

  function applyToForm(settings, secrets) {
    formRefs.brandName.value = settings.brand.name || "";
    formRefs.brandTagline.value = settings.brand.tagline || "";
    formRefs.heroTitle.value = settings.brand.heroTitle || "";
    formRefs.heroSubtitle.value = settings.brand.heroSubtitle || "";
    formRefs.accentHex.value = settings.theme.accentHex || "#ff2ea6";

    formRefs.stripeStarter.value = settings.stripeLinks.starter || "";
    formRefs.stripePro.value = settings.stripeLinks.pro || "";
    formRefs.stripeReset.value = settings.stripeLinks.reset || "";

    formRefs.supportEmail.value = settings.support.supportEmail || "";
    formRefs.anydeskSourceUrl.value = settings.support.anydeskSourceUrl || "";
    formRefs.refreshIntervalHours.value = String(settings.support.refreshIntervalHours || 12);
    formRefs.supportIntro.value = settings.support.intro || "";

    formRefs.customTrackingEnabled.checked = settings.analytics.customTrackingEnabled !== false;

    formRefs.protonDriveLogPath.value = secrets.protonDriveLogPath || "";
    formRefs.gaMeasurementId.value = secrets.gaMeasurementId || "";
    formRefs.metaPixelId.value = secrets.metaPixelId || "";
    formRefs.customWebhookUrl.value = secrets.customWebhookUrl || "";
    formRefs.apiKeyOpenai.value = (secrets.apiKeys && secrets.apiKeys.openai) || "";
    formRefs.apiKeyDiscord.value = (secrets.apiKeys && secrets.apiKeys.discord) || "";
    formRefs.apiKeyStripeSecret.value = (secrets.apiKeys && secrets.apiKeys.stripeSecret) || "";

    renderProductRows(settings.products || []);
  }

  function renderProductRows(products) {
    productTableBody.innerHTML = "";

    products.forEach((product) => {
      productTableBody.appendChild(buildProductRow(product));
    });

    if (products.length === 0) {
      addProductRow();
    }
  }

  function buildProductRow(product = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-key="id" value="${escapeHtml(product.id || "")}" placeholder="id"></td>
      <td><input data-key="title" value="${escapeHtml(product.title || "")}" placeholder="title"></td>
      <td><input data-key="category" value="${escapeHtml(product.category || "Programs")}" placeholder="category"></td>
      <td><input data-key="priceLabel" value="${escapeHtml(product.priceLabel || "")}" placeholder="price"></td>
      <td><input data-key="ctaLabel" value="${escapeHtml(product.ctaLabel || "Learn More")}" placeholder="CTA"></td>
      <td><input data-key="ctaUrl" value="${escapeHtml(product.ctaUrl || "#")}" placeholder="URL"></td>
      <td><label><input type="checkbox" data-key="requires18Plus" ${product.requires18Plus ? "checked" : ""}>18+</label></td>
      <td><button type="button" class="btn btn-ghost" data-remove>Remove</button></td>
      <td><textarea data-key="summary" placeholder="summary">${escapeHtml(product.summary || "")}</textarea></td>
    `;

    tr.querySelector("[data-remove]").addEventListener("click", () => {
      tr.remove();
    });

    return tr;
  }

  function addProductRow() {
    productTableBody.appendChild(buildProductRow());
  }

  async function onSave() {
    if (!currentSettings || !currentSecrets) {
      setStatus(saveStatus, "No data loaded.", "error");
      return;
    }

    const nextSettings = {
      ...currentSettings,
      brand: {
        name: formRefs.brandName.value,
        tagline: formRefs.brandTagline.value,
        heroTitle: formRefs.heroTitle.value,
        heroSubtitle: formRefs.heroSubtitle.value
      },
      theme: {
        accentHex: formRefs.accentHex.value || "#ff2ea6"
      },
      stripeLinks: {
        starter: formRefs.stripeStarter.value,
        pro: formRefs.stripePro.value,
        reset: formRefs.stripeReset.value
      },
      support: {
        ...currentSettings.support,
        supportEmail: formRefs.supportEmail.value,
        anydeskSourceUrl: formRefs.anydeskSourceUrl.value,
        refreshIntervalHours: Number(formRefs.refreshIntervalHours.value || 12),
        intro: formRefs.supportIntro.value
      },
      analytics: {
        customTrackingEnabled: formRefs.customTrackingEnabled.checked
      },
      products: collectProducts()
    };

    const nextSecrets = {
      ...currentSecrets,
      protonDriveLogPath: formRefs.protonDriveLogPath.value,
      gaMeasurementId: formRefs.gaMeasurementId.value,
      metaPixelId: formRefs.metaPixelId.value,
      customWebhookUrl: formRefs.customWebhookUrl.value,
      apiKeys: {
        openai: formRefs.apiKeyOpenai.value,
        discord: formRefs.apiKeyDiscord.value,
        stripeSecret: formRefs.apiKeyStripeSecret.value
      }
    };

    setStatus(saveStatus, "Saving...", "");

    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      credentials: "include",
      headers: {
        ...buildCsrfHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ settings: nextSettings, secrets: nextSecrets })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setStatus(saveStatus, payload.error || "Save failed.", "error");
      return;
    }

    currentSettings = nextSettings;
    currentSecrets = nextSecrets;
    setStatus(saveStatus, "Saved successfully.", "ok");
  }

  async function onRefreshAnydesk() {
    setStatus(saveStatus, "Refreshing AnyDesk link...", "");

    const response = await fetch("/api/admin/refresh-anydesk", {
      method: "POST",
      credentials: "include",
      headers: buildCsrfHeaders()
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setStatus(saveStatus, payload.error || "AnyDesk refresh failed.", "error");
      return;
    }

    setStatus(saveStatus, `AnyDesk refreshed: ${payload.resolvedUrl}`, "ok");
  }

  function collectProducts() {
    const rows = Array.from(productTableBody.querySelectorAll("tr"));
    return rows
      .map((row) => {
        const get = (key) => {
          const input = row.querySelector(`[data-key='${key}']`);
          return input ? input.value : "";
        };
        const requires18Plus = row.querySelector("[data-key='requires18Plus']")?.checked || false;

        return {
          id: get("id"),
          title: get("title"),
          category: get("category"),
          summary: get("summary"),
          priceLabel: get("priceLabel"),
          ctaLabel: get("ctaLabel"),
          ctaUrl: get("ctaUrl"),
          requires18Plus
        };
      })
      .filter((item) => item.id.trim().length > 0 && item.title.trim().length > 0);
  }

  function setStatus(node, message, type) {
    if (!node) {
      return;
    }

    node.textContent = message;
    node.className = `status ${type || ""}`;
  }

  function showLogin() {
    loginPane.classList.remove("hidden");
    contentPane.classList.add("hidden");
  }

  function showContent() {
    loginPane.classList.add("hidden");
    contentPane.classList.remove("hidden");
  }

  function setAdminView(viewName) {
    const showDashboard = viewName !== "settings";
    if (dashboardView) {
      dashboardView.classList.toggle("hidden", !showDashboard);
    }
    if (settingsView) {
      settingsView.classList.toggle("hidden", showDashboard);
    }
    if (dashboardTabButton) {
      dashboardTabButton.classList.toggle("active", showDashboard);
    }
    if (settingsTabButton) {
      settingsTabButton.classList.toggle("active", !showDashboard);
    }
  }

  function buildCsrfHeaders() {
    return csrfToken ? { "x-csrf-token": csrfToken } : {};
  }

  function formatDate(value) {
    const parsed = new Date(value || "");
    if (Number.isNaN(parsed.getTime())) {
      return "Unknown";
    }
    return parsed.toLocaleString();
  }

  function formatDuration(valueMs) {
    const totalMs = Number(valueMs || 0);
    if (!Number.isFinite(totalMs) || totalMs <= 0) {
      return "0s";
    }

    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
