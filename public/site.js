(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);

    document.title = `${config.brand.name} | Adaptive Build Systems`;

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
      mount.innerHTML = "<p class='muted'>No products are live right now. Check back soon or open a custom build request.</p>";
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
              : '<span class="badge">General Access</span>';

            return `
              <article class="card" id="product-${escapeHtml(item.id)}">
                <p class="eyebrow">${escapeHtml(item.category || "Offer")}</p>
                <h3>${escapeHtml(item.title)}</h3>
                <p class="muted">${escapeHtml(item.summary)}</p>
                <div class="product-meta">
                  <strong>${escapeHtml(item.priceLabel || "Custom Quote")}</strong>
                  ${adultBadge}
                </div>
                <div class="product-actions">
                  <a class="btn" href="/product.html?id=${encodeURIComponent(item.id)}" data-action="product_open" data-product-id="${escapeHtml(item.id)}">Open Product</a>
                  <a class="btn btn-ghost" href="${escapeHtml(item.ctaUrl || "#")}" target="_blank" rel="noopener" data-action="product_cta" data-product-id="${escapeHtml(item.id)}">${escapeHtml(item.ctaLabel || "Get Quote")}</a>
                </div>
              </article>
            `;
          })
          .join("\n");

        return `
          <section class="section" id="cat-${slugify(category)}">
            <div class="section-head">
              <p class="eyebrow">System Lane</p>
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
      "pos-suite": "Built to tighten retail flow, reduce operator friction, and improve daily revenue visibility.",
      "system-optimizer": "Built to recover performance headroom and keep systems stable under real workload pressure.",
      "discord-bot-kit": "Built to automate repetitive moderator tasks and keep communities responsive.",
      "dnd5e-campaign-scribe": "Built to preserve campaign continuity with fast recap, initiative, and quest tracking.",
      "remote-control-limited": "Built for controlled endpoint operations with clear approvals and full action traceability."
    };

    const outcome = outcomeLines[newest.id] || "Built to deliver practical outcomes with a clear implementation path.";

    mount.innerHTML = `
      <article class="card">
        <p class="eyebrow">Latest Release</p>
        <h3>${escapeHtml(newest.title)}</h3>
        <p class="muted">${escapeHtml(newest.summary || "New listing just published.")}</p>
        <p class="muted">${escapeHtml(outcome)}</p>
        <div class="kicker-row">
          <span class="kicker">${escapeHtml(newest.category || "Product")}</span>
          <span class="kicker">${escapeHtml(newest.priceLabel || "Custom Pricing")}</span>
        </div>
        <div class="inline-actions">
          <a class="btn" href="/product.html?id=${encodeURIComponent(newest.id)}">Open Release</a>
          <a class="btn btn-ghost" href="/products.html">View Full Catalog</a>
        </div>
      </article>
    `;
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
