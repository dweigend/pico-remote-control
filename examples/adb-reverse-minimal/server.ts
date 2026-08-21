/**
 * Purpose: Serve one static page for the minimal PICO USB transport demonstration.
 * Context: ADB reverse maps the PICO Browser's loopback port to this macOS Bun server.
 * Responsibility: Answer the demo route and expose a small health endpoint.
 * Boundary: This server does not control the browser, enter XR, or manage device state.
 */

const HOST = "127.0.0.1";
const PORT = 39081;
const INDEX_PATH = new URL("./index.html", import.meta.url);

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(Bun.file(INDEX_PATH));
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Minimal PICO USB demo: ${server.url}`);
