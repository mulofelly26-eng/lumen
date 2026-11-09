// DOM Elements
const titleEl = document.getElementById("title");
const detailsLink = document.getElementById("details-link");
const videoFrame = document.querySelector("#video-frame");
const statusEl = document.getElementById("status");

// 1. Get the movieId from the URL query params (e.g. watch.html?id=385687)
const params = new URLSearchParams(window.location.search);
const movieId = movieTmbd(); // Defaults to 385687 if none provided
async function movieTmbd() {
    const response = await fetch("/api/movies/" + encodeURIComponent(movieId));
    const movie = await response.json();
    return movie.tmdb_id;
}
async function initEmbedPlayer() {
    if (!movieId) {
        if (statusEl) statusEl.textContent = "No Movie ID specified.";
        return;
    }

    // 2. Set the iframe source using the dynamic movieId
    const embedUrl = `https://vidsrc.sh/embed/movie/${await movieTmbd()}`;
    videoFrame.src = embedUrl;

    // 3. Update the back button
    if (detailsLink) {
        detailsLink.href = `/details?id=${movieId}`;
    }

    // 4. (Optional) Fetch movie metadata from your own backend or TMDB
    fetchMovieDetails(movieId);
}

async function fetchMovieDetails(id) {
    try {
        // Replace this endpoint with your own API or TMDB endpoint
        const response = await fetch(`/api/movies/${await movieTmbd()}`);
        if (!response.ok) throw new Error("Metadata fetch failed");

        const data = await response.json();
        if (titleEl && data.title) {
            titleEl.textContent = data.title;
            document.title = `Watch - ${data.title}`;
        }
    } catch {
        // Fallback title if no custom backend exists
        if (titleEl) titleEl.textContent = `Movie #${id}`;
    }
}

// Initialize
initEmbedPlayer();











// const movie = await response.json();

// console.log("Database ID:", movie.id);
// console.log("TMDB ID:", movie.tmdb_id);

// titleEl.textContent = movie.title;
// document.title = "Watching " + movie.title + " - Lumen";