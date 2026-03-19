**`nextjs.conf`** — same shape as a minimal Next reverse proxy, extended for this monorepo:

| Host | Port |
|------|------|
| `turbomeck.cloud`, `www` | `localhost:3000` (apps/client `next start`) |
| `admin.turbomeck.cloud` | `localhost:3001` (apps/admin `PORT=3001 pnpm start`) |

Includes `X-Forwarded-*` so Next.js auth and redirects see HTTPS after Certbot.

```bash
sudo cp deploy/nginx/nextjs.conf /etc/nginx/sites-available/nextjs.conf
sudo ln -sf /etc/nginx/sites-available/nextjs.conf /etc/nginx/sites-enabled/nextjs.conf
sudo nginx -t && sudo systemctl reload nginx
```

Or: `sudo ./install-tmeck-nginx.sh`

`conf.d-connection-upgrade-map.conf` is **not** required with `Connection 'upgrade'`.
