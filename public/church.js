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
  const donateIframe = document.querySelector("[data-rwc-donate-iframe]");
  const donateEmbedNote = document.querySelector("[data-rwc-embed-note]");

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
    const response = await fetch("/api/church/rwcov", { credentials: "same-origin" });
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
      status.className = payload.stale ? "status" : "status ok";
    }

    app.track("page_view", { page: "church", source: "rwcov", stale: Boolean(payload.stale) });
  } catch (error) {
    applyChurchData(defaults);
    if (status) {
      status.textContent = `${error.message} Showing trusted fallback details.`;
      status.className = "status error";
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

    const phoneHref = `tel:${String(church.phone || "").replace(/[^\d+]/g, "")}`;
    setLink("[data-rwc-phone-link]", phoneHref);
    setLink("[data-rwc-email-link]", `mailto:${church.email || defaults.email}`);

    if (donateIframe && church.links.zeffyEmbed) {
      donateIframe.src = church.links.zeffyEmbed;
    }

    if (donateEmbedNote) {
      donateEmbedNote.textContent = "If the embedded form does not load in your browser, use the secure Zeffy donation button.";
    }
  }

  function buildZeffyDirectUrl(embedUrl, givingUrl) {
    const embed = String(embedUrl || "").trim();
    if (embed && embed.includes("/embed/donation-form/")) {
      return embed.replace("/embed/donation-form/", "/donation-form/");
    }

    return String(givingUrl || "").trim() || defaults.links.giving;
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (!node) {
      return;
    }
    node.textContent = String(value || "").trim() || node.textContent;
  }

  function setLink(selector, value) {
    const node = document.querySelector(selector);
    const href = String(value || "").trim();
    if (!node || !href) {
      return;
    }
    node.setAttribute("href", href);
  }
})();
