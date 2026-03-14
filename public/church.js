(async () => {
  const app = window.SlendyApp;
  app.initHeaderMenu();

  const defaults = {
    churchName: "Relevant Worship Center",
    mission:
      "A multigenerational church family devoted to loving God, loving people, and sharing the hope of Jesus throughout the Ohio Valley.",
    address: "52901 National Road East, St. Clairsville, OH 43950",
    mailingAddress: "PO Box 241, St. Clairsville, OH 43950",
    phone: "740-695-7099",
    email: "info@relevantworshipcenter.org",
    sundayWorship: "Sunday worship at 10:30 am",
    serviceTimes: "Sundays: 10:30 am | Bible Study: 9:30 am | Kids Zone and Teens Group: 9:30 am",
    links: {
      home: "https://rwcov.org/",
      worshipEvents: "https://rwcov.org/worship-events/",
      contact: "https://rwcov.org/contact/",
      prayerRequests: "https://rwcov.org/prayer-requests/",
      giving: "https://rwcov.org/giving/",
      youtube: "https://www.youtube.com/@rwcministries",
      zeffyEmbed: "https://www.zeffy.com/embed/donation-form/donate-to-change-lives-3160"
    }
  };

  const status = document.querySelector("[data-rwc-status]");

  try {
    const config = await app.fetchPublicConfig();
    app.injectAnalytics(config);
    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = config.brand.name || "slendystuff";
    });
  } catch {
    // Keep page readable with static fallback.
  }

  try {
    const response = await app.apiFetch("/api/church/rwcov");
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.church) {
      throw new Error(payload.error || "Could not load church details right now.");
    }

    const church = {
      ...defaults,
      ...payload.church,
      links: {
        ...defaults.links,
        ...((payload.church && payload.church.links) || {})
      }
    };

    applyChurchData(church);
    if (status) {
      const state = payload.stale ? "Using cached rwcov.org details." : "Live details loaded from rwcov.org.";
      const stamp = payload.fetchedAt ? ` Last update: ${new Date(payload.fetchedAt).toLocaleString()}.` : "";
      status.textContent = `${state}${stamp}`;
      setStatusTone(payload.stale ? "warn" : "ok");
    }

    app.track("page_view", { page: "church", source: "rwcov", stale: Boolean(payload.stale) });
  } catch (error) {
    applyChurchData(defaults);
    if (status) {
      status.textContent = `${error.message} Showing trusted fallback details.`;
      setStatusTone("error");
    }
  }

  function applyChurchData(church) {
    setText("[data-rwc-name]", church.churchName);
    setText("[data-rwc-mission]", church.mission);
    setText("[data-rwc-address]", church.address);
    setText("[data-rwc-mailing]", church.mailingAddress);
    setText("[data-rwc-sunday]", church.sundayWorship);
    setText("[data-rwc-service-times]", church.serviceTimes);
    setText("[data-rwc-phone]", church.phone);
    setText("[data-rwc-email]", church.email);

    setLink("[data-rwc-home]", church.links.home);
    setLink("[data-rwc-events]", church.links.worshipEvents);
    setLink("[data-rwc-contact]", church.links.contact);
    setLink("[data-rwc-prayer]", church.links.prayerRequests);
    setLink("[data-rwc-giving]", church.links.giving);
    setLink("[data-rwc-giving-2]", church.links.giving);
    setLink("[data-rwc-zeffy]", buildZeffyDirectUrl(church.links.zeffyEmbed, church.links.giving));
    setLink("[data-rwc-youtube]", church.links.youtube);
    setFrameSrc("[data-rwc-frame]", church.links.home || defaults.links.home);

    const phoneHref = `tel:${String(church.phone || "").replace(/[^\d+]/g, "")}`;
    setLink("[data-rwc-phone-link]", phoneHref);
    setLink("[data-rwc-email-link]", `mailto:${church.email || defaults.email}`);

  }

  function buildZeffyDirectUrl(embedUrl, givingUrl) {
    const embed = String(embedUrl || "").trim();
    if (embed && embed.includes("/embed/donation-form/")) {
      return embed.replace("/embed/donation-form/", "/donation-form/");
    }

    return String(givingUrl || "").trim() || defaults.links.giving;
  }

  function setText(selector, value) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (!nodes.length) {
      return;
    }
    const text = String(value || "").trim();
    nodes.forEach((node) => {
      if (text) {
        node.textContent = text;
      }
    });
  }

  function setLink(selector, value) {
    const nodes = Array.from(document.querySelectorAll(selector));
    const href = String(value || "").trim();
    if (!nodes.length || !href) {
      return;
    }
    nodes.forEach((node) => node.setAttribute("href", href));
  }

  function setFrameSrc(selector, value) {
    const nodes = Array.from(document.querySelectorAll(selector));
    const src = String(value || "").trim();
    if (!nodes.length || !src) {
      return;
    }
    nodes.forEach((node) => node.setAttribute("src", src));
  }

  function setStatusTone(tone) {
    if (!status) {
      return;
    }

    const isLiveShell = status.classList.contains("church-live-status");
    if (isLiveShell) {
      status.classList.remove("is-ok", "is-warn", "is-error");
      if (tone === "ok") {
        status.classList.add("is-ok");
      } else if (tone === "error") {
        status.classList.add("is-error");
      } else {
        status.classList.add("is-warn");
      }
      return;
    }

    if (tone === "ok") {
      status.className = "status ok";
    } else if (tone === "error") {
      status.className = "status error";
    } else {
      status.className = "status";
    }
  }
})();
