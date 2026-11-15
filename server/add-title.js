// Adds a movie, TV show or anime to the database by hand.
//
//   node server/add-title.js
//
// It asks you questions one by one. If the title is on TMDB, type its TMDB id and the script
// fills in everything for you. Otherwise press Enter and type the details yourself.
// For the hosted database:   $env:ENV_FILE=".env.aiven"   (then Remove-Item Env:ENV_FILE when done)
 
const path = require("path");
require("dotenv").config({ path: process.env.ENV_FILE || path.join(__dirname, "..", ".env") });
const readline = require("readline/promises");
const pool = require("./db");
 
const TYPES = ["movie", "tv", "anime"];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (question) => (await rl.question(question)).trim();
 
// ---------- Small helpers that keep asking until the answer is valid (or left empty) ----------
async function askNumber(label, min, max, decimals = false) {
    for (;;) {
        const text = await ask(label);
        if (text === "") return null;
        const n = Number(text);
        if (Number.isFinite(n) && n >= min && n <= max && (decimals || Number.isInteger(n))) return n;
        console.log(`  Please enter ${decimals ? "a number" : "a whole number"} from ${min} to ${max}, or press Enter to skip.`);
    }
}
 
function webAddress(text) {
    try {
        const u = new URL(text);
        return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
    } catch { return null; }
}
 
function youtubeLink(text) {
    try {
        const u = new URL(text);
        const host = u.hostname.replace(/^www\./, "");
        const id = host === "youtu.be" ? u.pathname.slice(1) : host === "youtube.com" ? u.searchParams.get("v") : null;
        return id && /^[A-Za-z0-9_-]{6,15}$/.test(id) ? "https://www.youtube.com/watch?v=" + id : null;
    } catch { return null; }
}
 
async function askLink(label, convert, problem) {
    for (;;) {
        const text = await ask(label);
        if (text === "") return null;
        const link = convert(text);
        if (link) return link;
        console.log("  " + problem);
    }
}
 
// ---------- Getting the details ----------
async function fromTmdb(type, idText) {
    const id = Number(idText);
    if (!Number.isInteger(id) || id < 1) { console.log("  That is not a valid TMDB id."); return null; }
    if (!process.env.TMDB_TOKEN) { console.log("  TMDB_TOKEN is missing from your .env file."); return null; }
 
    const endpoint = type === "movie" ? "/movie/" : "/tv/";
    const res = await fetch(`https://api.themoviedb.org/3${endpoint}${id}?language=en-US&append_to_response=videos`, {
        headers: { accept: "application/json", Authorization: "Bearer " + process.env.TMDB_TOKEN },
    });
    if (res.status === 404) { console.log("  TMDB has no " + (type === "movie" ? "movie" : "TV show") + " with that id."); return null; }
    if (!res.ok) { console.log("  TMDB answered with status " + res.status + "."); return null; }
    const d = await res.json();
 
    const videos = ((d.videos && d.videos.results) || []).filter((v) => v.site === "YouTube" && /^[A-Za-z0-9_-]{6,15}$/.test(v.key || ""));
    const best = videos.find((v) => v.type === "Trailer" && v.official) || videos.find((v) => v.type === "Trailer") || videos.find((v) => v.type === "Teaser");
    const date = d.release_date || d.first_air_date || "";
 
    return {
        type, tmdb_id: d.id,
        title: String(d.title || d.name || "").trim().slice(0, 200),
        description: d.overview || null,
        year: date ? Number(date.slice(0, 4)) : null,
        minutes: type === "movie" ? (d.runtime > 0 ? d.runtime : null) : (d.episode_run_time && d.episode_run_time[0]) || null,
        poster: d.poster_path ? "https://image.tmdb.org/t/p/w500" + d.poster_path : null,
        trailer: best ? "https://www.youtube.com/watch?v=" + best.key : null,
        rating: d.vote_count > 0 ? Math.round(d.vote_average * 10) / 10 : null,
        seasons: type === "movie" ? null : d.number_of_seasons || null,
        episodes: type === "movie" ? null : d.number_of_episodes || null,
        genres: (d.genres || []).map((g) => g.name),
    };
}
 
