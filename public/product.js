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
          </div>
        </article>
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
})();