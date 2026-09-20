(function () {
  const MAX_EVENTS = 40;
  const POLL_MS = 5000;
  const SSE_WAIT_MS = 8000;
  const DEMO_STEP_MS = 4000;
  const QUOTE_MS = 6000;
  const SHIPPED_FALLBACK_MS = 4000;

  const ACTOR_NAMES = {
    author: "Author",
    ceo: "Chief of Staff",
    social: "Social",
    system: "Office"
  };

  const TYPE_META = {
    "author.writing": { state: "typing", chip: "Drafting…", icon: "✍" },
    "author.shipped": { state: "shipped", chip: "Shipped", icon: "📦" },
    "ceo.note": { state: "noting", chip: "Reviewing", icon: "🗂" },
    "social.queued": { state: "queueing", chip: "Queued", icon: "⏱" },
    "social.reviewing": { state: "reviewing", chip: "Reviewing", icon: "🔎" },
    "social.posted": { state: "posting", chip: "Posting…", icon: "⬆" },
    "book.live": { state: "shipped", chip: "Live", icon: "📘" },
    chat: { state: "chatting", chip: "Chatting", icon: "💬" },
    idle: { state: "idle", chip: "Idle", icon: "•" }
  };

  const CHIP_DEFAULTS = {
    author: "Drafting…",
    ceo: "Reviewing next title",
    social: "Posting…"
  };

  const PLATFORM_LABELS = {
    ig: "Instagram",
    instagram: "Instagram",
    fb: "Facebook",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    site: "Site"
  };

  const DEMO_STEPS = [
    {
      type: "author.writing",
      actor: "author",
      title: "Drafting Cloud chapter 3…",
      draft: "Cloud chapter 3…"
    },
    {
      type: "ceo.note",
      actor: "ceo",
      title: "Tighten the opening",
      draft: "Tighten the opening"
    },
    {
      type: "social.queued",
      actor: "social",
      title: "Queued an Instagram post",
      draft: "New chapter in progress — Cloud, in plain English.",
      platform: "instagram"
    },
    {
      type: "author.shipped",
      actor: "author",
      title: "Author shipped Cloud chapter 3"
    },
    {
      type: "social.posted",
      actor: "social",
      title: "Posting to Instagram",
      platform: "instagram"
    },
    {
      type: "chat",
      actor: "social",
      title: "Live on Instagram",
      draft: "Live on Instagram"
    },
    {
      type: "book.live",
      actor: "author",
      title: "What is the Cloud is live"
    },
    {
      type: "idle",
      actor: "author",
      title: "Author taking a breath"
    },
    {
      type: "idle",
      actor: "ceo",
      title: "Chief of Staff idle"
    },
    {
      type: "idle",
      actor: "social",
      title: "Social wrapping up"
    }
  ];

  const feedEl = document.getElementById("office-feed");
  const tickerEl = document.getElementById("office-ticker");
  const homeTicker = document.getElementById("office-ticker-cards");
  const modeLabel = document.getElementById("office-mode-label");
  const sourceLine = document.getElementById("office-source");
  const liveBadge = document.querySelector(".live-badge");
  const liveRegion = document.getElementById("office-live-region");
  const stations = document.querySelectorAll("[data-actor-station]");
  const homeChips = {
    author: document.querySelector("[data-chip-for='author']"),
    ceo: document.querySelector("[data-chip-for='ceo']"),
    social: document.querySelector("[data-chip-for='social']")
  };

  const hasOfficeScene = stations.length > 0 || Boolean(feedEl || tickerEl);
  const hasHomeOffice = Boolean(homeTicker || homeChips.author);
  if (!hasOfficeScene && !hasHomeOffice) {
    return;
  }

  const eventsById = new Map();
  const stationTimers = {};
  let mode = "demo";
  let demoTimer = null;
  let demoStep = 0;
  let demoCycle = 0;
  let pollTimer = null;
  let sse = null;
  let apiGiveUpTimer = null;
  let lastAnnouncementId = "";

  function getEventsBase() {
    const raw = window.NEXT_PUBLIC_OFFICE_EVENTS_URL || window.OFFICE_EVENTS_URL || "";
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "__NEXT_PUBLIC_OFFICE_EVENTS_URL__") {
      return "";
    }
    return trimmed.replace(/\/+$/, "");
  }

  function metaFor(type) {
    return TYPE_META[type] || TYPE_META.idle;
  }

  function actorName(actor) {
    return ACTOR_NAMES[actor] || "Office";
  }

  function isValidEvent(event) {
    return Boolean(
      event &&
      typeof event === "object" &&
      event.id &&
      event.at &&
      event.type &&
      event.title &&
      !Number.isNaN(Date.parse(event.at))
    );
  }

  function eventList(input) {
    if (Array.isArray(input)) {
      return input;
    }
    if (input && Array.isArray(input.events)) {
      return input.events;
    }
    if (input && typeof input === "object" && input.id) {
      return [input];
    }
    return [];
  }

  function allSortedEvents() {
    return Array.from(eventsById.values()).sort(function (a, b) {
      const byTime = Date.parse(b.at) - Date.parse(a.at);
      if (byTime !== 0) {
        return byTime;
      }
      return String(b.id).localeCompare(String(a.id));
    });
  }

  function sortedEvents() {
    return allSortedEvents().slice(0, MAX_EVENTS);
  }

  function pruneEvents() {
    const all = allSortedEvents();
    while (all.length > MAX_EVENTS) {
      const oldest = all.pop();
      if (!oldest) {
        break;
      }
      eventsById.delete(String(oldest.id));
    }
  }

  function truncate(text, max) {
    const value = String(text || "").trim();
    if (value.length <= max) {
      return value;
    }
    return value.slice(0, max - 1).trim() + "…";
  }

  function relTime(iso) {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) {
      return "now";
    }
    const diffMs = Math.max(0, Date.now() - then);
    const secs = Math.round(diffMs / 1000);
    if (secs < 10) {
      return "just now";
    }
    if (secs < 60) {
      return secs + "s ago";
    }
    const mins = Math.round(secs / 60);
    if (mins < 60) {
      return mins + "m ago";
    }
    const hrs = Math.round(mins / 60);
    if (hrs < 24) {
      return hrs + "h ago";
    }
    return Math.round(hrs / 24) + "d ago";
  }

  function safeUrl(value) {
    if (typeof value !== "string" || !value) {
      return "";
    }
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
    } catch (_error) {
      return "";
    }
    return "";
  }

  function stationActorFor(event) {
    if (!event) {
      return "";
    }
    if (event.type === "author.writing" || event.type === "author.shipped" || event.type === "book.live") {
      return "author";
    }
    if (event.actor === "author" || event.actor === "ceo" || event.actor === "social") {
      return event.actor;
    }
    return "";
  }

  function setMode(next, detail) {
    mode = next;
    if (liveBadge) {
      liveBadge.dataset.mode = next === "live" ? "live" : "demo";
    }
    if (modeLabel) {
      modeLabel.textContent = next === "live" ? "Live" : "Demo";
    }
    if (sourceLine) {
      sourceLine.textContent = detail;
    }
  }

  function clearStationTimer(actor) {
    if (stationTimers[actor]) {
      window.clearTimeout(stationTimers[actor]);
      stationTimers[actor] = 0;
    }
  }

  function setStationState(station, state) {
    if (station.dataset.state === state) {
      station.dataset.state = "";
      void station.offsetWidth;
    }
    station.dataset.state = state;
  }

  function showQuote(station, event) {
    const quote = station.querySelector(".desk-quote");
    if (!quote) {
      return;
    }
    const text = event.draft || (event.type === "chat" ? event.title : "");
    if (!text) {
      quote.hidden = true;
      quote.textContent = "";
      return;
    }
    quote.hidden = false;
    quote.textContent = "“" + truncate(text, 72) + "”";
  }

  function hideQuote(station) {
    const quote = station.querySelector(".desk-quote");
    if (!quote) {
      return;
    }
    quote.hidden = true;
    quote.textContent = "";
  }

  function applyEventToStation(event) {
    if (event.type === "idle" && event.actor === "system") {
      stations.forEach(function (station) {
        const actor = station.getAttribute("data-actor-station");
        clearStationTimer(actor);
        setStationState(station, "idle");
        const chip = station.querySelector(".status-chip");
        if (chip) {
          chip.textContent = "Idle";
        }
        hideQuote(station);
      });
      return;
    }

    const actor = stationActorFor(event);
    if (!actor) {
      return;
    }
    const station = document.querySelector('[data-actor-station="' + actor + '"]');
    if (!station) {
      return;
    }

    const meta = metaFor(event.type);
    clearStationTimer(actor);
    setStationState(station, meta.state);
    const chip = station.querySelector(".status-chip");
    if (chip) {
      chip.textContent = meta.chip;
    }
    showQuote(station, event);

    const eventId = event.id;
    const hideMs = event.draft || event.type === "chat" ? QUOTE_MS : 0;
    const fallbackMs = (meta.state === "shipped" || event.type === "chat") ? (event.type === "chat" ? QUOTE_MS : SHIPPED_FALLBACK_MS) : hideMs;

    if (fallbackMs) {
      stationTimers[actor] = window.setTimeout(function () {
        const current = document.querySelector('[data-actor-station="' + actor + '"]');
        if (!current) {
          return;
        }
        hideQuote(current);
        if (meta.state === "shipped" || event.type === "chat") {
          const latest = sortedEvents().find(function (item) {
            return stationActorFor(item) === actor;
          });
          if (latest && latest.id !== eventId) {
            return;
          }
          setStationState(current, "idle");
          if (chip) {
            chip.textContent = "Idle";
          }
        }
      }, fallbackMs);
    }
  }

  function latestByActor() {
    const latest = { author: null, ceo: null, social: null };
    sortedEvents().forEach(function (event) {
      const actor = stationActorFor(event);
      if (actor && !latest[actor]) {
        latest[actor] = event;
      }
    });
    return latest;
  }

  function renderHomeChips() {
    const latest = latestByActor();
    ["author", "ceo", "social"].forEach(function (actor) {
      const el = homeChips[actor];
      if (!el) {
        return;
      }
      const event = latest[actor];
      el.textContent = event ? metaFor(event.type).chip : CHIP_DEFAULTS[actor];
    });
  }

  function createHomeCard(event) {
    const card = document.createElement("article");
    card.className = "live-card";

    const icon = document.createElement("div");
    icon.className = "live-icon";
    icon.textContent = metaFor(event.type).icon;

    const body = document.createElement("div");
    body.className = "live-copy";

    const title = document.createElement("strong");
    title.textContent = event.title;

    const time = document.createElement("span");
    time.textContent = actorName(event.actor) + " · " + relTime(event.at);

    body.appendChild(title);
    body.appendChild(time);
    card.appendChild(icon);
    card.appendChild(body);

    const href = safeUrl(event.url);
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener";
      link.className = "live-link";
      link.textContent = "↗";
      card.appendChild(link);
    }

    return card;
  }

  function renderHomeTicker() {
    if (!homeTicker) {
      return;
    }
    homeTicker.innerHTML = "";
    const events = sortedEvents().slice(0, 3);
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "live-empty";
      empty.textContent = "No events yet.";
      homeTicker.appendChild(empty);
      return;
    }
    events.forEach(function (event) {
      homeTicker.appendChild(createHomeCard(event));
    });
  }

  function renderOfficeFeed() {
    if (!feedEl || !tickerEl) {
      return;
    }
    const events = sortedEvents();
    feedEl.innerHTML = "";
    tickerEl.innerHTML = "";

    if (!events.length) {
      const empty = document.createElement("li");
      empty.className = "feed-empty";
      empty.textContent = "The office is quiet. Events will appear here.";
      feedEl.appendChild(empty);
      return;
    }

    events.forEach(function (event, index) {
      const item = document.createElement("li");
      item.className = "feed-item";
      item.dataset.type = event.type;
      item.dataset.actor = event.actor || "";

      const icon = document.createElement("span");
      icon.className = "feed-icon";
      icon.textContent = metaFor(event.type).icon;

      const body = document.createElement("div");
      const top = document.createElement("div");
      top.className = "feed-top";
      const who = document.createElement("strong");
      who.textContent = actorName(event.actor);
      const time = document.createElement("time");
      time.dateTime = event.at;
      time.textContent = relTime(event.at);
      top.appendChild(who);
      top.appendChild(time);

      const title = document.createElement("p");
      title.className = "feed-title";
      const href = safeUrl(event.url);
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = event.title;
        title.appendChild(link);
      } else {
        title.textContent = event.title;
      }

      body.appendChild(top);
      body.appendChild(title);

      if (event.platform && PLATFORM_LABELS[event.platform]) {
        const platform = document.createElement("span");
        platform.className = "feed-platform";
        platform.textContent = PLATFORM_LABELS[event.platform];
        body.appendChild(platform);
      }

      if (event.draft) {
        const quote = document.createElement("blockquote");
        quote.className = "feed-quote";
        quote.textContent = "“" + truncate(event.draft, 140) + "”";
        body.appendChild(quote);
      }

      item.appendChild(icon);
      item.appendChild(body);
      feedEl.appendChild(item);

      if (index < 3) {
        const tick = document.createElement("article");
        tick.className = "ticker-item";
        tick.dataset.type = event.type;
        const tickIcon = document.createElement("span");
        tickIcon.className = "ticker-icon";
        tickIcon.textContent = metaFor(event.type).icon;
        const tickCopy = document.createElement("div");
        const tickTitle = document.createElement("strong");
        tickTitle.textContent = event.title;
        const tickTime = document.createElement("span");
        tickTime.textContent = actorName(event.actor) + " · " + relTime(event.at);
        tickCopy.appendChild(tickTitle);
        tickCopy.appendChild(tickTime);
        tick.appendChild(tickIcon);
        tick.appendChild(tickCopy);
        tickerEl.appendChild(tick);
      }
    });

    const newest = events[0];
    if (newest && newest.id !== lastAnnouncementId && liveRegion) {
      lastAnnouncementId = newest.id;
      liveRegion.textContent = actorName(newest.actor) + ": " + newest.title;
    }
  }

  function render() {
    renderOfficeFeed();
    renderHomeChips();
    renderHomeTicker();
  }

  function ingest(event, fromLive) {
    if (!isValidEvent(event)) {
      return false;
    }
    if (fromLive && mode !== "live") {
      stopDemo();
      eventsById.clear();
      setMode("live", "Streaming live office events.");
    }
    eventsById.set(String(event.id), event);
    pruneEvents();
    applyEventToStation(event);
    render();
    return true;
  }

  function ingestMany(input, fromLive) {
    const valid = eventList(input).filter(isValidEvent);
    if (!valid.length) {
      return 0;
    }
    if (fromLive && mode !== "live") {
      stopDemo();
      eventsById.clear();
      setMode("live", "Streaming live office events.");
    }
    valid.forEach(function (event) {
      eventsById.set(String(event.id), event);
    });
    pruneEvents();
    const latest = latestByActor();
    ["author", "ceo", "social"].forEach(function (actor) {
      if (latest[actor]) {
        applyEventToStation(latest[actor]);
      }
    });
    render();
    return valid.length;
  }

  function stopDemo() {
    if (demoTimer) {
      window.clearTimeout(demoTimer);
      demoTimer = null;
    }
  }

  function demoEvent(step) {
    demoCycle += 1;
    return {
      id: "demo-" + demoCycle + "-" + (demoStep + 1),
      at: new Date().toISOString(),
      type: step.type,
      actor: step.actor,
      title: step.title,
      draft: step.draft,
      platform: step.platform
    };
  }

  function tickDemo() {
    const step = DEMO_STEPS[demoStep];
    ingest(demoEvent(step), false);
    demoStep = (demoStep + 1) % DEMO_STEPS.length;
    demoTimer = window.setTimeout(tickDemo, DEMO_STEP_MS);
  }

  function startDemo(detail) {
    if (demoTimer) {
      return;
    }
    setMode("demo", detail);
    demoStep = 0;
    tickDemo();
  }

  async function loadLocalEvents() {
    try {
      const response = await fetch("office-events.json", { cache: "no-store" });
      if (!response.ok) {
        return 0;
      }
      return ingestMany(await response.json(), false);
    } catch (_error) {
      return 0;
    }
  }

  async function pullRemoteEvents() {
    const base = getEventsBase();
    if (!base) {
      return 0;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(function () {
      controller.abort();
    }, SSE_WAIT_MS);
    try {
      const response = await fetch(base + "/api/office/events?limit=" + MAX_EVENTS, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("events " + response.status);
      }
      return ingestMany(await response.json(), true);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    if (pollTimer || !getEventsBase()) {
      return;
    }
    const tick = function () {
      pullRemoteEvents().catch(function () {
        if (mode !== "live") {
          startDemo("Could not reach the events API. Showing the office preview.");
        }
      });
    };
    pollTimer = window.setInterval(tick, POLL_MS);
    tick();
  }

  function stopSse() {
    if (sse) {
      sse.close();
      sse = null;
    }
  }

  function startSse() {
    const base = getEventsBase();
    if (!base || !window.EventSource) {
      startPolling();
      return;
    }
    stopSse();
    try {
      sse = new EventSource(base + "/api/office/events/stream");
    } catch (_error) {
      startPolling();
      return;
    }

    let opened = false;
    const watchdog = window.setTimeout(function () {
      if (!opened) {
        stopSse();
        startPolling();
      }
    }, SSE_WAIT_MS);

    const onPayload = function (data) {
      try {
        const parsed = JSON.parse(data);
        const list = eventList(parsed);
        if (list.length === 1) {
          ingest(list[0], true);
        } else {
          ingestMany(list, true);
        }
      } catch (_error) {
        // Ignore malformed messages.
      }
    };

    sse.onopen = function () {
      opened = true;
      window.clearTimeout(watchdog);
    };

    sse.onmessage = function (message) {
      onPayload(message.data);
    };
    sse.addEventListener("office", function (message) {
      onPayload(message.data);
    });

    sse.onerror = function () {
      window.clearTimeout(watchdog);
      stopSse();
      startPolling();
    };
  }

  function armApiGiveUp() {
    if (apiGiveUpTimer) {
      window.clearTimeout(apiGiveUpTimer);
    }
    apiGiveUpTimer = window.setTimeout(function () {
      if (mode !== "live") {
        startDemo("Events API did not respond in time. Showing the office preview.");
      }
    }, SSE_WAIT_MS);
  }

  async function connect() {
    const base = getEventsBase();
    if (!base) {
      startDemo("Offline preview — set NEXT_PUBLIC_OFFICE_EVENTS_URL to stream live events.");
      loadLocalEvents();
      return;
    }

    setMode("demo", "Connecting to the live office feed…");
    armApiGiveUp();
    try {
      const count = await pullRemoteEvents();
      if (count > 0) {
        window.clearTimeout(apiGiveUpTimer);
        apiGiveUpTimer = null;
      }
    } catch (_error) {
      startDemo("Could not reach the events API. Showing the office preview.");
    }
    startSse();
  }

  connect();
  window.setInterval(render, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      render();
    }
  });
})();
