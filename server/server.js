const express = require("express");
const path = require("path");
const pool = require("./db");
 
const app = express();
const PORT = process.env.PORT || 3000;
 
app.use(express.json());
 
// Wraps an async route so any error goes to the error handler at the bottom
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
 
// Base query: a movie with its genres joined into one text value
const MOVIE_LIST_SQL = `
    SELECT m.id, m.title, m.release_year, m.rating, m.poster_url,
           GROUP_CONCAT(g.name ORDER BY g.name SEPARATOR ', ') AS genres
    FROM movies m
    LEFT JOIN movie_genres mg ON mg.movie_id = m.id
    LEFT JOIN genres g        ON g.id = mg.genre_id
`;
 
// ---------- GET /api/movies ----------
app.get("/api/movies", asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`${MOVIE_LIST_SQL} GROUP BY m.id ORDER BY m.id`);
    res.json(rows);
}));
 
// ---------- GET /api/movies/search?q=signal ----------
// Must be defined BEFORE /api/movies/:id, otherwise "search" would be read as an id.
app.get("/api/movies/search", asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
 
    if (q.length === 0) {
        return res.status(400).json({ error: "Missing search text. Use /api/movies/search?q=..." });
    }
    if (q.length > 100) {
        return res.status(400).json({ error: "Search text is too long" });
    }
 
    // Escape LIKE wildcards so a user typing % or _ searches for those characters
    const escaped = q.replace(/[\\%_]/g, "\\$&");
 
    const [rows] = await pool.execute(
        `${MOVIE_LIST_SQL} WHERE m.title LIKE ? GROUP BY m.id ORDER BY m.title LIMIT 50`,
        [`%${escaped}%`]
    );
    res.json(rows);
}));
 
// ---------- GET /api/movies/featured ----------
// Newest movies that have a trailer, for the hero banner. Must come BEFORE /:id.
app.get("/api/movies/featured", asyncHandler(async (req, res) => {
    const [rows] = await pool.query(`
        SELECT m.id, m.title, m.description, m.release_year, m.rating, m.trailer_url,
               GROUP_CONCAT(g.name ORDER BY g.name SEPARATOR ', ') AS genres
        FROM movies m
        LEFT JOIN movie_genres mg ON mg.movie_id = m.id
        LEFT JOIN genres g        ON g.id = mg.genre_id
        WHERE m.trailer_url IS NOT NULL AND m.trailer_url <> ''
        GROUP BY m.id
        ORDER BY RAND()
        LIMIT 6
    `);
    res.set("Cache-Control", "no-store");      // so the browser never reuses an old random pick
    res.json(rows);
}));
 
// ---------- GET /api/movies/:id ----------
app.get("/api/movies/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
 
    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: "Movie id must be a positive whole number" });
    }
 
    const [rows] = await pool.execute(
        `${MOVIE_LIST_SQL} WHERE m.id = ? GROUP BY m.id`,
        [id]
    );
 
    if (rows.length === 0) {
        return res.status(404).json({ error: "Movie not found" });
    }
 
    // The list query leaves out the long fields, so fetch the rest for the details page
    const [details] = await pool.execute(
        "SELECT description, duration_minutes, trailer_url, video_url FROM movies WHERE id = ?",
        [id]
    );
 
    res.json({ ...rows[0], ...details[0] });
}));
 
// ---------- Playback progress ("Continue watching") ----------
// TEMPORARY: there is no login yet, so everyone is the "guest" user.
// In Step 9 this function will read the real user from the login token instead.
const GUEST_USER_ID = 1;
function currentUserId(req) {
    return GUEST_USER_ID;
}
 
function parseMovieId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id >= 1 ? id : null;
}
 
// GET /api/movies/5/progress  ->  { "progress_seconds": 754 }
app.get("/api/movies/:id/progress", asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    if (movieId === null) {
        return res.status(400).json({ error: "Movie id must be a positive whole number" });
    }
 
    const [rows] = await pool.execute(
        "SELECT progress_seconds FROM watch_history WHERE user_id = ? AND movie_id = ?",
        [currentUserId(req), movieId]
    );
 
    res.json({ progress_seconds: rows.length ? rows[0].progress_seconds : 0 });
}));
 
// PUT /api/movies/5/progress   body: { "seconds": 754 }
app.put("/api/movies/:id/progress", asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    if (movieId === null) {
        return res.status(400).json({ error: "Movie id must be a positive whole number" });
    }
 
    const seconds = Math.floor(Number(req.body && req.body.seconds));
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1000000) {
        return res.status(400).json({ error: "seconds must be a number between 0 and 1000000" });
    }
 
    try {
        await pool.execute(
            `INSERT INTO watch_history (user_id, movie_id, progress_seconds)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE progress_seconds = ?`,
            [currentUserId(req), movieId, seconds, seconds]
        );
    } catch (err) {
        if (err.code === "ER_NO_REFERENCED_ROW_2") {       // the movie id doesn't exist
            return res.status(404).json({ error: "Movie not found" });
        }
        throw err;
    }
 
    res.json({ saved: true, progress_seconds: seconds });
}));
 
// Unknown /api routes
app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found" });
});
 
// ---------- Front-end files ----------
app.use(express.static(path.join(__dirname, "..", "public")));
 
// ---------- Error handler (must be last) ----------
app.use((err, req, res, next) => {
    console.error(err);                                   // full details stay in the terminal
    res.status(500).json({ error: "Something went wrong on the server" });
});
 
// ---------- Start ----------
async function start() {
    try {
        await pool.query("SELECT 1");                     // test the database before accepting requests
        console.log("Connected to MySQL");
 
        // Temporary guest account so watch progress has a user to belong to (removed in Step 9)
        await pool.execute(
            `INSERT IGNORE INTO users (id, username, email, password_hash)
             VALUES (?, 'guest', 'guest@lumen.local', 'no-login-allowed')`,
            [GUEST_USER_ID]
        );
    } catch (err) {
        console.error("Could not connect to MySQL:", err.message);
        console.error("Check the MySQL service and the values in your .env file.");
        process.exit(1);
    }
 
    app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
}
 
start();