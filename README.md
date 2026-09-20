# Explain It Like I'm Normal

A responsive website mockup for Clinton Wesley Ivins' book series, preserving the original logo, book covers and navy, yellow and cyan identity.

## Run locally

This is a static website with no installation or build step:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000 in your browser. The office stream is at http://localhost:8000/office.html (and http://localhost:8000/office/).

## Files

- `dist/index.html` — homepage content and video player.
- `dist/office.html` — live Meet the Team / office stream.
- `dist/style.css` — responsive layout and brand styling.
- `dist/office.css` / `dist/office.js` — office scene, activity feed and events client.
- `dist/office-config.js` — events API origin (`NEXT_PUBLIC_OFFICE_EVENTS_URL`).
- `dist/film.js` — video playback, replay and reduced-motion handling.
- `dist/assets/` — original logo, seven book covers, video poster and finished MP4.
- `.openai/hosting.json` — configuration for the existing private Sites preview.

The 20-second film uses illustrated scenes, animated camera moves, transitions, electronic sound effects and an original-logo end card. It is a motion-graphics film, not full character animation. Playback starts muted when the player enters view, unless reduced motion is enabled. Native controls provide pause, sound and fullscreen; a separate button replays the film.

## Office events

The `/office` page reads a live activity feed from an external API. Set the API origin in `dist/office-config.js`, or inject the same value as `window.NEXT_PUBLIC_OFFICE_EVENTS_URL` at deploy:

```js
window.NEXT_PUBLIC_OFFICE_EVENTS_URL = "https://your-events-host.example";
```

If you later move this site to Next.js, the same value is `NEXT_PUBLIC_OFFICE_EVENTS_URL`.

The client calls:

- `GET {base}/api/office/events?limit=40` for the recent snapshot
- `GET {base}/api/office/events/stream` for Server-Sent Events

If the origin is empty, or the API is unreachable, the page plays a short finite demo timeline so the office never looks dead. It does not invent a continuous random feed. There is no client POST and no secrets in the browser.

## Hosting

Serve `dist/` as the public directory on a static website host. No API keys or server-side services are required. Existing book purchase links lead to Amazon, and contact links use email.

Private design preview: https://explain-it-normal-design.chizzman76.chatgpt.site

The original business website is not modified by this repository.
