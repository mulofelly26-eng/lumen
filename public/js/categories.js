// "Browse by category" on the home page: Movies, TV Shows, Anime.
// Each tile shows posters that change every few seconds, and a different random set each time
// the page loads. A category with no titles yet keeps its plain gradient.
(function () {
    const firstRow = document.querySelector("main .row");
    if (!firstRow) return;
 
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SLOTS = 3;              // posters shown in each tile
    const SWAP_EVERY_MS = 4500;   // each poster changes this often (one after another)
 
    const style = document.createElement("style");
    style.textContent = `
        .cats { padding: 24px var(--gutter) 0; }
        .cats h2 { font-family: var(--font-display); font-weight: 600; font-size: clamp(1.25rem, 3vw, 1.6rem); margin-bottom: 14px; }
        .cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .cat-tile { position: relative; display: flex; align-items: flex-end; min-height: 150px; padding: 18px;
            border-radius: 12px; overflow: hidden; transition: transform 0.2s, box-shadow 0.2s; }
        .cat-tile:hover, .cat-tile:focus-visible { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(0,0,0,0.5); }
        .cat-text { position: relative; z-index: 1; display: grid; }
        .cat-text strong { font-family: var(--font-display); font-size: 1.5rem; }
        .cat-text span { color: rgba(255,255,255,0.8); font-size: 0.9rem; }
        .cat-posters { position: absolute; top: 14px; right: 14px; bottom: 14px; display: flex; gap: 8px; }
        .cat-posters img { height: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 8px;
            box-shadow: 0 6px 16px rgba(0,0,0,0.5); transition: opacity 0.6s ease; }
        .cat-movie { background: linear-gradient(135deg, #b5701a, #3d2708); }
        .cat-tv    { background: linear-gradient(135deg, #2e5fa8, #0b1730); }
        .cat-anime { background: linear-gradient(135deg, #7a4aa8, #1d1330); }
        @media (max-width: 1100px) { .cat-posters img:nth-child(3) { display: none; } }
        @media (max-width: 720px) {
            .cat-grid { grid-template-columns: 1fr; }
            .cat-tile { min-height: 120px; }
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
 
    function showPosters(tile, posters) {
        if (posters.length === 0) return;
 
        const box = document.createElement("div");
        box.className = "cat-posters";
        box.setAttribute("aria-hidden", "true");        // decoration: the tile's text names the category
 
        const slots = [];
        for (let i = 0; i < Math.min(SLOTS, posters.length); i++) {
            const img = document.createElement("img");
            img.alt = "";
            img.src = posters[i];
            img.addEventListener("error", () => img.remove());
            box.appendChild(img);
            slots.push(img);
        }
        tile.appendChild(box);
 
        // Not enough posters to rotate, or the visitor asked for less motion
        if (reduceMotion || posters.length <= slots.length) return;
 
        let next = slots.length;
        function swap(img) {
            const url = posters[next++ % posters.length];
            const loader = new Image();
            loader.onload = () => {
                img.style.opacity = 0;                    // fade out, change picture, fade in
                setTimeout(() => { img.src = url; img.style.opacity = 1; }, 600);
            };
            loader.src = url;
        }
 
        slots.forEach((img, i) => {
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
 
    [["movie", "Movies", "Films from every genre", true],
     ["tv", "TV Shows", "Seasons and episodes", true],
     ["anime", "Anime", "Seasons and episodes", true]].forEach(([type, name, note, hasPosters]) => {
        const tile = document.createElement("a");
        tile.className = "cat-tile cat-" + type;
        tile.href = "browse.html?type=" + type;
 
        const text = document.createElement("div");
        text.className = "cat-text";
        const strong = document.createElement("strong");
        strong.textContent = name;
        const span = document.createElement("span");
        span.textContent = note;
        text.append(strong, span);
        tile.appendChild(text);
        grid.appendChild(tile);
 
        // The tile appears at once; the posters are added when they have loaded
        if (hasPosters) loadPosters(type).then((posters) => showPosters(tile, posters));
    });
 
    section.append(h2, grid);
    firstRow.before(section);
})();