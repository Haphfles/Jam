# GREENLIGHT Band — GitHub Pages edition

The deployment folder is a **static website**. Upload its **contents** to the root of your GitHub repository. `index.html`, `controller.html`, `shared-config.json`, `src/`, and `vendor/` must remain together. No Node hosting, install step, or build command is needed in production.

## Publish on GitHub Pages

1. Replace the previous repository files with this deployment package. Remove obsolete `server.js`, `render.yaml`, `package.json`, `package-lock.json`, `.env.example`, and the old `public/` folder if they are still present in the repository.
2. In repository Settings → Pages, select **Deploy from a branch**, select the branch containing these files, and choose **/(root)**. Save.
3. Wait for the Pages deployment to finish successfully in Actions. For the `haphfles/jam` repository, visit `https://haphfles.github.io/jam/`.
4. Refresh any old tabs. Click **Open the stage** on your computer, then **Connect phone** on an instrument or **Invite the band**.
5. Scan the new QR code on each phone, enter a name, and tap Connect. Start the clock on the host. Audio plays only on the computer.

All asset and controller URLs are relative, so a GitHub project subpath such as `/jam/` works. The QR code automatically uses the address from which the host was opened. QR links generated on localhost will not work on a phone; generate them from the published HTTPS site instead.

## Supabase

GitHub Pages hosts all application files. Supabase Realtime relays small input and control messages; this is not a service-free peer-to-peer game. The package includes the **public publishable configuration** from the existing RODA game. No secret/service-role key is included. RODA itself was not modified.

GREENLIGHT uses a separate random channel namespace, `greenlight-band-<room token>`. Supabase must permit public Realtime broadcast channels for the configured project. No database tables, SQL migrations, or Edge Functions are needed. If using a separate project, update `shared-config.json` with its HTTPS project URL and `sb_publishable_...` key. Never put a secret/service-role key in browser files.

Rooms are capability links, not authenticated accounts: share them only with intended participants. The host is the authority on five seats and the FIFO queue. The first available seat is assigned if the instrument named by an invitation is already occupied. Connections and messages consume the Supabase project's shared Realtime quota, including when RODA is also running.

## Playing and loops

- One computer hosts audio and the musical clock. Five phones can each own a unique instrument. Extra phones wait in order.
- The host can reserve one instrument for keyboard playing with A S D F G H J K.
- Notes play live while the clock runs. Melodic sounds use C minor pentatonic.
- Record arms a new **four-bar loop** on the next bar and replaces that instrument's previous loop. Input is quantized to sixteenth notes. After four bars, the recording repeats automatically.
- Start loop resumes a saved pattern on the next bar. Stop loop preserves it; Clear erases it. Releasing a player also clears their loop.
- Change tempo while stopped. Starting the host transport restarts saved loops together. Host transport and instrument controls are available on the computer; phone controls affect only their own instrument.
- Phones do not produce audio. People listen through the host speakers. This edition does not stream audio to remote listeners, record audio files, or use Bluetooth.

## Timing and reliability

Clock synchronization uses several ping/pong samples and the lowest round-trip sample from the most recent ten. Phone events carry a sequence, host-clock timestamp, and transport epoch. Inputs are sent once, with a 120 ms scheduling buffer. The host rejects repeated inputs, old epochs, timestamps over 60 ms into the future, and notes arriving more than 20 ms past their scheduled time. Late notes are discarded, not replayed after reconnect.

Host loops run from a 25 ms scheduler with an 80 ms Web Audio lookahead. Late loop ticks are skipped after a stall. Start/stop/clear/record/volume commands use recipient-bound acknowledgements, deduplication, and retries for up to five seconds, plus host command results. Controls show failure if confirmation is not received. State changes use reliable delivery and are also refreshed periodically. Reliability is bounded, not a guarantee during an outage.

## Lifecycle and limits

Keep both host and controllers visible. Backgrounding the host stops audio and the transport; resume with Start the clock. Phone controls disable when the host is missing or the clock is unsynchronized. Ten seconds without a phone heartbeat releases its seat to the queue. Reloading the host creates a new room and new QR links; loops are held in memory and are not persisted.

All devices need internet access to Supabase, but do not need the same Wi-Fi once the host is on GitHub Pages. Supabase latency varies: this is a casual jam tool, not guaranteed low-latency professional performance. A host must remain open for a room to exist.

## Troubleshooting

- **404 at `/jam/`:** verify Pages is enabled and `index.html` is at the selected publishing root. Check the deployment in Actions.
- **Stage won't connect:** check `shared-config.json`, public Realtime channel access, internet access and Supabase project availability/quotas.
- **Phone cannot open QR URL:** generate it from the published site, not localhost; use a new code after restarting the host.
- **Connected but silent:** start the host clock, enable host audio, unmute, and keep the host visible.
- **Notes are dropped:** improve connectivity; delayed notes are intentionally not replayed.

QR vendor: QR Code Generator by Kazuhiko Arase, MIT license (attribution preserved in `vendor/qrcode.mjs`). Connection lifecycle adapted from RODA's phone-channel and phone-host files, read as references only.
