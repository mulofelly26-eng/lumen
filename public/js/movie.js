const container = document.getElementById("movie");
 
// ---------- Helpers ----------
function showMessage(text) {
    const p = document.createElement("p");
    p.className = "row-message";
    p.textContent = text;
    container.replaceChildren(p);
}
 
function formatDuration(minutes) {
    const total = Number(minutes);
    if (!total) return "";
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h > 0 ? h + "h " + String(m).padStart(2, "0") + "m" : m + "m";
}
 
// Turns a normal YouTube link into a safe embed link.
// Returns null for anything that isn't YouTube, so we never embed unknown sites.
function getTrailerEmbedUrl(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        let id = null;
 
        if (u.hostname === "youtu.be") {
            id = u.pathname.slice(1);
        } else if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
            if (u.pathname === "/watch") id = u.searchParams.get("v");
            else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2];
        }
 
        if (!id || !/^[A-Za-z0-9_-]{6,15}$/.test(id)) return null;
        return "https://www.youtube-nocookie.com/embed/" + id;
    } catch {
        return null;                         // not a valid URL
    }
}
 
// ---------- My List (saved on the server for the logged-in user) ----------
async function setupListButton(button, movieId) {
    let saved = false;
 
    const refresh = () => {
        button.textContent = saved ? "In My List" : "+ Add to My List";
        button.setAttribute("aria-pressed", String(saved));
        button.classList.toggle("is-saved", saved);
    };
    refresh();
 
    try {
        const response = await fetch("/api/watchlist");           // 401 when not logged in
        if (response.ok) {
            const list = await response.json();
            saved = list.some((movie) => movie.id === movieId);
            refresh();
        }
    } catch { /* server not reachable */ }
 
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            const response = await fetch("/api/watchlist/" + movieId, { method: saved ? "DELETE" : "POST" });
            if (response.status === 401) {
                window.location.href = "login.html?next=" + encodeURIComponent("movie.html?id=" + movieId);
                return;
            }
            if (response.ok) saved = !saved;
        } catch { /* ignore, the button just stays as it was */ }
        button.disabled = false;
        refresh();
    });
}
 
// ---------- Build the page ----------
function renderMovie(movie) {
    document.title = movie.title + " - Lumen";
 
    // Poster
    let poster;
    if (movie.poster_url) {
        poster = document.createElement("img");
        poster.src = movie.poster_url;
        poster.alt = movie.title + " poster";
        poster.className = "poster detail-poster";
        poster.addEventListener("error", () => poster.replaceWith(makePlaceholder(movie)));
    } else {
        poster = makePlaceholder(movie);
    }
 
    // Title
    const title = document.createElement("h1");
    title.textContent = movie.title;
 
    // Meta line: year | duration | rating
    const meta = document.createElement("p");
    meta.className = "detail-meta";
    const bits = [];
    if (movie.release_year) bits.push(movie.release_year);
    if (movie.duration_minutes) bits.push(formatDuration(movie.duration_minutes));
    meta.textContent = bits.join("  |  ");
 
    const ratingNumber = Number(movie.rating);
    if (movie.rating !== null && movie.rating !== "" && !Number.isNaN(ratingNumber)) {
        const badge = document.createElement("span");
        badge.className = "rating-badge";
        badge.textContent = ratingNumber.toFixed(1);
        badge.title = "Rating out of 10";
        meta.prepend(badge);
    }
 
    // Genres as chips
    const genres = document.createElement("ul");
    genres.className = "genre-list";
    (movie.genres ? movie.genres.split(", ") : []).forEach((name) => {
        const li = document.createElement("li");
        li.textContent = name;
        genres.appendChild(li);
    });
 
    // Synopsis
    const synopsis = document.createElement("p");
    synopsis.className = "detail-synopsis";
    synopsis.textContent = movie.description || "No description yet.";
 
    // Buttons
    const actions = document.createElement("div");
    actions.className = "hero-actions";
 
    const watch = document.createElement("a");
    watch.className = "btn btn-primary";
    watch.href = "watch.html?id=" + encodeURIComponent(movie.id);
    watch.textContent = "Watch now";
 
    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.className = "btn btn-ghost";
    setupListButton(listBtn, Number(movie.id));
 
    actions.append(watch, listBtn);
 
    const info = document.createElement("div");
    info.className = "detail-info";
    info.append(title, meta, genres, synopsis, actions);
 
    const top = document.createElement("section");
    top.className = "detail-top";
    top.append(poster, info);
 
    // Trailer
    const trailerSection = document.createElement("section");
    trailerSection.className = "trailer";
    const trailerTitle = document.createElement("h2");
    trailerTitle.textContent = "Trailer";
    trailerSection.appendChild(trailerTitle);
 
    const embedUrl = getTrailerEmbedUrl(movie.trailer_url);
    if (embedUrl) {
        const frame = document.createElement("div");
        frame.className = "trailer-frame";
        const iframe = document.createElement("iframe");
        iframe.src = embedUrl;
        iframe.title = movie.title + " trailer";
        iframe.loading = "lazy";
        iframe.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        frame.appendChild(iframe);
        trailerSection.appendChild(frame);
    } else {
        const none = document.createElement("p");
        none.className = "row-message";
        none.textContent = "No trailer available yet.";
        trailerSection.appendChild(none);
    }
 
    container.replaceChildren(top, trailerSection);
}
 
function makePlaceholder(movie) {
    const box = document.createElement("div");
    box.className = "poster detail-poster p" + ((Number(movie.id) % 8) + 1);
    const label = document.createElement("span");
    label.textContent = movie.title;
    box.appendChild(label);
    return box;
}
 
// ---------- Start ----------
async function init() {
    const id = new URLSearchParams(window.location.search).get("id");
 
    if (!id || !/^\d+$/.test(id)) {
        showMessage("No movie selected. Go back to the home page and pick one.");
        return;
    }
 
    try {
        const response = await fetch("/api/movies/" + id);
 
        if (response.status === 404) {
            showMessage("Sorry, that movie doesn't exist.");
            return;
        }
        if (!response.ok) {
            throw new Error("Server answered with status " + response.status);
        }
 
        renderMovie(await response.json());
    } catch (error) {
        console.error(error);
        showMessage("Could not load this movie. Check that the server is running and try again.");
    }
}
 
init();