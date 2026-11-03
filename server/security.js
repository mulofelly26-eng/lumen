const crypto = require("crypto");
const net = require("net");
const { ipKeyGenerator } = require("express-rate-limit");

const PROXY_SECRET = process.env.PROXY_SECRET || "";

function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// The visitor's real address.
// Behind the Cloudflare Worker, Express only sees the Worker's address, so the Worker sends the
// visitor's address together with a shared secret. Without the right secret the header is ignored,
// because anyone could otherwise fake it to dodge the rate limit.
function visitorIp(req) {
    const secret = req.get("x-proxy-secret");
    const claimed = req.get("x-visitor-ip");

    if (PROXY_SECRET.length >= 16 && secret && claimed && net.isIP(claimed) && safeEqual(secret, PROXY_SECRET)) {
        return claimed;
    }
    return req.ip;
}

// The key the rate limiter counts attempts under
function limiterKey(req) {
    const ip = visitorIp(req);
    return typeof ipKeyGenerator === "function" ? ipKeyGenerator(ip) : ip;
}

module.exports = { visitorIp, limiterKey };
