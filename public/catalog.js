(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const statusNode = document.querySelector("[data-catalog-status]");
  const byTypeNode = document.querySelector("[data-catalog-by-type]");
  const byUseNode = document.querySelector("[data-catalog-by-use]");
  const cartCountNode = document.querySelector("[data-cart-count]");

  updateCartCount();

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);

    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name || "slendystuff";
    });

    renderByType(config.products || [], config);
    renderByUseCase(config.products || [], config);
    setStatus("Catalog ready. Add items to cart or checkout immediately.", "ok");
    app.track("page_view", { page: "catalog" });
  } catch (error) {
    setStatus(error.message || "Could not load catalog right now.", "error");
  }

  function renderByType(products, config) {
    if (!byTypeNode) {
      return;
    }

    if (!Array.isArray(products) || products.length === 0) {
      byTypeNode.innerHTML = "<p class='muted'>No catalog items available right now.</p>";
      return;
    }

    const groups = products.reduce((acc, item) => {
      const key = String(item.category || "Other").trim() || "Other";
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});

    byTypeNode.innerHTML = Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map((category) => {
        const cards = groups[category].map((product) => renderCard(product, config)).join("");
        return `
          <section class="section">
            <div class="section-head">
              <p class="eyebrow">Type</p>
              <h3>${escapeHtml(category)}</h3>
            </div>
            <div class="grid two">${cards}</div>
          </section>
        `;
      })
      .join("");

    bindCardActions(config);
  }

  function renderByUseCase(products, config) {
    if (!byUseNode) {
      return;
    }

    if (!Array.isArray(products) || products.length === 0) {
      byUseNode.innerHTML = "<p class='muted'>No use-case data yet.</p>";
      return;
    }

    const buckets = {};
    products.forEach((product) => {
      const useCase = classifyUseCase(product);
      buckets[useCase] = buckets[useCase] || [];
      buckets[useCase].push(product);
    });

    byUseNode.innerHTML = Object.keys(buckets)
      .sort((a, b) => a.localeCompare(b))
      .map((useCase) => {
        const cards = buckets[useCase].map((product) => renderCard(product, config)).join("");
        return `
          <section class="section">
            <div class="section-head">
              <p class="eyebrow">Use Case</p>
              <h3>${escapeHtml(useCase)}</h3>
            </div>
            <div class="grid two">${cards}</div>
          </section>
        `;
      })
      .join("");

    bindCardActions(config);
  }

  function renderCard(product, config) {
    const productUrl = app.getProductPageUrl(product.id);
    const checkoutUrl = "/checkout.html";
    return `
      <article class="card tilt-card">
        <p class="eyebrow">${escapeHtml(product.category || "Offer")}</p>
        <h3>${escapeHtml(product.title || "Untitled Product")}</h3>
        <p class="muted">${escapeHtml(product.summary || "")}</p>
        <div class="product-meta">
          <strong>${escapeHtml(product.priceLabel || "Pricing unavailable")}</strong>
          <span class="badge">${product.requires18Plus ? "18+ Gate" : "General Access"}</span>
        </div>
        <div class="inline-actions">
          <a class="btn" href="${escapeHtml(productUrl)}">View Product Page</a>
          <button class="btn btn-ghost" type="button" data-add-to-cart="${escapeHtml(product.id)}">Add To Cart</button>
          <a class="btn btn-ghost" href="${escapeHtml(checkoutUrl)}" data-direct-checkout="${escapeHtml(product.id)}">Checkout</a>
        </div>
      </article>
    `;
  }

  function bindCardActions(config) {
    document.querySelectorAll("[data-add-to-cart]").forEach((button) => {
      button.addEventListener("click", () => {
        const productId = button.getAttribute("data-add-to-cart");
        app.addToCart(productId, 1);
        updateCartCount();
        app.track("catalog_add_to_cart", { productId });
        setStatus("Added to cart.", "ok");
      });
    });

    document.querySelectorAll("[data-direct-checkout]").forEach((link) => {
      link.addEventListener("click", () => {
        const productId = link.getAttribute("data-direct-checkout");
        app.addToCart(productId, 1);
        app.track("catalog_direct_checkout", { productId, flow: "cart_to_stripe" });
      });
    });
  }

  function classifyUseCase(product) {
    const text = `${String(product.title || "")} ${String(product.summary || "")}`.toLowerCase();
    if (text.includes("pos") || text.includes("checkout") || text.includes("operations")) {
      return "Retail and Operations Flow";
    }
    if (text.includes("speed") || text.includes("stability") || text.includes("optimiz")) {
      return "Performance and System Reliability";
    }
    if (text.includes("discord") || text.includes("moderation") || text.includes("community")) {
      return "Community Automation";
    }
    if (text.includes("remote") || text.includes("managed")) {
      return "Controlled Remote Workflows";
    }
    return "General Productivity";
  }

  function updateCartCount() {
    if (!cartCountNode) {
      return;
    }
    const count = app.getCart().reduce((total, item) => total + Number(item.qty || 0), 0);
    cartCountNode.textContent = String(count);
  }

  function setStatus(message, state = "") {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = message;
    statusNode.className = state ? `status ${state}` : "status";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
