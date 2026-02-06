# Job Hopper – PWA Install and Web Push (Nick Schepis)

**Approach:** Job Hopper is a website plus Progressive Web App (PWA). No native mobile app; users can “Add to home screen” and optionally receive web push notifications.

---

## PWA scope

- **Installable:** Manifest and service worker so the site can be added to home screen (iOS/Android/desktop) and run in standalone mode.
- **Offline/cache:** Optional; cache static assets or key pages for faster load.
- **Web push (optional):** Browser push for new job matches and subscription updates when the user has granted permission. No app store submission required.

---

## Implementation notes

- Add `manifest.json` (name, short_name, start_url, display: standalone, icons).
- Register a service worker; use for push subscription (VAPID keys, store endpoint in backend for sending).
- No Apple/Google app store submission; no native build toolchain. Deploy as web app; PWA install is browser-driven.

---

## Out of scope

- Native iOS/Android apps and app store submission.
