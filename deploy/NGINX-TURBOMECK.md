# nginx: Turbomeck (storefront + studio subdomain)

## Reference config (Option 2 — **recommended**)

**`deploy/nginx-turbomeck.cloud.conf`** is set up for:

- **`https://turbomeck.cloud`** — storefront Next.js **:3000**; `/api/product/` only to **3000** (catalog + checkout).
- **`https://studio.turbomeck.cloud`** — admin Next.js **:3001** for **all** paths (`/studio`, `/api/product` saves, `/api/auth` for staff login, `/_next/`, etc.).
- **Redirects** — `https://turbomeck.cloud/studio/...` and `/login/...` → **301** → same path on **`studio.turbomeck.cloud`** (old bookmarks keep working).

Maps at the top only cover **`/api/reviews`** routing between apps.

### Deploy checklist

1. **DNS** — `A` / `AAAA` for **`studio.turbomeck.cloud`** → same VPS as the shop.
2. **TLS** — after DNS resolves:

   ```bash
   sudo certbot certonly --nginx -d studio.turbomeck.cloud
   ```

   Paths in the config assume certs live under  
   `/etc/letsencrypt/live/studio.turbomeck.cloud/`.

3. **Merge nginx** — paste or include the file in `sites-enabled`, then:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. **Admin app env** (`apps/admin/.env`, picked up by PM2 `ecosystem.config.js`):

   ```env
   AUTH_URL=https://studio.turbomeck.cloud
   NEXTAUTH_URL=https://studio.turbomeck.cloud
   ```

   The admin app forces `AUTH_SIGNIN_PATH=/` (via `next.config.ts` and PM2) so NextAuth does not send staff to `/studio` in the URL bar. Optionally set `AUTH_VERIFY_PATH` if you move the “check your email” page (default `/studio/verify`).

   Restart admin after changes:

   ```bash
   pm2 restart admin --update-env
   ```

   Storefront **`AUTH_URL` / `NEXTAUTH_URL`** stay **`https://turbomeck.cloud`** (customer login + magic links).

5. **Optional:** set cookie **`domain=.turbomeck.cloud`** only if you intentionally want one session shared across both hosts (usually not required; staff use the studio host only).

### Magic-link email (SMTP)

Mail is sent by `@repo/auth` using **`app_settings.mail`** (JSON) in the database. If that row is missing or empty, auth falls back to **environment variables** on the server running Next (**client** and **admin**): `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (`true`/`1` for SSL), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Set these in **PM2** or `.env` for each Node process — not in nginx.

---

## What went wrong (short)

1. **403 when saving products** — On the **shop** host, `/api/product/` was proxied only to **3000**. The storefront blocks admin `PUT`. With Option 2, editors use **`admin.*`**, so `/api/product/` there hits **3001**.

2. **Public `GET /api/product` 307 to login** — If an nginx regex sends **GET** catalog requests to **3001**, fix the regex (do not include `product` in the admin-only API block on the **apex** server).

### Smokes

```bash
curl -sSI https://turbomeck.cloud/api/product/products | head -n 5
# Expect 200 on shop

curl -sSI https://studio.turbomeck.cloud/studio | head -n 5
# Expect 200 or 307 to login — must not be shop (3000)

curl -sSI https://turbomeck.cloud/studio | grep -i location
# Expect 301 → https://studio.turbomeck.cloud/studio
```

---

## Legacy: single hostname + Referer split

If you **cannot** use a dedicated studio subdomain, you can route `/api/product/` with `map $http_referer` (studio/login → 3001, default → 3000) and keep `/_next/` on a Referer map. The repo previously documented that pattern; **Option 2 avoids Referer quirks** (empty Referer, new tabs).
