# nginx: storefront `/api/product` must hit the client (port 3000)

## Reference config

Use **`deploy/nginx-turbomeck.cloud.conf`** as a **single paste** into `/etc/nginx/sites-available/turbomeck` (or your site file). It includes the two **`map`** blocks at the top (valid because `sites-enabled` is included inside **`http { }`** on Debian/Ubuntu), then the HTTPS + HTTP **server** blocks.

It adds `^~ /api/product/` → 3000, removes `product` / `reviews` / `account` from the admin regex, adds `/login` → 3001, and uses **maps** for `/api/reviews` (POST vs GET) and numeric IDs (PATCH from `/studio` vs storefront).

**Two Next.js apps on one hostname** both request `/_next/static/...`. The reference config adds **`map $http_referer $next_static_upstream`** and **`location ^~ /_next/`** so requests **referred** from `/logga-in`, `/studio`, or `/login` go to **3001**; everything else defaults to **3000**. If anything still loads wrong assets (empty `Referer`), use **`basePath`** on the admin app or **`admin.turbomeck.cloud` → 3001** only.

### Magic-link email (SMTP)

Mail is sent by `@repo/auth` using **`app_settings.mail`** (JSON) in the database. If that row is missing or empty, auth falls back to **environment variables** on the server running Next (admin + client): `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (`true`/`1` for SSL), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Set these in **PM2** / systemd or `.env` for the Node process — not in nginx.

---

## What went wrong (short)

If the admin regex includes **`product`**, then **`/api/product/products`** is proxied to **3001**. Admin middleware may **307** guests to sign-in. The storefront client (3000) must serve **`/api/product/*`**.

Direct test:

- `curl -I http://127.0.0.1:3000/api/product/products` → **200** (client)
- `curl -I https://turbomeck.cloud/api/product/products` → **307** to `/logga-in` if nginx sent traffic to **3001**

## Fix (pick one)

### A) Prefer: dedicated location **before** the admin regex

Add **above** the `location ~ ^/api/(dashboard|...)` block (order matters: prefix `^~` wins over regex):

```nginx
location ^~ /api/product/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Use the same `proxy_*` headers as your other `proxy_pass` blocks.

### B) Remove `product` from the admin regex

Edit the alternation and **delete** `product`:

```nginx
location ~ ^/api/(dashboard|orders|shipping|...) {
    proxy_pass http://localhost:3001;
```

Ensure your **default** `location /` (or catch-all) for the storefront still proxies to **3000** so `/api/product/*` is not dropped.

## After editing

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Then:

```bash
curl -sSI "https://turbomeck.cloud/api/product/products" | grep -iE '^(HTTP/|location:)'
```

Expect **200** and **no** `Location: .../logga-in`.
