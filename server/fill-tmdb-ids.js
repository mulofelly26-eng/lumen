// Finds the TMDB id of every movie in your database that doesn't have one yet.
// It searches TMDB by title and year and only accepts a result with the same title.
//
// Usage (from the main project folder):
//   node server/fill-tmdb-ids.js
//
// Run this SQL once in MySQL Workbench first:
//   ALTER TABLE lumen.movies
//       ADD COLUMN tmdb_id INT UNSIGNED NULL,
//       ADD UNIQUE KEY uq_movies_tmdb_id (tmdb_id);

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const pool = require("./db");

const TMDB_BASE = "https://api.themoviedb.org/3";
const PAUSE_MS = 250;

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

function normalise(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function findMatch(results, title, year) {
    const wanted = normalise(title);

    return (results || []).find((r) => {
        if (normalise(r.title) !== wanted && normalise(r.original_title) !== wanted) return false;
        if (!year) return true;
        const resultYear = r.release_date ? Number(r.release_date.slice(0, 4)) : null;
        return resultYear !== null && Math.abs(resultYear - year) <= 1;
    }) || null;
}

async function main() {
    const [movies] = await pool.query(
        "SELECT id, title, release_year FROM movies WHERE tmdb_id IS NULL ORDER BY id"
    );

    if (movies.length === 0) {
        console.log("Every movie already has a TMDB id.");
        return;
    }

    console.log(`${movies.length} movie(s) without a TMDB id. Searching TMDB...\n`);

    let found = 0;
    let notFound = 0;

    for (const movie of movies) {
        try {
            const params = { query: movie.title, language: "en-US", include_adult: "false" };
            if (movie.release_year) params.year = movie.release_year;

            let search = await tmdbGet("/search/movie", params);
            let match = findMatch(search.results, movie.title, movie.release_year);

            if (!match && movie.release_year) {          // the year filter can be too strict
                delete params.year;
                search = await tmdbGet("/search/movie", params);
                match = findMatch(search.results, movie.title, movie.release_year);
            }

            if (!match) {
                console.log(`  not found on TMDB: ${movie.title} (${movie.release_year ?? "?"})`);
                notFound++;
            } else {
                try {
                    await pool.execute("UPDATE movies SET tmdb_id = ? WHERE id = ?", [match.id, movie.id]);
                    console.log(`  ${match.id}  ${movie.title}`);
                    found++;
                } catch (err) {
                    if (err.code === "ER_DUP_ENTRY") {
                        console.log(`  skipped (TMDB id ${match.id} already used by another row): ${movie.title}`);
                        notFound++;
                    } else {
                        throw err;
                    }
                }
            }
        } catch (err) {
            if (/rate limit|rejected the key|Unknown column/.test(err.message)) throw err;
            console.warn(`  problem with "${movie.title}": ${err.message}`);
            notFound++;
        }

        await sleep(PAUSE_MS);
    }

    console.log(`\nDone. TMDB ids saved: ${found}. Not matched: ${notFound}.`);
}

main()
    .catch((err) => {
        console.error("\nFailed:", err.message);
        if (/Unknown column/.test(err.message)) {
            console.error("Run the ALTER TABLE statement from the top of this file first.");
        }
        process.exitCode = 1;
    })
    .finally(() => pool.end());
