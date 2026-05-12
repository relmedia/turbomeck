import Fastify from "fastify";

/**
 * SECURITY (audit L5): the order-service scaffold was listening on port 8001
 * with no routes and no auth — an empty surface that still answered TCP and
 * could be probed for fastify version-fingerprints. Until the service grows
 * real routes, we keep it minimal: bind to 127.0.0.1 by default, return 404
 * to everything except a `/health` ping, and refuse to start if the listener
 * is somehow asked to bind to a public address in production without an
 * explicit opt-in. When this service grows endpoints, swap the catch-all
 * `notFound` handler and add per-route auth.
 */
const fastify = Fastify({
  trustProxy: process.env.TRUST_PROXY === "true",
});

fastify.get("/health", async () => ({ ok: true }));

fastify.setNotFoundHandler((_req, reply) => {
  reply.code(404).send({ error: "Not found" });
});

const port = Number(process.env.PORT) || 8001;
const host = process.env.ORDER_SERVICE_BIND || "127.0.0.1";

if (
  process.env.NODE_ENV === "production" &&
  host !== "127.0.0.1" &&
  process.env.ORDER_SERVICE_ALLOW_PUBLIC !== "true"
) {
  throw new Error(
    "[order-service] Refusing to bind to a non-loopback host in production without ORDER_SERVICE_ALLOW_PUBLIC=true.",
  );
}

const start = async () => {
  try {
    await fastify.listen({ port, host });
    console.log(`Order service listening on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
