(() => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const pageStatus = document.querySelector("[data-forum-page-status]");
  const authState = document.querySelector("[data-forum-auth-state]");
  const authStatus = document.querySelector("[data-forum-auth-status]");
  const topicStatus = document.querySelector("[data-forum-topic-status]");
  const topicsMount = document.querySelector("[data-forum-topics]");
  const topicPanel = document.querySelector("[data-topic-create-panel]");
  const logoutButton = document.querySelector("[data-forum-logout]");
  const loginForm = document.querySelector("[data-forum-login-form]");
  const registerForm = document.querySelector("[data-forum-register-form]");
  const topicForm = document.querySelector("[data-forum-topic-form]");

  const state = {
    account: null,
    topics: []
  };

  init().catch((error) => {
    setStatus(pageStatus, error.message || "Could not load forum.", "error");
  });

  async function init() {
    try {
      const config = await app.fetchPublicConfig();
      app.injectAnalytics(config);
      document.querySelectorAll("[data-brand-name]").forEach((node) => {
        node.textContent = (config.brand && config.brand.name) || "slendystuff";
      });
    } catch {
      // Keep forum functional with fallback branding.
    }

    bindEvents();
    await refreshSession();
    await loadTopics();
    app.track("page_view", { page: "forum" });
  }

  function bindEvents() {
    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        await app.apiFetch("/api/account/logout", {
          method: "POST",
        });
        state.account = null;
        renderAuthState();
        setStatus(authStatus, "Signed out.", "ok");
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(loginForm);
        const payload = {
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || "")
        };

        setStatus(authStatus, "Signing in...", "");
        const response = await app.apiFetch("/api/account/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setStatus(authStatus, body.error || "Sign in failed.", "error");
          return;
        }

        loginForm.reset();
        await refreshSession();
        setStatus(authStatus, "Signed in.", "ok");
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(registerForm);
        const payload = {
          name: String(formData.get("name") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || "")
        };

        setStatus(authStatus, "Creating account...", "");
        const response = await app.apiFetch("/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setStatus(authStatus, body.error || "Could not create account.", "error");
          return;
        }

        registerForm.reset();
        await refreshSession();
        setStatus(authStatus, "Account created and signed in.", "ok");
      });
    }

    if (topicForm) {
      topicForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.account) {
          setStatus(topicStatus, "Sign in to create a topic.", "error");
          return;
        }

        const formData = new FormData(topicForm);
        const payload = {
          title: String(formData.get("title") || "").trim(),
          body: String(formData.get("body") || "").trim()
        };

        setStatus(topicStatus, "Posting topic...", "");
        const response = await app.apiFetch("/api/forum/topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setStatus(topicStatus, body.error || "Could not post topic.", "error");
          return;
        }

        topicForm.reset();
        setStatus(topicStatus, "Topic posted.", "ok");
        await loadTopics();
      });
    }

    if (topicsMount) {
      topicsMount.addEventListener("submit", async (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.matches("[data-forum-comment-form]")) {
          return;
        }
        event.preventDefault();

        if (!state.account) {
          setStatus(pageStatus, "Sign in to comment.", "error");
          return;
        }

        const topicId = String(form.getAttribute("data-topic-id") || "").trim();
        const messageInput = form.querySelector("textarea[name='comment']");
        const body = String((messageInput && messageInput.value) || "").trim();
        if (!topicId || body.length < 2) {
          setStatus(pageStatus, "Comment is too short.", "error");
          return;
        }

        setStatus(pageStatus, "Posting comment...", "");
        const response = await app.apiFetch(`/api/forum/topics/${encodeURIComponent(topicId)}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          setStatus(pageStatus, payload.error || "Could not post comment.", "error");
          return;
        }

        if (messageInput) {
          messageInput.value = "";
        }
        setStatus(pageStatus, "Comment posted.", "ok");
        await loadTopics();
      });
    }
  }

  async function refreshSession() {
    try {
      const response = await app.apiFetch("/api/account/session");
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        state.account = null;
      } else {
        state.account = payload.account || null;
      }
    } catch {
      state.account = null;
    }

    renderAuthState();
  }

  function renderAuthState() {
    const signedIn = Boolean(state.account);
    if (authState) {
      authState.textContent = signedIn
        ? `Signed in as ${state.account.name || state.account.email} (${state.account.email}).`
        : "You are not signed in.";
    }

    if (logoutButton) {
      logoutButton.classList.toggle("hidden", !signedIn);
    }

    if (topicPanel) {
      topicPanel.classList.toggle("hidden", !signedIn);
    }
  }

  async function loadTopics() {
    setStatus(pageStatus, "Loading topics...", "");
    const response = await app.apiFetch("/api/forum/topics");
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setStatus(pageStatus, payload.error || "Could not load topics.", "error");
      return;
    }

    state.topics = Array.isArray(payload.topics) ? payload.topics : [];
    renderTopics();
    setStatus(pageStatus, `Loaded ${state.topics.length} topic(s).`, "ok");
  }

  function renderTopics() {
    if (!topicsMount) {
      return;
    }

    if (!state.topics.length) {
      topicsMount.innerHTML = `
        <article class="card">
          <h3>No topics yet</h3>
          <p class="muted">Be the first signed-in member to start a thread.</p>
        </article>
      `;
      return;
    }

    topicsMount.innerHTML = state.topics
      .map((topic) => {
        const comments = Array.isArray(topic.comments) ? topic.comments : [];
        const commentsHtml = comments.length
          ? comments
              .map((comment) => `
                <li>
                  <strong>${escapeHtml(comment.authorName || "Member")}:</strong>
                  ${escapeHtml(comment.body || "")}
                  <span class="muted">(${escapeHtml(formatDate(comment.createdAt))})</span>
                </li>
              `)
              .join("")
          : "<li class='muted'>No comments yet.</li>";

        const commentForm = state.account
          ? `
            <form data-forum-comment-form data-topic-id="${escapeHtml(topic.id)}">
              <div class="field">
                <label>Add Comment</label>
                <textarea name="comment" maxlength="2000" placeholder="Write a comment..." required></textarea>
              </div>
              <div class="inline-actions">
                <button class="btn btn-ghost" type="submit">Post Comment</button>
              </div>
            </form>
          `
          : "<p class='muted'>Sign in to comment.</p>";

        return `
          <article class="card">
            <p class="eyebrow">${escapeHtml(formatDate(topic.createdAt))}</p>
            <h3>${escapeHtml(topic.title || "Untitled Topic")}</h3>
            <p class="muted"><strong>${escapeHtml(topic.authorName || "Member")}</strong></p>
            <p>${escapeHtml(topic.body || "")}</p>
            <hr>
            <h4>Comments (${Number(topic.commentCount || comments.length || 0)})</h4>
            <ul class="list">${commentsHtml}</ul>
            ${commentForm}
          </article>
        `;
      })
      .join("");
  }

  function formatDate(value) {
    const ts = Date.parse(String(value || ""));
    if (!Number.isFinite(ts)) {
      return "Unknown date";
    }
    return new Date(ts).toLocaleString();
  }

  function setStatus(node, message, stateClass = "") {
    if (!node) {
      return;
    }
    node.textContent = message;
    node.className = stateClass ? `status ${stateClass}` : "status";
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
