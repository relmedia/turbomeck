module.exports = {
  apps: [
    {
      name: "product-service",
      cwd: "./apps/product-service",
      script: "pnpm",
      args: "start",
      env: { PORT: 8000 },
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
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
