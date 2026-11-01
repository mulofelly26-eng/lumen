// ---------- Settings ----------
const SAVE_EVERY_MS = 10000;        // save the position every 10 seconds
const HIDE_CONTROLS_MS = 2500;
const VOLUME_KEY = "lumen-volume";
 
// ---------- Elements ----------
const statusEl    = document.getElementById("status");
const titleEl     = document.getElementById("watch-title");
const detailsLink = document.getElementById("details-link");
const player      = document.getElementById("player");
const video       = document.getElementById("video");
const playBtn     = document.getElementById("play-btn");
const seek        = document.getElementById("seek");
const timeEl      = document.getElementById("time");
const muteBtn     = document.getElementById("mute-btn");
const volume      = document.getElementById("volume");
const fsBtn       = document.getElementById("fs-btn");
const resumeNote  = document.getElementById("resume-note");
const resumeText  = document.getElementById("resume-text");
const startOver   = document.getElementById("start-over");
 
const params  = new URLSearchParams(window.location.search);
const movieId = params.get("id");
 
// ---------- Helpers ----------
function formatTime(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const s = Math.floor(totalSeconds % 60);
    const m = Math.floor((totalSeconds / 60) % 60);
    const h = Math.floor(totalSeconds / 3600);
    const ss = String(s).padStart(2, "0");
    return h > 0 ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
}
 
function showStatus(text) {
    statusEl.textContent = text;
    statusEl.hidden = false;
}
 
// Only allow http(s) links or paths on this site, never javascript: or data: links
function safeVideoUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url, window.location.origin);
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
    } catch {
        return null;
    }
}
 
function setIcon(button, iconId) {
    button.querySelector("use").setAttribute("href", "#" + iconId);
}
 
// ---------- Play / pause ----------
function togglePlay() {
    if (video.paused || video.ended) {
        video.play().catch(() => { /* the browser blocked it, user can press again */ });
    } else {
        video.pause();
    }
}
 
function updatePlayButton() {
    const playing = !video.paused && !video.ended;
    setIcon(playBtn, playing ? "i-pause" : "i-play");
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
}
 
// ---------- Seek bar ----------
let dragging = false;
 
function updateSeekBar() {
    const duration = video.duration || 0;
    if (!dragging) seek.value = video.currentTime;
    const percent = duration ? (Number(seek.value) / duration) * 100 : 0;
    seek.style.setProperty("--progress", percent + "%");
    timeEl.textContent = formatTime(video.currentTime) + " / " + formatTime(duration);
}
 
function seekBy(seconds) {
    if (!video.duration) return;
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration);
}
 
// ---------- Volume ----------
function updateVolumeUi() {
    const silent = video.muted || video.volume === 0;
    setIcon(muteBtn, silent ? "i-muted" : "i-volume");
    muteBtn.setAttribute("aria-label", silent ? "Unmute" : "Mute");
    volume.value = video.muted ? 0 : video.volume;
}
 
function changeVolume(delta) {
    video.muted = false;
    video.volume = Math.min(Math.max(video.volume + delta, 0), 1);
}
 
// ---------- Fullscreen ----------
function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else if (player.requestFullscreen) {
        player.requestFullscreen();
    } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();     // iPhone Safari
    }
}
 
// ---------- Saving the position on the server ----------
let hasPlayed = false;      // never save before the person actually pressed play
let lastSaved = -1;
let canSave = true;         // becomes false when nobody is logged in
let saveTimer = null;
 
function saveProgress(force = false, keepalive = false) {
    if (!hasPlayed || !canSave || !video.duration) return;
 
    const seconds = video.ended ? 0 : Math.floor(video.currentTime);
    if (!force && seconds === lastSaved) return;
    lastSaved = seconds;
 
    fetch("/api/movies/" + encodeURIComponent(movieId) + "/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds, duration: Math.floor(video.duration) }),
        keepalive,                           // lets the request finish while the page is closing
    }).then((response) => {
        if (response.status === 401) canSave = false;     // not logged in: stop trying
    }).catch((err) => console.warn("Could not save progress:", err));
}
 
function startSaving() {
    if (saveTimer === null) saveTimer = setInterval(() => saveProgress(), SAVE_EVERY_MS);
}
 
function stopSaving() {
    clearInterval(saveTimer);
    saveTimer = null;
}
 
async function loadSavedProgress() {
    try {
        const response = await fetch("/api/movies/" + encodeURIComponent(movieId) + "/progress");
        if (!response.ok) return 0;
        const data = await response.json();
        return Number(data.progress_seconds) || 0;
    } catch {
        return 0;
    }
}
 
// ---------- Controls that hide while watching ----------
let hideTimer = null;
 
function showControls() {
    player.classList.remove("hide-controls");
    clearTimeout(hideTimer);
    if (!video.paused) {
        hideTimer = setTimeout(() => player.classList.add("hide-controls"), HIDE_CONTROLS_MS);
    }
}
 
