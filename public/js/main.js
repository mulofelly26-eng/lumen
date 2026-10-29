// ---------- Settings ----------
console.log("main.js loaded");
const API_URL = "/api/movies";

// Used only if the API can't be reached (for example when you open
// index.html directly from your folder). Delete it once your server works.
const SAMPLE_MOVIES = [
    { id: 1, title: "The Last Signal",   release_year: 2026, rating: 8.1, poster_url: "" },
    { id: 2, title: "Salt Road",         release_year: 2025, rating: 7.6, poster_url: "" },
    { id: 3, title: "Paper Kingdoms",    release_year: 2024, rating: 7.9, poster_url: "" },
    { id: 4, title: "Nine Floors Down",  release_year: 2026, rating: 6.8, poster_url: "" },
    { id: 5, title: "Harmattan",         release_year: 2023, rating: 8.4, poster_url: "" },
    { id: 6, title: "Blue Hour",         release_year: 2025, rating: 7.2, poster_url: "" },
    { id: 7, title: "Copper Hill",       release_year: 2022, rating: 7.5, poster_url: "" },
    { id: 8, title: "Long Tide",         release_year: 2024, rating: 7.0, poster_url: "" },
];

// ---------- Fetch ----------
async function fetchMovies() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error("Server answered with status " + response.status);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error("Expected a list of movies");
        }
        return data;
    } catch (error) {
        console.warn("Could not load " + API_URL + ", using sample data.", error);
        return SAMPLE_MOVIES;
    }
}

// ---------- Build one card ----------
function createCard(movie, index) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = "movie.html?id=" + encodeURIComponent(movie.id);
    // each card starts a little after the previous one
    card.style.setProperty("--delay", Math.min(index, 12) * 60 + "ms");

    // Poster: real image if we have one, coloured placeholder if not
    let poster;
    if (movie.poster_url) {
        poster = document.createElement("img");
        poster.className = "poster";
        poster.src = movie.poster_url;
        poster.alt = movie.title + " poster";
        poster.loading = "lazy";
        poster.addEventListener("error", () => {
            poster.replaceWith(createPlaceholder(movie));
        });
    } else {
        poster = createPlaceholder(movie);
    }

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = movie.title;       // textContent keeps it safe from HTML injection

    const sub = document.createElement("p");
    sub.className = "card-sub";
    sub.textContent = formatSubtitle(movie);

    card.append(poster, title, sub);
    return card;
}

function createPlaceholder(movie) {
    const box = document.createElement("div");
    box.className = "poster p" + ((Number(movie.id) % 8) + 1);
    const label = document.createElement("span");
    label.textContent = movie.title;
    box.appendChild(label);
    return box;
}

function formatSubtitle(movie) {
    const parts = [];
    if (movie.release_year) parts.push(movie.release_year);
    const rating = Number(movie.rating);
    if (!Number.isNaN(rating) && movie.rating !== null && movie.rating !== "") {
        parts.push(rating.toFixed(1));
    }
    return parts.join(" | ");
}

// ---------- Fill one row ----------
function renderRow(container, movies) {
    container.replaceChildren();           // clear "Loading..." text

    if (movies.length === 0) {
        const empty = document.createElement("p");
        empty.className = "row-message";
        empty.textContent = "No movies to show yet.";
        container.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    movies.forEach((movie, index) => fragment.appendChild(createCard(movie, index)));
    container.appendChild(fragment);
}

// ---------- Decide which movies go in which row ----------
const rowRules = {
    trending: (movies) => movies,                                                  // order from the server
    top:      (movies) => [...movies].sort((a, b) => b.rating - a.rating),         // best rated first
    new:      (movies) => [...movies].sort((a, b) => b.release_year - a.release_year), // newest first
};

// ---------- Start ----------
async function init() {
    const rows = document.querySelectorAll(".row-scroll[data-row]");

    rows.forEach((row) => {
        const message = document.createElement("p");
        message.className = "row-message";
        message.textContent = "Loading movies...";
        row.replaceChildren(message);
    });

    const movies = await fetchMovies();

    rows.forEach((row) => {
        const rule = rowRules[row.dataset.row] || rowRules.trending;
        renderRow(row, rule(movies));
    });
}

document.addEventListener("DOMContentLoaded", init);
