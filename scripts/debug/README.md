# Product pipeline debug

From the **monorepo root** (after `git pull` so `package.json` and this script exist):

```bash
pnpm run debug:products
```

Same check **without** pnpm scripts (only needs Node + this file):

```bash
node scripts/debug/product-pipeline.mjs
```

On a server, if `pnpm run debug:products` says the script is missing, your checkout is outdated — run `git pull`, or use `node scripts/debug/product-pipeline.mjs` after updating files.

Optional helper (bash):

```bash
bash deploy/debug-products.sh
```
