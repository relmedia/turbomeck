# Copy real PostgreSQL data (e.g. Docker → VPS)

Products, orders, and users live **only in the database**, not in Git. To move **your** data:

## 1. Export (machine that has the real data)

Point repo root `.env` at that database (`DATABASE_URL` = Docker Postgres URL).

Install PostgreSQL client tools (`pg_dump`):

- macOS: `brew install libpq`
- Ubuntu: `sudo apt install postgresql-client`

Then:

```bash
pnpm db:export
```

Creates `turbomeck.backup.dump` in the repo root (or pass a path: `pnpm db:export ./backups/prod.dump`).

## 2. Copy file to the VPS

```bash
scp turbomeck.backup.dump ariel@YOUR_VPS:~/apps/turbomeck/
```

## 3. Import on the VPS

On the VPS, `.env` must use the **target** database (`DATABASE_URL` for VPS Postgres).

```bash
cd ~/apps/turbomeck
pnpm db:import ./turbomeck.backup.dump
```

Use an **empty** database or drop/recreate it first if it already has conflicting tables. `pg_restore` with an existing schema can error; a clean DB is safest.

## 4. After import

- Align app env (`DATABASE_URL`, `NEXTAUTH_*`, R2, etc.).
- `pm2 restart all`

## Minimal seed

`pnpm db:seed` only ensures the **“Alla Produkter”** category row if missing — not a full catalog.
