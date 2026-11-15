// ---------- Settings ----------
// Player address for each kind of title. The TMDB id goes at the end.
// Only "movie" is defined for now. If you add TV shows later, add their pattern here.
// {id} = TMDB id, {season} and {episode} = numbers.
// The "tv" pattern is a GUESS: replace it with the exact format the provider gave you.
// Animes are TV shows on TMDB, so they use the same pattern as "tv".
const PLAYER_URLS = {
    movie: "https://vidsrc.sh/embed/movie/{id}",
    tv:    "https://vidsrc.sh/embed/tv/{id}/{season}/{episode}"
};
PLAYER_URLS.anime = PLAYER_URLS.tv;

// ---------- Elements ----------
const statusEl    = document.getElementById("status");
const titleEl     = document.getElementById("watch-title");
const detailsLink = document.getElementById("details-link");
const player      = document.getElementById("player");
const frame       = document.getElementById("video-frame");
const episodeBar     = document.getElementById("episode-bar");
const seasonInput    = document.getElementById("season-input");
const episodeInput   = document.getElementById("episode-input");
const prevEpisodeBtn = document.getElementById("prev-episode");
const nextEpisodeBtn = document.getElementById("next-episode");

const params  = new URLSearchParams(window.location.search);
const movieId = params.get("id");          // the id in YOUR database (watch.html?id=5)

// ---------- Helpers ----------
function showStatus(text) {
    statusEl.textContent = text;
    statusEl.hidden = false;
}

// Builds the player address from the TMDB id. Returns null if the id is not a plain number.
function buildPlayerUrl(tmdbId, type = "movie", season = 1, episode = 1) {
    const pattern = PLAYER_URLS[type];
    if (!pattern) return null;
    const parts = { id: tmdbId, season, episode };
    for (const value of Object.values(parts)) {
        if (!/^\d+$/.test(String(value ?? "").trim())) return null;   // digits only
    }
    return pattern.replace(/\{(id|season|episode)\}/g, (_, key) => String(parts[key]).trim());
}

// Reads ?season=2&episode=5 from the address (defaults to 1 and 1)
function positiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : 1;
}

// ---------- Season / episode picker (only for tv and anime) ----------
let currentMovie = null;
let season  = positiveInt(params.get("season"));
let episode = positiveInt(params.get("episode"));

// Limits from the database (null = unknown, so no limit)
function maxSeason()  { return Number(currentMovie.seasons)  || 9999; }
function maxEpisode() { return Number(currentMovie.episodes) || 9999; }

function loadEpisode() {
    const type = currentMovie.type || "movie";
    if (type !== "movie") {
        season  = Math.min(season, maxSeason());       // a link like ?season=99 is brought back in range
        episode = Math.min(episode, maxEpisode());
    }
    const url = buildPlayerUrl(currentMovie.tmdb_id, type, season, episode);
    if (!url) {
        player.hidden = true;
        showStatus("This title has no player link yet.");
        return;
    }

    statusEl.hidden = true;
    frame.src = url;
    player.hidden = false;

    if (type !== "movie") {
        seasonInput.value = season;
        episodeInput.value = episode;
        titleEl.textContent = currentMovie.title + " - S" + season + " E" + episode;

        // keep the address in sync so a refresh or a shared link opens the same episode
        const next = new URL(window.location.href);
        next.searchParams.set("season", season);
        next.searchParams.set("episode", episode);
        history.replaceState(null, "", next);
    }
}

function setupEpisodePicker() {
    episodeBar.hidden = false;
    seasonInput.max  = maxSeason();
    episodeInput.max = maxEpisode();

    seasonInput.addEventListener("change", () => {
        season = Math.min(positiveInt(seasonInput.value), maxSeason());
        episode = 1;                         // a new season starts at episode 1
        loadEpisode();
    });
    episodeInput.addEventListener("change", () => {
        episode = Math.min(positiveInt(episodeInput.value), maxEpisode());
        loadEpisode();
    });
    prevEpisodeBtn.addEventListener("click", () => {
        if (episode > 1) { episode--; loadEpisode(); }
    });
    nextEpisodeBtn.addEventListener("click", () => {
        if (episode < maxEpisode()) { episode++; loadEpisode(); }
    });
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

        currentMovie = movie;
        if ((movie.type || "movie") !== "movie") setupEpisodePicker();

        loadEpisode();
        if (!player.hidden) startMarking();
    } catch (error) {
        console.error(error);
        titleEl.textContent = "Something went wrong";
        showStatus("Could not load this movie. Check that the server is running and try again.");
    }
}

init();