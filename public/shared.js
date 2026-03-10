(() => {
  const VISITOR_ID_KEY = "slendy_visitor_id";
  const SESSION_ID_KEY = "slendy_session_id";
  const SESSION_STARTED_AT_KEY = "slendy_session_started_at";
  const SESSION_START_SENT_PREFIX = "slendy_session_start_sent_";
  const CART_STORAGE_KEY = "slendy_cart_items";
  const FOOTER_COPY_SUFFIX = "Owner-built software for niche real-world problems.";
  const PRODUCT_PAGE_PATHS = {
    "pos-suite": "/products/pos-suite.html",
    "system-optimizer": "/products/system-optimizer.html",
    "discord-bot-kit": "/products/discord-bot-kit.html",
    "remote-control-limited": "/products/remote-control-limited.html"
  };

  function generateId(prefix) {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return `${prefix}_${window.crypto.randomUUID()}`;
      }
    } catch {
      // Ignore and use fallback.
    }

    return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  const SlendyApp = {
    config: null,
    telemetry: {
      started: false,
      endSent: false,
      heartbeatTimer: null,
      session: null
    },

    safeStorageGet(storage, key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },

    safeStorageSet(storage, key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        // Ignore storage failures.
      }
    },

    getOrCreateSession() {
      if (this.telemetry.session) {
        return this.telemetry.session;
      }

      const existingVisitorId = this.safeStorageGet(window.localStorage, VISITOR_ID_KEY);
      const visitorId = existingVisitorId || generateId("v");
      if (!existingVisitorId) {
        this.safeStorageSet(window.localStorage, VISITOR_ID_KEY, visitorId);
      }

      const existingSessionId = this.safeStorageGet(window.sessionStorage, SESSION_ID_KEY);
      const sessionId = existingSessionId || generateId("s");
      if (!existingSessionId) {
        this.safeStorageSet(window.sessionStorage, SESSION_ID_KEY, sessionId);
      }

      const existingStartedAt = this.safeStorageGet(window.sessionStorage, SESSION_STARTED_AT_KEY);
      const startedAt = existingStartedAt || new Date().toISOString();
      if (!existingStartedAt) {
        this.safeStorageSet(window.sessionStorage, SESSION_STARTED_AT_KEY, startedAt);
      }

      const startedAtMs = Date.parse(startedAt);
      this.telemetry.session = {
        visitorId,
        sessionId,
        startedAt,
        startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now()
      };

      return this.telemetry.session;
    },

    getClientContext() {
      const viewport = `${window.innerWidth || 0}x${window.innerHeight || 0}`;
      const screenSize = `${window.screen && window.screen.width ? window.screen.width : 0}x${window.screen && window.screen.height ? window.screen.height : 0}`;

      return {
        pageTitle: document.title || "",
        viewport,
        screen: screenSize,
        dpr: Number(window.devicePixelRatio || 1),
        colorDepth: Number((window.screen && window.screen.colorDepth) || 0),
        language: navigator.language || "",
        platform: navigator.platform || "",
        doNotTrack: navigator.doNotTrack || "",
        touchPoints: Number(navigator.maxTouchPoints || 0),
        cookiesEnabled: Boolean(navigator.cookieEnabled)
      };
    },

    getProductPageUrl(productId) {
      const key = String(productId || "").trim();
      return PRODUCT_PAGE_PATHS[key] || `/product.html?id=${encodeURIComponent(key)}`;
    },

    getCheckoutPageUrl(productId) {
      const key = String(productId || "").trim();
      return `/checkout.html?id=${encodeURIComponent(key)}`;
    },

    getCheckoutUrl(product) {
      const productId = String((product && product.id) || "").trim();
      if (!productId) {
        return "/checkout.html";
      }
      return this.getCheckoutPageUrl(productId);
    },

    getCart() {
      const raw = this.safeStorageGet(window.localStorage, CART_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }

        return parsed
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            id: String(item.id || "").trim(),
            qty: Math.max(1, Math.min(99, Number(item.qty || 1)))
          }))
          .filter((item) => item.id);
      } catch {
        return [];
      }
    },

    saveCart(items) {
      const normalized = Array.isArray(items)
        ? items
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              id: String(item.id || "").trim(),
              qty: Math.max(1, Math.min(99, Number(item.qty || 1)))
            }))
            .filter((item) => item.id)
        : [];

      this.safeStorageSet(window.localStorage, CART_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    },

    addToCart(productId, qty = 1) {
      const id = String(productId || "").trim();
      if (!id) {
        return this.getCart();
      }

      const amount = Math.max(1, Math.min(99, Number(qty || 1)));
      const cart = this.getCart();
      const index = cart.findIndex((item) => item.id === id);
      if (index >= 0) {
        cart[index].qty = Math.max(1, Math.min(99, cart[index].qty + amount));
      } else {
        cart.push({ id, qty: amount });
      }
      return this.saveCart(cart);
    },

    updateCartQty(productId, qty) {
      const id = String(productId || "").trim();
      const amount = Math.max(0, Math.min(99, Number(qty || 0)));
      const cart = this.getCart();
      const index = cart.findIndex((item) => item.id === id);
      if (index < 0) {
        return this.saveCart(cart);
      }

      if (amount <= 0) {
        cart.splice(index, 1);
      } else {
        cart[index].qty = amount;
      }
      return this.saveCart(cart);
    },

    clearCart() {
      this.safeStorageSet(window.localStorage, CART_STORAGE_KEY, JSON.stringify([]));
      return [];
    },

    buildTrackPayload(eventName, meta = {}) {
      const session = this.getOrCreateSession();
      const elapsedMs = Math.max(0, Date.now() - session.startedAtMs);
      return {
        eventName,
        path: window.location.pathname + window.location.search,
        referrer: document.referrer,
        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        visitorId: session.visitorId,
        sessionId: session.sessionId,
        sessionStartedAt: session.startedAt,
        sessionElapsedMs: elapsedMs,
        clientContext: this.getClientContext(),
        meta
      };
    },

    async postTrackPayload(payload, options = {}) {
      const useBeacon = options.beacon === true && typeof navigator.sendBeacon === "function";
      const body = JSON.stringify(payload);

      if (useBeacon) {
        try {
          const blob = new Blob([body], { type: "application/json" });
          const sent = navigator.sendBeacon("/api/track", blob);
          if (sent) {
            return;
          }
        } catch {
          // Fall through to fetch.
        }
      }

      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: options.keepalive !== false,
        body
      });
    },

    async track(eventName, meta = {}) {
      this.ensureTelemetryStarted();
      const payload = this.buildTrackPayload(eventName, meta);

      try {
        await this.postTrackPayload(payload, { keepalive: true });
      } catch {
        // No-op: tracking failures should not break UX.
      }
    },

    sendBeaconTrack(eventName, meta = {}) {
      const payload = this.buildTrackPayload(eventName, meta);
      this.postTrackPayload(payload, { beacon: true, keepalive: true }).catch(() => {
        // No-op: lifecycle events are best-effort only.
      });
    },

    ensureTelemetryStarted() {
      if (this.telemetry.started) {
        return;
      }

      const session = this.getOrCreateSession();
      this.telemetry.started = true;
      this.telemetry.endSent = false;

      const startSentKey = `${SESSION_START_SENT_PREFIX}${session.sessionId}`;
      if (!this.safeStorageGet(window.sessionStorage, startSentKey)) {
        this.safeStorageSet(window.sessionStorage, startSentKey, "1");
        this.track("session_start", { auto: true });
      }

      this.telemetry.heartbeatTimer = window.setInterval(() => {
        this.track("session_heartbeat", {
          auto: true,
          visibility: document.visibilityState || "unknown"
        });
      }, 60000);

      const sendEnd = () => {
        if (this.telemetry.endSent) {
          return;
        }
        this.telemetry.endSent = true;
        this.sendBeaconTrack("session_end", {
          auto: true,
          visibility: document.visibilityState || "unknown"
        });
      };

      window.addEventListener("pagehide", sendEnd, { once: true });
      window.addEventListener("beforeunload", sendEnd, { once: true });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.sendBeaconTrack("session_pause", {
            auto: true,
            visibility: "hidden"
          });
        }
      });
    },

    async fetchPublicConfig() {
      if (this.config) {
        return this.config;
      }

      const response = await fetch("/api/public-config");
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error("We could not load page details. Please refresh.");
      }

      this.config = payload.config;
      this.applyFooterCopy(this.config && this.config.brand ? this.config.brand.name : "slendystuff");
      return this.config;
    },

    applyFooterCopy(brandName) {
      const brand = String(brandName || "slendystuff").trim() || "slendystuff";
      const year = new Date().getFullYear();
      const line = `\u00A9 ${year} ${brand}. ${FOOTER_COPY_SUFFIX}`;
      const nodes = Array.from(document.querySelectorAll(".footer p, .footer .muted"));
      nodes
        .filter((node) => String(node.textContent || "").includes("\u00A9"))
        .forEach((node) => {
          node.textContent = line;
        });
    },

    async getAnydeskInfo() {
      const response = await fetch("/api/support/anydesk");
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error("We could not load download details right now.");
      }

      return payload.anydesk;
    },

    initHeaderMenu() {
      this.ensureTelemetryStarted();

      const navToggle = document.querySelector("[data-nav-toggle]");
      const nav = document.querySelector("[data-nav]");

      if (!navToggle || !nav) {
        return;
      }

      const hasForumLink = Array.from(nav.querySelectorAll("a")).some((link) => {
        const href = String(link.getAttribute("href") || "").trim();
        return href === "/forum.html" || href === "forum.html";
      });
      if (!hasForumLink) {
        const forumLink = document.createElement("a");
        forumLink.setAttribute("href", "/forum.html");
        forumLink.textContent = "Forum";
        nav.appendChild(forumLink);
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
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function gtag() {
          window.dataLayer.push(arguments);
        };
        window.gtag("js", new Date());

        const gtagScript = document.createElement("script");
        gtagScript.async = true;
        gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
        gtagScript.addEventListener("load", () => {
          window.gtag("config", gaId);
        });

        document.head.appendChild(gtagScript);
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
              status.textContent = "This item is only available to visitors 18 or older.";
              status.className = "status error";
            }
            this.track("age_gate_denied", { pageKey });
            resolve(false);
          } catch {
            if (status) {
              status.textContent = "Age verification could not be completed. Please try again.";
              status.className = "status error";
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
  SlendyApp.ensureTelemetryStarted();
})();
