(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const statusNode = document.querySelector("[data-checkout-status]");
  const itemsNode = document.querySelector("[data-checkout-items]");
  const subtotalNode = document.querySelector("[data-checkout-subtotal]");
  const discountNode = document.querySelector("[data-checkout-discount]");
  const totalNode = document.querySelector("[data-checkout-total]");
  const couponInput = document.querySelector("[data-coupon-input]");
  const applyCouponButton = document.querySelector("[data-apply-coupon]");
  const removeCouponButton = document.querySelector("[data-remove-coupon]");
  const startCheckoutButton = document.querySelector("[data-start-checkout]");
  const freeCheckoutButton = document.querySelector("[data-free-checkout]");
  const upgradeCodeInput = document.querySelector("[data-upgrade-code]");
  const upgradeNoteNode = document.querySelector("[data-upgrade-note]");

  const COUPON_CODE = "SLENDERFAM";
  let config = null;
  let cartItems = [];
  let selectedCouponCode = "";

  try {
    config = await app.fetchPublicConfig();
    app.injectAnalytics(config);
    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = (config.brand && config.brand.name) || "slendystuff";
    });

    const params = new URLSearchParams(window.location.search);
    const productId = String(params.get("id") || "").trim();
    if (productId) {
      ensureItemInCart(productId);
    }

    if (params.get("success") === "1") {
      app.clearCart();
      setStatus("Payment completed. Thank you. I will follow up with setup details.", "ok");
    } else if (params.get("canceled") === "1") {
      setStatus("Stripe checkout canceled. Your cart is still here.", "");
    }

    const code = String(params.get("code") || "").trim().toUpperCase();
    if (code) {
      selectedCouponCode = code;
      if (couponInput) {
        couponInput.value = code;
      }
    }

    render();
    app.track("page_view", { page: "checkout_cart" });
  } catch (error) {
    setStatus(error.message || "Checkout could not load.", "error");
  }

  if (applyCouponButton) {
    applyCouponButton.addEventListener("click", () => {
      const code = String((couponInput && couponInput.value) || "").trim().toUpperCase();
      if (code === COUPON_CODE) {
        selectedCouponCode = code;
        setStatus("Coupon applied.", "ok");
      } else {
        selectedCouponCode = "";
        setStatus("Invalid coupon code.", "error");
      }
      render();
    });
  }

  if (removeCouponButton) {
    removeCouponButton.addEventListener("click", () => {
      selectedCouponCode = "";
      if (couponInput) {
        couponInput.value = "";
      }
      setStatus("Coupon removed.", "");
      render();
    });
  }

  if (startCheckoutButton) {
    startCheckoutButton.addEventListener("click", async () => {
      if (!cartItems.length) {
        setStatus("Cart is empty. Add items first.", "error");
        return;
      }

      setBusy(startCheckoutButton, true, "Preparing Stripe...");
      setStatus("Creating Stripe checkout session...", "");
      try {
        const response = await fetch("/api/checkout/cart-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            items: cartItems.map((item) => ({ id: item.id, qty: item.qty })),
            couponCode: selectedCouponCode,
            upgradeCode: String((upgradeCodeInput && upgradeCodeInput.value) || "").trim()
          })
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          setStatus(payload.error || "Could not start Stripe checkout.", "error");
          return;
        }

        if (payload.freeCheckout) {
          app.clearCart();
          render();
          setStatus("Free checkout completed. I will follow up with setup details.", "ok");
          app.track("free_checkout_complete", { coupon: selectedCouponCode || null });
          return;
        }

        if (payload.remodelDiscountApplied) {
          setStatus(`Remodel discount applied (${Number(payload.remodelDiscountPercent || 0)}%). Redirecting to Stripe...`, "ok");
        }

        app.track("stripe_checkout_redirect", {
          cartItems: cartItems.length,
          coupon: selectedCouponCode || null,
          remodelDiscountApplied: Boolean(payload.remodelDiscountApplied)
        });

        if (payload.url) {
          window.location.assign(payload.url);
          return;
        }

        setStatus("Stripe session was created but redirect URL is missing.", "error");
      } catch (error) {
        setStatus(error.message || "Checkout request failed.", "error");
      } finally {
        setBusy(startCheckoutButton, false, "Pay With Stripe");
      }
    });
  }

  if (freeCheckoutButton) {
    freeCheckoutButton.addEventListener("click", () => {
      app.clearCart();
      render();
      setStatus("Free checkout completed. I will follow up with setup details.", "ok");
      app.track("free_checkout_complete", { coupon: COUPON_CODE });
    });
  }

  function ensureItemInCart(productId) {
    const id = String(productId || "").trim();
    if (!id) {
      return;
    }

    const existing = app.getCart().find((item) => item.id === id);
    if (!existing) {
      app.addToCart(id, 1);
    }
  }

  function render() {
    const products = (config && config.products) || [];
    cartItems = app.getCart()
      .map((item) => {
        const product = products.find((entry) => entry.id === item.id) || null;
        const unitAmountCents = getProductPriceCents(product);
        return {
          id: item.id,
          qty: Math.max(1, Number(item.qty || 1)),
          title: product ? product.title : item.id,
          priceLabel: product ? product.priceLabel : "",
          unitAmountCents
        };
      })
      .filter((item) => item.unitAmountCents > 0);

    if (!cartItems.length) {
      if (itemsNode) {
        itemsNode.innerHTML = `
          <article class="card note-card">
            <h3>Your cart is empty</h3>
            <p class="muted">Add products from the catalog before checkout.</p>
            <a class="btn" href="/catalog.html">Open Catalog</a>
          </article>
        `;
      }
      writeTotals(0, 0, 0);
      if (startCheckoutButton) startCheckoutButton.classList.add("hidden");
      if (freeCheckoutButton) freeCheckoutButton.classList.add("hidden");
      return;
    }

    const subtotalCents = cartItems.reduce((sum, item) => sum + item.unitAmountCents * item.qty, 0);
    const couponDiscountCents = selectedCouponCode === COUPON_CODE ? subtotalCents : 0;
    const totalCents = Math.max(0, subtotalCents - couponDiscountCents);

    if (itemsNode) {
      const rows = cartItems
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.priceLabel || `$${(item.unitAmountCents / 100).toFixed(2)}`)}</td>
              <td>${escapeHtml(String(item.qty))}</td>
              <td>$${((item.unitAmountCents * item.qty) / 100).toFixed(2)}</td>
            </tr>
          `
        )
        .join("");

      itemsNode.innerHTML = `
        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit Price</th>
                <th>Qty</th>
                <th>Line Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    writeTotals(subtotalCents, couponDiscountCents, totalCents);

    if (startCheckoutButton) {
      startCheckoutButton.classList.toggle("hidden", totalCents <= 0);
    }
    if (freeCheckoutButton) {
      freeCheckoutButton.classList.toggle("hidden", totalCents > 0);
    }

    const hasDiscord = cartItems.some((item) => item.id === "discord-bot-kit");
    const discountPercent = Number((config && config.offers && config.offers.discordRemodelDiscountPercent) || 40);
    if (upgradeNoteNode) {
      upgradeNoteNode.textContent = hasDiscord
        ? `Discord remodel upgrades can receive up to ${discountPercent}% off with a valid owner-issued code.`
        : "Add Discord Bot Kit to cart if you need the remodel upgrade option.";
    }
  }

  function getProductPriceCents(product) {
    if (!product || typeof product !== "object") {
      return 0;
    }
    const explicit = Number(product.priceCents || 0);
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.round(explicit);
    }
    const match = String(product.priceLabel || "").match(/([0-9]+(?:\.[0-9]{1,2})?)/);
    if (!match) {
      return 0;
    }
    return Math.round((Number(match[1]) || 0) * 100);
  }

  function writeTotals(subtotalCents, discountCents, totalCents) {
    if (subtotalNode) subtotalNode.textContent = (subtotalCents / 100).toFixed(2);
    if (discountNode) discountNode.textContent = (discountCents / 100).toFixed(2);
    if (totalNode) totalNode.textContent = (totalCents / 100).toFixed(2);
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) {
      return;
    }
    if (busy) {
      button.disabled = true;
      button.dataset.originalText = button.textContent || "";
      button.textContent = busyLabel;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || "Pay With Stripe";
    }
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
