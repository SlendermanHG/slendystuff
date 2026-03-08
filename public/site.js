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
    renderStripeLinks(config.stripeLinks || {});

    app.track("page_view", { page: "home" });
  } catch (error) {
    const mount = document.querySelector("[data-products-mount]");
    if (mount) {
      mount.innerHTML = `<p class="status error">${error.message}</p>`;
    }
  }

  function renderStripeLinks(links) {
    const starter = document.querySelector("[data-stripe='starter']");
    const pro = document.querySelector("[data-stripe='pro']");
    const reset = document.querySelector("[data-stripe='reset']");

    if (starter) starter.href = links.starter || "#";
    if (pro) pro.href = links.pro || "#";
    if (reset) reset.href = links.reset || "#";
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