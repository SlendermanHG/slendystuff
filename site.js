(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);

    document.title = `${config.brand.name} | Versatile Programs and Bots`;

    const brandTargets = document.querySelectorAll("[data-brand-name]");
    brandTargets.forEach((node) => {
      node.textContent = config.brand.name;
    });

    const tagline = document.querySelector("[data-tagline]");
    const heroTitle = document.querySelector("[data-hero-title]");
    const heroSubtitle = document.querySelector("[data-hero-subtitle]");
    const productsMount = document.querySelector("[data-products-mount]");
    const newestMount = document.querySelector("[data-newest-product]");

    if (tagline) tagline.textContent = config.brand.tagline;
    if (heroTitle) heroTitle.textContent = config.brand.heroTitle;
    if (heroSubtitle) heroSubtitle.textContent = config.brand.heroSubtitle;

    if (productsMount) {
      renderProducts(config.products || []);
    }
    if (newestMount) {
      renderNewestProduct(config.products || []);
    }
    initFunZone(config.products || []);

    app.track("page_view", {
      page: productsMount ? "products" : "home"
    });
  } catch (error) {
    const mount = document.querySelector("[data-products-mount]");
    if (mount) {
      mount.innerHTML = `<p class="status error">${error.message}</p>`;
    }
  }

  function renderProducts(products) {
    const mount = document.querySelector("[data-products-mount]");
    if (!mount) {
      return;
    }

    if (!products.length) {
      mount.innerHTML = "<p class='muted'>No products configured yet. Use the admin page to add your first listing.</p>";
      return;
    }

    const groups = products.reduce((acc, item) => {
      const category = item.category || "Uncategorized";
      acc[category] = acc[category] || [];
      acc[category].push(item);
      return acc;
    }, {});

    const categories = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    const html = categories
      .map((category) => {
        const cards = groups[category]
          .map((item) => {
            const adultBadge = item.requires18Plus
              ? '<span class="badge warning">18+ Verification</span>'
              : '<span class="badge">All Ages</span>';

            return `
              <article class="card" id="product-${escapeHtml(item.id)}">
                <h3>${escapeHtml(item.title)}</h3>
                <p class="muted">${escapeHtml(item.summary)}</p>
                <div class="product-meta">
                  <strong>${escapeHtml(item.priceLabel || "")}</strong>
                  ${adultBadge}
                </div>
                <div class="product-actions">
                  <a class="btn" href="/product.html?id=${encodeURIComponent(item.id)}" data-action="product_open" data-product-id="${escapeHtml(item.id)}">View Details</a>
                  <a class="btn btn-ghost" href="${escapeHtml(item.ctaUrl || "#")}" target="_blank" rel="noopener" data-action="product_cta" data-product-id="${escapeHtml(item.id)}">${escapeHtml(item.ctaLabel || "Learn More")}</a>
                </div>
              </article>
            `;
          })
          .join("\n");

        return `
          <section class="section" id="cat-${slugify(category)}">
            <div class="section-head">
              <p class="eyebrow">Category</p>
              <h2>${escapeHtml(category)}</h2>
            </div>
            <div class="grid two">${cards}</div>
          </section>
        `;
      })
      .join("\n");

    mount.innerHTML = html;

    mount.querySelectorAll("[data-action]").forEach((node) => {
      node.addEventListener("click", () => {
        app.track(node.dataset.action, {
          productId: node.dataset.productId || "unknown"
        });
      });
    });
  }

  function renderNewestProduct(products) {
    const mount = document.querySelector("[data-newest-product]");
    if (!mount) {
      return;
    }

    if (!Array.isArray(products) || products.length === 0) {
      mount.innerHTML = "<p class='muted'>No products published yet.</p>";
      return;
    }

    const newest = products[products.length - 1] || products[0];
    const outcomeLines = {
      "pos-suite": "Operational outcome: cleaner transaction flow, faster staff onboarding, and better reporting confidence.",
      "system-optimizer": "Operational outcome: faster systems, lower performance drag, and repeatable maintenance cadence.",
      "discord-bot-kit": "Operational outcome: stronger community workflows, faster moderation, and better member experience.",
      "dnd5e-campaign-scribe": "Operational outcome: smoother sessions, less note chaos, and stronger campaign continuity for both DM and players.",
      "remote-control-limited": "Operational outcome: controlled endpoint/computer management automation with explicit boundaries and clear auditability."
    };
    const outcome = outcomeLines[newest.id] || "Operational outcome: purpose-built delivery aligned to real workflow goals.";
    mount.innerHTML = `
      <article class="card">
        <p class="eyebrow">Newest Product</p>
        <h3>${escapeHtml(newest.title)}</h3>
        <p class="muted">${escapeHtml(newest.summary || "New listing just published.")}</p>
        <p class="muted">${escapeHtml(outcome)}</p>
        <div class="kicker-row">
          <span class="kicker">${escapeHtml(newest.category || "Product")}</span>
          <span class="kicker">${escapeHtml(newest.priceLabel || "Custom Pricing")}</span>
        </div>
        <div class="inline-actions">
          <a class="btn" href="/product.html?id=${encodeURIComponent(newest.id)}">View Details</a>
          <a class="btn btn-ghost" href="/products.html">Browse All Products</a>
        </div>
      </article>
    `;
  }

  function initFunZone(products) {
    const rollIdeaButton = document.querySelector("[data-fun-roll-idea]");
    const rollPricingButton = document.querySelector("[data-fun-roll-pricing]");
    const ideaResult = document.querySelector("[data-fun-idea-result]");
    const pricingResult = document.querySelector("[data-fun-pricing-result]");
    const industryInput = document.querySelector("[data-fun-industry]");
    const outcomeInput = document.querySelector("[data-fun-outcome]");
    const budgetInput = document.querySelector("[data-fun-budget]");
    const timelineInput = document.querySelector("[data-fun-timeline]");
    const volumeInput = document.querySelector("[data-fun-pricing-volume]");
    const supportInput = document.querySelector("[data-fun-pricing-support]");
    const riskInput = document.querySelector("[data-fun-pricing-risk]");
    const offerInput = document.querySelector("[data-fun-pricing-offer]");

    if (rollIdeaButton && ideaResult) {
      rollIdeaButton.addEventListener("click", () => {
        const industry = industryInput ? industryInput.value : "Business";
        const outcome = outcomeInput ? outcomeInput.value : "Increase Sales";
        const budget = budgetInput ? budgetInput.value : "starter";
        const timelineDays = Number(timelineInput ? timelineInput.value : "14");
        const budgetLabelMap = {
          starter: "starter budget",
          growth: "growth budget",
          scale: "scale budget"
        };
        const audienceMap = {
          Retail: "store owners and front-line staff",
          Creator: "fans, subscribers, and buyers",
          Service: "leads and returning clients",
          Community: "members and moderators",
          Operations: "internal staff and managers"
        };
        const deliveryMap = {
          7: "fast launch sprint",
          14: "rapid two-week build",
          30: "month-long production rollout",
          60: "phased release with testing gates"
        };
        const offerTemplates = [
          "Create a compact onboarding flow that turns first-time visitors into qualified leads.",
          "Launch a done-for-you automation pack that removes repeat manual work from your team.",
          "Introduce a support-focused workflow that resolves issues faster and reduces churn.",
          "Deploy a conversion playbook that combines product education with guided checkout steps."
        ];
        const firstStepTemplates = [
          "Map the top 3 customer frustrations and convert each into one clear feature.",
          "Publish one focused landing offer and route visitors to a single next action.",
          "Set up a support response sequence with one-hour acknowledgement and follow-up checkpoints.",
          "Create a weekly performance review using traffic, conversion, and request volume data."
        ];
        const conversionHooks = [
          "limited-time onboarding bonus",
          "priority implementation slot",
          "free setup audit for first clients",
          "quarterly optimization add-on"
        ];

        const productList = Array.isArray(products) ? products : [];
        const productPool = productList.length ? productList : [{ id: "", title: "Custom Build", category: "Custom" }];
        const matchedByOutcome = productPool.filter((item) => {
          const category = String(item.category || "").toLowerCase();
          if (outcome.includes("Support")) {
            return category.includes("remote") || category.includes("bot");
          }
          if (outcome.includes("Manual")) {
            return category.includes("program") || category.includes("automation");
          }
          if (outcome.includes("Retention")) {
            return category.includes("bot") || category.includes("service");
          }
          return true;
        });
        const pool = matchedByOutcome.length ? matchedByOutcome : productPool;
        const product = pool[Math.floor(Math.random() * pool.length)];
        const offer = offerTemplates[Math.floor(Math.random() * offerTemplates.length)];
        const firstStep = firstStepTemplates[Math.floor(Math.random() * firstStepTemplates.length)];
        const hook = conversionHooks[Math.floor(Math.random() * conversionHooks.length)];
        const actionUrl = product.id ? `/product.html?id=${encodeURIComponent(product.id)}` : "/custom-tool.html";
        const actionLabel = product.id ? `Open ${product.title}` : "Open Custom Build Intake";
        const message = [
          `Adventure Brief (${industry} | ${budgetLabelMap[budget] || "starter budget"} | ${timelineDays}-day target)`,
          "",
          `1) Offer Direction`,
          `${offer}`,
          "",
          `2) Best Audience`,
          `Focus on ${audienceMap[industry] || "your highest-value buyer segment"} with a promise tied to "${outcome}".`,
          "",
          `3) First Week Action Plan`,
          `- Day 1-2: ${firstStep}`,
          `- Day 3-4: Build and publish the offer page with one clear CTA.`,
          `- Day 5-7: Run outreach + support follow-up and measure response quality.`,
          "",
          `4) Conversion Hook`,
          `Use a ${hook} to drive early decisions without heavy discounting.`,
          "",
          `5) Suggested Starting Product`,
          `${product.title} (${product.category || "Custom"})`,
          `Next Step: ${actionLabel} -> ${actionUrl}`
        ].join("\n");
        ideaResult.textContent = message;
        app.track("fun_zone_roll_idea", {
          industry,
          outcome,
          budget,
          timelineDays,
          suggestedProduct: product.id || "custom"
        });
      });
    }

    if (rollPricingButton && pricingResult) {
      rollPricingButton.addEventListener("click", () => {
        const volume = volumeInput ? volumeInput.value : "low";
        const support = supportInput ? supportInput.value : "standard";
        const risk = riskInput ? riskInput.value : "balanced";
        const offer = offerInput ? offerInput.value : "program";

        const volumeBaseMap = { low: 79, mid: 179, high: 379 };
        const supportMultiplierMap = { light: 1, standard: 1.35, priority: 1.7 };
        const riskMultiplierMap = { safe: 1.15, balanced: 1, aggressive: 0.9 };
        const offerLabels = {
          program: "Software Program",
          bot: "Bot / Automation",
          managed: "Managed Service"
        };
        const testHooks = {
          safe: "90-day reliability promise",
          balanced: "7-day onboarding bonus",
          aggressive: "48-hour fast-start offer"
        };

        const roundPrice = (value) => Math.max(25, Math.round(value / 5) * 5);
        const base = volumeBaseMap[volume] || 79;
        const supportFactor = supportMultiplierMap[support] || 1.35;
        const riskFactor = riskMultiplierMap[risk] || 1;
        const starter = roundPrice(base * supportFactor * riskFactor);
        const growth = roundPrice(starter * 2.1);
        const premium = roundPrice(starter * 3.4);
        const setupFee = roundPrice(starter * 1.4);
        const rushBlock = roundPrice(starter * 0.55);
        const message = [
          `Pricing Blueprint (${offerLabels[offer] || "Offer"} | ${volume} volume | ${support} support)`,
          "",
          `1) Entry Offer`,
          `$${starter}/mo + $${setupFee} setup`,
          `Includes core delivery, reporting snapshot, and support response baseline.`,
          "",
          `2) Growth Offer`,
          `$${growth}/mo`,
          `Adds optimization cycles, advanced automation, and outcome reviews.`,
          "",
          `3) Premium Offer`,
          `$${premium}/mo`,
          `Adds priority queue, strategic roadmap calls, and dedicated implementation windows.`,
          "",
          `4) Optional Add-On`,
          `$${rushBlock} emergency/rush support block (one-time).`,
          "",
          `5) Conversion Test Plan`,
          `- Test Hook: ${testHooks[risk] || "7-day onboarding bonus"}`,
          `- Compare monthly plan vs annual prepay with a 10% incentive.`,
          `- Put the offer in front of support and product pages, then track close rate by source.`,
          "",
          `Next Step: Open /custom-tool.html to request a custom quote using this structure.`
        ].join("\n");

        pricingResult.textContent = message;
        app.track("fun_zone_roll_pricing", { volume, support, risk, offer, starter, growth, premium });
      });
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

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
})();
