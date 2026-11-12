// Cloudflare Worker for the Lumen site.
//  - /api/...  is forwarded to your Render server (so login cookies stay on this one address)
//  - everything else is served from the /public folder
 
// Render's free plan puts the server to sleep when nobody has used it for a while. While it is
// waking up, requests come back as 429 / 502 / 503 / 504. For read requests we simply wait and try
// again, so the visitor sees a slow first page instead of an error.
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [2000, 4000, 8000, 12000];     // about 26 seconds in total
 
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
 
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
            const visitorIp = request.headers.get("CF-Connecting-IP") || "";
 
            // Only GET and HEAD are safe to repeat. A login or a save is sent exactly once.
            const delays = request.method === "GET" || request.method === "HEAD" ? RETRY_DELAYS_MS : [];
 
            for (let attempt = 0; ; attempt++) {
                // Same method, headers and body, just a different destination (a fresh copy each try)
                const upstream = new Request(target, request);
                upstream.headers.set("X-Forwarded-For", visitorIp);
 
                // Tells the server who the visitor really is. The secret proves the message comes from
                // this Worker. Any copy of these headers sent by a visitor is overwritten or removed.
                if (env.PROXY_SECRET) {
                    upstream.headers.set("X-Proxy-Secret", env.PROXY_SECRET);
                    upstream.headers.set("X-Visitor-IP", visitorIp);
                } else {
                    upstream.headers.delete("X-Proxy-Secret");
                    upstream.headers.delete("X-Visitor-IP");
                }
 
                // Pass redirects on to the browser instead of following them here
                const response = await fetch(upstream, { redirect: "manual" });
 
                if (!RETRY_STATUSES.has(response.status) || attempt >= delays.length) {
                    return response;
                }
 
                // A little randomness, so several requests don't all knock on the door together
                await sleep(delays[attempt] + Math.floor(Math.random() * 500));
            }
        }
 
        return env.ASSETS.fetch(request);
    },
 
    // Runs on a schedule (see "triggers" in wrangler.jsonc). Visiting the Render server every
    // 10 minutes stops its free plan from going to sleep after 15 minutes without visitors.
    async scheduled(controller, env, ctx) {
        if (!env.API_ORIGIN) return;
        ctx.waitUntil(
            fetch(new URL("/healthz", env.API_ORIGIN))
                .then((response) => console.log("Keep-alive ping:", response.status))
                .catch((error) => console.log("Keep-alive ping failed:", String(error)))
        );
    },
};