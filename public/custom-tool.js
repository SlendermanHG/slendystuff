(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const IDEA_LOG_KEY = "slendy-idea-log-v1";
  const form = document.querySelector("[data-custom-tool-form]");
  const status = document.querySelector("[data-custom-tool-status]");
  const ideaPrompt = document.querySelector("[data-idea-prompt]");
  const ideaGenerateButton = document.querySelector("[data-idea-generate]");
  const ideaDeepRollButton = document.querySelector("[data-idea-deep-roll]");
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
  if (ideaDeepRollButton) {
    ideaDeepRollButton.addEventListener("click", onDeepRollSpec);
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
      await app.apiFetch("/api/tool-request", {
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

    setStatus(ideaStatus, "Generating detailed concept options...", "");
    const history = savedIdeaLogs.map((entry) => ({
      createdAt: entry.createdAt,
      prompt: entry.prompt,
      answer: entry.answer
    }));

    let result;
    try {
      const response = await app.apiFetch("/api/idea-assistant/generate", {
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

  function onDeepRollSpec() {
    const prompt = String((ideaPrompt && ideaPrompt.value) || "").trim();
    setStatus(ideaStatus, "Building full 7-section spec...", "");

    const answer = buildDeepRollSpec(prompt, assistantRules, savedIdeaLogs);
    currentIdeaOutput = {
      id: createLocalId(),
      createdAt: new Date().toISOString(),
      prompt: prompt || "Deep roll template",
      answer,
      source: "deep-roll-template",
      model: "template-v1"
    };

    renderIdeaAnswer(currentIdeaOutput);
    setStatus(ideaStatus, "Deep roll ready. Save it if you want it attached to your request.", "ok");
    app.track("idea_deep_roll_complete", { hasPrompt: Boolean(prompt) });
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
    const offerTypes = [
      "core build + premium managed operations",
      "modular product with expansion packs",
      "implementation service with recurring optimization plan",
      "niche-targeted launch package with analytics layer"
    ];
    const technicalTracks = [
      "web dashboard + automation service + logging pipeline",
      "desktop tooling + control API + admin configuration panel",
      "bot workflow engine + queue processing + moderation safeguards",
      "orchestrated service stack + reporting + remote management hooks"
    ];
    const launchPlans = [
      "Discovery -> MVP in 2-4 weeks -> staged rollout by priority.",
      "Scope lock -> pilot deployment -> production hardening and scale.",
      "Core workflow release -> feedback cycle -> expansion module drops.",
      "Critical feature launch -> stability sprint -> managed optimization phase."
    ];

    const offer = offerTypes[Math.floor(Math.random() * offerTypes.length)];
    const track = technicalTracks[Math.floor(Math.random() * technicalTracks.length)];
    const launch = launchPlans[Math.floor(Math.random() * launchPlans.length)];

    return [
      "Fallback Strategy Output:",
      "Offer Structure:",
      `- ${offer}`,
      "",
      "Technical Shape:",
      `- ${track}`,
      "",
      "Launch Sequence:",
      `- ${launch}`,
      "",
      "Pricing Direction:",
      "- Implementation fee + recurring support/management tier + optional priority add-ons.",
      "",
      "Risks to Control:",
      "- Scope drift, integration complexity, and unclear ownership boundaries.",
      "",
      `Prompt: ${prompt}`,
      `Hardwired rules: ${String(rules || "").slice(0, 180)}`
    ].join("\n");
  }

  function buildDeepRollSpec(prompt, rules, history) {
    const conceptTracks = [
      "Outcome-first productized service with optional managed operations",
      "Modular software package with paid expansion modules",
      "Bot + dashboard bundle with recurring support and tuning"
    ];
    const audienceTracks = [
      "small operations teams that need less manual work and fewer errors",
      "community managers who need structured automation and auditability",
      "service providers who need faster delivery with repeatable templates"
    ];
    const painTracks = [
      "too much manual handling, inconsistent quality, and delayed response cycles",
      "scattered tools, weak visibility, and no clear ownership of process health",
      "support backlog growth and operational drift as usage scales"
    ];
    const architectureTracks = [
      "Web front-end + API service + queue worker + event/log store + admin settings panel",
      "Discord/automation worker + policy engine + telemetry pipeline + operator dashboard",
      "Client app + orchestration API + scheduled jobs + reporting and alerting layer"
    ];
    const launchTracks = [
      "Week 1 discovery and scope lock, Week 2-3 MVP build, Week 4 controlled launch",
      "Sprint 1 architecture and prototype, Sprint 2 feature completion, Sprint 3 hardening",
      "Phase A requirements and risk controls, Phase B build and QA, Phase C rollout and tuning"
    ];
    const pricingTracks = [
      "Implementation fee + monthly support plan + priority response add-on",
      "Starter/Scale/Managed tiers with clear feature and SLA boundaries",
      "Base deployment + optional integrations + quarterly optimization retainer"
    ];
    const riskTracks = [
      "scope creep, weak requirement clarity, and unmanaged integration dependencies",
      "permission/security misconfiguration and missing audit events",
      "handoff gaps, unclear ownership, and delayed issue response"
    ];
    const metricTracks = [
      "time saved per workflow, error-rate reduction, and support queue age",
      "active usage, completion rate of automated tasks, and incident volume",
      "response-time adherence, user retention, and expansion conversion"
    ];

    const selectedPrompt =
      prompt || "Flexible product/bot concept for mixed markets with room for future expansion.";
    const recentPrompt = Array.isArray(history) && history.length > 0 ? history[0].prompt : "No prior saved prompts.";
    const rulesSnippet = String(rules || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);

    return [
      "1. Offer Concept",
      `- Input Focus: ${selectedPrompt}`,
      `- Positioning: ${pickOne(conceptTracks)}.`,
      "- Core Promise: deliver measurable operational gains with clear upgrade paths.",
      "",
      "2. Target Users + Pain Points",
      `- Target Users: ${pickOne(audienceTracks)}.`,
      `- Primary Pain: ${pickOne(painTracks)}.`,
      "- Buying Trigger: current process is too slow, risky, or expensive to scale.",
      "",
      "3. Feature Scope (MVP vs Expansion)",
      "- MVP Scope:",
      "  - Core workflow automation, role-based controls, and baseline reporting.",
      "  - Guided onboarding, template presets, and fail-safe guardrails.",
      "- Expansion Scope:",
      "  - Advanced analytics, premium automation packs, and partner integrations.",
      "  - White-label options and dedicated managed operations lane.",
      "",
      "4. Technical Architecture",
      `- Suggested Stack: ${pickOne(architectureTracks)}.`,
      "- Data + Audit: event logs, action traces, and change history retained by policy.",
      "- Control Layer: admin-configurable policies, feature flags, and access boundaries.",
      "",
      "5. Delivery Plan + Milestones",
      `- Timeline Model: ${pickOne(launchTracks)}.`,
      "- Milestone Gates: scope sign-off -> QA/UAT pass -> controlled release -> post-launch tuning.",
      "- Communication: weekly status summary with decision/risk log.",
      "",
      "6. Pricing + Packaging",
      `- Packaging Direction: ${pickOne(pricingTracks)}.`,
      "- Commercial Notes: include clear support boundaries and paid escalation paths.",
      "- Upsell Path: remote management bundle and premium SLA response windows.",
      "",
      "7. Risks + Controls + Success Metrics",
      `- Key Risks: ${pickOne(riskTracks)}.`,
      "- Controls: hard scope boundaries, audit logging, staged rollout, and rollback plan.",
      `- Success Metrics: ${pickOne(metricTracks)}.`,
      "",
      `Context from latest saved prompt: ${recentPrompt}`,
      `Hardwired rules snapshot: ${rulesSnippet || "No hardwired rules provided."}`
    ].join("\n");
  }

  function pickOne(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }
    return items[Math.floor(Math.random() * items.length)];
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
