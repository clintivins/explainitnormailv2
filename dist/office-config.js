/* Events API origin only — no secrets.
   Set NEXT_PUBLIC_OFFICE_EVENTS_URL at deploy, or edit the string below.
   Example: "https://events.explainitnormal.co.uk"
   Endpoints used:
     GET {base}/api/office/events?limit=40
     GET {base}/api/office/events/stream  (SSE) */
window.NEXT_PUBLIC_OFFICE_EVENTS_URL = "https://office-events-api-eta.vercel.app";
