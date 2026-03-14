(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const anydeskLink = document.querySelector("[data-anydesk-link]");
  const anydeskMeta = document.querySelector("[data-anydesk-meta]");
  const supportForm = document.querySelector("[data-support-form]");
  const status = document.querySelector("[data-support-status]");

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);

    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name;
    });

    const supportIntro = document.querySelector("[data-support-intro]");
    if (supportIntro) {
      supportIntro.textContent = config.support.intro;
    }

    const anydesk = await app.getAnydeskInfo();
    if (anydeskLink) {
      anydeskLink.href = anydesk.downloadUrl || config.support.anydeskDownloadUrl;
    }

    if (anydeskMeta) {
      anydeskMeta.textContent = `Last verified download check: ${formatDate(anydesk.lastCheckedAt)}`;
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
      const payload = {
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        preferredTime: String(formData.get("preferredTime") || ""),
        issue: String(formData.get("issue") || ""),
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      try {
        const response = await app.apiFetch("/api/support/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result.error || "Your request could not be sent. Please try again.");
        }

        supportForm.reset();
        if (status) {
          status.textContent = "Request received. You will get a first human response within 24 hours.";
          status.className = "status ok";
        }
        app.track("support_request_submitted", { emailProvided: Boolean(payload.email) });
      } catch (error) {
        if (status) {
          status.textContent = error.message;
          status.className = "status error";
        }
      }
    });
  }

  function formatDate(value) {
    if (!value) {
      return "pending";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "unknown";
    }

    return `${date.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  }
})();
