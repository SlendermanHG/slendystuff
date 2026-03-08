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

    if (tagline) tagline.textContent = config.brand.tagline;
    if (heroTitle) heroTitle.textContent = config.brand.heroTitle;
    if (heroSubtitle) heroSubtitle.textContent = config.brand.heroSubtitle;

    renderProducts(config.products || []);
    initFunZone(config.products || []);

    app.track("page_view", { page: "home" });
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

  function initFunZone(products) {
    const rollIdeaButton = document.querySelector("[data-fun-roll-idea]");
    const rollPricingButton = document.querySelector("[data-fun-roll-pricing]");
    const ideaResult = document.querySelector("[data-fun-idea-result]");
    const pricingResult = document.querySelector("[data-fun-pricing-result]");

    if (rollIdeaButton && ideaResult) {
      rollIdeaButton.addEventListener("click", () => {
        const categories = [...new Set((products || []).map((item) => item.category).filter(Boolean))];
        const category = categories[Math.floor(Math.random() * categories.length)] || "Automation";
        const hooks = [
          "starter setup + paid monthly management",
          "one-time install + annual support renewal",
          "niche-specific dashboard + premium analytics add-on",
          "done-for-you deployment + optional training package",
          "low-ticket entry tool + upsell to managed service"
        ];
        const hook = hooks[Math.floor(Math.random() * hooks.length)];
        const message = `Build a ${category} offer with ${hook}.`;
        ideaResult.textContent = message;
        app.track("fun_zone_roll_idea", { category });
      });
    }

    if (rollPricingButton && pricingResult) {
      rollPricingButton.addEventListener("click", () => {
        const patterns = [
          "3-tier stack: Lite / Pro / Managed",
          "One-time setup fee + recurring optimization plan",
          "Monthly base + performance bonus tier",
          "Starter bundle + feature packs",
          "Per-seat plan + enterprise support retainer"
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
