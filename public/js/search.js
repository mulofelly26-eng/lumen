const DEBOUNCE_MS = 300;     // wait this long after the last key press before searching

const form = document.querySelector(".search");
const qInput = document.getElementById("q");
const genreSelect = document.getElementById("genre");
const yearSelect = document.getElementById("year");
const clearBtn = document.getElementById("clear-filters");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

let timer = null;            // the pending "search in 300ms"
let controller = null;       // lets us cancel a search that is no longer needed

// ---------- Cards (same look as the homepage) ----------
function createCard(movie, index) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = "movie.html?id=" + encodeURIComponent(movie.id);
    card.style.setProperty("--delay", Math.min(index, 12) * 40 + "ms");

    let poster;
    if (movie.poster_url) {
        poster = document.createElement("img");
        poster.className = "poster";
        poster.src = movie.poster_url;
        poster.alt = movie.title + " poster";
        poster.loading = "lazy";
        poster.addEventListener("error", () => poster.replaceWith(createPlaceholder(movie)));
    } else {
        poster = createPlaceholder(movie);
    }

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = movie.title;

    const sub = document.createElement("p");
    sub.className = "card-sub";
    const parts = [];
    if (movie.release_year) parts.push(movie.release_year);
    const rating = Number(movie.rating);
    if (movie.rating !== null && movie.rating !== "" && !Number.isNaN(rating)) parts.push(rating.toFixed(1));
    sub.textContent = parts.join(" | ");

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

// ---------- Helpers ----------
function showStatus(text) {
    statusEl.textContent = text;
}

// Keeps the address bar in step with the search, so the link can be shared
function updateUrl(q, genre, year) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (genre) params.set("genre", genre);
    if (year) params.set("year", year);
    const text = params.toString();
    history.replaceState(null, "", text ? "?" + text : window.location.pathname);
}

function addOptions(select, values) {
    values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

// ---------- The search ----------
async function runSearch() {
    const q = qInput.value.trim();
    const genre = genreSelect.value;
    const year = yearSelect.value;

    updateUrl(q, genre, year);

    if (controller) controller.abort();      // a newer search replaces the older one

    if (!q && !genre && !year) {
        resultsEl.replaceChildren();
        clearBtn.hidden = true;
        showStatus("Type a title, or pick a genre or a year.");
        return;
    }

    clearBtn.hidden = false;
    showStatus("Searching...");

    controller = new AbortController();

    try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (genre) params.set("genre", genre);
        if (year) params.set("year", year);

        const response = await fetch("/api/movies/search?" + params, { signal: controller.signal });
        if (!response.ok) throw new Error("Server answered with status " + response.status);

        const movies = await response.json();

        resultsEl.replaceChildren(...movies.map(createCard));
        showStatus(
            movies.length === 0
                ? "No movies found. Try another title, or clear the filters."
                : movies.length + (movies.length === 1 ? " movie found" : " movies found")
        );
    } catch (error) {
        if (error.name === "AbortError") return;     // cancelled on purpose
        console.error(error);
        resultsEl.replaceChildren();
        showStatus("Search failed. Check that the server is running and try again.");
    }
}

// ---------- Events ----------
qInput.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, DEBOUNCE_MS);      // restarts the 300ms wait on every key press
});

form.addEventListener("submit", (event) => {
    event.preventDefault();                          // search right now, without leaving the page
    clearTimeout(timer);
    runSearch();
});

genreSelect.addEventListener("change", runSearch);
yearSelect.addEventListener("change", runSearch);

clearBtn.addEventListener("click", () => {
    qInput.value = "";
    genreSelect.value = "";
    yearSelect.value = "";
    runSearch();
    qInput.focus();
});

// ---------- Start ----------
async function init() {
    try {
        const response = await fetch("/api/filters");
        if (response.ok) {
            const filters = await response.json();
            addOptions(genreSelect, filters.genres);
            addOptions(yearSelect, filters.years);
        }
    } catch (error) {
        console.warn("Could not load the filter lists:", error);
    }

    // Fill the controls from the address, for example search.html?q=spider&genre=Action
    const params = new URLSearchParams(window.location.search);
    qInput.value = params.get("q") || "";
    genreSelect.value = params.get("genre") || "";
    yearSelect.value = params.get("year") || "";

    runSearch();
}

init();
