(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const contentNode = document.querySelector("[data-product-content]");
  const notFoundNode = document.querySelector("[data-product-not-found]");

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);

    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name;
    });

    const params = new URLSearchParams(window.location.search);
    const productId = params.get("id");

    const product = (config.products || []).find((item) => item.id === productId);
    if (!product) {
      if (contentNode) contentNode.classList.add("hidden");
      if (notFoundNode) notFoundNode.classList.remove("hidden");
      app.track("product_not_found", { productId: productId || "empty" });
      return;
    }

    const allow = !product.requires18Plus || (await app.promptAgeGate(product.id));
    if (!allow) {
      if (contentNode) {
        contentNode.innerHTML = `
          <article class="card">
            <h2>Access blocked</h2>
            <p class="muted">This listing requires 18+ confirmation and access was denied.</p>
            <a class="btn" href="/">Back to Home</a>
          </article>
        `;
      }
      return;
    }

    if (contentNode) {
      const details = getDetails(product);
      const sections = [
        createListCard("What's Included", details.includes),
        createListCard("Typical Deliverables", details.deliverables),
        createListCard("Implementation Flow", details.flow),
        createListCard("Best Fit", details.bestFit)
      ].join("");

      const guardrails = details.guardrails && details.guardrails.length
        ? `
          <article class="card">
            <h2>Limits and Safeguards</h2>
            <ul class="list">${details.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </article>
        `
        : "";

      contentNode.innerHTML = `
        <article class="card">
          <p class="eyebrow">${escapeHtml(product.category)}</p>
          <h1>${escapeHtml(product.title)}</h1>
          <p class="muted">${escapeHtml(product.summary)}</p>
          <div class="kicker-row">
            <span class="kicker">${escapeHtml(product.priceLabel || "")}</span>
            ${
              product.requires18Plus
                ? '<span class="kicker">18+ Verified</span>'
                : '<span class="kicker">All Ages</span>'
            }
          </div>
          <div class="inline-actions">
            <a class="btn" href="${escapeHtml(product.ctaUrl || "#")}" target="_blank" rel="noopener" data-track="product_cta">${escapeHtml(product.ctaLabel || "Get Started")}</a>
            <a class="btn btn-ghost" href="/support.html">Need setup help?</a>
            <a class="btn btn-ghost" href="/custom-tool.html">Need Custom Version?</a>
          </div>
        </article>
        <div class="grid two details-grid">${sections}</div>
        ${guardrails}
      `;

      contentNode.querySelectorAll("[data-track='product_cta']").forEach((node) => {
        node.addEventListener("click", () => {
          app.track("product_cta", { productId: product.id });
        });
      });
    }

    app.track("product_view", { productId: product.id, requires18Plus: product.requires18Plus });
  } catch (error) {
    if (contentNode) {
      contentNode.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
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

  function createListCard(title, items) {
    return `
      <article class="card">
        <h2>${escapeHtml(title)}</h2>
        <ul class="list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    `;
  }

  function getDetails(product) {
    const byId = {
      "pos-suite": {
        includes: [
          "Role-based checkout workflows, shift controls, and transaction-path safeguards.",
          "Inventory-aware pricing and item management with multi-location operation support.",
          "Operational dashboard layer for daily totals, trends, and reconciliation accuracy."
        ],
        deliverables: [
          "Configured deployment package with baseline workflows and permissions.",
          "Setup and migration guidance for catalog, tax rules, and sales operations.",
          "Optimization and performance handoff documentation for repeatable operations."
        ],
        flow: [
          "Map current sales flow and required controls.",
          "Configure operational modules and validate high-risk paths.",
          "Deploy, monitor, and iterate with measured improvement cycles."
        ],
        bestFit: [
          "Businesses that need dependable POS behavior without operational drag.",
          "Teams planning phased growth with modular feature expansion."
        ]
      },
      "system-optimizer": {
        includes: [
          "Deep startup/service/process optimization with repeatable system baselining.",
          "Automated cleanup and maintenance routines for sustained performance.",
          "Bottleneck mapping for CPU, memory, storage, and workload contention."
        ],
        deliverables: [
          "Optimization profile package with documented tuning policy.",
          "Before/after diagnostics and prioritized action set.",
          "Long-term maintenance cadence and monitoring checklist."
        ],
        flow: [
          "Profile system behavior under your real workload pattern.",
          "Apply targeted optimization passes and benchmark each stage.",
          "Lock stable settings and define maintenance schedule."
        ],
        bestFit: [
          "Operators who need consistent speed across production workloads.",
          "Users replacing ad-hoc tweaks with controlled optimization strategy."
        ]
      },
      "discord-bot-kit": {
        includes: [
          "Command architecture with utility, moderation, and operations modules.",
          "Workflow automation for tickets, moderation routing, and community events.",
          "Role/channel permission strategy designed for scale and abuse resistance."
        ],
        deliverables: [
          "Configured bot package aligned to your server outcomes.",
          "Command map, usage documentation, and moderator control guide.",
          "Reliability and safety guardrails with escalation-handling patterns."
        ],
        flow: [
          "Define outcome targets: moderation, utility, growth, support.",
          "Implement command modules and run controlled test rounds.",
          "Deploy and tune response behavior against live usage data."
        ],
        bestFit: [
          "Communities requiring robust automation without copy-paste templates.",
          "Owners needing fast moderation response and clean utility UX."
        ]
      },
      "dnd5e-campaign-scribe": {
        includes: [
          "Dual-mode campaign tooling with dedicated DM controls and player-facing command set.",
          "Session recap generation, quest/objective tracking, and searchable campaign timeline memory.",
          "Initiative and encounter support with configurable dice, combat turns, and scene notes."
        ],
        deliverables: [
          "Configured Discord bot package with channel/role layout recommendations for campaign flow.",
          "DM and player command handbook with setup checklist, examples, and moderation controls.",
          "Data structure templates for NPC logs, loot tracking, session summaries, and arc progression."
        ],
        flow: [
          "Map table style, campaign cadence, and what information should be tracked automatically.",
          "Configure DM/player modules, run live sandbox sessions, and tune command responses.",
          "Deploy to production server and iterate recap/quest formatting from play feedback."
        ],
        bestFit: [
          "Dungeon Masters who need campaign continuity across long arcs and multiple players.",
          "Player groups that want clear quest memory, recap clarity, and lower admin overhead between sessions."
        ]
      },
      "remote-control-limited": {
        includes: [
          "Bounded remote automation commands with explicit permission boundaries.",
          "Session-level auditing and control restrictions for operational safety.",
          "Deployment safeguards designed for controlled remote workflows."
        ],
        deliverables: [
          "Configured limited-control profile with approved command surface.",
          "Permissions and boundaries documentation with operator runbook.",
          "Risk-aware deployment and monitoring recommendations."
        ],
        flow: [
          "Define approved remote actions and hard limits.",
          "Implement permissions, failsafes, and operational controls.",
          "Validate auditability and behavior before production launch."
        ],
        bestFit: [
          "Use cases requiring controlled remote execution with strict oversight.",
          "Teams prioritizing auditability, scope boundaries, and safety."
        ],
        guardrails: [
          "Feature scope is intentionally limited by design.",
          "Unsafe or unrestricted control patterns are excluded.",
          "18+ verification may be required depending on deployment context."
        ]
      }
    };

    const known = byId[product.id];
    if (known) {
      return known;
    }

    const category = String(product.category || "").toLowerCase();
    const isBot = category.includes("bot");

    return {
      includes: [
        isBot
          ? "Custom command surface and automation logic tailored to your server/workflow."
          : "Tailored software modules aligned to your operating process and outcome targets.",
        "Operational controls, reliability safeguards, and guided deployment strategy.",
        "Scalable architecture path for future feature growth."
      ],
      deliverables: [
        "Scope document with milestones, constraints, and delivery targets.",
        "Configurable release package with implementation notes.",
        "Follow-up optimization pass based on live usage."
      ],
      flow: [
        "Discovery and requirement mapping.",
        "Build and validation sprint.",
        "Deployment, monitoring, and iterative tuning."
      ],
      bestFit: [
        "Teams that need outcome-focused builds instead of template tooling.",
        "Operators who want practical delivery with upgrade paths."
      ]
    };
  }
})();
