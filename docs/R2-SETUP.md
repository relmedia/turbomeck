# Cloudflare R2 Setup for Product Images

Product images are stored in Cloudflare R2 object storage (bucket `turbomeck`, folder `products/`).

## 1. Create R2 Bucket and Folder

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 Object Storage
2. Create a bucket named **turbomeck**
3. Enable **Allow public access** on the bucket (Settings → Public access)
4. Note the public URL (e.g. `https://pub-xxxxxxxx.r2.dev`)
5. Create a folder **products** (or it will be created automatically on first upload)

## 2. Generate R2 API Tokens

1. R2 → Manage R2 API Tokens → Create API token
2. Permissions: Object Read & Write
3. Copy: **Access Key ID** and **Secret Access Key**
4. Find your **Account ID** in the dashboard URL or sidebar

## 3. Configure product-service

Add to `apps/product-service/.env`:

```
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=turbomeck
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

## 4. Configure Client & Admin (for Next.js Image component)

**Important:** The S3 endpoint (`*.r2.cloudflarestorage.com`) returns 400 for unauthenticated requests. You must use the **public R2 URL** from step 1.

Add to `apps/client/.env.local` and `apps/admin/.env.local`:

```
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

Use the **full** public URL from your bucket settings. The client rewrites any `r2.cloudflarestorage.com` URLs in the database to this public URL at runtime, so existing images will load without a DB migration.

## 5. Configure CORS (for browser access)

R2 needs CORS headers so your app can load images when the browser requests them from a different origin.

**Recommended: Cloudflare Dashboard**

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 → your bucket (**turbomeck**)
2. **Settings** → **CORS Policy** → **Add CORS policy**
3. Paste this JSON (adjust origins for production):

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3000",
      "https://yoursite.com"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your production domains to `AllowedOrigins`. Save the policy.

**Optional script:** If your R2 API token has bucket admin permissions, you can run:

```bash
pnpm --filter product-service set-r2-cors
```

Set `R2_CORS_ORIGINS=https://yoursite.com` in `.env` for production domains. If you get Access Denied, use the dashboard method above instead.

## 6. Behavior

- **When R2 is configured**: New uploads go directly to R2. URLs are stored using `R2_PUBLIC_URL`.
- **When R2 is not configured**: Uploads stay local in `admin/public/uploads/` (previous behavior).
- The client rewrites `r2.cloudflarestorage.com` URLs to `NEXT_PUBLIC_R2_PUBLIC_URL` at runtime so images load without DB migration.

## 7. Troubleshooting

**"upstream image response failed... 400"** – You are using the S3 endpoint URL (`*.r2.cloudflarestorage.com`) instead of the public URL. The S3 endpoint requires authentication. Fix:

1. Enable **Allow public access** on your R2 bucket (Settings → Public access).
2. Copy the public URL (e.g. `https://pub-abc123.r2.dev`).
3. Set `R2_PUBLIC_URL` in product-service and `NEXT_PUBLIC_R2_PUBLIC_URL` in client/admin to that URL.
