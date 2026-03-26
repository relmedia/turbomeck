/**
 * Each app loads `apps/<name>/.env` via `tsx --env-file=.env` (see package.json "start").
 * Required for product-service: INTERNAL_PRODUCT_API_SECRET (same value as apps/client + apps/admin).
 * PM2 `env_file` (5.3+) is optional extras; the secret must exist in apps/product-service/.env
 */
module.exports = {
  apps: [
    {
      name: "product-service",
      cwd: "./apps/product-service",
      script: "pnpm",
      args: "start",
      env: { PORT: 8000 },
      env_file: ".env",
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: "payment-service",
      cwd: "./apps/payment-service",
      script: "pnpm",
      args: "start",
      env: { PORT: 8002 },
      env_file: ".env",
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: "client",
      cwd: "./apps/client",
      script: "pnpm",
      args: "start",
      env: { PORT: 3000 },
      env_file: ".env",
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: "admin",
      cwd: "./apps/admin",
      script: "pnpm",
      args: "start",
      env: { PORT: 3001 },
      env_file: ".env",
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
