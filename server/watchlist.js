const express = require("express");
const pool = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

router.use(requireAuth);          // every route below needs a logged-in user

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id >= 1 ? id : null;
}

// GET /api/watchlist  ->  the logged-in user's saved movies, newest first
router.get("/", async (req, res, next) => {
    try {
        const [rows] = await pool.execute(
            `SELECT m.id, m.title, m.release_year, m.rating, m.poster_url
             FROM watchlist w
             JOIN movies m ON m.id = w.movie_id
             WHERE w.user_id = ?
             ORDER BY w.added_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/watchlist/5  ->  add movie 5 (adding it twice is fine)
router.post("/:movieId", async (req, res, next) => {
    const movieId = parseId(req.params.movieId);
    if (movieId === null) {
        return res.status(400).json({ error: "Movie id must be a positive whole number." });
    }

    try {
        await pool.execute(
            "INSERT IGNORE INTO watchlist (user_id, movie_id) VALUES (?, ?)",
            [req.user.id, movieId]
        );
        res.status(201).json({ saved: true });
    } catch (err) {
        if (err.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(404).json({ error: "Movie not found." });
        }
        next(err);
    }
});

// DELETE /api/watchlist/5  ->  remove movie 5
router.delete("/:movieId", async (req, res, next) => {
    const movieId = parseId(req.params.movieId);
    if (movieId === null) {
        return res.status(400).json({ error: "Movie id must be a positive whole number." });
    }

    try {
        await pool.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?",
            [req.user.id, movieId]
        );
        res.json({ saved: false });
    } catch (err) {
        next(err);
    }
});

module.exports = router;