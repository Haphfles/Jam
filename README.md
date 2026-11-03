# GREENLIGHT Band — deployment

This folder is the complete deployment package. Upload **the contents of this folder** to the root of your GitHub repository. Do not upload the parent GREENLIGHT Band folder or the development folder.

## Host the live app

GitHub stores the source. GitHub Pages alone cannot run this app: multiplayer, the waiting queue, and phone controllers require the Node server.

On a Node-compatible hosting service, connect your GitHub repository and configure:

- Node.js: version 20 or newer.
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/api/health`
- `PUBLIC_URL`: your complete deployed HTTPS address, without a trailing slash (for example, `https://your-band.example.com`). This controls the address in QR codes.
- `PORT`: use the value supplied by the host. The app otherwise defaults to 3000.

A `render.yaml` configuration is included for hosts supporting Render blueprints. Supply PUBLIC_URL when setting up the service, and update it to match the final deployed address if necessary.

Use one server instance with support for long-lived Server-Sent Events (SSE). Disable proxy buffering for SSE. For continuous availability, choose a service that stays running rather than sleeping when idle.

## Verify after deployment

1. Open the deployed HTTPS address on your computer and click Start listening.
2. Join an instrument and select Use your phone.
3. Confirm the QR link starts with your deployed HTTPS address, not localhost or a local IP address.
4. Scan the fresh QR code with your phone and play. Keep the computer browser open with sound enabled.
5. Open the site in another browser to verify live listening and the shared stage.

QR links connect one phone and expire after five minutes. Create a new one if pairing fails. Internet-hosted phone controllers do not need to share the computer’s Wi-Fi.

## Files

- `server.js`: live room, five seats, queue, phone pairing, and note relay.
- `public/`: browser interface, instrument controls, and synthesized audio.
- `package.json` and `package-lock.json`: runtime dependency configuration.
- `render.yaml`: deployment configuration.
- `.env.example`: environment variable reference; it is not loaded automatically.
- `.gitignore`: prevents local dependencies, caches, and secrets from being committed.

No API keys are required. Dependencies are intentionally omitted; the hosting service installs them with npm ci. To run locally, use npm ci followed by npm start.

## Current limits

This version has one in-memory room. Server restarts clear seats and queues. Audio is synthesized in each browser, and remote timing depends on network latency. Direct Bluetooth pairing is not implemented. For a broad public launch, infrastructure rate limiting, moderation, and operational monitoring are still needed.
