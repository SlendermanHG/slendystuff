(() => {
  const loginPane = document.querySelector("[data-admin-auth]");
  const contentPane = document.querySelector("[data-admin-content]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginStatus = document.querySelector("[data-login-status]");
  const saveButton = document.querySelector("[data-save-settings]");
  const saveStatus = document.querySelector("[data-save-status]");
  const logoutButton = document.querySelector("[data-logout]");
  const refreshAnydeskButton = document.querySelector("[data-refresh-anydesk]");

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
    } else {
      showLogin();
    }

    loginForm.addEventListener("submit", onLogin);
    saveButton.addEventListener("click", onSave);
    addProductButton.addEventListener("click", addProductRow);
    logoutButton.addEventListener("click", onLogout);
    refreshAnydeskButton.addEventListener("click", onRefreshAnydesk);
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

    const password = String(new FormData(loginForm).get("password") || "");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      const payload = await parseJson(response);
      if (!response.ok || !payload.ok) {
        setStatus(loginStatus, payload.error || "Login failed.", "error");
        return;
      }

      await loadAdminData();
      showContent();
      setStatus(loginStatus, "", "");
      loginForm.reset();
    } catch {
      setStatus(loginStatus, "Backend API is unavailable in GitHub Pages mode. Host server.js to enable admin saves.", "error");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: nextSettings, secrets: nextSecrets })
    });

    const payload = await parseJson(response);
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
      credentials: "include"
    });

    const payload = await parseJson(response);
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

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function parseJson(response) {
    try {
      return await response.json();
    } catch {
      return { ok: false, error: "Invalid API response." };
    }
  }
})();
