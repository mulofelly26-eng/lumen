// Finds a trailer for EVERY movie in your database that doesn't have one yet.
// For each movie it searches TMDB by title and year, then saves the YouTube trailer.
//
// Usage (from the main project folder):
//   node server/fill-trailers.js
//
// Safe to run more than once: movies that already have a trailer are not touched.
// Needs TMDB_TOKEN in the .env file.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const pool = require("./db");

const TMDB_BASE = "https://api.themoviedb.org/3";
const PAUSE_MS = 250;                           // small pause between movies, to be gentle with TMDB

const TOKEN = process.env.TMDB_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

if (!TOKEN && !API_KEY) {
    console.error("Missing TMDB_TOKEN in your .env file.");
    process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tmdbGet(endpoint, params = {}) {
    const url = new URL(TMDB_BASE + endpoint);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const headers = { accept: "application/json" };
    if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
    else url.searchParams.set("api_key", API_KEY);

    const response = await fetch(url, { headers });

    if (response.status === 401) throw new Error("TMDB rejected the key (401). Check TMDB_TOKEN in .env.");
    if (response.status === 429) throw new Error("TMDB rate limit reached (429). Wait a minute and run again.");
    if (!response.ok) throw new Error("TMDB answered with status " + response.status);
    return response.json();
}

// Compare titles ignoring case, accents and punctuation
function normalise(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

// Only accept a search result that really is the same movie
function findMatch(results, title, year) {
    const wanted = normalise(title);

    return (results || []).find((r) => {
        if (normalise(r.title) !== wanted && normalise(r.original_title) !== wanted) return false;
        if (!year) return true;
        const resultYear = r.release_date ? Number(r.release_date.slice(0, 4)) : null;
        return resultYear !== null && Math.abs(resultYear - year) <= 1;
    }) || null;
}

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

async function main() {
    const [movies] = await pool.query(
        "SELECT id, title, release_year FROM movies WHERE trailer_url IS NULL OR trailer_url = '' ORDER BY id"
    );

    if (movies.length === 0) {
        console.log("Every movie already has a trailer.");
        return;
    }

    console.log(`${movies.length} movie(s) without a trailer. Searching TMDB...\n`);

    let found = 0;
    let notFound = 0;

    for (const movie of movies) {
        try {
            const params = { query: movie.title, language: "en-US", include_adult: "false" };
            if (movie.release_year) params.year = movie.release_year;

            let search = await tmdbGet("/search/movie", params);
            let match = findMatch(search.results, movie.title, movie.release_year);

            // The year filter can be too strict, so try once without it
            if (!match && movie.release_year) {
                delete params.year;
                search = await tmdbGet("/search/movie", params);
                match = findMatch(search.results, movie.title, movie.release_year);
            }

            if (!match) {
                console.log(`  not found on TMDB: ${movie.title} (${movie.release_year ?? "?"})`);
                notFound++;
                continue;
            }

            const details = await tmdbGet("/movie/" + match.id, {
                language: "en-US",
                append_to_response: "videos",
                include_video_language: "en,null",
            });

            const trailerUrl = pickTrailerUrl(details.videos && details.videos.results);

            if (!trailerUrl) {
                console.log(`  no trailer on TMDB: ${movie.title}`);
                notFound++;
                continue;
            }

            await pool.execute(
                `UPDATE movies
                 SET trailer_url = ?,
                     duration_minutes = COALESCE(duration_minutes, ?)
                 WHERE id = ?`,
                [trailerUrl, details.runtime > 0 ? details.runtime : null, movie.id]
            );

            console.log(`  trailer added: ${movie.title}`);
            found++;
        } catch (err) {
            if (/rate limit|rejected the key/.test(err.message)) throw err;   // stop on problems that affect every movie
            console.warn(`  problem with "${movie.title}": ${err.message}`);
            notFound++;
        }

        await sleep(PAUSE_MS);
    }

    console.log(`\nDone. Trailers added: ${found}. Without a trailer: ${notFound}.`);
}

main()
    .catch((err) => {
        console.error("\nFailed:", err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
