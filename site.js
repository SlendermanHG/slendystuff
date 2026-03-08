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
      "remote-control-limited": "Operational outcome: controlled remote automation with explicit boundaries and clear auditability."
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

    if (rollIdeaButton && ideaResult) {
      rollIdeaButton.addEventListener("click", () => {
        const categories = [...new Set((products || []).map((item) => item.category).filter(Boolean))];
        const category = categories[Math.floor(Math.random() * categories.length)] || "Automation";
        const audiences = [
          "small operations teams",
          "creators and community owners",
          "managed service clients",
          "high-volume support teams",
          "multi-location operators"
        ];
        const coreOffers = [
          "phase-based implementation package + optimization retainer",
          "core product deployment + paid expansion modules",
          "workflow automation stack + reporting dashboard add-on",
          "done-for-you launch + managed maintenance cycle",
          "foundation build + premium support SLA"
        ];
        const deliveryModes = [
          "two-week discovery and architecture sprint",
          "measured MVP release followed by phased feature drops",
          "pilot rollout with usage analytics feedback loop",
          "high-priority launch path with post-launch hardening",
          "modular rollout matched to business-critical workflows"
        ];

        const audience = audiences[Math.floor(Math.random() * audiences.length)];
        const offer = coreOffers[Math.floor(Math.random() * coreOffers.length)];
        const delivery = deliveryModes[Math.floor(Math.random() * deliveryModes.length)];
        const message = `Offer Concept: ${category} solution for ${audience}.\nMonetization: ${offer}.\nExecution Path: ${delivery}.`;
        ideaResult.textContent = message;
        app.track("fun_zone_roll_idea", { category });
      });
    }

    if (rollPricingButton && pricingResult) {
      rollPricingButton.addEventListener("click", () => {
        const patterns = [
          "3-tier structure: Foundation / Scale / Managed Ops with response-time guarantees.",
          "Implementation fee + monthly optimization retainer + optional emergency support block.",
          "Base plan + usage-triggered expansion modules tied to measurable ROI milestones.",
          "Starter package + premium integration bundle + quarterly tuning cycle.",
          "Per-team plan + enterprise governance add-on + dedicated launch concierge."
        ];
        const pick = patterns[Math.floor(Math.random() * patterns.length)];
        pricingResult.textContent = pick;
        app.track("fun_zone_roll_pricing", { pattern: pick });
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
