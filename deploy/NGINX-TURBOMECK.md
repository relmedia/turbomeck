# nginx: Turbomeck (storefront + studio subdomain)

## Reference config (Option 2 — **recommended**)

**`deploy/nginx-turbomeck.se.conf`** is set up for:

- **`https://turbomeck.se`** — storefront Next.js **:3000**; `/api/product/` only to **3000** (catalog + checkout).
- **`https://studio.turbomeck.se`** — admin Next.js **:3001** for **all** paths (`/studio`, `/api/product` saves, `/api/auth` for staff login, `/_next/`, etc.).
- **Redirects** — `https://turbomeck.se/studio/...` and `/login/...` → **301** → same path on **`studio.turbomeck.se`** (old bookmarks keep working).

Maps at the top only cover **`/api/reviews`** routing between apps.

### Deploy checklist

1. **DNS** — `A` / `AAAA` for **`studio.turbomeck.se`** → same VPS as the shop.
2. **TLS** — after DNS resolves:

   ```bash
   sudo certbot certonly --nginx -d studio.turbomeck.se
   ```

   Paths in the config assume certs live under  
   `/etc/letsencrypt/live/studio.turbomeck.se/`.

3. **Merge nginx** — paste or include the file in `sites-enabled`, then:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. **Admin app env** (`apps/admin/.env`, picked up by PM2 `ecosystem.config.js`):

   ```env
   AUTH_URL=https://studio.turbomeck.se
   NEXTAUTH_URL=https://studio.turbomeck.se
   # Optional; PM2 + admin next.config also set this from the two lines above:
   # PUBLIC_AUTH_ORIGIN=https://studio.turbomeck.se
   ```

   **Magic-link emails** must use **`https://studio.turbomeck.se`**, not the shop apex. On nginx, **`turbomeck.se`** routes **`/api/auth/`** to the **storefront (:3000)** only. If the link in the mail is **`https://turbomeck.se/api/auth/callback/...`**, the sign-in request was handled by the **shop**, not admin — open **`https://studio.turbomeck.se`** for staff login (the login page redirects off the shop hosts when mis-opened). Staff links are rebuilt in **`@repo/auth`** on the **:3001** process. Rebuild admin and **`pm2 restart admin --update-env`** after pulling changes.

   The admin app forces `AUTH_SIGNIN_PATH=/` (via `next.config.ts` and PM2) so NextAuth does not send staff to `/studio` in the URL bar. Optionally set `AUTH_VERIFY_PATH` if you move the “check your email” page (default `/studio/verify`).

   **“Not secure” / broken padlock** usually means mixed content (an HTTPS page loading `http://…` assets) or a certificate problem. Set **`NEXTAUTH_URL`** / **`AUTH_URL`** to `https://studio.turbomeck.se` for production builds, and avoid **`NEXT_PUBLIC_UPLOADS_BASE`** pointing at plain HTTP; omit it so `/uploads/` stays same-origin, or use an HTTPS URL. After updating nginx, reload to apply **HSTS** on the studio vhost.

   Restart admin after changes:

   ```bash
   pm2 restart admin --update-env
   ```

   Storefront **`AUTH_URL` / `NEXTAUTH_URL`** stay **`https://turbomeck.se`** (customer login + magic links).

5. **Optional:** set cookie **`domain=.turbomeck.se`** only if you intentionally want one session shared across both hosts (usually not required; staff use the studio host only).

### Magic-link email (SMTP)

Mail is sent by `@repo/auth` using **`app_settings.mail`** (JSON) in the database. If that row is missing or empty, auth falls back to **environment variables** on the server running Next (**client** and **admin**): `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (`true`/`1` for SSL), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Set these in **PM2** or `.env` for each Node process — not in nginx.

---

## What went wrong (short)

1. **403 when saving products** — On the **shop** host, `/api/product/` was proxied only to **3000**. The storefront blocks admin `PUT`. With Option 2, editors use **`admin.*`**, so `/api/product/` there hits **3001**.

2. **Public `GET /api/product` 307 to login** — If an nginx regex sends **GET** catalog requests to **3001**, fix the regex (do not include `product` in the admin-only API block on the **apex** server).

3. **Account page shows 0 orders / CORS or `access-denied`** — On the **apex** (`turbomeck.se`), **`GET /api/orders`** must go to the **storefront (:3000)** (session-scoped list for customers). If the admin-only nginx regex includes **`orders`**, that request hits **admin (:3001)**, which rejects the shop session and may redirect to `studio.…/access-denied`, causing fetch failures. **Do not include `orders` in the apex admin API regex** — staff use **`https://studio.turbomeck.se/api/orders`** (all studio traffic is :3001). If you use a separate host such as **`api.turbomeck.se`**, route **`/api/orders`** the same way as on the apex shop (to the client app), not to admin-only upstreams.

### Smokes

```bash
curl -sSI https://turbomeck.se/api/product/products | head -n 5
# Expect 200 on shop

curl -sSI https://studio.turbomeck.se/studio | head -n 5
# Expect 200 or 307 to login — must not be shop (3000)

curl -sSI https://turbomeck.se/studio | grep -i location
# Expect 301 → https://studio.turbomeck.se/studio
```

---

## Legacy: single hostname + Referer split

If you **cannot** use a dedicated studio subdomain, you can route `/api/product/` with `map $http_referer` (studio/login → 3001, default → 3000) and keep `/_next/` on a Referer map. The repo previously documented that pattern; **Option 2 avoids Referer quirks** (empty Referer, new tabs).
