// Imports popular movies from TMDB into your MySQL database,
// including each movie's runtime and trailer.
//
// Usage (from the main project folder):
//   node server/import-tmdb.js          -> page 1 (20 movies)
//   node server/import-tmdb.js 3        -> pages 1 to 3 (60 movies)
//
// Movies already in the database are not duplicated. If one is missing its
// trailer or runtime, those are filled in, so you can run this again to fix old imports.
//
// Needs TMDB_TOKEN (your "API Read Access Token") in the .env file.
 
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
 
const pool = require("./db");
 
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const MAX_PAGES = 5;                          // keeps you well inside TMDB's limits
const SKIP_MOVIES_WITHOUT_POSTER = false;     // set to true to import only movies that have a poster
 
// ---------- Authentication ----------
const TOKEN = process.env.TMDB_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;
 
if (!TOKEN && !API_KEY) {
    console.error("Missing TMDB_TOKEN in your .env file.");
    console.error("Add a line like:  TMDB_TOKEN=your_read_access_token");
    process.exit(1);
}
 
async function tmdbGet(endpoint, params = {}) {
    const url = new URL(TMDB_BASE + endpoint);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
 
    const headers = { accept: "application/json" };
    if (TOKEN) {
        headers.Authorization = "Bearer " + TOKEN;
    } else {
        url.searchParams.set("api_key", API_KEY);
    }
 
    const response = await fetch(url, { headers });
 
    if (response.status === 401) {
        throw new Error("TMDB rejected the key (401). Check TMDB_TOKEN in .env for typos or spaces.");
    }
    if (response.status === 429) {
        throw new Error("TMDB rate limit reached (429). Wait a minute and try again.");
    }
    if (!response.ok) {
        throw new Error("TMDB answered with status " + response.status);
    }
    return response.json();
}
 
// ---------- Convert one TMDB movie into our table's format ----------
function toRow(movie) {
    const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
 
    return {
        title: String(movie.title || "").trim().slice(0, 200),
        description: movie.overview || null,
        release_year: Number.isInteger(year) && year > 1800 ? year : null,
        poster_url: movie.poster_path ? IMAGE_BASE + movie.poster_path : null,
        // vote_average is 0 when nobody has voted yet, which would look like a bad rating
        rating: movie.vote_count > 0 ? Math.round(movie.vote_average * 10) / 10 : null,
    };
}
 
// ---------- Pick the best YouTube video from TMDB's list ----------
// Prefers an official trailer, then any trailer, then a teaser.
function pickTrailerUrl(videos) {
    const youtube = (videos || []).filter(
        (v) => v.site === "YouTube" && /^[A-Za-z0-9_-]{6,15}$/.test(v.key || "")
    );
 
    const best =
        youtube.find((v) => v.type === "Trailer" && v.official) ||
        youtube.find((v) => v.type === "Trailer") ||
        youtube.find((v) => v.type === "Teaser");
 
    return best ? "https://www.youtube.com/watch?v=" + best.key : null;
}
 
// One extra request per movie gets both the runtime and the videos
async function fetchExtras(tmdbId) {
    try {
        const details = await tmdbGet("/movie/" + tmdbId, {
            language: "en-US",
            append_to_response: "videos",
            include_video_language: "en,null",
        });
 
        return {
            duration_minutes: details.runtime > 0 ? details.runtime : null,
            trailer_url: pickTrailerUrl(details.videos && details.videos.results),
        };
    } catch (err) {
        console.warn(`  (could not get trailer/runtime: ${err.message})`);
        return { duration_minutes: null, trailer_url: null };
    }
}
 
// ---------- Database helpers ----------
// Matches by TMDB id first, and by title + year for movies saved before ids were stored.
// (<=> also matches NULL = NULL)
async function findMovie(tmdbId, title, year) {
    const [rows] = await pool.execute(
        `SELECT id, trailer_url, duration_minutes, tmdb_id FROM movies
         WHERE tmdb_id = ? OR (title = ? AND release_year <=> ?)
         ORDER BY (tmdb_id IS NULL) LIMIT 1`,
        [tmdbId, title, year]
    );
    return rows[0] || null;
}
 
async function getOrCreateGenreId(name) {
    await pool.execute("INSERT IGNORE INTO genres (name) VALUES (?)", [name]);
    const [rows] = await pool.execute("SELECT id FROM genres WHERE name = ?", [name]);
    return rows[0].id;
}
 
// ---------- Main ----------
async function main() {
    const pages = Math.min(Math.max(parseInt(process.argv[2], 10) || 1, 1), MAX_PAGES);
 
    // TMDB sends genre numbers; this list turns them into names
    const genreData = await tmdbGet("/genre/movie/list", { language: "en-US" });
    const genreNames = new Map(genreData.genres.map((g) => [g.id, g.name]));
 
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let withTrailer = 0;
 
    for (let page = 1; page <= pages; page++) {
        console.log(`Fetching page ${page} of ${pages}...`);
        const data = await tmdbGet("/movie/popular", { language: "en-US", page });
 
        for (const movie of data.results) {
            const row = toRow(movie);
 
            if (!row.title || movie.adult || (SKIP_MOVIES_WITHOUT_POSTER && !row.poster_url)) {
                skipped++;
                continue;
            }
 
            const existing = await findMovie(movie.id, row.title, row.release_year);
 
            // Already in the database: only fill in what's missing
            if (existing) {
                if (existing.trailer_url && existing.duration_minutes && existing.tmdb_id) {
                    console.log(`  skip (already complete): ${row.title}`);
                    skipped++;
                    continue;
                }
 
                const extras = await fetchExtras(movie.id);
                await pool.execute(
                    `UPDATE movies
                     SET trailer_url = COALESCE(trailer_url, ?),
                         duration_minutes = COALESCE(duration_minutes, ?),
                         tmdb_id = COALESCE(tmdb_id, ?)
                     WHERE id = ?`,
                    [extras.trailer_url, extras.duration_minutes, movie.id, existing.id]
                );
                console.log(`  updated: ${row.title}${extras.trailer_url ? " (trailer added)" : " (no trailer on TMDB)"}`);
                if (extras.trailer_url) withTrailer++;
                updated++;
                continue;
            }
 
            // New movie
            const extras = await fetchExtras(movie.id);
 
            const [result] = await pool.execute(
                `INSERT INTO movies (tmdb_id, title, description, release_year, duration_minutes, poster_url, trailer_url, rating)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [movie.id, row.title, row.description, row.release_year, extras.duration_minutes,
                 row.poster_url, extras.trailer_url, row.rating]
            );
            const movieId = result.insertId;
 
            for (const genreId of movie.genre_ids || []) {
                const name = genreNames.get(genreId);
                if (!name) continue;
                const dbGenreId = await getOrCreateGenreId(name);
                await pool.execute(
                    "INSERT IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)",
                    [movieId, dbGenreId]
                );
            }
 
            console.log(`  added: ${row.title} (${row.release_year ?? "year unknown"})${extras.trailer_url ? " + trailer" : ""}`);
            if (extras.trailer_url) withTrailer++;
            inserted++;
        }
    }
 
    console.log(`\nDone. Added ${inserted}, updated ${updated}, skipped ${skipped}. Trailers found: ${withTrailer}.`);
}
 
main()
    .catch((err) => {
        console.error("\nImport failed:", err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());     // close the connections so the script can exit