# GREENLIGHT Band — live instruments

Upload **all contents of deployment/** to your GitHub repository root, including `src/`, `vendor/`, `styles.css` and `shared-config.json`. Enable Pages from your branch's root. There is no production Node server or build step. Open the Pages URL on your computer, select Open the stage, then scan an instrument QR code on a phone. Localhost QR links cannot be opened from another device.

## Connections

Supabase is already configured through `shared-config.json`, using RODA's public publishable configuration. It handles QR room introductions, WebRTC signaling, reliable settings/state, and fallback note delivery. RODA files remain unchanged. Never put a secret/service-role key in browser files.

Live notes prefer a WebRTC data channel directly between phone and host. It is unordered with zero retransmissions; congested sends are dropped rather than queued by the app. Supabase carries notes if WebRTC cannot connect. Google’s public STUN service helps discover network routes; there is no TURN relay configured. Restrictive networks can prevent direct connections, in which case the Supabase fallback remains available. No camera, microphone, app installation, or Bluetooth is required.

The phone and instrument cards show Direct (WebRTC) or Relay (Supabase). Phone RTT measures messages over the active route, not physical press-to-speaker latency. Clock sync is reset and inputs disabled briefly when switching routes. Same Wi-Fi and built-in/wired host speakers usually provide the most responsive setup; actual performance depends on devices and networks.

## Live playing only

Five unique instrument seats and a FIFO waiting list remain. All sound is generated on the host computer. The host may reserve one seat for its keyboard (A S D F G H J K). Opening the stage enables playing; Pause/Resume controls everyone. Each phone can change its own volume. Keep host and phone pages visible. Host backgrounding pauses playback; a missing phone is released after about ten seconds.

There are no recording, pattern, quantization, or repeated-playback tools in this version. Nothing is saved or played automatically. Remote audio streaming is not provided.

## Timing

The fixed 120 ms delay has been removed. Local keyboard input schedules about 2 ms ahead. Remote input uses recent measured arrival ages to choose a small adaptive scheduling target (6–35 ms direct; 12–80 ms relay), measured from the estimated original press time—not added on top of network transit. Already-arrived notes schedule at least 2 ms ahead. These are software targets, not guaranteed end-to-end latency.

Sequence numbers and stage epochs reject duplicate/old-session inputs. Age gates drop stale packets without allowing a late packet to expand its own deadline. Volume commands and pause/resume state retain recipient-bound acknowledgements, deduplication, bounded retries and failure feedback. A broken connection is not treated as successful delivery.

## Publishing checklist

At the repository root you must have `index.html`, `controller.html`, `app.js`, `controller.js`, `art.mjs`, `styles.css`, `shared-config.json`, `src/` and `vendor/`. Missing CSS gives an unstyled page; missing modules prevent instrument cards and controls from working. Keep `.nojekyll` too. Remove obsolete Node/Render files from the old upload. After Pages finishes deploying, refresh both host and phone tabs and generate new QR codes.

Public room links are capability invitations, not authenticated accounts. Anyone with a link can join; only share with intended players. Supabase Realtime quotas are shared with any other app using the same project. Keep its public broadcast channels enabled.

## Development

From `development/`, run `npm start` for a static preview, `npm test` for local tests, and `npm run package` to refresh deployment. Files are served under `/jam/` locally to exercise project-relative paths. Local tests do not establish physical-phone or real-world speaker latency.

QR library: Kazuhiko Arase, MIT; attribution is preserved in vendor/qrcode.mjs. Supabase connection lifecycle adapted from RODA, read as reference only.
