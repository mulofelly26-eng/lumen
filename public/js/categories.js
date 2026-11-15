// "Browse by category" on the home page: Movies, TV Shows, Anime.
// No coloured background: each category is just three posters that change every few seconds
// (a different random set on every visit), with the category name underneath.
(function () {
    const firstRow = document.querySelector("main .row");
    if (!firstRow) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SLOTS = 3;              // posters shown for each category
    const SWAP_EVERY_MS = 4500;   // each poster changes this often (one after another)

    const style = document.createElement("style");
    style.textContent = `
        .cats { padding: 24px var(--gutter) 0; }
        .cats h2 { font-family: var(--font-display); font-weight: 600; font-size: clamp(1.25rem, 3vw, 1.6rem); margin-bottom: 14px; }
        .cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px 24px; }
        .cat-tile { display: grid; gap: 12px; align-content: start; transition: transform 0.2s; }
        .cat-tile:hover, .cat-tile:focus-visible { transform: translateY(-3px); }
        .cat-posters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .cat-slot { position: relative; aspect-ratio: 2 / 3; border-radius: 8px; overflow: hidden;
            background: var(--surface); box-shadow: 0 6px 16px rgba(0,0,0,0.5); }
        .cat-slot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity 0.6s ease; }
        .cat-name { font-family: var(--font-display); font-weight: 600; font-size: 1.3rem; transition: color 0.2s; }
        .cat-tile:hover .cat-name, .cat-tile:focus-visible .cat-name { color: var(--accent); }
        @media (max-width: 720px) {
            .cat-grid { grid-template-columns: 1fr; }
            .cat-posters { max-width: 360px; }
        }
    `;
    document.head.appendChild(style);

    function shuffle(list) {
        const copy = [...list];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    // Poster addresses of one category, in random order
    async function loadPosters(type) {
        try {
            const response = await fetch("/api/movies?type=" + type);
            if (!response.ok) return [];
            const items = await response.json();
            return shuffle(
                items.filter((item) => (item.type || "movie") === type && item.poster_url).map((item) => item.poster_url)
            ).slice(0, 12);
        } catch {
            return [];
        }
    }

    function fillSlots(slotBoxes, posters) {
        const images = [];
        slotBoxes.forEach((box, i) => {
            if (i >= posters.length) return;                // not enough posters: the slot stays empty
            const img = document.createElement("img");
            img.alt = "";
            img.src = posters[i];
            img.addEventListener("error", () => img.remove());
            box.appendChild(img);
            images.push(img);
        });

        // Nothing to rotate, or the visitor asked for less motion
        if (reduceMotion || posters.length <= images.length) return;

        let next = images.length;
        function swap(img) {
            const url = posters[next++ % posters.length];
            const loader = new Image();
            loader.onload = () => {
                img.style.opacity = 0;                      // fade out, change picture, fade in
                setTimeout(() => { img.src = url; img.style.opacity = 1; }, 600);
            };
            loader.src = url;
        }

        images.forEach((img, i) => {
            // The posters change one after another instead of all together
            setTimeout(() => setInterval(() => swap(img), SWAP_EVERY_MS), i * 1500);
        });
    }

    const section = document.createElement("section");
    section.className = "cats";
    section.setAttribute("aria-labelledby", "cats-title");
    const h2 = document.createElement("h2");
    h2.id = "cats-title";
    h2.textContent = "Browse by category";
    const grid = document.createElement("div");
    grid.className = "cat-grid";

    [["movie", "Movies"], ["tv", "TV Shows"], ["anime", "Anime"]].forEach(([type, name]) => {
        const tile = document.createElement("a");
        tile.className = "cat-tile";
        tile.href = "browse.html?type=" + type;

        const posters = document.createElement("div");
        posters.className = "cat-posters";
        posters.setAttribute("aria-hidden", "true");        // decoration: the name below names the link
        const slotBoxes = [];
        for (let i = 0; i < SLOTS; i++) {
            const slot = document.createElement("div");
            slot.className = "cat-slot";
            posters.appendChild(slot);
            slotBoxes.push(slot);
        }

        const label = document.createElement("span");
        label.className = "cat-name";
        label.textContent = name;

        tile.append(posters, label);
        grid.appendChild(tile);

        // The tile appears at once; the posters are added when they have loaded
        loadPosters(type).then((list) => fillSlots(slotBoxes, list));
    });

    section.append(h2, grid);
    firstRow.before(section);
})();