(() => {
  const SLENDY_HELPER_SEEN_KEY = "slendy-helper-seen-v1";

  const SlendyApp = {
    config: null,
    userSession: null,
    helperMounted: false,

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

    async getUserSession(forceRefresh = false) {
      if (!forceRefresh && this.userSession) {
        return this.userSession;
      }

      try {
        const response = await fetch("/api/auth/session");
        const payload = await response.json();
        if (response.ok && payload.ok) {
          this.userSession = payload;
          return payload;
        }
      } catch {
        // Backend unavailable in static mode.
      }

      this.userSession = { ok: true, authenticated: false };
      return this.userSession;
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

    initTopNote() {
      if (!document.body || window.location.pathname.startsWith("/admin")) {
        return;
      }
      if (document.querySelector("[data-top-note]")) {
        return;
      }

      const header = document.querySelector(".site-header");
      if (!header) {
        return;
      }

      const note = document.createElement("section");
      note.className = "site-top-note";
      note.dataset.topNote = "true";
      note.innerHTML = `
        <div class="shell top-note-grid">
          <p><strong>Fast navigation mode:</strong> Products is your direct catalog, Custom Intake is for net-new builds, and Support is for immediate technical help.</p>
          <div class="top-note-actions">
            <a href="/products.html">Catalog</a>
            <a href="/custom-tool.html">Custom Intake</a>
            <a href="/support.html">Support</a>
          </div>
        </div>
      `;
      header.insertAdjacentElement("afterend", note);
    },

    async initSiteHelper() {
      if (this.helperMounted) {
        return;
      }
      if (!document.body || window.location.pathname.startsWith("/admin")) {
        return;
      }

      this.helperMounted = true;
      try {
        await this.mountSiteHelper();
      } catch {
        // Helper should never break the page.
      }
    },

    async mountSiteHelper() {
      if (document.querySelector("[data-site-helper]")) {
        return;
      }

      const [config, session] = await Promise.all([
        this.fetchPublicConfig().catch(() => ({ brand: { name: "Slendy Stuff" }, products: [] })),
        this.getUserSession()
      ]);

      const helper = document.createElement("aside");
      helper.className = "site-helper";
      helper.dataset.siteHelper = "true";
      helper.innerHTML = `
        <button class="helper-toggle" type="button" aria-expanded="false" aria-controls="site-helper-panel" data-helper-toggle>
          <span class="helper-face" aria-hidden="true">CLP</span>
          <span class="helper-toggle-label">Launch Assistant</span>
        </button>
        <section class="helper-panel hidden" id="site-helper-panel" data-helper-panel aria-live="polite">
          <header class="helper-head">
            <p class="eyebrow">Slendy Assistant</p>
            <button class="helper-close" type="button" aria-label="Close assistant" data-helper-close>x</button>
          </header>
          <p class="helper-message" data-helper-message></p>
          <div class="helper-intents" data-helper-intents>
            <button class="helper-chip" type="button" data-intent="explore">Explore</button>
            <button class="helper-chip" type="button" data-intent="bots">Bots</button>
            <button class="helper-chip" type="button" data-intent="programs">Programs</button>
            <button class="helper-chip" type="button" data-intent="support">Support</button>
            <button class="helper-chip" type="button" data-intent="account">Account</button>
          </div>
          <div class="helper-actions" data-helper-actions></div>
        </section>
      `;
      document.body.appendChild(helper);

      const toggleButton = helper.querySelector("[data-helper-toggle]");
      const closeButton = helper.querySelector("[data-helper-close]");
      const panel = helper.querySelector("[data-helper-panel]");
      const messageNode = helper.querySelector("[data-helper-message]");
      const actionNode = helper.querySelector("[data-helper-actions]");
      const intentButtons = Array.from(helper.querySelectorAll("[data-intent]"));

      const context = {
        config,
        session,
        path: window.location.pathname.toLowerCase(),
        query: new URLSearchParams(window.location.search)
      };

      let currentIntent = "explore";
      const setOpen = (open) => {
        panel.classList.toggle("hidden", !open);
        toggleButton.setAttribute("aria-expanded", open ? "true" : "false");
      };

      const render = () => {
        const plan = this.buildHelperPlan(currentIntent, context);
        messageNode.textContent = plan.message;
        this.renderHelperActions(actionNode, plan.actions, currentIntent);

        intentButtons.forEach((button) => {
          button.classList.toggle("active", button.dataset.intent === currentIntent);
        });
      };

      toggleButton.addEventListener("click", () => {
        const next = panel.classList.contains("hidden");
        setOpen(next);
        if (next) {
          this.track("helper_opened", { page: context.path });
          localStorage.setItem(SLENDY_HELPER_SEEN_KEY, "yes");
        } else {
          this.track("helper_closed", { page: context.path });
        }
      });

      closeButton.addEventListener("click", () => {
        setOpen(false);
        this.track("helper_closed", { page: context.path });
      });

      intentButtons.forEach((button) => {
        button.addEventListener("click", () => {
          currentIntent = button.dataset.intent || "explore";
          this.track("helper_intent_selected", { intent: currentIntent, page: context.path });
          render();
        });
      });

      render();

      if (localStorage.getItem(SLENDY_HELPER_SEEN_KEY) !== "yes" && window.matchMedia("(min-width: 781px)").matches) {
        setOpen(true);
        this.track("helper_auto_opened", { page: context.path });
        localStorage.setItem(SLENDY_HELPER_SEEN_KEY, "yes");
      }
    },

    buildHelperPlan(intent, context) {
      const products = Array.isArray(context.config && context.config.products) ? context.config.products : [];
      const session = context.session || { authenticated: false };
      const eligibility = session.eligibility || {};
      const signedEmail = session.user && session.user.email ? session.user.email : "your account";
      const path = context.path || "/";
      const query = context.query || new URLSearchParams();

      const productAction = (product, variant = "btn") => ({
        label: `View ${product.title}`,
        href: `/product.html?id=${encodeURIComponent(product.id)}`,
        variant,
        eventName: "helper_product_click",
        meta: { productId: product.id }
      });

      if (intent === "account") {
        if (session.authenticated) {
          return {
            message: eligibility.eligible
              ? `You are signed in as ${signedEmail}. Your support status is currently free within the active window.`
              : `You are signed in as ${signedEmail}. Choose paid support or product setup to continue.`,
            actions: [
              { label: "Open Account Center", href: "/account.html", eventName: "helper_account_center" },
              { label: "Open Tech Support", href: "/support.html", variant: "ghost", eventName: "helper_support" }
            ]
          };
        }

        return {
            message: "Create an account to keep purchase history and automatically check support eligibility on future tickets.",
          actions: [
            { label: "Create Account", href: "/account.html", eventName: "helper_account_create" },
            { label: "Browse Products", href: "/products.html", variant: "ghost", eventName: "helper_browse_products" }
          ]
        };
      }

      if (intent === "bots") {
        const picks = this.pickProducts(products, (item) => {
          const text = `${item.title} ${item.category}`.toLowerCase();
          return text.includes("bot") || text.includes("discord") || text.includes("automation");
        });

        return {
          message: "Need automation? Start with these bot-focused options and move to custom tailoring when ready.",
          actions: [
            ...picks.map((item, index) => productAction(item, index === 0 ? "btn" : "ghost")),
            ...(!session.authenticated ? [{ label: "Create Account First", href: "/account.html", variant: "ghost", eventName: "helper_account_create" }] : [])
          ]
        };
      }

      if (intent === "programs") {
        const picks = this.pickProducts(products, (item) => {
          const text = `${item.title} ${item.category}`.toLowerCase();
          return text.includes("program") || text.includes("optimizer") || text.includes("pos") || text.includes("suite");
        });

        return {
          message: "Need software-focused tools? These offers are built for optimization and operations outcomes.",
          actions: picks.map((item, index) => productAction(item, index === 0 ? "btn" : "ghost"))
        };
      }

      if (intent === "support") {
        return {
          message: session.authenticated
            ? "Support can use your account context for faster handling."
            : "For best support routing, sign in first so purchase-based free support can be checked automatically.",
          actions: [
            { label: "Open Tech Support", href: "/support.html", eventName: "helper_support" },
            { label: "Request Custom Tool", href: "/custom-tool.html", variant: "ghost", eventName: "helper_custom_tool" },
            ...(!session.authenticated ? [{ label: "Sign In / Create Account", href: "/account.html", variant: "ghost", eventName: "helper_account_create" }] : [])
          ]
        };
      }

      if (path === "/product.html") {
        const productId = query.get("id");
        const current = products.find((item) => item.id === productId);
        const related = current
          ? this.pickProducts(products, (item) => item.category === current.category && item.id !== current.id)
          : [];

        return {
          message: current
            ? `Viewing ${current.title}. Want alternatives in the same lane or direct setup help?`
            : "Need a fast route? Pick bots, programs, or support and continue in one click.",
          actions: [
            ...(related.length ? related.map((item, index) => productAction(item, index === 0 ? "btn" : "ghost")) : []),
            { label: "Get Setup Help", href: "/support.html", variant: "ghost", eventName: "helper_support" }
          ]
        };
      }

      if (path === "/support.html") {
        return {
          message: session.authenticated
            ? "Since you are signed in, your support request can be matched against purchase history automatically."
            : "Sign in first if you want the system to auto-check whether your support should be free.",
          actions: [
            { label: "Open Account", href: "/account.html", eventName: "helper_account_open" },
            { label: "Request Support", href: "/support.html#main", variant: "ghost", eventName: "helper_support" }
          ]
        };
      }

      const starter = this.pickProducts(products, () => true);
      return {
        message: session.authenticated
          ? "Welcome back. Pick a lane and continue through product or support flow."
          : "Find the right product quickly, then create an account to track support and purchases.",
        actions: [
          ...starter.map((item, index) => productAction(item, index === 0 ? "btn" : "ghost")),
          ...(!session.authenticated ? [{ label: "Create Account", href: "/account.html", variant: "ghost", eventName: "helper_account_create" }] : [])
        ]
      };
    },

    pickProducts(products, matcher, count = 2) {
      const list = Array.isArray(products) ? products : [];
      const matched = list.filter((item) => item && matcher(item));
      if (matched.length >= 1) {
        return matched.slice(0, count);
      }
      return list.slice(0, count);
    },

    renderHelperActions(container, actions, intent) {
      if (!container) {
        return;
      }

      container.innerHTML = "";
      const safeActions = Array.isArray(actions) ? actions.filter((item) => item && item.href && item.label).slice(0, 3) : [];

      safeActions.forEach((action, index) => {
        const anchor = document.createElement("a");
        const useGhost = action.variant === "ghost" || index > 0;
        anchor.className = useGhost ? "btn btn-ghost helper-action" : "btn helper-action";
        anchor.href = action.href;
        anchor.textContent = action.label;
        anchor.addEventListener("click", () => {
          this.track(action.eventName || "helper_action_click", {
            intent,
            href: action.href,
            ...(action.meta || {})
          });
        });
        container.appendChild(anchor);
      });
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
  window.addEventListener("DOMContentLoaded", () => {
    SlendyApp.initTopNote();
    SlendyApp.initSiteHelper();
  });
})();
