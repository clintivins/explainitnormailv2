(() => {
  const FEED_LIMIT = 40;
  const POLL_MS = 10000;
  const SSE_OPEN_MS = 6000;
  const ACTOR_NAMES = {
    author: "Author",
    social: "Social",
    ceo: "Chief of Staff",
    system: "Office"
  };
  const EVENT_TYPES = {
    "author.writing": { state: "typing", chip: "Drafting…", icon: "pen" },
    "author.shipped": { state: "shipped", chip: "Shipped", icon: "box" },
    "ceo.note": { state: "noting", chip: "Coordinating", icon: "note" },
    "social.queued": { state: "queueing", chip: "Queued", icon: "queue" },
    "social.reviewing": { state: "reviewing", chip: "Reviewing", icon: "review" },
    "social.posted": { state: "posting", chip: "Posting…", icon: "share" },
    "book.live": { state: "shipped", chip: "Book live", icon: "book" },
    idle: { state: "idle", chip: "Idle", icon: "idle" },
    chat: { state: "chatting", chip: "Chatting", icon: "chat" }
  };
  const PLATFORM_LABELS = {
    ig: "Instagram",
    fb: "Facebook",
    linkedin: "LinkedIn",
    site: "Site"
  };

  const feedEl = document.getElementById("office-feed");
  const tickerEl = document.getElementById("office-ticker");
  const modeLabel = document.getElementById("office-mode-label");
  const sourceLine = document.getElementById("office-source");
  const liveBadge = document.querySelector(".live-badge");
  const liveRegion = document.getElementById("office-live-region");
  const stations = document.querySelectorAll("[data-actor-station]");
  if (!feedEl || !tickerEl) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const eventsById = new Map();
  const demoTimers = [];
  let mode = "demo";
  let demoCancelled = false;
  let pollTimer = null;
  let sse = null;
  let latestAnnouncement = "";

  function getEventsBase() {
    const raw = window.NEXT_PUBLIC_OFFICE_EVENTS_URL || window.OFFICE_EVENTS_URL || "";
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "__NEXT_PUBLIC_OFFICE_EVENTS_URL__") {
      return "";
    }
    return trimmed.replace(/\/+$/, "");
  }

  function isValidEvent(event) {
    if (!event || typeof event !== "object") return false;
    if (typeof event.id !== "string" || !event.id) return false;
    if (typeof event.at !== "string" || Number.isNaN(Date.parse(event.at))) return false;
    if (typeof event.type !== "string" || !event.type) return false;
    if (typeof event.actor !== "string" || !event.actor) return false;
    if (typeof event.title !== "string" || !event.title.trim()) return false;
    return true;
  }

  function eventMeta(type) {
    return EVENT_TYPES[type] || EVENT_TYPES.idle;
  }

  function actorName(actor) {
    return ACTOR_NAMES[actor] || "Office";
  }

  function safeUrl(value) {
    if (typeof value !== "string" || !value) return "";
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch {
      return "";
    }
    return "";
  }

  function relativeTime(iso, now) {
    const delta = Math.round((now - Date.parse(iso)) / 1000);
    if (delta < 10) return "just now";
    if (delta < 60) return `${delta}s ago`;
    const minutes = Math.round(delta / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function truncate(text, max) {
    const value = String(text || "").trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1).trim()}…`;
  }

  function sortedEvents() {
    return Array.from(eventsById.values()).sort((a, b) => {
      const byTime = Date.parse(b.at) - Date.parse(a.at);
      if (byTime !== 0) return byTime;
      return b.id.localeCompare(a.id);
    });
  }

  function latestByActor() {
    const latest = { author: null, social: null, ceo: null };
    for (const event of sortedEvents()) {
      if (event.actor !== "system" && !latest[event.actor]) {
        latest[event.actor] = event;
      }
    }
    return latest;
  }

  function setMode(next, detail) {
    mode = next;
    const configured = Boolean(getEventsBase());
    if (liveBadge) {
      liveBadge.dataset.mode = configured ? "live" : "demo";
    }
    if (modeLabel) {
      modeLabel.textContent = configured ? "Live from the office" : "Demo timeline";
    }
    if (sourceLine) {
      sourceLine.textContent = detail;
    }
  }

  function iconSvg(name) {
    const icons = {
      pen: '<path d="M4 14.5 13.2 5.3l2.5 2.5L6.5 17H4z"/><path d="M12.4 4.5l2.1-2.1 2.5 2.5-2.1 2.1z"/>',
      box: '<path d="M3 7.5 10 4l7 3.5v8L10 19 3 15.5z"/><path d="M3 7.5 10 11l7-3.5M10 11v8"/>',
      note: '<rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h4"/>',
      queue: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4.5l3 2"/>',
      review: '<path d="M3 10s2.8-5 7-5 7 5 7 5-2.8 5-7 5-7-5-7-5z"/><circle cx="10" cy="10" r="2.2"/>',
      share: '<circle cx="5" cy="10" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="15" cy="14" r="2"/><path d="M7 9.2 13.2 6.7M7 10.8l6.2 2.5"/>',
      book: '<path d="M4 5.5c1.4-.8 3.2-.8 4.6 0L10 6v11l-1.2-.6c-1.5-.8-3.3-.8-4.8 0zM16 5.5c-1.4-.8-3.2-.8-4.6 0L10 6v11l1.2-.6c1.5-.8 3.3-.8 4.8 0z"/>',
      idle: '<path d="M6 14c0-3 1.8-5 4-5s4 2 4 5"/><path d="M7 14h6v2H7z"/><path d="M12.5 9c.8-1.4 2.4-2 3.5-1"/>',
      chat: '<path d="M4 5h12v8H8l-4 3z"/>'
    };
    return `<svg viewBox="0 0 20 20" aria-hidden="true">${icons[name] || icons.idle}</svg>`;
  }

  function renderStations() {
    const latest = latestByActor();
    stations.forEach((station) => {
      const actor = station.getAttribute("data-actor-station");
      const event = latest[actor];
      const meta = event ? eventMeta(event.type) : EVENT_TYPES.idle;
      const state = event ? meta.state : "idle";
      station.dataset.state = state;
      const chip = station.querySelector(".status-chip");
      if (chip) {
        chip.textContent = event ? (event.type === "chat" ? "Chatting" : meta.chip) : "Idle";
      }
      const quote = station.querySelector(".desk-quote");
      if (quote) {
        const draft = event && event.draft ? truncate(event.draft, 72) : "";
        quote.hidden = !draft;
        quote.textContent = draft ? `“${draft}”` : "";
      }
    });
  }

  function renderFeed() {
    const now = Date.now();
    const events = sortedEvents().slice(0, FEED_LIMIT);
    feedEl.replaceChildren();
    tickerEl.replaceChildren();

    if (!events.length) {
      const empty = document.createElement("li");
      empty.className = "feed-empty";
      empty.textContent = "The office is quiet. Events will appear here.";
      feedEl.appendChild(empty);
      return;
    }

    events.forEach((event, index) => {
      const meta = eventMeta(event.type);
      const item = document.createElement("li");
      item.className = "feed-item";
      item.dataset.type = event.type;
      item.dataset.actor = event.actor;

      const icon = document.createElement("span");
      icon.className = "feed-icon";
      icon.innerHTML = iconSvg(meta.icon);

      const body = document.createElement("div");
      body.className = "feed-body";

      const top = document.createElement("div");
      top.className = "feed-top";
      const who = document.createElement("strong");
      who.textContent = actorName(event.actor);
      const time = document.createElement("time");
      time.dateTime = event.at;
      time.textContent = relativeTime(event.at, now);
      top.append(who, time);

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

      body.append(top, title);

      if (event.platform && PLATFORM_LABELS[event.platform]) {
        const platform = document.createElement("span");
        platform.className = "feed-platform";
        platform.textContent = PLATFORM_LABELS[event.platform];
        body.appendChild(platform);
      }

      if (event.draft) {
        const quote = document.createElement("blockquote");
        quote.className = "feed-quote";
        quote.textContent = `“${truncate(event.draft, 140)}”`;
        body.appendChild(quote);
      }

      item.append(icon, body);
      feedEl.appendChild(item);

      if (index < 3) {
        const tick = document.createElement("article");
        tick.className = "ticker-item";
        tick.dataset.type = event.type;
        const tickIcon = document.createElement("span");
        tickIcon.className = "ticker-icon";
        tickIcon.innerHTML = iconSvg(meta.icon);
        const tickCopy = document.createElement("div");
        const tickTitle = document.createElement("strong");
        tickTitle.textContent = event.title;
        const tickTime = document.createElement("span");
        tickTime.textContent = relativeTime(event.at, now);
        tickCopy.append(tickTitle, tickTime);
        tick.append(tickIcon, tickCopy);
        tickerEl.appendChild(tick);
      }
    });

    const newest = events[0];
    if (newest && newest.id !== latestAnnouncement) {
      latestAnnouncement = newest.id;
      if (liveRegion) {
        liveRegion.textContent = `${actorName(newest.actor)}: ${newest.title}`;
      }
    }
  }

  function render() {
    renderStations();
    renderFeed();
  }

  function ingest(event, fromLive) {
    if (!isValidEvent(event)) return false;
    if (fromLive && mode === "demo") {
      cancelDemo();
      eventsById.clear();
      setMode("live", "Streaming live office events.");
    }
    eventsById.set(event.id, event);
    while (eventsById.size > FEED_LIMIT) {
      const oldest = sortedEvents().at(-1);
      if (!oldest) break;
      eventsById.delete(oldest.id);
    }
    render();
    return true;
  }

  function ingestMany(list, fromLive) {
    if (!Array.isArray(list) || !list.length) return 0;
    const valid = list.filter(isValidEvent);
    if (!valid.length) return 0;
    if (fromLive && mode === "demo") {
      cancelDemo();
      eventsById.clear();
      setMode(sse && sse.readyState === EventSource.OPEN ? "live" : "poll", "Streaming live office events.");
    }
    valid.forEach((event) => eventsById.set(event.id, event));
    while (eventsById.size > FEED_LIMIT) {
      const oldest = sortedEvents().at(-1);
      if (!oldest) break;
      eventsById.delete(oldest.id);
    }
    render();
    return valid.length;
  }

  function cancelDemo() {
    demoCancelled = true;
    demoTimers.splice(0).forEach(clearTimeout);
  }

  function demoEvents() {
    const stamps = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
    return [
      {
        delay: 0,
        event: {
          id: "demo-1",
          at: stamps(0),
          type: "author.writing",
          actor: "author",
          title: "Drafting the next plain-English chapter",
          draft: "The cloud is just someone else’s computer — but that’s only the start of the story."
        }
      },
      {
        delay: 2400,
        event: {
          id: "demo-2",
          at: stamps(2400),
          type: "social.reviewing",
          actor: "social",
          title: "Reviewing next title",
          platform: "ig"
        }
      },
      {
        delay: 5200,
        event: {
          id: "demo-3",
          at: stamps(5200),
          type: "ceo.note",
          actor: "ceo",
          title: "Chief of Staff queued the next guide"
        }
      },
      {
        delay: 8200,
        event: {
          id: "demo-4",
          at: stamps(8200),
          type: "social.queued",
          actor: "social",
          title: "Social queued a post for Instagram",
          platform: "ig",
          draft: "Big tech ideas. Finally, they make sense."
        }
      },
      {
        delay: 11200,
        event: {
          id: "demo-5",
          at: stamps(11200),
          type: "author.shipped",
          actor: "author",
          title: "Author shipped What is the Cloud"
        }
      },
      {
        delay: 14200,
        event: {
          id: "demo-6",
          at: stamps(14200),
          type: "social.posted",
          actor: "social",
          title: "Social posted on Instagram",
          platform: "ig"
        }
      },
      {
        delay: 16800,
        event: {
          id: "demo-7",
          at: stamps(16800),
          type: "chat",
          actor: "author",
          title: "Anyone seen the latest cover proof?",
          draft: "Keep the yellow loud. Keep the explanation louder."
        }
      },
      {
        delay: 19800,
        event: {
          id: "demo-8",
          at: stamps(19800),
          type: "idle",
          actor: "system",
          title: "Coffee brewing in the little office"
        }
      }
    ];
  }

  function playDemo() {
    const sequence = demoEvents();
    const first = sequence[0];
    ingest(first.event, false);
    sequence.slice(1).forEach((beat) => {
      const wait = reducedMotion.matches ? Math.min(beat.delay, 400) : beat.delay;
      const timer = setTimeout(() => {
        if (demoCancelled) return;
        const event = { ...beat.event, at: new Date().toISOString() };
        ingest(event, false);
      }, wait);
      demoTimers.push(timer);
    });
  }

  async function pullSnapshot() {
    const base = getEventsBase();
    if (!base) return 0;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(`${base}/api/office/events?limit=${FEED_LIMIT}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) throw new Error(`events ${response.status}`);
    const payload = await response.json();
    return ingestMany(payload && payload.events, true);
  }

  function startPolling() {
    if (pollTimer || !getEventsBase()) return;
    if (mode !== "demo") {
      setMode("poll", "Live office feed · refreshing.");
    }
    const tick = () => {
      pullSnapshot().catch(() => {
        if (mode === "demo") {
          setMode("demo", "Could not reach the events API. Showing the office preview.");
        }
      });
    };
    pollTimer = setInterval(tick, POLL_MS);
    tick();
  }

  function stopSse() {
    if (sse) {
      sse.close();
      sse = null;
    }
  }

  function connectSse() {
    const base = getEventsBase();
    if (!base || !window.EventSource) {
      startPolling();
      return;
    }
    stopSse();
    let opened = false;
    sse = new EventSource(`${base}/api/office/events/stream`);
    const watchdog = setTimeout(() => {
      if (!opened) {
        stopSse();
        startPolling();
      }
    }, SSE_OPEN_MS);

    const onPayload = (data) => {
      try {
        const event = JSON.parse(data);
        ingest(event, true);
      } catch {
        return;
      }
    };

    sse.onopen = () => {
      opened = true;
      clearTimeout(watchdog);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (mode !== "demo") {
        setMode("live", "Streaming live office events.");
      } else {
        setMode("demo", "Connected — waiting for the next live event.");
      }
    };
    sse.onmessage = (message) => onPayload(message.data);
    sse.addEventListener("office", (message) => onPayload(message.data));
    sse.onerror = () => {
      clearTimeout(watchdog);
      stopSse();
      startPolling();
    };
  }

  async function connectLive() {
    const base = getEventsBase();
    if (!base) {
      setMode("demo", "Offline preview — set NEXT_PUBLIC_OFFICE_EVENTS_URL to stream live events.");
      return;
    }
    setMode("demo", "Connected — waiting for the next live event.");
    try {
      const count = await pullSnapshot();
      if (count > 0) {
        setMode("live", "Streaming live office events.");
      }
    } catch {
      setMode("demo", "Could not reach the events API yet. Showing the office preview.");
    }
    connectSse();
  }

  playDemo();
  connectLive();
  setInterval(renderFeed, 30000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderFeed();
  });
})();