async function fromKeyboard(type) {
    let title = "";
    while (!title) {
        title = (await ask("Title: ")).slice(0, 200);
        if (!title) console.log("  A title is required.");
    }
    const year = await askNumber("Year (Enter to skip): ", 1800, 2200);
    const description = (await ask("Description (Enter to skip): ")) || null;
    const poster = await askLink("Poster image link (Enter to skip): ", webAddress, "Please paste a full link starting with https://");
    const trailer = await askLink("YouTube trailer link (Enter to skip): ", youtubeLink, "Please paste a YouTube link, like https://www.youtube.com/watch?v=...");
    const rating = await askNumber("Rating from 0 to 10 (Enter to skip): ", 0, 10, true);
    const minutes = await askNumber(type === "movie" ? "Length in minutes (Enter to skip): " : "Minutes per episode (Enter to skip): ", 1, 100000);
    const seasons = type === "movie" ? null : await askNumber("Number of seasons (Enter to skip): ", 0, 10000);
    const episodes = type === "movie" ? null : await askNumber("Number of episodes (Enter to skip): ", 0, 100000);
    const genres = (await ask("Genres, separated by commas, e.g. Action, Drama (Enter to skip): "))
        .split(",").map((g) => g.trim().slice(0, 50)).filter(Boolean);
 
    return { type, tmdb_id: null, title, description, year, minutes, poster, trailer, rating, seasons, episodes, genres: [...new Set(genres)] };
}
 
// ---------- Saving ----------
function summary(item) {
    console.log("\n  Type:      " + item.type);
    console.log("  Title:     " + item.title + (item.year ? " (" + item.year + ")" : ""));
    if (item.seasons || item.episodes) console.log("  Series:    " + (item.seasons ?? "?") + " seasons, " + (item.episodes ?? "?") + " episodes");
    if (item.rating !== null) console.log("  Rating:    " + item.rating);
    if (item.genres.length) console.log("  Genres:    " + item.genres.join(", "));
    console.log("  Poster:    " + (item.poster ? "yes" : "none") + "   Trailer: " + (item.trailer ? "yes" : "none"));
}
 
async function save(item) {
    const [same] = await pool.execute(
        "SELECT id FROM movies WHERE type = ? AND (tmdb_id <=> ? AND ? IS NOT NULL OR (title = ? AND release_year <=> ?)) LIMIT 1",
        [item.type, item.tmdb_id, item.tmdb_id, item.title, item.year]
    );
    if (same.length) { console.log(`  Already in the database with id ${same[0].id}. Nothing added.`); return; }
 
    const [result] = await pool.execute(
        `INSERT INTO movies (type, tmdb_id, title, description, release_year, duration_minutes,
                             poster_url, trailer_url, rating, seasons, episodes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.type, item.tmdb_id, item.title, item.description, item.year, item.minutes,
         item.poster, item.trailer, item.rating, item.seasons, item.episodes]
    );
 
    for (const name of item.genres) {
        await pool.execute("INSERT IGNORE INTO genres (name) VALUES (?)", [name]);
        const [[genre]] = await pool.execute("SELECT id FROM genres WHERE name = ?", [name]);
        await pool.execute("INSERT IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)", [result.insertId, genre.id]);
    }
    console.log(`  Added "${item.title}" with id ${result.insertId}.`);
}
 
// ---------- Main loop ----------
async function main() {
    console.log(`Adding to database "${process.env.DB_NAME}" on ${process.env.DB_HOST || "127.0.0.1"}\n`);
 
    for (;;) {
        const type = (await ask("Type (movie / tv / anime): ")).toLowerCase();
        if (!TYPES.includes(type)) {
            console.log("  The type must be movie, tv or anime.\n");
            continue;
        }
 
        const tmdbId = await ask("TMDB id (press Enter to type everything yourself): ");
        const item = tmdbId ? await fromTmdb(type, tmdbId) : await fromKeyboard(type);
 
        if (item) {
            summary(item);
            const answer = (await ask("\nSave this? (Y/n): ")).toLowerCase();
            if (answer === "" || answer === "y" || answer === "yes") await save(item);
            else console.log("  Not saved.");
        }
 
        const more = (await ask("\nAdd another? (y/N): ")).toLowerCase();
        if (more !== "y" && more !== "yes") break;
        console.log("");
    }
}
 
main()
    .catch((err) => {
        console.error("\nFailed:", err.message);
        if (/Unknown column/.test(err.message)) console.error("Run the ALTER TABLE statements for type, seasons and episodes first.");
        process.exitCode = 1;
    })
    .finally(() => { rl.close(); return pool.end(); });