# Explain It Like I'm Normal

A responsive website for Clinton Wesley Ivins' book series, covering health, wealth, motivation, technology and AI in plain English.

## Run locally

This is a static website with no installation or build step:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000 in your browser.

## Files

- `dist/index.html` — homepage, newest guide, YouTube feature and book catalogue.
- `dist/style.css` — responsive layout and brand styling.
- `dist/office.js` — live Little Office UI state mapping, polling and optional SSE.
- `dist/office-events.json` — static local event store (newest-first, max 40 entries).
- `dist/assets/` — original logo, book covers, author portrait and supporting artwork.
- `.openai/hosting.json` — configuration for the existing private Sites preview.

The homepage uses a modern catalogue layout, a latest-video link for the YouTube channel and reduced-motion-safe cover animation.

## Little Office live section

The standalone `dist/office.html` page includes:

- An isometric-style office scene (Author desk, Chief of Staff desk, Social Media desk, coffee machine, parcel pile)
- A right sidebar social queue
- A bottom live ticker

### Static mode (current)

This repository is static-first. The live feed currently reads from `dist/office-events.json` every 5 seconds. No synthetic events are generated; the UI stays idle when there are no events.

Event shape:

```ts
type OfficeEvent = {
	id: string
	at: string // ISO
	type: 'author.writing' | 'author.shipped' | 'ceo.note' | 'social.queued' | 'social.reviewing' | 'social.posted' | 'book.live' | 'idle'
	actor: 'author' | 'ceo' | 'social'
	title: string
	draft?: string
	platform?: 'instagram' | 'facebook'
	url?: string
}
```

### API upgrade path

To move to true live writes:

- Add `GET /api/office/events` returning last 40 events, newest-first
- Add `POST /api/office/events` with shared secret header `x-office-secret` validated against `OFFICE_EVENT_SECRET`
- Optionally add SSE at `/api/office/events/stream`

The client is already prepared to use SSE if available, and falls back to polling when not.

## Hosting

Serve `dist/` as the public directory on a static website host. No API keys or server-side services are required. Existing book purchase links lead to Amazon, and contact links use email.

Live website: https://explainitnormal.co.uk/clint/
