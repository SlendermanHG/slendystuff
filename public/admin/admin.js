(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const loginPane = $("[data-admin-auth]");
  const contentPane = $("[data-admin-content]");
  const loginForm = $("[data-login-form]");
  const loginStatus = $("[data-login-status]");
  const dashboardStatus = $("[data-dashboard-status]");
  const saveStatus = $("[data-save-status]");
  const operatorStatus = $("[data-operator-status]");
  const operatorPrompt = $("[data-operator-prompt]");
  const operatorOutput = $("[data-operator-output]");
  const supportBody = $("[data-support-requests-body]");
  const contactBody = $("[data-contact-messages-body]");
  const activityList = $("[data-manager-activity]");
  const securityList = $("[data-security-findings]");
  const productsBody = $("[data-products-body]");
  const couponsBody = $("[data-coupons-body]");
  const tabs = $$("[data-admin-tab]");
  const views = $$("[data-admin-view]");

  const stats = {
    visitors24h: $("[data-stat='visitors24h']"),
    events7d: $("[data-stat='events7d']"),
    queueOpen: $("[data-stat='queueOpen']"),
    accountTotal: $("[data-stat='accountTotal']")
  };

  const manager = {
    critical: $("[data-manager-critical]"),
    siteHealth: $("[data-manager-site-health]"),
    repoPath: $("[data-repo-path]"),
    repoBranch: $("[data-repo-branch]"),
    repoRemote: $("[data-repo-remote]"),
    repoDirty: $("[data-repo-dirty]"),
    repoLastCommit: $("[data-repo-last-commit]"),
    domainName: $("[data-domain-name]"),
    domainProvider: $("[data-domain-provider]"),
    lastScan: $("[data-manager-last-scan]"),
    siteCheck: $("[data-manager-site-check]"),
    scanSummary: $("[data-manager-scan-summary]"),
    readinessList: $("[data-phase-one-readiness]")
  };

  const form = {
    brandName: $("[name='brandName']"),
    brandTagline: $("[name='brandTagline']"),
    heroTitle: $("[name='heroTitle']"),
    heroSubtitle: $("[name='heroSubtitle']"),
    accentHex: $("[name='accentHex']"),
    stripeStarter: $("[name='stripeStarter']"),
    stripePro: $("[name='stripePro']"),
    stripeReset: $("[name='stripeReset']"),
    supportEmail: $("[name='supportEmail']"),
    anydeskSourceUrl: $("[name='anydeskSourceUrl']"),
    refreshIntervalHours: $("[name='refreshIntervalHours']"),
    supportIntro: $("[name='supportIntro']"),
    customTrackingEnabled: $("[name='customTrackingEnabled']"),
    opsGithubRepo: $("[name='opsGithubRepo']"),
    opsDefaultBranch: $("[name='opsDefaultBranch']"),
    opsManagedRepoPath: $("[name='opsManagedRepoPath']"),
    opsDomainName: $("[name='opsDomainName']"),
    opsApiSubdomain: $("[name='opsApiSubdomain']"),
    opsOpsSubdomain: $("[name='opsOpsSubdomain']"),
    opsDomainProvider: $("[name='opsDomainProvider']"),
    opsDnsNotes: $("[name='opsDnsNotes']"),
    opsAlertEmail: $("[name='opsAlertEmail']"),
    opsSecurityScanIntervalMinutes: $("[name='opsSecurityScanIntervalMinutes']"),
    opsCriticalReminderMinutes: $("[name='opsCriticalReminderMinutes']"),
    opsNormalReminderMinutes: $("[name='opsNormalReminderMinutes']"),
    opsOperatorBaseUrl: $("[name='opsOperatorBaseUrl']"),
    opsOperatorModel: $("[name='opsOperatorModel']"),
    opsAutoFixCritical: $("[name='opsAutoFixCritical']"),
    opsNativeWindowsNotifications: $("[name='opsNativeWindowsNotifications']"),
    opsBrowserNotifications: $("[name='opsBrowserNotifications']"),
    opsCloudflareEnabled: $("[name='opsCloudflareEnabled']"),
    opsLocalOwnerConsoleEnabled: $("[name='opsLocalOwnerConsoleEnabled']"),
    opsSensitiveTextApprovalsRequireCode: $("[name='opsSensitiveTextApprovalsRequireCode']"),
    opsOperatorFullAccess: $("[name='opsOperatorFullAccess']"),
    opsOperatorSystemPrompt: $("[name='opsOperatorSystemPrompt']"),
    protonDriveLogPath: $("[name='protonDriveLogPath']"),
    gaMeasurementId: $("[name='gaMeasurementId']"),
    metaPixelId: $("[name='metaPixelId']"),
    customWebhookUrl: $("[name='customWebhookUrl']"),
    discordRemodelCode: $("[name='discordRemodelCode']"),
    discordRemodelDiscountPercent: $("[name='discordRemodelDiscountPercent']"),
    twilioAccountSid: $("[name='twilioAccountSid']"),
    twilioAuthToken: $("[name='twilioAuthToken']"),
    twilioPhoneNumber: $("[name='twilioPhoneNumber']"),
    twilioOwnerPhone: $("[name='twilioOwnerPhone']"),
    protonSmtpHost: $("[name='protonSmtpHost']"),
    protonSmtpPort: $("[name='protonSmtpPort']"),
    protonSmtpUsername: $("[name='protonSmtpUsername']"),
    protonSmtpPassword: $("[name='protonSmtpPassword']"),
    protonFromEmail: $("[name='protonFromEmail']"),
    ociSshHost: $("[name='ociSshHost']"),
    ociSshUser: $("[name='ociSshUser']"),
    ociSshKeyPath: $("[name='ociSshKeyPath']"),
    ociBackupMountPath: $("[name='ociBackupMountPath']"),
    cloudflareApiToken: $("[name='cloudflareApiToken']"),
    cloudflareZoneId: $("[name='cloudflareZoneId']"),
    cloudflareAccountEmail: $("[name='cloudflareAccountEmail']"),
    ownerTextApprovalSecret: $("[name='ownerTextApprovalSecret']"),
    apiKeyOpenai: $("[name='apiKeyOpenai']"),
    apiKeyDiscord: $("[name='apiKeyDiscord']"),
    apiKeyStripeSecret: $("[name='apiKeyStripeSecret']")
  };

  const state = {
    csrfToken: "",
    settings: null,
    secrets: null,
    support: [],
    contact: [],
    supportSeen: new Set(),
    contactSeen: new Set(),
    pollId: null
  };

  init().catch((error) => setStatus(loginStatus, error.message || "Failed to initialize.", "error"));

  async function init() {
    loginForm?.addEventListener("submit", onLogin);
    $("[data-refresh-dashboard]")?.addEventListener("click", loadDashboard);
    $("[data-manual-security-scan]")?.addEventListener("click", onManualSecurityScan);
    $("[data-save-settings]")?.addEventListener("click", onSaveSettings);
    $("[data-refresh-anydesk]")?.addEventListener("click", onRefreshAnydesk);
    $("[data-logout]")?.addEventListener("click", onLogout);
    $("[data-add-product]")?.addEventListener("click", () => productsBody.appendChild(productRow()));
    $("[data-add-coupon]")?.addEventListener("click", () => couponsBody.appendChild(couponRow()));
    $("[data-operator-plan]")?.addEventListener("click", () => runOperator("plan"));
    $("[data-operator-apply]")?.addEventListener("click", () => runOperator("apply"));
    tabs.forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.adminTab || "dashboard")));
    if (!(await checkSession())) {
      showLogin();
      return;
    }
    await Promise.all([loadSettings(), loadDashboard()]);
    showContent();
    setView("dashboard");
    await maybeRequestNotifications();
    startPolling();
  }

  async function checkSession() {
    try {
      const payload = await api("/api/admin/session");
      state.csrfToken = payload.csrfToken || "";
      return Boolean(state.csrfToken);
    } catch {
      state.csrfToken = "";
      return false;
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    setStatus(loginStatus, "Signing in...", "");
    const body = Object.fromEntries(new FormData(loginForm).entries());
    try {
      const payload = await api("/api/admin/login", { method: "POST", body, includeCsrf: false });
      state.csrfToken = payload.csrfToken || "";
      await Promise.all([loadSettings(), loadDashboard()]);
      loginForm.reset();
      showContent();
      setView("dashboard");
      await maybeRequestNotifications();
      startPolling();
      setStatus(loginStatus, "", "");
    } catch (error) {
      setStatus(loginStatus, error.message || "Login failed.", "error");
    }
  }

  async function onLogout() {
    stopPolling();
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch {}
    state.csrfToken = "";
    state.settings = null;
    state.secrets = null;
    state.support = [];
    state.contact = [];
    state.supportSeen.clear();
    state.contactSeen.clear();
    showLogin();
  }

  async function loadSettings() {
    const payload = await api("/api/admin/settings");
    state.settings = payload.settings;
    state.secrets = payload.secrets;
    applySettings();
  }

  async function loadDashboard() {
    setStatus(dashboardStatus, "Refreshing...", "");
    try {
      const [statsPayload, supportPayload, contactPayload, managerPayload, accountsPayload] = await Promise.all([
        api("/api/admin/stats"),
        api("/api/admin/support-requests"),
        api("/api/admin/contact-messages"),
        api("/api/admin/manager/status"),
        api("/api/admin/accounts")
      ]);
      state.support = Array.isArray(supportPayload.requests) ? supportPayload.requests : [];
      state.contact = Array.isArray(contactPayload.messages) ? contactPayload.messages : [];
      renderStats(statsPayload.stats || {}, accountsPayload.stats || {});
      renderSupport();
      renderContact();
      renderManager(managerPayload.manager || {});
      notifyNew("support", state.support);
      notifyNew("contact", state.contact);
      setStatus(dashboardStatus, `Updated ${new Date().toLocaleTimeString()}.`, "ok");
    } catch (error) {
      setStatus(dashboardStatus, error.message || "Refresh failed.", "error");
    }
  }

  function renderStats(statsPayload, accountStats) {
    const traffic = statsPayload.traffic || {};
    const support = statsPayload.support || {};
    text(stats.visitors24h, num(traffic.visitors24h));
    text(stats.events7d, num(traffic.events7d));
    text(stats.queueOpen, num(Number(support.queueNew || 0) + Number(support.queueInProgress || 0) + Number(support.queueWaitingOnOwner || 0)));
    text(stats.accountTotal, num(accountStats.total || 0));
  }

  function renderManager(payload) {
    const repo = payload.repoStatus || {};
    const health = payload.siteHealth || {};
    const summary = payload.lastSecurityScanSummary || {};
    text(manager.critical, num(summary.critical || 0));
    text(manager.siteHealth, health.statusCode ? `${health.status} (${health.statusCode})` : health.status || "Unknown");
    text(manager.repoPath, repo.path || state.settings?.opsManager?.managedRepoPath || "--");
    text(manager.repoBranch, repo.branch || "--");
    text(manager.repoRemote, repo.remoteUrl || "--");
    text(manager.repoDirty, repo.isDirty ? "Yes" : "No");
    text(manager.repoLastCommit, repo.lastCommit || "--");
    text(manager.domainName, state.settings?.opsManager?.domainName || "--");
    text(manager.domainProvider, state.settings?.opsManager?.domainProvider || "--");
    text(manager.lastScan, date(payload.lastSecurityScanAt));
    text(manager.siteCheck, health.checkedAt ? `${date(health.checkedAt)} | ${num(health.responseTimeMs)}ms` : "--");
    text(
      manager.scanSummary,
      `critical ${num(summary.critical || 0)}, high ${num(summary.high || 0)}, fixed ${num(summary.fixed || 0)}, missing setup ${num(payload.readiness?.missingCount || 0)}`
    );
    renderList(activityList, payload.recentActivity, (item) => `<strong>${esc(date(item.createdAt))}</strong> ${esc(item.message || "")}`);
    renderList(
      securityList,
      payload.securityFindings,
      (item) => `<strong>${esc(String(item.severity || "info").toUpperCase())}</strong> ${esc(item.title || "")}<br><span class="muted">${esc(item.target || "")} | ${esc(item.details || "")}</span>`
    );
    renderList(
      manager.readinessList,
      payload.readiness?.items,
      (item) => `<strong>${esc(item.ready ? "READY" : "NEEDS VALUE")}</strong> ${esc(item.label || "")}<br><span class="muted">${esc(item.hint || "")}</span>`
    );
  }

  function renderSupport() {
    if (!state.support.length) {
      supportBody.innerHTML = "<tr><td colspan='7' class='muted'>No support requests yet.</td></tr>";
      return;
    }
    supportBody.innerHTML = state.support.map((item) => rowMarkup(item, "support")).join("");
    supportBody.querySelectorAll("[data-save-kind='support']").forEach((button) => {
      button.addEventListener("click", () => saveRow("support", button.closest("tr")));
    });
  }

  function renderContact() {
    if (!state.contact.length) {
      contactBody.innerHTML = "<tr><td colspan='7' class='muted'>No contact messages yet.</td></tr>";
      return;
    }
    contactBody.innerHTML = state.contact.map((item) => rowMarkup(item, "contact")).join("");
    contactBody.querySelectorAll("[data-save-kind='contact']").forEach((button) => {
      button.addEventListener("click", () => saveRow("contact", button.closest("tr")));
    });
  }

  function rowMarkup(item, kind) {
    const detail = kind === "support" ? item.preferredTime || "--" : item.preferredContact || "email";
    const subject = kind === "support" ? item.issue : item.subject;
    return `
      <tr data-row-id="${esc(item.id)}">
        <td>${esc(date(item.createdAt))}</td>
        <td>${esc(item.name || "Anonymous")}</td>
        <td>${item.email ? `<a href="mailto:${esc(item.email)}">${esc(item.email)}</a>` : "<span class='muted'>No email</span>"}</td>
        <td>${esc(detail)}</td>
        <td>${esc(subject || "")}</td>
        <td><select data-field="status">${statusOption("new", item.status)}${statusOption("in_progress", item.status)}${statusOption("waiting_on_owner", item.status)}${statusOption("closed", item.status)}</select></td>
        <td><textarea data-field="adminNotes">${esc(item.adminNotes || "")}</textarea></td>
        <td><button class="btn btn-ghost" type="button" data-save-kind="${kind}">Save</button><p class="status" data-row-status></p></td>
      </tr>`;
  }

  async function saveRow(kind, row) {
    const id = row?.dataset.rowId || "";
    const status = row?.querySelector("[data-field='status']")?.value || "new";
    const adminNotes = row?.querySelector("[data-field='adminNotes']")?.value || "";
    const statusNode = row?.querySelector("[data-row-status]");
    setStatus(statusNode, "Saving...", "");
    try {
      const url = kind === "support" ? `/api/admin/support-requests/${encodeURIComponent(id)}` : `/api/admin/contact-messages/${encodeURIComponent(id)}`;
      const payload = await api(url, { method: "PATCH", body: { status, adminNotes } });
      if (kind === "support") {
        state.support = state.support.map((item) => (item.id === id ? payload.request : item));
      } else {
        state.contact = state.contact.map((item) => (item.id === id ? payload.message : item));
      }
      setStatus(statusNode, "Saved.", "ok");
    } catch (error) {
      setStatus(statusNode, error.message || "Save failed.", "error");
    }
  }

  function applySettings() {
    const s = state.settings || {};
    const ops = s.opsManager || {};
    const secrets = state.secrets || {};
    setInputValue(form.brandName, s.brand?.name || "");
    setInputValue(form.brandTagline, s.brand?.tagline || "");
    setInputValue(form.heroTitle, s.brand?.heroTitle || "");
    setInputValue(form.heroSubtitle, s.brand?.heroSubtitle || "");
    setInputValue(form.accentHex, s.theme?.accentHex || "#ff2ea6");
    setInputValue(form.stripeStarter, s.stripeLinks?.starter || "");
    setInputValue(form.stripePro, s.stripeLinks?.pro || "");
    setInputValue(form.stripeReset, s.stripeLinks?.reset || "");
    setInputValue(form.supportEmail, s.support?.supportEmail || "");
    setInputValue(form.anydeskSourceUrl, s.support?.anydeskSourceUrl || "");
    setInputValue(form.refreshIntervalHours, String(s.support?.refreshIntervalHours || 12));
    setInputValue(form.supportIntro, s.support?.intro || "");
    setInputChecked(form.customTrackingEnabled, s.analytics?.customTrackingEnabled !== false);
    setInputValue(form.opsGithubRepo, ops.githubRepo || "");
    setInputValue(form.opsDefaultBranch, ops.defaultBranch || "");
    setInputValue(form.opsManagedRepoPath, ops.managedRepoPath || "");
    setInputValue(form.opsDomainName, ops.domainName || "");
    setInputValue(form.opsApiSubdomain, ops.apiSubdomain || "");
    setInputValue(form.opsOpsSubdomain, ops.opsSubdomain || "");
    setInputValue(form.opsDomainProvider, ops.domainProvider || "");
    setInputValue(form.opsDnsNotes, ops.dnsNotes || "");
    setInputValue(form.opsAlertEmail, ops.alertEmail || "");
    setInputValue(form.opsSecurityScanIntervalMinutes, String(ops.securityScanIntervalMinutes || 60));
    setInputValue(form.opsCriticalReminderMinutes, String(ops.criticalReminderMinutes || 15));
    setInputValue(form.opsNormalReminderMinutes, String(ops.normalReminderMinutes || 60));
    setInputValue(form.opsOperatorBaseUrl, ops.operatorBaseUrl || "");
    setInputValue(form.opsOperatorModel, ops.operatorModel || "");
    setInputChecked(form.opsAutoFixCritical, ops.autoFixCritical !== false);
    setInputChecked(form.opsNativeWindowsNotifications, ops.nativeWindowsNotifications !== false);
    setInputChecked(form.opsBrowserNotifications, ops.browserNotifications !== false);
    setInputChecked(form.opsCloudflareEnabled, ops.cloudflareEnabled !== false);
    setInputChecked(form.opsLocalOwnerConsoleEnabled, ops.localOwnerConsoleEnabled !== false);
    setInputChecked(form.opsSensitiveTextApprovalsRequireCode, ops.sensitiveTextApprovalsRequireCode !== false);
    setInputChecked(form.opsOperatorFullAccess, ops.operatorFullAccess !== false);
    setInputValue(form.opsOperatorSystemPrompt, ops.operatorSystemPrompt || "");
    setInputValue(form.protonDriveLogPath, secrets.protonDriveLogPath || "");
    setInputValue(form.gaMeasurementId, secrets.gaMeasurementId || "");
    setInputValue(form.metaPixelId, secrets.metaPixelId || "");
    setInputValue(form.customWebhookUrl, secrets.customWebhookUrl || "");
    setInputValue(form.discordRemodelCode, secrets.discordRemodelCode || "");
    setInputValue(form.discordRemodelDiscountPercent, String(secrets.discordRemodelDiscountPercent || 40));
    setInputValue(form.twilioAccountSid, secrets.twilio?.accountSid || "");
    setInputValue(form.twilioAuthToken, secrets.twilio?.authToken || "");
    setInputValue(form.twilioPhoneNumber, secrets.twilio?.phoneNumber || "");
    setInputValue(form.twilioOwnerPhone, secrets.twilio?.ownerPhone || "");
    setInputValue(form.protonSmtpHost, secrets.protonSmtp?.host || "");
    setInputValue(form.protonSmtpPort, String(secrets.protonSmtp?.port || 587));
    setInputValue(form.protonSmtpUsername, secrets.protonSmtp?.username || "");
    setInputValue(form.protonSmtpPassword, secrets.protonSmtp?.password || "");
    setInputValue(form.protonFromEmail, secrets.protonSmtp?.fromEmail || "");
    setInputValue(form.ociSshHost, secrets.oci?.sshHost || "");
    setInputValue(form.ociSshUser, secrets.oci?.sshUser || "ubuntu");
    setInputValue(form.ociSshKeyPath, secrets.oci?.sshKeyPath || "");
    setInputValue(form.ociBackupMountPath, secrets.oci?.backupMountPath || "");
    setInputValue(form.cloudflareApiToken, secrets.cloudflare?.apiToken || "");
    setInputValue(form.cloudflareZoneId, secrets.cloudflare?.zoneId || "");
    setInputValue(form.cloudflareAccountEmail, secrets.cloudflare?.accountEmail || "");
    setInputValue(form.ownerTextApprovalSecret, secrets.ownerApproval?.textApprovalSecret || "");
    setInputValue(form.apiKeyOpenai, secrets.apiKeys?.openai || "");
    setInputValue(form.apiKeyDiscord, secrets.apiKeys?.discord || "");
    setInputValue(form.apiKeyStripeSecret, secrets.apiKeys?.stripeSecret || "");
    renderRows(couponsBody, s.coupons || [], couponRow);
    renderRows(productsBody, s.products || [], productRow);
  }

  async function onSaveSettings() {
    if (!state.settings || !state.secrets) {
      setStatus(saveStatus, "No settings loaded.", "error");
      return;
    }
    const settings = {
      ...state.settings,
      brand: {
        name: form.brandName.value,
        tagline: form.brandTagline.value,
        heroTitle: form.heroTitle.value,
        heroSubtitle: form.heroSubtitle.value
      },
      theme: { accentHex: form.accentHex.value },
      stripeLinks: {
        starter: fieldValue(form.stripeStarter),
        pro: fieldValue(form.stripePro),
        reset: fieldValue(form.stripeReset)
      },
      support: {
        ...state.settings.support,
        supportEmail: form.supportEmail.value,
        anydeskSourceUrl: form.anydeskSourceUrl.value,
        refreshIntervalHours: Number(form.refreshIntervalHours.value || 12),
        intro: form.supportIntro.value
      },
      analytics: { customTrackingEnabled: form.customTrackingEnabled.checked },
      opsManager: {
        enabled: true,
        githubRepo: fieldValue(form.opsGithubRepo),
        defaultBranch: fieldValue(form.opsDefaultBranch),
        managedRepoPath: fieldValue(form.opsManagedRepoPath),
        domainName: fieldValue(form.opsDomainName),
        apiSubdomain: fieldValue(form.opsApiSubdomain),
        opsSubdomain: fieldValue(form.opsOpsSubdomain),
        domainProvider: fieldValue(form.opsDomainProvider),
        dnsNotes: fieldValue(form.opsDnsNotes),
        alertEmail: fieldValue(form.opsAlertEmail),
        securityScanIntervalMinutes: fieldNumber(form.opsSecurityScanIntervalMinutes, 60),
        criticalReminderMinutes: fieldNumber(form.opsCriticalReminderMinutes, 15),
        normalReminderMinutes: fieldNumber(form.opsNormalReminderMinutes, 60),
        operatorBaseUrl: fieldValue(form.opsOperatorBaseUrl),
        operatorModel: fieldValue(form.opsOperatorModel),
        autoFixCritical: fieldChecked(form.opsAutoFixCritical, true),
        nativeWindowsNotifications: fieldChecked(form.opsNativeWindowsNotifications, true),
        browserNotifications: fieldChecked(form.opsBrowserNotifications, true),
        cloudflareEnabled: fieldChecked(form.opsCloudflareEnabled, true),
        localOwnerConsoleEnabled: fieldChecked(form.opsLocalOwnerConsoleEnabled, true),
        sensitiveTextApprovalsRequireCode: fieldChecked(form.opsSensitiveTextApprovalsRequireCode, true),
        operatorFullAccess: fieldChecked(form.opsOperatorFullAccess, true),
        operatorSystemPrompt: fieldValue(form.opsOperatorSystemPrompt)
      },
      coupons: collectCoupons(),
      products: collectProducts()
    };
    const secrets = {
      ...state.secrets,
      protonDriveLogPath: fieldValue(form.protonDriveLogPath),
      gaMeasurementId: fieldValue(form.gaMeasurementId),
      metaPixelId: fieldValue(form.metaPixelId),
      customWebhookUrl: fieldValue(form.customWebhookUrl),
      discordRemodelCode: fieldValue(form.discordRemodelCode),
      discordRemodelDiscountPercent: fieldNumber(form.discordRemodelDiscountPercent, 40),
      twilio: {
        accountSid: fieldValue(form.twilioAccountSid),
        authToken: fieldValue(form.twilioAuthToken),
        phoneNumber: fieldValue(form.twilioPhoneNumber),
        ownerPhone: fieldValue(form.twilioOwnerPhone)
      },
      protonSmtp: {
        host: fieldValue(form.protonSmtpHost),
        port: fieldNumber(form.protonSmtpPort, 587),
        username: fieldValue(form.protonSmtpUsername),
        password: fieldValue(form.protonSmtpPassword),
        fromEmail: fieldValue(form.protonFromEmail)
      },
      oci: {
        sshHost: fieldValue(form.ociSshHost),
        sshUser: fieldValue(form.ociSshUser),
        sshKeyPath: fieldValue(form.ociSshKeyPath),
        backupMountPath: fieldValue(form.ociBackupMountPath)
      },
      cloudflare: {
        apiToken: fieldValue(form.cloudflareApiToken),
        zoneId: fieldValue(form.cloudflareZoneId),
        accountEmail: fieldValue(form.cloudflareAccountEmail)
      },
      ownerApproval: {
        textApprovalSecret: fieldValue(form.ownerTextApprovalSecret)
      },
      apiKeys: {
        openai: fieldValue(form.apiKeyOpenai),
        discord: fieldValue(form.apiKeyDiscord),
        stripeSecret: fieldValue(form.apiKeyStripeSecret)
      }
    };
    setStatus(saveStatus, "Saving settings...", "");
    try {
      await api("/api/admin/settings", { method: "PUT", body: { settings, secrets } });
      state.settings = settings;
      state.secrets = secrets;
      setStatus(saveStatus, "Settings saved.", "ok");
    } catch (error) {
      setStatus(saveStatus, error.message || "Save failed.", "error");
    }
  }

  async function onRefreshAnydesk() {
    setStatus(saveStatus, "Refreshing AnyDesk...", "");
    try {
      const payload = await api("/api/admin/refresh-anydesk", { method: "POST" });
      setStatus(saveStatus, `AnyDesk refreshed: ${payload.resolvedUrl || "ok"}`, "ok");
    } catch (error) {
      setStatus(saveStatus, error.message || "AnyDesk refresh failed.", "error");
    }
  }

  async function onManualSecurityScan() {
    setStatus(dashboardStatus, "Running security scan...", "");
    try {
      await api("/api/admin/manager/security-scan", { method: "POST" });
      await loadDashboard();
    } catch (error) {
      setStatus(dashboardStatus, error.message || "Security scan failed.", "error");
    }
  }

  async function runOperator(mode) {
    const prompt = String(operatorPrompt?.value || "").trim();
    if (!prompt) {
      setStatus(operatorStatus, "Enter an instruction first.", "error");
      return;
    }
    setStatus(operatorStatus, mode === "apply" ? "Applying changes..." : "Running operator...", "");
    try {
      const payload = await api(mode === "apply" ? "/api/admin/operator/apply" : "/api/admin/operator/ask", {
        method: "POST",
        body: { prompt }
      });
      operatorOutput.textContent = JSON.stringify(payload, null, 2);
      setStatus(operatorStatus, mode === "apply" ? `Applied ${(payload.applied || []).length} file change(s).` : "Operator response received.", "ok");
      await loadDashboard();
    } catch (error) {
      setStatus(operatorStatus, error.message || "Operator request failed.", "error");
    }
  }

  function renderRows(body, items, build) {
    body.innerHTML = "";
    items.forEach((item) => body.appendChild(build(item)));
    if (!items.length) {
      body.appendChild(build());
    }
  }

  function productRow(item = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input data-key="id" value="${esc(item.id || "")}"></td><td><input data-key="title" value="${esc(item.title || "")}"></td><td><input data-key="category" value="${esc(item.category || "Programs")}"></td><td><input data-key="priceLabel" value="${esc(item.priceLabel || "")}"></td><td><input data-key="priceCents" type="number" value="${esc(String(item.priceCents || ""))}"></td><td><input data-key="ctaLabel" value="${esc(item.ctaLabel || "")}"></td><td><input data-key="ctaUrl" value="${esc(item.ctaUrl || "")}"></td><td><label><input data-key="requires18Plus" type="checkbox" ${item.requires18Plus ? "checked" : ""}>18+</label></td><td><button class="btn btn-ghost" type="button" data-remove-row>Remove</button></td><td><textarea data-key="summary">${esc(item.summary || "")}</textarea></td>`;
    tr.querySelector("[data-remove-row]")?.addEventListener("click", () => tr.remove());
    return tr;
  }

  function couponRow(item = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input data-key="code" value="${esc(String(item.code || "").toUpperCase())}"></td><td><input data-key="percentOff" type="number" min="1" max="100" value="${esc(String(item.percentOff || ""))}"></td><td><label><input data-key="active" type="checkbox" ${item.active !== false ? "checked" : ""}>Active</label></td><td><button class="btn btn-ghost" type="button" data-remove-row>Remove</button></td>`;
    tr.querySelector("[data-remove-row]")?.addEventListener("click", () => tr.remove());
    return tr;
  }

  function collectProducts() {
    return Array.from(productsBody.querySelectorAll("tr")).map((row) => ({
      id: val(row, "id"),
      title: val(row, "title"),
      category: val(row, "category"),
      priceLabel: val(row, "priceLabel"),
      priceCents: Number(val(row, "priceCents") || 0),
      ctaLabel: val(row, "ctaLabel"),
      ctaUrl: val(row, "ctaUrl"),
      requires18Plus: row.querySelector("[data-key='requires18Plus']")?.checked || false,
      summary: val(row, "summary")
    })).filter((item) => item.id.trim() && item.title.trim());
  }

  function collectCoupons() {
    return Array.from(couponsBody.querySelectorAll("tr")).map((row) => ({
      code: String(val(row, "code")).trim().toUpperCase(),
      percentOff: Number(val(row, "percentOff") || 0),
      active: row.querySelector("[data-key='active']")?.checked !== false
    })).filter((item) => item.code && item.percentOff > 0);
  }

  function val(row, key) {
    return row.querySelector(`[data-key='${key}']`)?.value || "";
  }

  async function maybeRequestNotifications() {
    if (!state.settings?.opsManager?.browserNotifications || !("Notification" in window)) {
      return;
    }
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {}
    }
  }

  function notifyNew(kind, items) {
    const seen = kind === "support" ? state.supportSeen : state.contactSeen;
    if (seen.size === 0) {
      items.forEach((item) => item.id && seen.add(item.id));
      return;
    }
    const enabled = state.settings?.opsManager?.browserNotifications && "Notification" in window && Notification.permission === "granted";
    items.forEach((item) => {
      if (!item.id || seen.has(item.id)) {
        return;
      }
      seen.add(item.id);
      if (enabled) {
        const detail = (kind === "support" ? item.issue : item.subject) || "New item received.";
        new Notification(kind === "support" ? "New Support Request" : "New Contact Message", {
          body: `${item.name || item.email || "Unknown"}: ${detail.slice(0, 120)}`
        });
      }
    });
  }

  function startPolling() {
    stopPolling();
    state.pollId = window.setInterval(() => {
      loadDashboard().catch(() => {});
    }, 20000);
  }

  function stopPolling() {
    if (state.pollId) {
      window.clearInterval(state.pollId);
      state.pollId = null;
    }
  }

  async function api(url, options = {}) {
    const method = options.method || "GET";
    const headers = { ...(options.headers || {}) };
    if (method !== "GET" && options.includeCsrf !== false && state.csrfToken) {
      headers["x-csrf-token"] = state.csrfToken;
    }
    let body;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const response = await fetch(url, { method, credentials: "include", headers, body });
    const payload = await response.json().catch(() => ({ ok: false, error: "Invalid API response." }));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Request failed: ${method} ${url}`);
    }
    return payload;
  }

  function renderList(node, items, render) {
    if (!node) {
      return;
    }
    if (!Array.isArray(items) || !items.length) {
      node.innerHTML = "<li class='muted'>No data yet.</li>";
      return;
    }
    node.innerHTML = items.slice(0, 20).map((item) => `<li>${render(item)}</li>`).join("");
  }

  function setView(view) {
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.adminTab === view));
    views.forEach((section) => section.classList.toggle("hidden", section.dataset.adminView !== view));
  }

  function showLogin() {
    loginPane?.classList.remove("hidden");
    contentPane?.classList.add("hidden");
  }

  function showContent() {
    loginPane?.classList.add("hidden");
    contentPane?.classList.remove("hidden");
  }

  function setStatus(node, message, type) {
    if (!node) {
      return;
    }
    node.textContent = message;
    node.className = `status ${type || ""}`;
  }

  function text(node, value) {
    if (node) {
      node.textContent = String(value ?? "");
    }
  }

  function statusOption(value, selectedValue) {
    const labels = { new: "New", in_progress: "In Progress", waiting_on_owner: "Waiting On Owner", closed: "Closed" };
    return `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${labels[value] || value}</option>`;
  }

  function setInputValue(node, value) {
    if (node) {
      node.value = String(value ?? "");
    }
  }

  function setInputChecked(node, value) {
    if (node) {
      node.checked = Boolean(value);
    }
  }

  function fieldValue(node, fallback = "") {
    return node ? node.value : fallback;
  }

  function fieldNumber(node, fallback = 0) {
    const numeric = Number(fieldValue(node, fallback));
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function fieldChecked(node, fallback = false) {
    return node ? node.checked : fallback;
  }

  function date(value) {
    if (!value) {
      return "--";
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : "--";
  }

  function num(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toLocaleString() : "0";
  }

  function esc(value) {
    return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
})();
