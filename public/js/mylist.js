const grid = document.getElementById("results");
const statusEl = document.getElementById("status");

function goToLogin() {
    window.location.href = "login.html?next=mylist.html";
}

function updateStatus() {
    const count = grid.children.length;
    statusEl.innerHTML = "";
    if (count === 0) {
        statusEl.append("Your list is empty. ");
        const link = document.createElement("a");
        link.href = "index.html";
        link.textContent = "Find something to watch";
        link.style.color = "var(--accent)";
        statusEl.append(link, ".");
    } else {
        statusEl.textContent = count + (count === 1 ? " movie" : " movies") + " saved";
    }
}

function createPlaceholder(movie) {
    const box = document.createElement("div");
    box.className = "poster p" + ((Number(movie.id) % 8) + 1);
    const label = document.createElement("span");
    label.textContent = movie.title;
    box.appendChild(label);
    return box;
}

function createItem(movie, index) {
    const item = document.createElement("div");
    item.className = "list-item";

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
    const rating = Number(movie.rating);
    sub.textContent = [movie.release_year, movie.rating !== null && !Number.isNaN(rating) ? rating.toFixed(1) : null]
        .filter(Boolean).join(" | ");

    card.append(poster, title, sub);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "list-remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + movie.title + " from My List");

    remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
            const response = await fetch("/api/watchlist/" + movie.id, { method: "DELETE" });
            if (response.status === 401) return goToLogin();
            if (!response.ok) throw new Error("status " + response.status);
            item.remove();                 // gone from the page, no reload
            updateStatus();
        } catch (error) {
            console.error(error);
            remove.disabled = false;
            statusEl.textContent = "Could not remove that movie. Please try again.";
        }
    });

    item.append(card, remove);
    return item;
}

(async function () {
    try {
        const response = await fetch("/api/watchlist");
        if (response.status === 401) return goToLogin();
        if (!response.ok) throw new Error("status " + response.status);

        const movies = await response.json();
        grid.replaceChildren(...movies.map(createItem));
        updateStatus();
    } catch (error) {
        console.error(error);
        statusEl.textContent = "Could not load your list. Check that the server is running.";
    }
})();
