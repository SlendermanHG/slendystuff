(() => {
  const loginPane = document.querySelector("[data-admin-auth]");
  const contentPane = document.querySelector("[data-admin-content]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginStatus = document.querySelector("[data-login-status]");
  const saveButton = document.querySelector("[data-save-settings]");
  const saveStatus = document.querySelector("[data-save-status]");
  const logoutButton = document.querySelector("[data-logout]");
  const refreshAnydeskButton = document.querySelector("[data-refresh-anydesk]");
  const adminPasswordForm = document.querySelector("[data-admin-password-form]");
  const adminPasswordStatus = document.querySelector("[data-admin-password-status]");
  const productTableBody = document.querySelector("[data-products-body]");
  const addProductButton = document.querySelector("[data-add-product]");

  const tabs = Array.from(document.querySelectorAll("[data-admin-tab]"));
  const views = Array.from(document.querySelectorAll("[data-admin-view]"));

  const statsRefreshButton = document.querySelector("[data-admin-stats-refresh]");
  const statsStatus = document.querySelector("[data-admin-stats-status]");
  const statsGenerated = document.querySelector("[data-stats-generated]");
  const topEventsList = document.querySelector("[data-top-events]");
  const topProductsList = document.querySelector("[data-top-products]");
  const statRefs = {
    visitors24h: document.querySelector("[data-stat='visitors24h']"),
    visitors7d: document.querySelector("[data-stat='visitors7d']"),
    events24h: document.querySelector("[data-stat='events24h']"),
    events7d: document.querySelector("[data-stat='events7d']"),
    support24h: document.querySelector("[data-stat='support24h']"),
    support7d: document.querySelector("[data-stat='support7d']"),
    queueTotal: document.querySelector("[data-stat='queueTotal']"),
    queueNew: document.querySelector("[data-stat='queueNew']"),
    queueInProgress: document.querySelector("[data-stat='queueInProgress']"),
    queueClosed: document.querySelector("[data-stat='queueClosed']")
  };

  const inboxRefreshButton = document.querySelector("[data-admin-inbox-refresh]");
  const inboxStatus = document.querySelector("[data-admin-inbox-status]");
  const supportRequestsBody = document.querySelector("[data-support-requests-body]");

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
    ideaAssistantEnabled: document.querySelector("[name='ideaAssistantEnabled']"),
    ideaHardwiredRules: document.querySelector("[name='ideaHardwiredRules']"),
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
  const ADMIN_BACKEND_REQUIRED_MESSAGE =
    "Admin login requires backend API hosting. This domain is currently serving static GitHub Pages files only.";

  init().catch((error) => {
    setStatus(loginStatus, error.message, "error");
  });

  async function init() {
    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = "Slendy Stuff";
    });

    const authenticated = await checkSession();
    if (authenticated) {
      await loadAdminData();
      showContent();
      setActiveView("dashboard");
      await refreshDashboardAndInbox();
    } else {
      showLogin();
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => setActiveView(tab.dataset.adminTab || "dashboard"));
    });

    if (loginForm) {
      loginForm.addEventListener("submit", onLogin);
    }
    if (saveButton) {
      saveButton.addEventListener("click", onSave);
    }
    if (addProductButton) {
      addProductButton.addEventListener("click", addProductRow);
    }
    if (logoutButton) {
      logoutButton.addEventListener("click", onLogout);
    }
    if (refreshAnydeskButton) {
      refreshAnydeskButton.addEventListener("click", onRefreshAnydesk);
    }
    if (adminPasswordForm) {
      adminPasswordForm.addEventListener("submit", onAdminPasswordChange);
    }
    if (statsRefreshButton) {
      statsRefreshButton.addEventListener("click", loadAdminStats);
    }
    if (inboxRefreshButton) {
      inboxRefreshButton.addEventListener("click", loadSupportRequests);
    }
  }

  async function refreshDashboardAndInbox() {
    await Promise.allSettled([loadAdminStats(), loadSupportRequests()]);
  }

  function setActiveView(view) {
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.adminTab === view);
    });

    views.forEach((section) => {
      section.classList.toggle("hidden", section.dataset.adminView !== view);
    });
  }

  async function checkSession() {
    try {
      const response = await fetch("/api/admin/session", { credentials: "include" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    setStatus(loginStatus, "Signing in...", "");

    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const payload = await parseJson(response);
      if (!response.ok || !payload.ok) {
        if (isBackendApiUnavailable(response, payload)) {
          setStatus(loginStatus, ADMIN_BACKEND_REQUIRED_MESSAGE, "error");
          return;
        }
        setStatus(loginStatus, payload.error || "Login failed.", "error");
        return;
      }

      await loadAdminData();
      showContent();
      setActiveView("dashboard");
      await refreshDashboardAndInbox();
      setStatus(loginStatus, "", "");
      loginForm.reset();
    } catch {
      setStatus(loginStatus, ADMIN_BACKEND_REQUIRED_MESSAGE, "error");
    }
  }

  async function onLogout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    showLogin();
  }

  async function loadAdminData() {
    const response = await fetch("/api/admin/settings", { credentials: "include" });
    const payload = await parseJson(response);

    if (!response.ok || !payload.ok) {
      if (isBackendApiUnavailable(response, payload)) {
        throw new Error(ADMIN_BACKEND_REQUIRED_MESSAGE);
      }
      throw new Error(payload.error || "Failed to load admin settings.");
    }

    currentSettings = payload.settings;
    currentSecrets = payload.secrets;
    applyToForm(currentSettings, currentSecrets);
  }

  async function loadAdminStats() {
    setStatus(statsStatus, "Refreshing stats...", "");

    const response = await fetch("/api/admin/stats", { credentials: "include" });
    const payload = await parseJson(response);
    if (!response.ok || !payload.ok) {
      if (isBackendApiUnavailable(response, payload)) {
        setStatus(statsStatus, ADMIN_BACKEND_REQUIRED_MESSAGE, "error");
        return;
      }
      setStatus(statsStatus, payload.error || "Failed to load stats.", "error");
      return;
    }

    applyStats(payload.stats || {});
    setStatus(statsStatus, "Stats updated.", "ok");
  }

  function applyStats(stats) {
    const traffic = stats.traffic || {};
    const support = stats.support || {};

    setNodeText(statRefs.visitors24h, formatNumber(traffic.visitors24h));
    setNodeText(statRefs.visitors7d, formatNumber(traffic.visitors7d));
    setNodeText(statRefs.events24h, formatNumber(traffic.events24h));
    setNodeText(statRefs.events7d, formatNumber(traffic.events7d));
    setNodeText(statRefs.support24h, formatNumber(support.requests24h));
    setNodeText(statRefs.support7d, formatNumber(support.requests7d));
    setNodeText(statRefs.queueTotal, formatNumber(support.queueTotal));
    setNodeText(statRefs.queueNew, formatNumber(support.queueNew));
    setNodeText(statRefs.queueInProgress, formatNumber(support.queueInProgress));
    setNodeText(statRefs.queueClosed, formatNumber(support.queueClosed));
    setNodeText(statsGenerated, formatDateTime(stats.generatedAt));

    renderTopList(topEventsList, stats.topEvents || [], "No event data yet.");
    renderTopList(topProductsList, stats.topProducts || [], "No product interaction data yet.");
  }

  function renderTopList(node, rows, emptyMessage) {
    if (!node) {
      return;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      node.innerHTML = `<li class="muted">${escapeHtml(emptyMessage)}</li>`;
      return;
    }

    node.innerHTML = rows
      .map((row) => `<li><strong>${escapeHtml(row.label || "unknown")}</strong> <span class="muted">(${formatNumber(row.count)})</span></li>`)
      .join("");
  }

  async function loadSupportRequests() {
    setStatus(inboxStatus, "Refreshing inbox...", "");

    const response = await fetch("/api/admin/support-requests", { credentials: "include" });
    const payload = await parseJson(response);
    if (!response.ok || !payload.ok) {
      if (isBackendApiUnavailable(response, payload)) {
        setStatus(inboxStatus, ADMIN_BACKEND_REQUIRED_MESSAGE, "error");
        return;
      }
      setStatus(inboxStatus, payload.error || "Failed to load support inbox.", "error");
      return;
    }

    renderSupportRequests(payload.requests || []);
    setStatus(inboxStatus, `Inbox loaded: ${formatNumber((payload.requests || []).length)} ticket(s).`, "ok");
  }

  function renderSupportRequests(requests) {
    if (!supportRequestsBody) {
      return;
    }

    supportRequestsBody.innerHTML = "";
    if (!Array.isArray(requests) || requests.length === 0) {
      supportRequestsBody.innerHTML = `<tr><td colspan="8" class="muted">No support requests yet.</td></tr>`;
      return;
    }

    requests.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div>${escapeHtml(formatDateTime(item.createdAt))}</div>
          <div class="muted">${escapeHtml(formatDateTime(item.updatedAt))}</div>
        </td>
        <td>
          <div><strong>${escapeHtml(item.name || "Anonymous")}</strong></div>
          <div>${escapeHtml(item.email || "No email")}</div>
          <div class="muted">${escapeHtml(item.accountEmail ? `Account: ${item.accountEmail}` : "No linked account")}</div>
        </td>
        <td>
          <div>${escapeHtml(item.issue || "")}</div>
          <div class="muted">${escapeHtml(item.preferredTime ? `Preferred: ${item.preferredTime}` : "Preferred: not set")}</div>
          <div class="muted">${escapeHtml((item.managementOptions || []).join(", ") || "No management options selected")}</div>
        </td>
        <td>${escapeHtml(item.serviceLevel || "Not specified")}</td>
        <td>
          <div>${escapeHtml(formatBillingLabel(item.billingStatus || "paid_support_required"))}</div>
          <div class="muted">${escapeHtml(item.billingReason || "")}</div>
        </td>
        <td>
          <select data-request-status>
            ${buildStatusOption("new", item.status)}
            ${buildStatusOption("in_progress", item.status)}
            ${buildStatusOption("closed", item.status)}
          </select>
        </td>
        <td><textarea data-request-notes>${escapeHtml(item.adminNotes || "")}</textarea></td>
        <td>
          <button class="btn btn-ghost" type="button" data-request-save>Save</button>
          <p class="status" data-request-row-status></p>
        </td>
      `;

      const save = tr.querySelector("[data-request-save]");
      const status = tr.querySelector("[data-request-status]");
      const notes = tr.querySelector("[data-request-notes]");
      const rowStatus = tr.querySelector("[data-request-row-status]");

      save.addEventListener("click", async () => {
        save.disabled = true;
        setStatus(rowStatus, "Saving...", "");
        const result = await updateSupportRequest(item.id, status.value, notes.value);
        save.disabled = false;
        if (!result.ok) {
          setStatus(rowStatus, result.error || "Failed to save.", "error");
          return;
        }
        setStatus(rowStatus, "Saved.", "ok");
        await loadAdminStats();
      });

      supportRequestsBody.appendChild(tr);
    });
  }

  async function updateSupportRequest(requestId, status, adminNotes) {
    try {
      const response = await fetch(`/api/admin/support-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNotes })
      });
      const payload = await parseJson(response);
      if (!response.ok || !payload.ok) {
        return { ok: false, error: payload.error || "Failed to update support request." };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error while updating support request." };
    }
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
    formRefs.ideaAssistantEnabled.checked = !settings.aiAssistant || settings.aiAssistant.enabled !== false;
    formRefs.ideaHardwiredRules.value =
      (settings.aiAssistant && settings.aiAssistant.hardwiredRules) ||
      "You are Slendy Stuff Idea Assistant. Generate practical product and automation concepts with clear scope, audience, and monetization direction.";

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
      aiAssistant: {
        enabled: formRefs.ideaAssistantEnabled.checked,
        hardwiredRules: formRefs.ideaHardwiredRules.value
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: nextSettings, secrets: nextSecrets })
    });

    const payload = await parseJson(response);
    if (!response.ok || !payload.ok) {
      if (isBackendApiUnavailable(response, payload)) {
        setStatus(saveStatus, ADMIN_BACKEND_REQUIRED_MESSAGE, "error");
        return;
      }
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
      credentials: "include"
    });

    const payload = await parseJson(response);
    if (!response.ok || !payload.ok) {
      if (isBackendApiUnavailable(response, payload)) {
        setStatus(saveStatus, ADMIN_BACKEND_REQUIRED_MESSAGE, "error");
        return;
      }
      setStatus(saveStatus, payload.error || "AnyDesk refresh failed.", "error");
      return;
    }

    setStatus(saveStatus, `AnyDesk refreshed: ${payload.resolvedUrl}`, "ok");
  }

  async function onAdminPasswordChange(event) {
    event.preventDefault();
    if (!adminPasswordForm) {
      return;
    }

    const formData = new FormData(adminPasswordForm);
    const payload = {
      currentPassword: String(formData.get("currentPassword") || ""),
      newPassword: String(formData.get("newPassword") || ""),
      confirmPassword: String(formData.get("confirmPassword") || "")
    };

    if (payload.newPassword !== payload.confirmPassword) {
      setStatus(adminPasswordStatus, "New password and confirm password must match.", "error");
      return;
    }
    if (payload.newPassword.length < 10) {
      setStatus(adminPasswordStatus, "New password must be at least 10 characters.", "error");
      return;
    }

    setStatus(adminPasswordStatus, "Updating admin password...", "");
    const response = await fetch("/api/admin/change-password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await parseJson(response);

    if (!response.ok || !result.ok) {
      if (isBackendApiUnavailable(response, result)) {
        setStatus(adminPasswordStatus, ADMIN_BACKEND_REQUIRED_MESSAGE, "error");
        return;
      }
      setStatus(adminPasswordStatus, result.error || "Failed to update admin password.", "error");
      return;
    }

    adminPasswordForm.reset();
    setStatus(adminPasswordStatus, "Admin password updated.", "ok");
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

  function formatDateTime(value) {
    if (!value) {
      return "--";
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "--";
    }
    return date.toLocaleString();
  }

  function formatNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    return numeric.toLocaleString();
  }

  function formatBillingLabel(value) {
    if (value === "free_support") {
      return "Free Support";
    }
    if (value === "paid_support_required") {
      return "Paid Support Required";
    }
    return value || "Unknown";
  }

  function buildStatusOption(value, currentValue) {
    const labelMap = {
      new: "New",
      in_progress: "In Progress",
      closed: "Closed"
    };
    const selected = value === currentValue ? "selected" : "";
    return `<option value="${value}" ${selected}>${labelMap[value] || value}</option>`;
  }

  function setNodeText(node, value) {
    if (node) {
      node.textContent = String(value);
    }
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

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isBackendApiUnavailable(response, payload) {
    const contentType = String((response && response.headers && response.headers.get("content-type")) || "").toLowerCase();
    const error = String((payload && payload.error) || "").toLowerCase();
    return (
      (response && response.status === 404 && contentType.includes("text/html")) ||
      error.includes("invalid api response")
    );
  }

  async function parseJson(response) {
    try {
      return await response.json();
    } catch {
      return { ok: false, error: "Invalid API response." };
    }
  }
})();
