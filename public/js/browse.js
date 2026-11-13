const TYPES = { movie: "Movies", tv: "TV Shows", anime: "Anime" };
const EMPTY = {
    movie: "No movies yet.",
    tv: "TV shows are coming soon.",
    anime: "No anime yet.",
};
 
let type = new URLSearchParams(window.location.search).get("type");
if (!TYPES[type]) type = "movie";
 
const grid = document.getElementById("results");
const statusEl = document.getElementById("status");
document.getElementById("title").textContent = TYPES[type];
document.title = TYPES[type] + " - Lumen";
 
// The three category tabs
const tabs = document.getElementById("tabs");
Object.entries(TYPES).forEach(([key, label]) => {
    const a = document.createElement("a");
    a.href = "browse.html?type=" + key;
    a.textContent = label;
    if (key === type) a.setAttribute("aria-current", "page");
    tabs.appendChild(a);
});
 
function subtitle(item) {
    const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
    if (item.type !== "movie" && (item.seasons || item.episodes)) {
        return [item.seasons && plural(item.seasons, "season"), item.episodes && plural(item.episodes, "episode")]
            .filter(Boolean).join(" | ");
    }
    const rating = Number(item.rating);
    return [item.release_year, item.rating !== null && !Number.isNaN(rating) ? rating.toFixed(1) : null]
        .filter(Boolean).join(" | ");
}
 
function placeholder(item) {
    const box = document.createElement("div");
    box.className = "poster p" + ((Number(item.id) % 8) + 1);
    const span = document.createElement("span");
    span.textContent = item.title;
    box.appendChild(span);
    return box;
}
 
function card(item, index) {
    const a = document.createElement("a");
    a.className = "card";
    a.href = "movie.html?id=" + encodeURIComponent(item.id);
    a.style.setProperty("--delay", Math.min(index, 12) * 40 + "ms");
 
    let poster;
    if (item.poster_url) {
        poster = document.createElement("img");
        poster.className = "poster";
        poster.src = item.poster_url;
        poster.alt = item.title + " poster";
        poster.loading = "lazy";
        poster.addEventListener("error", () => poster.replaceWith(placeholder(item)));
    } else {
        poster = placeholder(item);
    }
 
    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = item.title;
    const sub = document.createElement("p");
    sub.className = "card-sub";
    sub.textContent = subtitle(item);
 
    a.append(poster, title, sub);
    return a;
}
 
(async function () {
    try {
        const response = await fetch("/api/movies?type=" + type);
        if (!response.ok) throw new Error("status " + response.status);
        const items = await response.json();
 
        grid.replaceChildren(...items.map(card));
        statusEl.textContent = items.length ? items.length + (items.length === 1 ? " title" : " titles") : EMPTY[type];
    } catch (error) {
        console.error(error);
        statusEl.textContent = "Could not load this category. Please try again.";
    }
})();