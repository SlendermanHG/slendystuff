(() => {
  const SlendyApp = {
    config: null,

    async fetchPublicConfig() {
      if (this.config) {
        return this.config;
      }

      try {
        const response = await fetch("/api/public-config");
        const payload = await response.json();
        if (payload.ok && payload.config) {
          this.config = payload.config;
          return this.config;
        }
      } catch {
        // Fallback to static config when running on GitHub Pages without backend APIs.
      }

      const staticResponse = await fetch("/config.public.json");
      const staticConfig = await staticResponse.json();

      this.config = {
        ...staticConfig,
        analytics: {
          customTrackingEnabled: false,
          gaMeasurementId: "",
          metaPixelId: ""
        }
      };

      return this.config;
    },

    async getAnydeskInfo() {
      try {
        const response = await fetch("/api/support/anydesk");
        const payload = await response.json();
        if (payload.ok && payload.anydesk) {
          return payload.anydesk;
        }
      } catch {
        // Fallback handled below.
      }

      const config = await this.fetchPublicConfig();
      return {
        downloadUrl: config.support.anydeskDownloadUrl || config.support.anydeskSourceUrl,
        sourceUrl: config.support.anydeskSourceUrl,
        lastCheckedAt: null,
        lastModified: null,
        contentLength: null,
        lastError: "Backend API unavailable; using static AnyDesk link."
      };
    },

    async track(eventName, meta = {}) {
      const body = {
        eventName,
        path: window.location.pathname + window.location.search,
        referrer: document.referrer,
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        meta
      };

      try {
        await fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } catch {
        // No-op: tracking failures should not break UX.
      }
    },

    initHeaderMenu() {
      const navToggle = document.querySelector("[data-nav-toggle]");
      const nav = document.querySelector("[data-nav]");

      if (!navToggle || !nav) {
        return;
      }

      navToggle.addEventListener("click", () => {
        nav.classList.toggle("open");
      });

      nav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => nav.classList.remove("open"));
      });
    },

    injectAnalytics(config) {
      const analytics = (config && config.analytics) || {};
      const gaId = analytics.gaMeasurementId;

      if (gaId) {
        const gtagScript = document.createElement("script");
        gtagScript.async = true;
        gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;

        const inline = document.createElement("script");
        inline.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`;

        document.head.appendChild(gtagScript);
        document.head.appendChild(inline);
      }
    },

    async promptAgeGate(pageKey) {
      const storageKey = `age-verified-${pageKey}`;
      const existing = localStorage.getItem(storageKey);
      if (existing === "yes") {
        return true;
      }

      const overlay = document.getElementById("age-gate-overlay");
      if (!overlay) {
        return true;
      }

      overlay.classList.remove("hidden");

      return new Promise((resolve) => {
        const yesButton = overlay.querySelector("[data-age-answer='yes']");
        const noButton = overlay.querySelector("[data-age-answer='no']");
        const status = overlay.querySelector("[data-age-status]");

        const submit = async (answer) => {
          try {
            const response = await fetch("/api/age-verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pageKey,
                answer,
                clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                clientTime: new Date().toString()
              })
            });
            const payload = await response.json();

            if (payload.allowed) {
              localStorage.setItem(storageKey, "yes");
              overlay.classList.add("hidden");
              this.track("age_gate_approved", { pageKey });
              resolve(true);
              return;
            }

            if (status) {
              status.textContent = "Access denied. This section is restricted to verified 18+ users.";
              status.className = "status error";
            }
            this.track("age_gate_denied", { pageKey });
            resolve(false);
          } catch {
            if (status) {
              status.textContent = "Verification request failed. Try again.";
              status.className = "status error";
            }
            if (answer === "yes") {
              localStorage.setItem(storageKey, "yes");
              overlay.classList.add("hidden");
              resolve(true);
              return;
            }

            resolve(false);
          }
        };

        if (yesButton) {
          yesButton.addEventListener("click", () => submit("yes"), { once: true });
        }

        if (noButton) {
          noButton.addEventListener("click", () => submit("no"), { once: true });
        }
      });
    }
  };

  window.SlendyApp = SlendyApp;
})();
