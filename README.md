# Publish GREENLIGHT Band

Upload the contents of `deployment/` to the GitHub Pages publishing root. Keep `src/` and `vendor/` alongside `index.html`, `app.js`, `controller.html`, `controller.js`, `styles.css`, `art.mjs`, `shared-config.json`, and `.nojekyll`. Replace existing files. No Node server or build step is needed on GitHub.

## Play

- **Play here** opens a full-screen instrument on phone or computer. This is solo play until you host or join a band. It works without Supabase.
- **Host a band** creates a shared room. Invite others with its QR code or link. The host may also claim one of the five instruments and play here.
- **Join a band** accepts the host invitation. Each player gets a unique instrument; additional players wait and can listen. Keep the host and player pages visible.
- Each player hears their own notes locally immediately. The host validates and distributes notes to everyone else, who synthesize them on their devices. Network delay still affects other players' notes; late notes are dropped, not replayed. This is live event distribution, not an audio stream or sample-accurate synchronized output.
- Use headphones when devices are nearby to avoid hearing several speakers playing the same band. Tap **Enable sound / full screen** if mobile audio is suspended.
- Full-screen instrument layout works even where native browser fullscreen is unavailable. **Back to room** exits the instrument view without releasing your seat; **Leave the stage** releases a joined player's seat.

GitHub Pages hosts the static files. Supabase handles invitations, room state and reliable commands; WebRTC carries live notes when available, with Supabase fallback. The supplied public config must remain enabled. No loop/recording tools are included.

Validation: `npm --prefix development test`; package: `python3 scripts/package-static.py` from the project root. Physical phone and multi-device latency should be checked after upload.
