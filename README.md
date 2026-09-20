# Explain It Like I'm Normal

A responsive website mockup for Clinton Wesley Ivins' book series, preserving the original logo, book covers and navy, yellow and cyan identity.

## Run locally

This is a static website with no installation or build step:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000 in your browser.

## Files

- `dist/index.html` — homepage content and video player.
- `dist/style.css` — responsive layout and brand styling.
- `dist/film.js` — video playback, replay and reduced-motion handling.
- `dist/assets/` — original logo, seven book covers, video poster and finished MP4.
- `.openai/hosting.json` — configuration for the existing private Sites preview.

The 20-second film uses illustrated scenes, animated camera moves, transitions, electronic sound effects and an original-logo end card. It is a motion-graphics film, not full character animation. Playback starts muted when the player enters view, unless reduced motion is enabled. Native controls provide pause, sound and fullscreen; a separate button replays the film.

## Hosting

Serve `dist/` as the public directory on a static website host. No API keys or server-side services are required. Existing book purchase links lead to Amazon, and contact links use email.

Private design preview: https://explain-it-normal-design.chizzman76.chatgpt.site

The original business website is not modified by this repository.
