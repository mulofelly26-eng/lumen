// Cloudflare Pages Function: sends every /api/... request on your Pages site to your Render server.
// The browser only ever talks to the Pages address, so login cookies keep working.
// Needs one setting in Cloudflare Pages: API_ORIGIN = https://your-service.onrender.com

export async function onRequest({ request, env }) {
    if (!env.API_ORIGIN) {
        return new Response(
            JSON.stringify({ error: "API_ORIGIN is not set in the Cloudflare Pages settings." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, env.API_ORIGIN);

    // Same method, headers and body, just a different destination
    const upstream = new Request(target, request);
    upstream.headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");

    // Pass redirects on to the browser instead of following them here
    return fetch(upstream, { redirect: "manual" });
}
