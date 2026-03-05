# Regenerate Images with AI Background Removal

Use this to regenerate all product images with AI-removed backgrounds.

## Quick start (from repo root)

```bash
# Regenerate ALL product images from the database
pnpm regenerate-images

# Or use the shorter alias
pnpm remove-bg
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm regenerate-images` | Process all product images in the database. Removes background, resizes, updates DB. |
| `pnpm remove-bg` | Same as above |
| `pnpm remove-bg --folder ./path/to/images` | Process all images in a folder (useful before adding to products) |

## How it works

- Uses **@imgly/background-removal-node** (AI model, "small" variant)
- Output: PNG with transparent background, resized to 1200×1200
- Replaces original files and updates the database
- Skips `avatars` subfolder when using `--folder`

## Requirements

1. **Dependencies**: Run `pnpm install` (includes `@imgly/background-removal-node`, `sharp`, `jimp`)
2. **Database**: Must be running for `pnpm regenerate-images` (product-service needs DB connection)
3. **Environment**: `apps/product-service/.env` configured with DB URL

## Windows (Sharp ERR_DLOPEN_FAILED)

If you see `Could not load the "sharp" module` or `ERR_DLOPEN_FAILED` on Windows, the script automatically falls back to **Jimp** (pure JavaScript, no native deps). No action needed—just run `pnpm regenerate-images` again.

## Processing a custom folder

```bash
# Process all images in admin uploads
pnpm remove-bg --folder ./admin/public/uploads

# Process any folder
pnpm remove-bg --folder ./path/to/your/images
```
