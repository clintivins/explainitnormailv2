(function () {
  const MAX_EVENTS = 40;
  const POLL_MS = 5000;

  const CHIP_DEFAULTS = {
    author: "Drafting...",
    ceo: "Reviewing next title",
    social: "Posting..."
  };

  const CHIP_LABELS = {
    "author.writing": "Drafting...",
    "author.shipped": "Shipped",
    "ceo.note": "Reviewing next title",
    "social.queued": "Queued",
    "social.reviewing": "Reviewing",
    "social.posted": "Posting...",
    "book.live": "Live"
  };

  const TYPE_ICONS = {
    "author.writing": "✍",
    "author.shipped": "📦",
    "ceo.note": "🗂",
    "social.queued": "⏱",
    "social.reviewing": "🔎",
    "social.posted": "⬆",
    "book.live": "📘",
    idle: "•"
  };

  let chipAuthor = null;
  let chipCeo = null;
  let chipSocial = null;
  let tickerCards = null;

  let events = [];
  let pollTimer = null;
  let sse = null;
  let lastSeenEventId = "";

  function normalizeEvents(input) {
    const arr = Array.isArray(input) ? input : (input && Array.isArray(input.events) ? input.events : []);
    return arr
      .filter(function (item) {
        return item && item.id && item.at && item.type && item.title;
      })
      .sort(function (a, b) {
        return new Date(b.at).getTime() - new Date(a.at).getTime();
      })
      .slice(0, MAX_EVENTS);
  }

  function findLatest(filterFn) {
    return events.find(filterFn) || null;
  }

  function relTime(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) {
      return "now";
    }
    const diffMs = Math.max(0, Date.now() - then);
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) {
      return "now";
    }
    if (mins < 60) {
      return mins + "m ago";
    }
    const hrs = Math.round(mins / 60);
    return hrs + "h ago";
  }

  function setChip(el, event, fallback) {
    if (!el) {
      return;
    }
    if (!event) {
      el.textContent = fallback;
      return;
    }
    const prefix = CHIP_LABELS[event.type] || fallback;
    el.textContent = prefix;
  }

  function renderChips() {
    const authorEvent = findLatest(function (event) {
      return event.actor === "author" || event.type === "author.writing" || event.type === "author.shipped" || event.type === "book.live";
    });
    const ceoEvent = findLatest(function (event) {
      return event.actor === "ceo" || event.type === "ceo.note";
    });
    const socialEvent = findLatest(function (event) {
      return event.actor === "social" || event.type === "social.queued" || event.type === "social.reviewing" || event.type === "social.posted";
    });

    setChip(chipAuthor, authorEvent, CHIP_DEFAULTS.author);
    setChip(chipCeo, ceoEvent, CHIP_DEFAULTS.ceo);
    setChip(chipSocial, socialEvent, CHIP_DEFAULTS.social);
  }

  function createCard(event) {
    const card = document.createElement("article");
    card.className = "live-card";

    const icon = document.createElement("div");
    icon.className = "live-icon";
    icon.textContent = TYPE_ICONS[event.type] || "•";

    const body = document.createElement("div");
    body.className = "live-copy";

    const title = document.createElement("strong");
    title.textContent = event.title;

    const time = document.createElement("span");
    time.textContent = relTime(event.at);

    body.appendChild(title);
    body.appendChild(time);

    card.appendChild(icon);
    card.appendChild(body);

    if (event.type === "social.posted" && event.url) {
      const link = document.createElement("a");
      link.href = event.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.className = "live-link";
      link.textContent = "↗";
      card.appendChild(link);
    }

    return card;
  }

  function renderTicker() {
    if (!tickerCards) {
      return;
    }
    tickerCards.innerHTML = "";

    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "live-empty";
      empty.textContent = "No events yet.";
      tickerCards.appendChild(empty);
      return;
    }

    events.slice(0, 3).forEach(function (event) {
      tickerCards.appendChild(createCard(event));
    });
  }

  function pulseBar() {
    const bar = document.querySelector(".office-livebar");
    if (!bar) {
      return;
    }
    bar.classList.remove("livebar-pulse");
    void bar.offsetWidth;
    bar.classList.add("livebar-pulse");
  }

  function render() {
    renderChips();
    renderTicker();
  }

  function mergeIncoming(incoming) {
    const next = normalizeEvents(incoming);
    if (!next.length) {
      return;
    }

    if (lastSeenEventId && next[0].id !== lastSeenEventId) {
      pulseBar();
    }

    lastSeenEventId = next[0].id;
    events = next;
    render();
  }

  async function fetchEvents() {
    const sources = ["office-events.json", "/office-events.json", "/api/office/events"];
    for (let i = 0; i < sources.length; i += 1) {
      try {
        const response = await fetch(sources[i], { cache: "no-store" });
        if (!response.ok) {
          continue;
        }
        mergeIncoming(await response.json());
        return;
      } catch (_error) {
        // Try next source.
      }
    }
  }

  function startPolling() {
    if (pollTimer) {
      return;
    }
    fetchEvents();
    pollTimer = window.setInterval(fetchEvents, POLL_MS);
  }

  function stopPolling() {
    if (!pollTimer) {
      return;
    }
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  function startSSE() {
    if (!window.EventSource) {
      return;
    }
    try {
      sse = new EventSource("/api/office/events/stream");
      let opened = false;

      sse.onopen = function () {
        opened = true;
        stopPolling();
      };

      sse.onmessage = function (message) {
        try {
          const payload = JSON.parse(message.data);
          if (Array.isArray(payload) || (payload && Array.isArray(payload.events))) {
            mergeIncoming(payload);
          } else {
            mergeIncoming([payload].concat(events));
          }
        } catch (_error) {
          // Ignore malformed message.
        }
      };

      sse.onerror = function () {
        if (sse) {
          sse.close();
        }
        sse = null;
        if (!opened) {
          startPolling();
        }
      };
    } catch (_error) {
      startPolling();
    }
  }

  function init() {
    chipAuthor = document.querySelector("[data-chip-for='author']");
    chipCeo = document.querySelector("[data-chip-for='ceo']");
    chipSocial = document.querySelector("[data-chip-for='social']");
    tickerCards = document.getElementById("office-ticker-cards");

    if (!chipAuthor || !chipCeo || !chipSocial || !tickerCards) {
      return;
    }

    render();
    startPolling();
    startSSE();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
