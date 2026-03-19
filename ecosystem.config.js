module.exports = {
  apps: [
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
