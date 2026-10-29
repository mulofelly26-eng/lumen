const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const pool = require("./db");              // also loads the .env file

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error("JWT_SECRET is missing or too short (needs 32+ characters) in your .env file.");
    console.error('Make one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
}

const COOKIE_NAME = "lumen_token";
const SESSION_DAYS = 7;
const BCRYPT_COST = 12;
// Compared against when the email is unknown, so "wrong email" and "wrong password" take equally long
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

const router = express.Router();

// At most 20 register/login attempts per 15 minutes from one address
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in 15 minutes." },
});

// ---------- Helpers ----------
function text(value) {
    return typeof value === "string" ? value : "";
}

function validateEmail(email) {
    if (!email) return "Enter your email address.";
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
    return null;
}

function validatePassword(password) {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (Buffer.byteLength(password) > 72) return "Password is too long (72 bytes at most).";
    return null;
}

function startSession(res, user) {
    const token = jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: SESSION_DAYS + "d",
    });

    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,                                   // JavaScript on the page cannot read it
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",    // HTTPS only once deployed
        maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
}

// ---------- Middleware: put this in front of any route that needs a logged-in user ----------
function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ error: "Please log in to do that." });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
        req.user = { id: payload.uid, username: payload.username };
        next();
    } catch {
        res.clearCookie(COOKIE_NAME);
        res.status(401).json({ error: "Your session has expired. Please log in again." });
    }
}

// ---------- POST /api/auth/register ----------
router.post("/register", limiter, async (req, res, next) => {
    try {
        const username = text(req.body && req.body.username).trim();
        const email = text(req.body && req.body.email).trim().toLowerCase();
        const password = text(req.body && req.body.password);

        if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
            return res.status(400).json({ error: "Username must be 3 to 30 characters: letters, numbers and underscores only." });
        }
        const problem = validateEmail(email) || validatePassword(password);
        if (problem) return res.status(400).json({ error: problem });

        const hash = await bcrypt.hash(password, BCRYPT_COST);

        let result;
        try {
            [result] = await pool.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                [username, email, hash]
            );
        } catch (err) {
            if (err.code === "ER_DUP_ENTRY") {
                const field = /email/.test(err.message) ? "email" : "username";
                return res.status(409).json({
                    error: field === "email" ? "That email is already registered." : "That username is already taken.",
                });
            }
            throw err;
        }

        const user = { id: result.insertId, username };
        startSession(res, user);
        res.status(201).json({ user });
    } catch (err) {
        next(err);
    }
});

// ---------- POST /api/auth/login ----------
router.post("/login", limiter, async (req, res, next) => {
    try {
        const email = text(req.body && req.body.email).trim().toLowerCase();
        const password = text(req.body && req.body.password);

        if (!email || !password) {
            return res.status(400).json({ error: "Enter your email and password." });
        }

        const [rows] = await pool.execute(
            "SELECT id, username, password_hash FROM users WHERE email = ?",
            [email]
        );
        const user = rows[0];

        const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

        // Same message for both cases, so nobody can use this to find out which emails exist
        if (!user || !passwordOk) {
            return res.status(401).json({ error: "Incorrect email or password." });
        }

        startSession(res, user);
        res.json({ user: { id: user.id, username: user.username } });
    } catch (err) {
        next(err);
    }
});

// ---------- POST /api/auth/logout ----------
router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ loggedOut: true });
});

// ---------- GET /api/auth/me ----------
router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

module.exports = { router, requireAuth };
