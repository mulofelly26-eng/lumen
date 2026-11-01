// Adds a "Continue watching" row to the home page for logged-in users.
// It builds the row itself, so index.html only needs the script tag.
(async function () {
    const firstRow = document.querySelector("main .row");
    if (!firstRow) return;

    let items;
    try {
        const response = await fetch("/api/history");
        if (!response.ok) return;                       // not logged in: show nothing
        items = await response.json();
    } catch {
        return;
    }
    if (!Array.isArray(items) || items.length === 0) return;

    const style = document.createElement("style");
    style.textContent = `
        .progress { height: 4px; margin-top: 8px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden; }
        .progress span { display: block; height: 100%; background: var(--accent); }
    `;
    document.head.appendChild(style);

    function formatTime(total) {
        const m = Math.floor(total / 60);
        const s = String(Math.floor(total % 60)).padStart(2, "0");
        return m + ":" + s;
    }

    const section = document.createElement("section");
    section.className = "row";
    section.setAttribute("aria-labelledby", "row-continue");

    const heading = document.createElement("h2");
    heading.id = "row-continue";
    heading.textContent = "Continue watching";

    const scroll = document.createElement("div");
    scroll.className = "row-scroll";

    items.forEach((item, index) => {
        const card = document.createElement("a");
        card.className = "card";
        card.href = "watch.html?id=" + encodeURIComponent(item.id);   // the player resumes by itself
        card.style.setProperty("--delay", Math.min(index, 12) * 60 + "ms");

        let poster;
        if (item.poster_url) {
            poster = document.createElement("img");
            poster.className = "poster";
            poster.src = item.poster_url;
            poster.alt = item.title + " poster";
            poster.loading = "lazy";
        } else {
            poster = document.createElement("div");
            poster.className = "poster p" + ((Number(item.id) % 8) + 1);
            const label = document.createElement("span");
            label.textContent = item.title;
            poster.appendChild(label);
        }

        const title = document.createElement("p");
        title.className = "card-title";
        title.textContent = item.title;

        const sub = document.createElement("p");
        sub.className = "card-sub";

        card.append(poster);

        if (item.duration_seconds) {
            const percent = Math.min(100, Math.round((item.progress_seconds / item.duration_seconds) * 100));
            const bar = document.createElement("div");
            bar.className = "progress";
            const fill = document.createElement("span");
            fill.style.width = percent + "%";
            bar.appendChild(fill);
            card.append(bar);
            sub.textContent = formatTime(item.duration_seconds - item.progress_seconds) + " left";
        } else {
            sub.textContent = "Resume at " + formatTime(item.progress_seconds);
        }

        card.append(title, sub);
        scroll.appendChild(card);
    });

    section.append(heading, scroll);
    firstRow.before(section);
})();
