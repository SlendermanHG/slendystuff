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
          "Checkout flow and transaction handling tuned for practical day-to-day usage.",
          "Configurable item/price structure with workflow-oriented controls.",
          "Performance tuning guidance for stable operation under active usage."
        ],
        deliverables: [
          "Configured POS deployment package.",
          "Initial setup guidance and baseline optimization pass.",
          "Operational recommendations tailored to your environment."
        ],
        flow: [
          "Scope your operation model and constraints.",
          "Configure POS logic and test critical transaction paths.",
          "Deploy and run with support follow-up for adjustments."
        ],
        bestFit: [
          "Operators who need clean POS workflows instead of bloated complexity.",
          "Teams wanting fast setup with room for future tailoring."
        ]
      },
      "system-optimizer": {
        includes: [
          "System cleanup and startup/process optimization.",
          "Resource usage tuning recommendations for smoother performance.",
          "Repeatable optimization profile for ongoing maintenance."
        ],
        deliverables: [
          "Optimizer configuration package.",
          "Before/after optimization notes and focus areas.",
          "Maintenance checklist for sustained performance."
        ],
        flow: [
          "Assess current bottlenecks and workload pattern.",
          "Apply optimization profile and validate impact.",
          "Refine settings based on observed behavior."
        ],
        bestFit: [
          "Windows users with performance drag or workflow lag.",
          "People who want predictable maintenance without deep manual tuning."
        ]
      },
      "discord-bot-kit": {
        includes: [
          "Core bot utility features and command structure.",
          "Moderation/automation workflow customization.",
          "Role and channel integration guidance."
        ],
        deliverables: [
          "Bot feature set configured to your server goals.",
          "Command map with usage notes.",
          "Recommended guardrails for moderation and abuse prevention."
        ],
        flow: [
          "Define server outcomes and command priorities.",
          "Configure and test command behavior.",
          "Deploy with adjustment cycle after real usage."
        ],
        bestFit: [
          "Communities that want automation without generic template bots.",
          "Owners who need practical moderation and utility balance."
        ]
      },
      "remote-control-limited": {
        includes: [
          "Bounded remote-control automation with scoped command authority.",
          "Operational limits designed to reduce misuse risk.",
          "Session-level control and behavior constraints."
        ],
        deliverables: [
          "Configured limited-control bot profile.",
          "Permission and boundary documentation.",
          "Risk-aware operating recommendations."
        ],
        flow: [
          "Define allowed actions and explicit restrictions.",
          "Configure permission model and fail-safe behavior.",
          "Validate controls before live operation."
        ],
        bestFit: [
          "Use cases requiring controlled automation, not unrestricted remote control.",
          "Operators who prioritize boundaries and auditability."
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

    // No generic templates: unknown products intentionally show a neutral placeholder
    // until a specific scope is defined.
    return {
      includes: [
        "Public service scope for this product has not been published yet."
      ],
      deliverables: [
        "Deliverables are provided during direct inquiry."
      ],
      flow: [
        "Use the request/contact flow to receive a product-specific breakdown."
      ],
      bestFit: [
        "Best-fit guidance will be added once this product has a finalized offer structure."
      ]
    };
  }
})();
