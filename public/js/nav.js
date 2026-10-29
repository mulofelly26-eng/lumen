// Navbar account button.
// Logged out: the normal "Log in" button stays.
// Logged in:  it becomes a round avatar with the first letter of the username,
//             and clicking it opens a small menu with a "Log out" button.
// Add <script src="js/nav.js" defer></script> to every page that has the navbar.
(async function () {
    const loginLink = document.querySelector(".btn-login");
    if (!loginLink) return;
 
    let user = null;
    try {
        const response = await fetch("/api/auth/me");
        if (response.ok) user = (await response.json()).user;
    } catch {
        return;                                   // server not reachable: leave the button alone
    }
    if (!user) return;                            // not logged in: keep "Log in"
 
    // The styles live here, so no extra CSS file is needed
    const style = document.createElement("style");
    style.textContent = `
        .profile { position: relative; }
        .profile-btn {
            display: grid; place-items: center;
            width: 40px; height: 40px; padding: 0;
            background: var(--accent); color: #1a1305;
            border: 2px solid transparent; border-radius: 50%;
            font: inherit; font-weight: 800; font-size: 1.05rem; cursor: pointer;
            transition: border-color 0.2s, transform 0.2s;
        }
        .profile-btn:hover, .profile-btn[aria-expanded="true"] { border-color: var(--text); transform: scale(1.05); }
        .profile-menu {
            position: absolute; right: 0; top: calc(100% + 10px); z-index: 200;
            min-width: 210px; padding: 8px;
            background: var(--surface); border: 1px solid #2a3144; border-radius: 10px;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
        }
        .profile-menu[hidden] { display: none; }
        .profile-name { padding: 8px 10px 10px; margin: 0 0 6px; border-bottom: 1px solid #2a3144; font-size: 0.9rem; color: var(--muted); }
        .profile-name strong { display: block; color: var(--text); font-size: 1rem; overflow: hidden; text-overflow: ellipsis; }
        .profile-logout {
            width: 100%; padding: 9px 10px; text-align: left;
            background: transparent; color: var(--text); border: 0; border-radius: 6px;
            font: inherit; cursor: pointer; transition: background 0.2s;
        }
        .profile-logout:hover { background: var(--surface-2); }
        @media (max-width: 720px) { .profile { margin-left: auto; } }
    `;
    document.head.appendChild(style);
 
    // Build: [ A ]  ->  menu
    const wrapper = document.createElement("div");
    wrapper.className = "profile";
 
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile-btn";
    button.textContent = Array.from(user.username)[0].toUpperCase();
    button.setAttribute("aria-label", "Account menu for " + user.username);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
 
    const menu = document.createElement("div");
    menu.className = "profile-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
 
    const name = document.createElement("p");
    name.className = "profile-name";
    name.append("Signed in as");
    const strong = document.createElement("strong");
    strong.textContent = user.username;          // textContent keeps odd names from breaking the page
    name.appendChild(strong);
 
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "profile-logout";
    logout.setAttribute("role", "menuitem");
    logout.textContent = "Log out";
 
    menu.append(name, logout);
    wrapper.append(button, menu);
    loginLink.replaceWith(wrapper);
 
    function setOpen(open) {
        menu.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
    }
 
    button.addEventListener("click", () => setOpen(menu.hidden));
 
    document.addEventListener("click", (event) => {
        if (!wrapper.contains(event.target)) setOpen(false);
    });
 
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !menu.hidden) {
            setOpen(false);
            button.focus();
        }
    });
 
    logout.addEventListener("click", async () => {
        logout.disabled = true;
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            window.location.reload();
        }
    });
})();