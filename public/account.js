(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const authSection = document.querySelector("[data-account-auth]");
  const dashboard = document.querySelector("[data-account-dashboard]");
  const registerForm = document.querySelector("[data-register-form]");
  const loginForm = document.querySelector("[data-login-form]");
  const registerStatus = document.querySelector("[data-register-status]");
  const loginStatus = document.querySelector("[data-login-status]");
  const policyNode = document.querySelector("[data-account-policy]");
  const userNode = document.querySelector("[data-account-user]");
  const eligibilityNode = document.querySelector("[data-account-eligibility]");
  const purchasesNode = document.querySelector("[data-purchases-list]");
  const historyNode = document.querySelector("[data-support-history]");
  const logoutButton = document.querySelector("[data-logout-account]");

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);
    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name;
    });
    if (policyNode && config.account && config.account.supportPolicy) {
      policyNode.textContent = config.account.supportPolicy;
    }
  } catch {
    // Keep page usable without config API.
  }

  await hydrateSession();
  app.track("page_view", { page: "account" });

  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(registerStatus, "Creating account...", "");
      const payload = Object.fromEntries(new FormData(registerForm).entries());

      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await parseJson(response);
        if (!response.ok || !result.ok) {
          throw new Error(result.error || "Unable to create account.");
        }

        registerForm.reset();
        setStatus(registerStatus, "Account created and signed in.", "ok");
        await hydrateSession();
      } catch (error) {
        setStatus(registerStatus, error.message, "error");
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(loginStatus, "Signing in...", "");
      const payload = Object.fromEntries(new FormData(loginForm).entries());

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await parseJson(response);
        if (!response.ok || !result.ok) {
          throw new Error(result.error || "Unable to sign in.");
        }

        loginForm.reset();
        setStatus(loginStatus, "Signed in.", "ok");
        await hydrateSession();
      } catch (error) {
        setStatus(loginStatus, error.message, "error");
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      await hydrateSession();
    });
  }

  async function hydrateSession() {
    try {
      const response = await fetch("/api/auth/session");
      const session = await parseJson(response);

      if (!response.ok || !session.ok || !session.authenticated) {
        showAuth();
        return;
      }

      const summaryRes = await fetch("/api/account/summary");
      const summary = await parseJson(summaryRes);
      if (!summaryRes.ok || !summary.ok) {
        showAuth();
        return;
      }

      renderSummary(summary.user, summary.eligibility);
      showDashboard();
    } catch {
      showAuth();
      setStatus(loginStatus, "Backend account APIs are unavailable in static Pages mode.", "error");
    }
  }

  function renderSummary(user, eligibility) {
    if (userNode) {
      userNode.textContent = `Signed in as ${user.name} (${user.email})`;
    }
    if (eligibilityNode) {
      if (eligibility.eligible) {
        eligibilityNode.textContent = `Support status: FREE through ${formatDate(eligibility.freeSupportUntil)} (based on qualifying purchase).`;
        eligibilityNode.className = "status ok";
      } else {
        eligibilityNode.textContent = `Support status: PAID SUPPORT REQUIRED. Reason: ${eligibility.reason}`;
        eligibilityNode.className = "status error";
      }
    }

    if (purchasesNode) {
      if (!user.purchases.length) {
        purchasesNode.textContent = "No purchases recorded yet.";
      } else {
        purchasesNode.innerHTML = `<ul class="list">${user.purchases
          .map((purchase) => `<li><strong>${escapeHtml(purchase.title || purchase.productId || "Purchase")}</strong> | ${escapeHtml(purchase.currency || "USD")} ${formatAmount(purchase.amountCents)} | ${formatDate(purchase.purchasedAt)}</li>`)
          .join("")}</ul>`;
      }
    }

    if (historyNode) {
      if (!user.supportRequests.length) {
        historyNode.textContent = "No support requests recorded yet.";
      } else {
        historyNode.innerHTML = `<ul class="list">${user.supportRequests
          .map((item) => `<li><strong>${formatDate(item.createdAt)}</strong> | ${escapeHtml(item.serviceLevel || "support") } | ${escapeHtml(item.billingStatus || "paid_support_required")}</li>`)
          .join("")}</ul>`;
      }
    }
  }

  function showAuth() {
    if (authSection) authSection.classList.remove("hidden");
    if (dashboard) dashboard.classList.add("hidden");
  }

  function showDashboard() {
    if (authSection) authSection.classList.add("hidden");
    if (dashboard) dashboard.classList.remove("hidden");
  }

  function setStatus(node, message, type) {
    if (!node) return;
    node.textContent = message;
    node.className = `status ${type || ""}`;
  }

  async function parseJson(response) {
    try {
      return await response.json();
    } catch {
      return { ok: false, error: "Invalid response" };
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }

  function formatAmount(amountCents) {
    if (!Number.isFinite(Number(amountCents))) return "TBD";
    return (Number(amountCents) / 100).toFixed(2);
  }
})();