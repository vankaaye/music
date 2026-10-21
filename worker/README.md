# Music admin Worker

Fronts the R2 bucket `music` so the library is managed from inside the app.

Endpoints (all need header `X-Admin-Passcode`, checked against the
`ADMIN_PASSCODE` secret): `GET /api/ping`, `GET /api/list`,
`POST /api/upload` (multipart: `file`, optional `meta` JSON), `POST /api/delete`
(`{"key":"..."}`), `POST /api/rebuild`. Every change rewrites `library.json`.

## Deploy

    cd worker
    npx wrangler login                    # or export CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
    npx wrangler deploy
    npx wrangler secret put ADMIN_PASSCODE

Route: none needed — it deploys to `https://music-admin.<your-subdomain>.workers.dev`.
`ALLOWED_ORIGINS` in `wrangler.toml` is the CORS allow-list for the app's origin.
