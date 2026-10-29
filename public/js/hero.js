// Fills the hero banner with featured movies and plays their trailer behind the text.
// If anything fails, the hero keeps whatever is already written in index.html.
 
(async function () {
    const hero = document.getElementById("hero");
    if (!hero) return;
 
    const videoBox = document.getElementById("hero-video");
    const titleEl = document.getElementById("hero-title");
    const metaEl = document.getElementById("hero-meta");
    const descEl = document.getElementById("hero-desc");
    const watchBtn = document.getElementById("hero-watch");
    const infoBtn = document.getElementById("hero-info");
    const dotsEl = document.getElementById("hero-dots");
    const soundBtn = document.getElementById("hero-sound");
 
    // Autoplay video on every screen size, except for people who asked for less motion or less data
    const canPlayVideo =
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !(navigator.connection && navigator.connection.saveData);
 
    let movies = [];
    try {
        const response = await fetch("/api/movies/featured");
        if (response.ok) movies = await response.json();
    } catch (error) {
        console.warn("Could not load featured movies:", error);
    }
    if (!Array.isArray(movies) || movies.length === 0) return;
 
    // The server already shuffles. Make sure the first movie is not the one shown last time.
    const LAST_KEY = "lumen-last-hero";
    try {
        const last = localStorage.getItem(LAST_KEY);
        if (movies.length > 1 && String(movies[0].id) === last) {
            movies.push(movies.shift());
        }
        localStorage.setItem(LAST_KEY, String(movies[0].id));
    } catch { /* storage blocked: skip */ }
 
    let soundOn = false;
    let currentFrame = null;
    let currentIndex = 0;
    let advancedFrame = null;     // makes sure each video moves on only once
 
    function youtubeId(url) {
        try {
            const u = new URL(url);
            let id = null;
            if (u.hostname === "youtu.be") id = u.pathname.slice(1);
            else if (u.hostname.endsWith("youtube.com") && u.pathname === "/watch") id = u.searchParams.get("v");
            return id && /^[A-Za-z0-9_-]{6,15}$/.test(id) ? id : null;
        } catch {
            return null;
        }
    }
 
    function loadVideo(url) {
        videoBox.replaceChildren();
        currentFrame = null;
        soundOn = false;
        soundBtn.hidden = true;
 
        const id = youtubeId(url);
        if (!id || !canPlayVideo) return;
 
        const box = document.createElement("div");
        box.className = "hero-video-frame";
 
        const iframe = document.createElement("iframe");
        iframe.src =
            "https://www.youtube-nocookie.com/embed/" + id +
            "?autoplay=1&mute=1&controls=0" + (movies.length === 1 ? "&loop=1&playlist=" + id : "") +
            "&playsinline=1&rel=0&modestbranding=1&enablejsapi=1";
        iframe.title = "Trailer";
        iframe.allow = "autoplay; encrypted-media";
        iframe.tabIndex = -1;
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.addEventListener("load", () => {
            box.classList.add("ready");
            // Ask the player to send us its events (state changes and errors).
            // Sent twice because the player can still be starting up the first time.
            const listen = () => iframe.contentWindow &&
                iframe.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
            listen();
            setTimeout(listen, 1000);
        });
 
        box.appendChild(iframe);
        videoBox.appendChild(box);
        currentFrame = iframe;
 
        soundBtn.textContent = "Sound on";
        soundBtn.hidden = false;
    }
 
    function show(index) {
        const movie = movies[index];
        currentIndex = index;
 
        titleEl.textContent = movie.title;
        descEl.textContent = movie.description || "";
 
        const bits = [];
        if (movie.release_year) bits.push(movie.release_year);
        if (movie.rating !== null && movie.rating !== "") bits.push("Rating " + Number(movie.rating).toFixed(1));
        if (movie.genres) bits.push(movie.genres.split(", ").slice(0, 2).join(", "));
        metaEl.textContent = bits.join("  |  ");
 
        watchBtn.href = "watch.html?id=" + encodeURIComponent(movie.id);
        infoBtn.href = "movie.html?id=" + encodeURIComponent(movie.id);
 
        dotsEl.querySelectorAll("button").forEach((dot, i) => {
            dot.setAttribute("aria-current", String(i === index));
        });
 
        loadVideo(movie.trailer_url);
    }
 
    // One dot per featured movie
    movies.forEach((movie, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", "Show " + movie.title);
        dot.addEventListener("click", () => show(i));
        dotsEl.appendChild(dot);
    });
 
    // Sound toggle (YouTube's player listens for these messages because of enablejsapi=1)
    soundBtn.addEventListener("click", () => {
        if (!currentFrame) return;
        soundOn = !soundOn;
        currentFrame.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: soundOn ? "unMute" : "mute", args: [] }),
            "*"
        );
        soundBtn.textContent = soundOn ? "Mute" : "Sound on";
    });
 
    function goToNext() {
        if (!currentFrame || advancedFrame === currentFrame) return;
        advancedFrame = currentFrame;
        show((currentIndex + 1) % movies.length);
    }
 
    // Messages from the YouTube player: state 0 means "ended". An error (for example a
    // trailer that can't be embedded) also moves on, so the banner never gets stuck.
    window.addEventListener("message", (event) => {
        if (!currentFrame || event.source !== currentFrame.contentWindow) return;
 
        let data = event.data;
        if (typeof data === "string") {
            try { data = JSON.parse(data); } catch { return; }
        }
        if (!data) return;
 
        const ended =
            (data.event === "onStateChange" && data.info === 0) ||
            (data.event === "infoDelivery" && data.info && data.info.playerState === 0);
 
        if (ended || data.event === "onError") goToNext();
    });
 
    show(0);
})();