(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const IDEA_LOG_KEY = "slendy-idea-log-v1";
  const form = document.querySelector("[data-custom-tool-form]");
  const status = document.querySelector("[data-custom-tool-status]");
  const ideaPrompt = document.querySelector("[data-idea-prompt]");
  const ideaGenerateButton = document.querySelector("[data-idea-generate]");
  const ideaSaveButton = document.querySelector("[data-idea-save]");
  const ideaClearButton = document.querySelector("[data-idea-clear]");
  const ideaStatus = document.querySelector("[data-idea-status]");
  const ideaAnswer = document.querySelector("[data-idea-answer]");
  const ideaLogMount = document.querySelector("[data-idea-log]");
  const ideaAttachSummary = document.querySelector("[data-idea-attach-summary]");
  const targetEmail = "Operations@slendystuff.com";
  let assistantRules = "";
  let currentIdeaOutput = null;
  let savedIdeaLogs = loadIdeaLogs();

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);
    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name;
    });
    assistantRules = ((config.aiAssistant && config.aiAssistant.hardwiredRules) || "").trim();
    app.track("page_view", { page: "custom_tool" });
  } catch {
    // Keep page functional even without config.
  }

  renderSavedIdeaLog();
  syncIdeaAttachSummary();

  if (ideaGenerateButton) {
    ideaGenerateButton.addEventListener("click", onGenerateIdeas);
  }
  if (ideaSaveButton) {
    ideaSaveButton.addEventListener("click", onSaveIdeaOutput);
  }
  if (ideaClearButton) {
    ideaClearButton.addEventListener("click", onClearIdeaLogs);
  }

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const remoteOptions = formData.getAll("remoteOptions").map(String);
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      toolType: String(formData.get("toolType") || ""),
      timeline: String(formData.get("timeline") || ""),
      whatWant: String(formData.get("whatWant") || ""),
      howUsed: String(formData.get("howUsed") || ""),
      remoteOptions,
      budget: String(formData.get("budget") || ""),
      notes: String(formData.get("notes") || ""),
      attachIdeaLog: String(formData.get("attachIdeaLog") || "").toLowerCase() === "yes",
      ideaLog:
        String(formData.get("attachIdeaLog") || "").toLowerCase() === "yes"
          ? savedIdeaLogs
          : [],
      clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    try {
      await fetch("/api/tool-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch {
      // Ignore; fallback to email draft always happens.
    }

    const subject = encodeURIComponent(`Custom Tool Request - ${payload.toolType || "General"}`);
    const ideaLogText = payload.attachIdeaLog ? formatIdeaLogForEmail(payload.ideaLog) : "Not attached.";
    const body = encodeURIComponent(
      `Name: ${payload.name}\nEmail: ${payload.email}\nRequest Type: ${payload.toolType}\nTimeline: ${payload.timeline}\nBudget: ${payload.budget || "Not provided"}\nTimezone: ${payload.clientTimezone}\n\nWhat do you want built?\n${payload.whatWant}\n\nHow will it be used?\n${payload.howUsed}\n\nRemote Management Tailoring:\n${payload.remoteOptions.join(", ") || "None selected"}\n\nProject Overview / Notes / Comments:\n${payload.notes || "None"}\n\nSaved Idea Generation Logs:\n${ideaLogText}`
    );

    window.location.href = `mailto:${targetEmail}?subject=${subject}&body=${body}`;
    if (status) {
      status.textContent = "Email draft opened. Send it when ready.";
      status.className = "status ok";
    }

    app.track("custom_tool_request_drafted", {
      toolType: payload.toolType,
      remoteOptions: payload.remoteOptions,
      attachedIdeaLogCount: payload.ideaLog.length
    });
  });

  async function onGenerateIdeas() {
    const prompt = String((ideaPrompt && ideaPrompt.value) || "").trim();
    if (!prompt) {
      setStatus(ideaStatus, "Type a prompt before generating ideas.", "error");
      return;
    }

    setStatus(ideaStatus, "Generating ideas...", "");
    const history = savedIdeaLogs.map((entry) => ({
      createdAt: entry.createdAt,
      prompt: entry.prompt,
      answer: entry.answer
    }));

    let result;
    try {
      const response = await fetch("/api/idea-assistant/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          history,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      const payload = await parseJson(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Generation failed.");
      }
      result = {
        answer: String(payload.answer || ""),
        source: String(payload.source || "unknown"),
        model: String(payload.model || "unknown")
      };
    } catch {
      result = {
        answer: buildBrowserFallback(prompt, assistantRules),
        source: "browser-fallback",
        model: "local"
      };
    }

    currentIdeaOutput = {
      id: createLocalId(),
      createdAt: new Date().toISOString(),
      prompt,
      answer: result.answer,
      source: result.source,
      model: result.model
    };

    renderIdeaAnswer(currentIdeaOutput);
    setStatus(ideaStatus, `Idea output ready (${result.source}). Save it if you want it attached to your request.`, "ok");
    app.track("idea_generation_complete", { source: result.source, model: result.model });
  }

  function onSaveIdeaOutput() {
    if (!currentIdeaOutput) {
      setStatus(ideaStatus, "Generate an output first, then save it.", "error");
      return;
    }

    savedIdeaLogs.unshift(currentIdeaOutput);
    savedIdeaLogs = savedIdeaLogs.slice(0, 20);
    persistIdeaLogs(savedIdeaLogs);
    renderSavedIdeaLog();
    syncIdeaAttachSummary();
    setStatus(ideaStatus, "Current idea output saved to log.", "ok");
    app.track("idea_log_saved", { count: savedIdeaLogs.length });
  }

  function onClearIdeaLogs() {
    savedIdeaLogs = [];
    persistIdeaLogs(savedIdeaLogs);
    renderSavedIdeaLog();
    syncIdeaAttachSummary();
    setStatus(ideaStatus, "Saved idea logs cleared.", "ok");
    app.track("idea_log_cleared");
  }

  function renderIdeaAnswer(entry) {
    if (!ideaAnswer) {
      return;
    }
    ideaAnswer.innerHTML = `
      <p class="eyebrow">Generated Output</p>
      <p class="muted">Source: ${escapeHtml(entry.source)} | Model: ${escapeHtml(entry.model)}</p>
      <pre class="idea-output">${escapeHtml(entry.answer)}</pre>
    `;
  }

  function renderSavedIdeaLog() {
    if (!ideaLogMount) {
      return;
    }
    if (!savedIdeaLogs.length) {
      ideaLogMount.innerHTML = "<p class='muted'>No saved idea logs yet.</p>";
      return;
    }

    ideaLogMount.innerHTML = savedIdeaLogs
      .map(
        (entry) => `
          <article class="idea-entry">
            <p><strong>${escapeHtml(formatDate(entry.createdAt))}</strong> | ${escapeHtml(entry.source || "unknown")}</p>
            <p><strong>Prompt:</strong> ${escapeHtml(entry.prompt)}</p>
            <p><strong>Output:</strong> ${escapeHtml(entry.answer.slice(0, 700))}${entry.answer.length > 700 ? "..." : ""}</p>
          </article>
        `
      )
      .join("");
  }

  function syncIdeaAttachSummary() {
    if (!ideaAttachSummary) {
      return;
    }
    ideaAttachSummary.textContent = `Saved logs attached: ${savedIdeaLogs.length}`;
  }

  function loadIdeaLogs() {
    try {
      const raw = localStorage.getItem(IDEA_LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((entry) => entry && typeof entry === "object")
        .slice(0, 20)
        .map((entry) => ({
          id: String(entry.id || createLocalId()),
          createdAt: String(entry.createdAt || new Date().toISOString()),
          prompt: String(entry.prompt || ""),
          answer: String(entry.answer || ""),
          source: String(entry.source || ""),
          model: String(entry.model || "")
        }));
    } catch {
      return [];
    }
  }

  function persistIdeaLogs(entries) {
    try {
      localStorage.setItem(IDEA_LOG_KEY, JSON.stringify(entries || []));
    } catch {
      // No-op
    }
  }

  function formatIdeaLogForEmail(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return "Not attached.";
    }
    return entries
      .slice(0, 20)
      .map(
        (entry, index) =>
          `Entry ${index + 1} (${formatDate(entry.createdAt)})\nPrompt: ${entry.prompt}\nOutput: ${entry.answer}\nSource: ${entry.source} | Model: ${entry.model}`
      )
      .join("\n\n");
  }

  function buildBrowserFallback(prompt, rules) {
    return [
      "Local fallback ideation mode:",
      "1. Define one clear paid outcome and ship a narrow MVP around it.",
      "2. Add a premium management tier for recurring revenue.",
      "3. Build one niche-specific variant page with targeted copy and offer framing.",
      "",
      `Prompt: ${prompt}`,
      `Hardwired rules: ${String(rules || "").slice(0, 180)}`
    ].join("\n");
  }

  function setStatus(node, message, type) {
    if (!node) return;
    node.textContent = message;
    node.className = `status ${type || ""}`;
  }

  function createLocalId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `idea-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }
    return date.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function parseJson(response) {
    try {
      return await response.json();
    } catch {
      return { ok: false, error: "Invalid response." };
    }
  }
})();
