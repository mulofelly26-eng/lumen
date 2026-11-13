// Imports popular TV shows from TMDB, with their seasons and episodes (anime is left out: it has its own script).
//   node server/import-tv.js        -> 1 page (20 shows)
//   node server/import-tv.js 3      -> 3 pages (60 shows)
// Run the ALTER TABLE statements for type / seasons / episodes first.
// Against the hosted database:  $env:ENV_FILE=".env.aiven"  before running.
 
const path = require("path");
require("dotenv").config({ path: process.env.ENV_FILE || path.join(__dirname, "..", ".env") });
const pool = require("./db");
 
const TMDB = "https://api.themoviedb.org/3";
const TOKEN = process.env.TMDB_TOKEN;
if (!TOKEN) { console.error("Missing TMDB_TOKEN in your .env file."); process.exit(1); }
 
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
 
async function tmdb(endpoint, params = {}) {
    const url = new URL(TMDB + endpoint);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { headers: { accept: "application/json", Authorization: "Bearer " + TOKEN } });
    if (res.status === 401) throw new Error("TMDB rejected the key (401). Check TMDB_TOKEN.");
    if (res.status === 429) throw new Error("TMDB rate limit (429). Wait a minute and run again.");
    if (!res.ok) throw new Error("TMDB answered with status " + res.status);
    return res.json();
}
 
function trailerUrl(videos) {
    const yt = (videos || []).filter((v) => v.site === "YouTube" && /^[A-Za-z0-9_-]{6,15}$/.test(v.key || ""));
    const best = yt.find((v) => v.type === "Trailer" && v.official) || yt.find((v) => v.type === "Trailer") || yt.find((v) => v.type === "Teaser");
    return best ? "https://www.youtube.com/watch?v=" + best.key : null;
}
 
async function main() {
    const pages = Math.min(Math.max(parseInt(process.argv[2], 10) || 1, 1), 5);
    let added = 0, updated = 0;
 
    for (let page = 1; page <= pages; page++) {
        console.log(`Fetching page ${page} of ${pages}...`);
        const list = await tmdb("/discover/tv", { sort_by: "popularity.desc", language: "en-US", page });
 
        for (const item of list.results) {
            // Japanese animation is anime, which has its own category
            if ((item.genre_ids || []).includes(16) && (item.origin_country || []).includes("JP")) continue;
            const d = await tmdb("/tv/" + item.id, { language: "en-US", append_to_response: "videos", include_video_language: "en,null" });
            const title = String(d.name || "").trim().slice(0, 200);
            if (!title) continue;
 
            const year = d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : null;
            const row = [
                title, d.overview || null, Number.isInteger(year) ? year : null,
                d.episode_run_time && d.episode_run_time[0] ? d.episode_run_time[0] : null,
                d.poster_path ? "https://image.tmdb.org/t/p/w500" + d.poster_path : null,
                trailerUrl(d.videos && d.videos.results),
                d.vote_count > 0 ? Math.round(d.vote_average * 10) / 10 : null,
                d.number_of_seasons || null, d.number_of_episodes || null,
            ];
 
            const [found] = await pool.execute("SELECT id FROM movies WHERE type = 'tv' AND tmdb_id = ?", [d.id]);
            let movieId;
            if (found.length) {
                movieId = found[0].id;
                await pool.execute(
                    "UPDATE movies SET seasons = ?, episodes = ?, trailer_url = COALESCE(trailer_url, ?) WHERE id = ?",
                    [row[7], row[8], row[5], movieId]
                );
                updated++;
                console.log(`  updated: ${title}`);
            } else {
                const [r] = await pool.execute(
                    `INSERT INTO movies (type, tmdb_id, title, description, release_year, duration_minutes,
                                         poster_url, trailer_url, rating, seasons, episodes)
                     VALUES ('tv', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [d.id, ...row]
                );
                movieId = r.insertId;
                added++;
                console.log(`  added: ${title} (${row[7] ?? "?"} seasons, ${row[8] ?? "?"} episodes)`);
            }
 
            for (const g of d.genres || []) {
                await pool.execute("INSERT IGNORE INTO genres (name) VALUES (?)", [g.name]);
                const [[genre]] = await pool.execute("SELECT id FROM genres WHERE name = ?", [g.name]);
                await pool.execute("INSERT IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)", [movieId, genre.id]);
            }
            await sleep(150);
        }
    }
    console.log(`\nDone. Added ${added}, updated ${updated}.`);
}
 
main().catch((e) => { console.error("\nImport failed:", e.message); process.exitCode = 1; }).finally(() => pool.end());