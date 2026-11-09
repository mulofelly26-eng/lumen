// ---------- Settings ----------
// Player address for each kind of title. The TMDB id goes at the end.
// Only "movie" is defined for now. If you add TV shows later, add their pattern here.
const PLAYER_URLS = {
    movie: "https://vidsrc.sh/embed/movie/",
};
 
// ---------- Elements ----------
const statusEl    = document.getElementById("status");
const titleEl     = document.getElementById("watch-title");
const detailsLink = document.getElementById("details-link");
const player      = document.getElementById("player");
const frame       = document.getElementById("video-frame");
 
const params  = new URLSearchParams(window.location.search);
const movieId = params.get("id");          // the id in YOUR database (watch.html?id=5)
 
// ---------- Helpers ----------
function showStatus(text) {
    statusEl.textContent = text;
    statusEl.hidden = false;
}
 
// Builds the player address from the TMDB id. Returns null if the id is not a plain number.
function buildPlayerUrl(tmdbId, type = "movie") {
    const base = PLAYER_URLS[type];
    if (!base) return null;
    const id = String(tmdbId ?? "").trim();
    if (!/^\d+$/.test(id)) return null;     // only digits, so nothing strange ends up in the URL
    return base + id;
}
 
// ---------- Continue watching ----------
// The external player lives on another site, so the browser does not let us read its play position.
// What we can do is remember that the person opened this movie, so it shows up in "Continue watching".
const MARK_AFTER_MS = 30000;   // only count it if they stay on the page for 30 seconds
let canMark = true;            // becomes false when nobody is logged in
 
async function markWatching() {
    if (!canMark) return;
    try {
        const response = await fetch("/api/movies/" + encodeURIComponent(movieId) + "/watched", {
            method: "POST",
        });
        if (response.status === 401) canMark = false;       // not logged in: stop trying
    } catch (err) {
        console.warn("Could not save watch history:", err);
    }
}
 
function startMarking() {
    setTimeout(markWatching, MARK_AFTER_MS);
}
 
// ---------- Start ----------
async function init() {
    if (!movieId || !/^\d+$/.test(movieId)) {
        titleEl.textContent = "No movie selected";
        showStatus("Go back to the home page and pick a movie.");
        return;
    }
 
    detailsLink.href = "movie.html?id=" + encodeURIComponent(movieId);
 
    try {
        const response = await fetch("/api/movies/" + encodeURIComponent(movieId));
 
        if (response.status === 404) {
            titleEl.textContent = "Movie not found";
            showStatus("Sorry, that movie doesn't exist.");
            return;
        }
        if (!response.ok) throw new Error("Server answered with status " + response.status);
 
        const movie = await response.json();
        titleEl.textContent = movie.title;
        document.title = "Watching " + movie.title + " - Lumen";
 
        // Change "movie" here if you later store a type column (movie.type)
        const playerUrl = buildPlayerUrl(movie.tmdb_id, "movie");
        if (!playerUrl) {
            showStatus("This movie has no player link yet (missing TMDB id).");
            return;
        }
 
        statusEl.hidden = true;
        frame.src = playerUrl;
        player.hidden = false;
        startMarking();
    } catch (error) {
        console.error(error);
        titleEl.textContent = "Something went wrong";
        showStatus("Could not load this movie. Check that the server is running and try again.");
    }
}
 
init();