// ---------- Wire everything up ----------
function setupPlayer(videoUrl) {
    video.src = videoUrl;
    player.hidden = false;
 
    // Volume remembered between visits
    const savedVolume = Number(localStorage.getItem(VOLUME_KEY));
    video.volume = Number.isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 1 ? savedVolume : 1;
    updateVolumeUi();
 
    // Buttons
    playBtn.addEventListener("click", togglePlay);
    muteBtn.addEventListener("click", () => { video.muted = !video.muted; });
    fsBtn.addEventListener("click", toggleFullscreen);
    video.addEventListener("click", togglePlay);
    video.addEventListener("dblclick", toggleFullscreen);
 
    // Sliders
    seek.addEventListener("input", () => {
        dragging = true;
        video.currentTime = Number(seek.value);
        updateSeekBar();
    });
    seek.addEventListener("change", () => { dragging = false; });
    seek.addEventListener("pointerup", () => seek.blur());     // so keyboard shortcuts keep working
 
    volume.addEventListener("input", () => {
        video.muted = false;
        video.volume = Number(volume.value);
    });
    volume.addEventListener("pointerup", () => volume.blur());
 
    // Video events
    video.addEventListener("loadedmetadata", async () => {
        seek.max = video.duration;
        updateSeekBar();
 
        const saved = await loadSavedProgress();
        if (saved >= 5 && saved < video.duration - 10) {
            video.currentTime = saved;
            resumeText.textContent = "Resumed from " + formatTime(saved);
            resumeNote.hidden = false;
            setTimeout(() => { resumeNote.hidden = true; }, 8000);
        }
    });
 
    video.addEventListener("timeupdate", updateSeekBar);
 
    video.addEventListener("play", () => {
        hasPlayed = true;
        updatePlayButton();
        startSaving();
        showControls();
    });
 
    video.addEventListener("pause", () => {
        updatePlayButton();
        stopSaving();
        saveProgress();
        showControls();
    });
 
    video.addEventListener("ended", () => {
        updatePlayButton();
        stopSaving();
        saveProgress(true);       // finished: saves 0 so it starts from the beginning next time
        showControls();
    });
 
    video.addEventListener("volumechange", () => {
        updateVolumeUi();
        try { localStorage.setItem(VOLUME_KEY, String(video.volume)); } catch { /* storage blocked */ }
    });
 
    video.addEventListener("error", () => {
        player.hidden = true;
        showStatus("This video could not be loaded. Check the video address and that the file exists.");
    });
 
    startOver.addEventListener("click", () => {
        video.currentTime = 0;
        resumeNote.hidden = true;
    });
 
    document.addEventListener("fullscreenchange", () => {
        const full = Boolean(document.fullscreenElement);
        setIcon(fsBtn, full ? "i-exit-fullscreen" : "i-fullscreen");
        fsBtn.setAttribute("aria-label", full ? "Exit fullscreen" : "Fullscreen");
    });
 
    // Save when the tab is hidden or closed
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") saveProgress(true, true);
    });
    window.addEventListener("pagehide", () => saveProgress(true, true));
 
    // Show controls on movement
    player.addEventListener("mousemove", showControls);
    player.addEventListener("touchstart", showControls, { passive: true });
    player.addEventListener("focusin", showControls);
 
    // Keyboard shortcuts
    document.addEventListener("keydown", (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
 
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;   // let sliders use their own keys
        const onButton = tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
 
        switch (event.key) {
            case " ":
                if (onButton) return;              // Space on a focused button presses that button
                event.preventDefault();
                togglePlay();
                break;
            case "k": case "K":
                togglePlay();
                break;
            case "ArrowLeft":
                event.preventDefault();
                seekBy(-5);
                break;
            case "ArrowRight":
                event.preventDefault();
                seekBy(5);
                break;
            case "j": case "J":
                seekBy(-10);
                break;
            case "l": case "L":
                seekBy(10);
                break;
            case "ArrowUp":
                event.preventDefault();
                changeVolume(0.1);
                break;
            case "ArrowDown":
                event.preventDefault();
                changeVolume(-0.1);
                break;
            case "m": case "M":
                video.muted = !video.muted;
                break;
            case "f": case "F":
                toggleFullscreen();
                break;
            default:
                return;
        }
        showControls();
    });
 
    updatePlayButton();
}
 
// ---------- Start ----------
async function init() {
    if (!movieId || !/^\d+$/.test(movieId)) {
        titleEl.textContent = "No movie selected";
        showStatus("Go back to the home page and pick a movie.");
        return;
    }
 
    detailsLink.href = "movie.html?id=" + encodeURIComponent(movieId);
 
    try {
        const response = await fetch("/api/movies/" + encodeURIComponent(movieId));
 
        if (response.status === 404) {
            titleEl.textContent = "Movie not found";
            showStatus("Sorry, that movie doesn't exist.");
            return;
        }
        if (!response.ok) throw new Error("Server answered with status " + response.status);
 
        const movie = await response.json();
        titleEl.textContent = movie.title;
        document.title = "Watching " + movie.title + " - Lumen";
 
        const videoUrl = safeVideoUrl(movie.video_url);
        if (!videoUrl) {
            showStatus("There is no video for this movie yet.");
            return;
        }
 
        statusEl.hidden = true;
        setupPlayer(videoUrl);
    } catch (error) {
        console.error(error);
        titleEl.textContent = "Something went wrong";
        showStatus("Could not load this movie. Check that the server is running and try again.");
    }
}
 
init();