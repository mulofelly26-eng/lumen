// Cloudflare Worker for the Lumen site.
//  - /api/...  is forwarded to your Render server (so login cookies stay on this one address)
//  - everything else is served from the /public folder

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/api/")) {
            if (!env.API_ORIGIN) {
                return new Response(
                    JSON.stringify({ error: "API_ORIGIN is not set in wrangler.jsonc." }),
                    { status: 500, headers: { "Content-Type": "application/json" } }
                );
            }

            const target = new URL(url.pathname + url.search, env.API_ORIGIN);

            // Same method, headers and body, just a different destination
            const upstream = new Request(target, request);
            upstream.headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");

            // Pass redirects on to the browser instead of following them here
            return fetch(upstream, { redirect: "manual" });
        }

        return env.ASSETS.fetch(request);
    },
};
