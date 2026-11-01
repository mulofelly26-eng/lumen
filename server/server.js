const express = require("express");
const path = require("path");
const pool = require("./db");
const cookieParser = require("cookie-parser");
const { router: authRouter, requireAuth } = require("./auth");
const watchlistRouter = require("./watchlist");
 
const app = express();
const PORT = process.env.PORT || 3000;
 
app.use(express.json());
app.use(cookieParser());
 
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
 
// ---------- GET /api/filters ----------
// The genres and years that appear in the search page's drop-down lists.
app.get("/api/filters", asyncHandler(async (req, res) => {
    const [genres] = await pool.query("SELECT name FROM genres ORDER BY name");
    const [years] = await pool.query(
        "SELECT DISTINCT release_year FROM movies WHERE release_year IS NOT NULL ORDER BY release_year DESC"
    );
    res.json({
        genres: genres.map((g) => g.name),
        years: years.map((y) => y.release_year),
    });
}));
 
// ---------- GET /api/movies/search?q=signal&genre=Drama&year=2025 ----------
// Every part is optional, but at least one is needed.
// Must be defined BEFORE /api/movies/:id, otherwise "search" would be read as an id.
app.get("/api/movies/search", asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const genre = String(req.query.genre || "").trim();
    const yearText = String(req.query.year || "").trim();
 
    if (q.length > 100 || genre.length > 50) {
        return res.status(400).json({ error: "Search text is too long" });
    }
 
    let year = null;
    if (yearText) {
        year = Number(yearText);
        if (!Number.isInteger(year) || year < 1800 || year > 2200) {
            return res.status(400).json({ error: "year must be a four-digit number" });
        }
    }
 
    if (!q && !genre && year === null) {
        return res.status(400).json({ error: "Give a search text (q), a genre or a year" });
    }
 
    const conditions = [];
    const params = [];
 
    if (q) {
        // Escape LIKE wildcards so a user typing % or _ searches for those characters
        conditions.push("m.title LIKE ?");
        params.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
    }
    if (genre) {
        // EXISTS keeps each movie's full genre list in the results
        conditions.push(`EXISTS (
            SELECT 1 FROM movie_genres mg2
            JOIN genres g2 ON g2.id = mg2.genre_id
            WHERE mg2.movie_id = m.id AND g2.name = ?)`);
        params.push(genre);
    }
    if (year !== null) {
        conditions.push("m.release_year = ?");
        params.push(year);
    }
 
    const [rows] = await pool.execute(
        `${MOVIE_LIST_SQL}
         WHERE ${conditions.join(" AND ")}
         GROUP BY m.id
         ORDER BY (m.rating IS NULL), m.rating DESC, m.title
         LIMIT 60`,
        params
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
// The logged-in user, set by requireAuth
function currentUserId(req) {
    return req.user.id;
}
 
function parseMovieId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id >= 1 ? id : null;
}
 
// GET /api/movies/5/progress  ->  { "progress_seconds": 754 }
app.get("/api/movies/:id/progress", requireAuth, asyncHandler(async (req, res) => {
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
app.put("/api/movies/:id/progress", requireAuth, asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    if (movieId === null) {
        return res.status(400).json({ error: "Movie id must be a positive whole number" });
    }
 
    const seconds = Math.floor(Number(req.body && req.body.seconds));
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1000000) {
        return res.status(400).json({ error: "seconds must be a number between 0 and 1000000" });
    }
 
    try {
        // The player also sends the video's length, so the home page can draw a progress bar
        const length = Math.floor(Number(req.body && req.body.duration));
        const duration = Number.isFinite(length) && length > 0 && length <= 1000000 ? length : null;
 
        await pool.execute(
            `INSERT INTO watch_history (user_id, movie_id, progress_seconds, duration_seconds)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE progress_seconds = ?, duration_seconds = COALESCE(?, duration_seconds)`,
            [currentUserId(req), movieId, seconds, duration, seconds, duration]
        );
    } catch (err) {
        if (err.code === "ER_NO_REFERENCED_ROW_2") {       // the movie id doesn't exist
            return res.status(404).json({ error: "Movie not found" });
        }
        throw err;
    }
 
    res.json({ saved: true, progress_seconds: seconds });
}));
 
// GET /api/history  ->  movies the logged-in user started but did not finish, latest first
app.get("/api/history", requireAuth, asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
        `SELECT m.id, m.title, m.release_year, m.poster_url,
                h.progress_seconds, h.duration_seconds
         FROM watch_history h
         JOIN movies m ON m.id = h.movie_id
         WHERE h.user_id = ?
           AND h.progress_seconds >= 5
           AND (h.duration_seconds IS NULL OR h.progress_seconds < h.duration_seconds * 0.95)
         ORDER BY h.updated_at DESC
         LIMIT 20`,
        [currentUserId(req)]
    );
    res.json(rows);
}));
 
app.use("/api/auth", authRouter);
app.use("/api/watchlist", watchlistRouter);
 
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
    } catch (err) {
        console.error("Could not connect to MySQL:", err.message);
        console.error("Check the MySQL service and the values in your .env file.");
        process.exit(1);
    }
 
    app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
}
 
start();