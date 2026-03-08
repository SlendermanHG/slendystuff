(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const anydeskLink = document.querySelector("[data-anydesk-link]");
  const anydeskMeta = document.querySelector("[data-anydesk-meta]");
  const supportForm = document.querySelector("[data-support-form]");
  const status = document.querySelector("[data-support-status]");
  const accountHint = document.querySelector("[data-support-account-hint]");
  let supportEmail = "Help@slendystuff.com";

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);

    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name;
    });
    supportEmail = config.support.supportEmail || supportEmail;

    const supportIntro = document.querySelector("[data-support-intro]");
    if (supportIntro) {
      supportIntro.textContent = config.support.intro;
    }

    await hydrateAccountHint();

    const anydesk = await app.getAnydeskInfo();
    if (anydeskLink) {
      anydeskLink.href = anydesk.downloadUrl || config.support.anydeskDownloadUrl;
    }

    if (anydeskMeta) {
      anydeskMeta.textContent = `Last auto-check: ${formatDate(anydesk.lastCheckedAt)} | Source: ${anydesk.sourceUrl}`;
    }

    app.track("page_view", { page: "support" });
  } catch (error) {
    if (anydeskMeta) {
      anydeskMeta.textContent = error.message;
      anydeskMeta.className = "status error";
    }
  }

  if (supportForm) {
    supportForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(supportForm);
      const managementOptions = formData.getAll("managementOptions").map(String);
      const payload = {
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        preferredTime: String(formData.get("preferredTime") || ""),
        serviceLevel: String(formData.get("serviceLevel") || ""),
        managementOptions,
        issue: String(formData.get("issue") || ""),
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      try {
        const response = await fetch("/api/support/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result.error || "Failed to submit support request.");
        }

        supportForm.reset();
        if (status) {
          if (result.supportIsFree) {
            status.textContent = `Request sent. This ticket is marked FREE support (qualifying purchase within 365 days).`;
            status.className = "status ok";
          } else {
            status.textContent = `Request sent. Billing status: paid support required. Reason: ${result.billingReason || "No qualifying purchase in last 365 days."}`;
            status.className = "status error";
          }
        }
        app.track("support_request_submitted", {
          emailProvided: Boolean(payload.email),
          serviceLevel: payload.serviceLevel,
          managementOptions: payload.managementOptions
        });
      } catch (error) {
        const subject = encodeURIComponent("Tech Support Request");
        const body = encodeURIComponent(
          `Name: ${payload.name}\nEmail: ${payload.email}\nPreferred Time: ${payload.preferredTime}\nService Level: ${payload.serviceLevel}\nManagement Options: ${payload.managementOptions.join(", ") || "None selected"}\nTimezone: ${payload.clientTimezone}\n\nProject Overview / Issue:\n${payload.issue}`
        );
        window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
        if (status) {
          status.textContent = "Backend is unavailable. Opened your email client as fallback.";
          status.className = "status error";
        }
      }
    });
  }

  async function hydrateAccountHint() {
    try {
      const response = await fetch("/api/auth/session");
      const session = await response.json();
      if (!session.ok || !session.authenticated) {
        if (accountHint) {
          accountHint.textContent = "Sign into your account before support requests so purchase-based free-support eligibility can be checked automatically.";
        }
        return;
      }

      const user = session.user || {};
      const eligibility = session.eligibility || {};
      const nameInput = document.getElementById("name");
      const emailInput = document.getElementById("email");
      if (nameInput && user.name) nameInput.value = user.name;
      if (emailInput && user.email) emailInput.value = user.email;

      if (accountHint) {
        if (eligibility.eligible) {
          accountHint.textContent = `Account detected: ${user.email}. Current support status: FREE through ${formatDate(eligibility.freeSupportUntil)}.`;
          accountHint.className = "status ok";
        } else {
          accountHint.textContent = `Account detected: ${user.email}. Current support status: paid support required. Reason: ${eligibility.reason || "No qualifying purchase in last 365 days."}`;
          accountHint.className = "status error";
        }
      }
    } catch {
      if (accountHint) {
        accountHint.textContent = "Account status unavailable in static mode. Backend hosting is required for automatic eligibility checks.";
      }
    }
  }

  function formatDate(value) {
    if (!value) {
      return "not available yet";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "unknown";
    }

    return `${date.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  }
})();
