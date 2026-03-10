(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const mount = document.querySelector("[data-cart-mount]");
  const statusNode = document.querySelector("[data-cart-status]");
  const clearButton = document.querySelector("[data-clear-cart]");
  let config = null;

  try {
    config = await app.fetchPublicConfig();
    app.injectAnalytics(config);
    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name || "slendystuff";
    });
  } catch {
    // Continue with fallback mode.
  }

  render();
  app.track("page_view", { page: "cart" });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      app.clearCart();
      render();
      setStatus("Cart cleared.", "ok");
      app.track("cart_clear", {});
    });
  }

  function render() {
    if (!mount) {
      return;
    }

    const cart = app.getCart();
    const products = (config && config.products) || [];
    if (!cart.length) {
      mount.innerHTML = `
        <article class="card note-card">
          <h2>Your cart is empty</h2>
          <p class="muted">Add items from the catalog to compare and checkout.</p>
          <a class="btn" href="/catalog.html">Open Catalog</a>
        </article>
      `;
      return;
    }

    const rows = cart
      .map((item) => {
        const product = products.find((p) => p.id === item.id) || { id: item.id, title: item.id, priceLabel: "See product page" };
        return `
          <tr>
            <td>${escapeHtml(product.title || item.id)}</td>
            <td>${escapeHtml(product.priceLabel || "")}</td>
            <td>
              <input type="number" min="1" max="99" value="${Number(item.qty || 1)}" data-cart-qty="${escapeHtml(item.id)}">
            </td>
            <td>
              <div class="inline-actions">
                <a class="btn btn-ghost" href="${escapeHtml(app.getProductPageUrl(item.id))}">View</a>
                <button class="btn btn-ghost" type="button" data-remove-item="${escapeHtml(item.id)}">Remove</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    mount.innerHTML = `
      <article class="card">
        <h2>Cart Items</h2>
        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Base Price</th>
                <th>Qty</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="inline-actions">
          <a class="btn" href="/checkout.html" data-cart-checkout="cart">Checkout Cart</a>
        </div>
      </article>
    `;

    bindActions();
  }

  function bindActions() {
    mount.querySelectorAll("[data-remove-item]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-remove-item");
        app.updateCartQty(id, 0);
        render();
        setStatus("Item removed.", "ok");
        app.track("cart_remove_item", { productId: id });
      });
    });

    mount.querySelectorAll("[data-cart-qty]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-cart-qty");
        const qty = Number(input.value || 1);
        app.updateCartQty(id, qty);
        render();
        setStatus("Cart updated.", "ok");
        app.track("cart_update_qty", { productId: id, qty });
      });
    });

    mount.querySelectorAll("[data-cart-checkout]").forEach((link) => {
      link.addEventListener("click", () => {
        const productId = link.getAttribute("data-cart-checkout");
        app.track("cart_checkout_click", { productId });
      });
    });
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
