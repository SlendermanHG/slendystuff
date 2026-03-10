(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const contentNode = document.querySelector("[data-product-content]");
  const notFoundNode = document.querySelector("[data-product-not-found]");

  const PRODUCT_DETAILS = {
    "pos-suite": {
      positioning: "Purpose-built checkout and back-counter workflow for local retail teams that need less click-chaos and faster lane throughput.",
      bestFor: [
        "Independent retail stores and pop-up teams with 1-5 registers",
        "Shops replacing spreadsheet inventory with structured checkout flow",
        "Owners who need cleaner daily closeout and simpler training"
      ],
      includedDeliverables: [
        "Checkout flow map with role-based lane actions",
        "Item and category mapping template",
        "Receipt formatting and tax-rule checkpoints",
        "Shift-close checklist and daily summary export",
        "Support handoff notes for future updates"
      ],
      implementationPhases: [
        "Discovery: map current lane pain points and failure moments",
        "Build: deploy optimized checkout and inventory touchpoints",
        "Validation: dry-run with live-like transaction scenarios",
        "Launch: switch-over plan with same-day support window"
      ],
      comparableLocalProjects: [
        {
          label: "Ohio Valley corner market workflow reset",
          scope: "Two-lane checkout cleanup + inventory category realignment",
          before: "Frequent price mismatches, delayed shift close, manual reconciliation.",
          after: "Faster lane transitions, cleaner closeout routine, fewer register corrections."
        },
        {
          label: "Regional hobby shop point-of-sale tune",
          scope: "SKU grouping, receipt clarity, quick-item shortcuts",
          before: "Staff relied on memory and ad-hoc key patterns.",
          after: "Consistent cashier flow, lower training ramp time, improved speed at rush."
        }
      ],
      riskControls: [
        "Rollout staged so existing checkout can be restored quickly if needed",
        "Change windows planned around peak and weekend traffic",
        "Data mapping reviewed before go-live to reduce SKU mismatch risk"
      ],
      faqs: [
        {
          q: "Do we have to replace our whole system?",
          a: "No. Most builds start by stabilizing your current flow first, then replacing only what hurts throughput."
        },
        {
          q: "How fast can this go live?",
          a: "A focused local deployment can be staged quickly once product mapping is complete."
        }
      ]
    },
    "system-optimizer": {
      positioning: "Deep cleanup and stability hardening for Windows systems that feel bogged down, inconsistent, or unreliable during daily work.",
      bestFor: [
        "Local creators and operators with aging Windows environments",
        "Teams seeing startup delay, random hangs, or noisy background load",
        "Users who need practical improvement without a full rebuild"
      ],
      includedDeliverables: [
        "Performance baseline snapshot before changes",
        "Startup/load-path optimization pass",
        "Service/process tuning recommendations",
        "Storage health and cleanup strategy",
        "Post-reset maintenance checklist"
      ],
      implementationPhases: [
        "Audit: identify bottlenecks and conflict clusters",
        "Remediation: remove friction layers and tune key services",
        "Stability pass: test real workload scenarios",
        "Handoff: action plan for maintaining gains"
      ],
      comparableLocalProjects: [
        {
          label: "Belmont County home office speed recovery",
          scope: "Startup sequence cleanup + storage pressure reduction",
          before: "10+ minute startup and recurring app freezes.",
          after: "Faster boot, consistent desktop responsiveness, fewer lockups."
        },
        {
          label: "Small-team admin workstation reset",
          scope: "Background task trimming and update pipeline cleanup",
          before: "System lag during normal multitasking.",
          after: "Smoother app switching and steadier daily usage."
        }
      ],
      riskControls: [
        "High-risk changes require confirmation checkpoints",
        "Stability checkpoints before and after each tuning block",
        "Change notes provided so future issues are easier to trace"
      ],
      faqs: [
        {
          q: "Will files be touched?",
          a: "The focus is system performance and stability; personal files are not the target."
        },
        {
          q: "Is this one-time or ongoing?",
          a: "You can run one reset pass, then choose ongoing maintenance if needed."
        }
      ]
    },
    "discord-bot-kit": {
      positioning: "One-time Discord automation build for communities that need moderation consistency, faster support loops, and cleaner member workflow.",
      bestFor: [
        "Growing local communities with volunteer mod teams",
        "Creators needing repeatable support and role workflows",
        "Servers where manual moderation consumes too much time",
        "Returning Slendy clients who want a discounted remodel of a previous Slendy-built bot"
      ],
      includedDeliverables: [
        "Command and permission map by role",
        "Moderation and escalation rule setup",
        "Support ticket or intake flow starter",
        "Announcement and reminder automations",
        "Admin documentation for future edits",
        "Optional remodel path with owner-issued upgrade discount code validation"
      ],
      implementationPhases: [
        "Scope: identify must-have workflows and abuse vectors",
        "Build: configure commands, automations, and role safety",
        "Dry-run: test with sample user paths and mod actions",
        "Launch: activate with monitored support window"
      ],
      comparableLocalProjects: [
        {
          label: "Ohio gaming community moderation lift",
          scope: "Role-based automod and support intake routes",
          before: "Manual moderation backlog and unclear handoffs.",
          after: "Cleaner mod queue and faster response consistency."
        },
        {
          label: "Creator support server workflow tune",
          scope: "Announcement scheduling + command simplification",
          before: "Admins repeated routine tasks multiple times daily.",
          after: "Automation reduced repetitive admin effort."
        }
      ],
      riskControls: [
        "Permission boundaries reviewed before enabling commands",
        "Moderation automations tuned conservatively first",
        "Rollback profile kept for quick correction"
      ],
      faqs: [
        {
          q: "Can this work with existing bots?",
          a: "Yes, integration planning is done upfront to avoid command collisions."
        },
        {
          q: "Is this monthly or one-time?",
          a: "Discord Bot Kit is sold as a one-time build. Ongoing changes are optional."
        },
        {
          q: "How does remodel pricing work?",
          a: "If your current bot was previously built by Slendy, enter your owner-issued remodel code at checkout for upgrade discount eligibility."
        },
        {
          q: "How customizable is it after launch?",
          a: "Very. The kit is structured for iterative changes as your server evolves."
        }
      ]
    },
    "remote-control-limited": {
      positioning: "Guardrailed remote automation for approved workflows where control, auditability, and change safety are mandatory.",
      bestFor: [
        "Teams with strict workflow constraints and controlled environments",
        "Use cases needing automation with clear operational boundaries",
        "Operators who require transparent oversight and logs"
      ],
      includedDeliverables: [
        "Approved use-case scope and boundary definition",
        "Execution guardrails and rollback strategy",
        "Operator-level control and pause mechanics",
        "Action log structure and review cadence",
        "Ongoing policy alignment checkpoints"
      ],
      implementationPhases: [
        "Qualification: confirm workflow fit and risk profile",
        "Design: define strict control boundaries",
        "Implementation: build monitored automation path",
        "Review: validate behavior and approve production usage"
      ],
      comparableLocalProjects: [
        {
          label: "Regional operations desk controlled automation",
          scope: "Limited command automation with explicit authorization gates",
          before: "Manual repetitive control tasks and inconsistent timing.",
          after: "More consistent execution with visibility into each action path."
        },
        {
          label: "Small-office remote maintenance workflow",
          scope: "Scheduled maintenance triggers with operator confirmation",
          before: "Patch and routine controls were ad hoc.",
          after: "Controlled sequence reduced drift and missed steps."
        }
      ],
      riskControls: [
        "Eligibility review before activation",
        "Operator confirmation for sensitive actions",
        "Logging and audit trail included in delivery"
      ],
      faqs: [
        {
          q: "Why is this limited?",
          a: "Because safety and accountability come first in remote-control workflows."
        },
        {
          q: "Do all requests get approved?",
          a: "No. Requests are vetted against scope, risk, and policy alignment."
        }
      ]
    }
  };

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);

    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name;
    });

    const params = new URLSearchParams(window.location.search);
    const productIdFromQuery = params.get("id");
    const productIdFromPage = document.body.getAttribute("data-product-id");
    const productId = productIdFromQuery || productIdFromPage;

    const product = (config.products || []).find((item) => item.id === productId);
    if (!product) {
      if (contentNode) contentNode.classList.add("hidden");
      if (notFoundNode) notFoundNode.classList.remove("hidden");
      app.track("product_not_found", { productId: productId || "empty" });
      return;
    }

    document.title = `${product.title} | ${config.brand.name || "slendystuff"}`;

    const allow = !product.requires18Plus || (await app.promptAgeGate(product.id));
    if (!allow) {
      if (contentNode) {
        contentNode.innerHTML = `
          <article class="card">
            <h2>Age Confirmation Required</h2>
            <p class="muted">This item is available only to visitors who are 18 or older.</p>
            <a class="btn" href="/">Return Home</a>
          </article>
        `;
      }
      return;
    }

    if (contentNode) {
      const detail = PRODUCT_DETAILS[product.id] || null;
      contentNode.innerHTML = renderDetailedProductPage(product, detail);

      const checkoutButton = contentNode.querySelector("[data-track='product_checkout']");
      if (checkoutButton) {
        checkoutButton.addEventListener("click", () => {
          app.addToCart(product.id, 1);
          app.track("product_checkout", { productId: product.id, source: "product_page" });
        });
      }

      const addToCartButton = contentNode.querySelector("[data-track='add_to_cart']");
      if (addToCartButton) {
        addToCartButton.addEventListener("click", () => {
          app.addToCart(product.id, 1);
          app.track("product_add_to_cart", { productId: product.id });
          addToCartButton.textContent = "Added";
          setTimeout(() => {
            addToCartButton.textContent = "Add To Cart";
          }, 1400);
        });
      }

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

  function renderDetailedProductPage(product, detail) {
    const d = detail || {
      positioning: "Detailed delivery profile coming soon.",
      bestFor: [],
      includedDeliverables: [],
      implementationPhases: [],
      comparableLocalProjects: [],
      riskControls: [],
      faqs: []
    };

    const supportUrl = normalizeNonStripeUrl(product.ctaUrl || "/support.html");

    return `
      <article class="card">
        <p class="eyebrow">${escapeHtml(product.category)}</p>
        <h1>${escapeHtml(product.title)}</h1>
        <p class="muted">${escapeHtml(product.summary)}</p>
        <p>${escapeHtml(d.positioning)}</p>
        <div class="kicker-row">
          <span class="kicker">${escapeHtml(product.priceLabel || "")}</span>
          ${product.requires18Plus ? '<span class="kicker">18+ Verified</span>' : '<span class="kicker">All Ages</span>'}
          <span class="kicker">Itemized cart checkout</span>
        </div>
        <div class="inline-actions">
          <a class="btn" href="${escapeHtml(app.getCheckoutPageUrl(product.id))}" data-track="product_checkout">Add And Checkout Cart</a>
          <button class="btn btn-ghost" type="button" data-track="add_to_cart">Add To Cart</button>
          <a class="btn btn-ghost" href="/cart.html">Open Cart</a>
          <a class="btn btn-ghost" href="${escapeHtml(supportUrl)}" data-track="product_cta">${escapeHtml(product.ctaLabel || "Need setup help?")}</a>
        </div>
      </article>

      <section class="section">
        <div class="section-head">
          <p class="eyebrow">Best Fit</p>
          <h2>Who this works best for</h2>
        </div>
        <article class="card note-card">
          ${renderList(d.bestFor)}
        </article>
      </section>

      <section class="section">
        <div class="section-head">
          <p class="eyebrow">Delivery Scope</p>
          <h2>What is included</h2>
        </div>
        <div class="grid two">
          <article class="card">
            <h3>Included deliverables</h3>
            ${renderList(d.includedDeliverables)}
          </article>
          <article class="card">
            <h3>Implementation phases</h3>
            ${renderList(d.implementationPhases)}
          </article>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <p class="eyebrow">Comparable Local Projects</p>
          <h2>Project profiles with similar scope</h2>
          <p class="muted">Anonymized examples to show realistic local implementation patterns.</p>
        </div>
        <div class="grid two">
          ${Array.isArray(d.comparableLocalProjects) && d.comparableLocalProjects.length
            ? d.comparableLocalProjects
                .map(
                  (project) => `
                    <article class="card tilt-card">
                      <h3>${escapeHtml(project.label || "Comparable project")}</h3>
                      <p><strong>Scope:</strong> ${escapeHtml(project.scope || "-")}</p>
                      <p><strong>Before:</strong> ${escapeHtml(project.before || "-")}</p>
                      <p><strong>After:</strong> ${escapeHtml(project.after || "-")}</p>
                    </article>
                  `
                )
                .join("")
            : "<article class='card'><p class='muted'>Comparable project profiles will be published shortly.</p></article>"}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <p class="eyebrow">Risk Controls</p>
          <h2>How risk is managed during rollout</h2>
        </div>
        <article class="card">
          ${renderList(d.riskControls)}
        </article>
      </section>

      <section class="section">
        <div class="section-head">
          <p class="eyebrow">FAQ</p>
          <h2>Questions people ask before buying</h2>
        </div>
        <div class="grid two">
          ${Array.isArray(d.faqs) && d.faqs.length
            ? d.faqs
                .map(
                  (faq) => `
                    <article class="card note-card">
                      <h3>${escapeHtml(faq.q || "Question")}</h3>
                      <p>${escapeHtml(faq.a || "")}</p>
                    </article>
                  `
                )
                .join("")
            : "<article class='card'><p class='muted'>FAQ data pending.</p></article>"}
        </div>
      </section>
    `;
  }

  function renderList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "<p class='muted'>Details are being prepared.</p>";
    }
    return `<ul class="list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeNonStripeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "/support.html";
    }

    try {
      const parsed = new URL(raw, window.location.origin);
      if (/stripe\.com$/i.test(parsed.hostname) || /\.stripe\.com$/i.test(parsed.hostname)) {
        return "/checkout.html";
      }
      return parsed.pathname === "/"
        ? `${parsed.origin}/`
        : parsed.href.startsWith(window.location.origin)
          ? `${parsed.pathname}${parsed.search}${parsed.hash}`
          : parsed.href;
    } catch {
      return raw.startsWith("/") ? raw : "/support.html";
    }
  }
})();
