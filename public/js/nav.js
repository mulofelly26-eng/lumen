// Shows "username | Log out" in the navbar when someone is logged in.
// Add <script src="js/nav.js" defer></script> to each page that has the navbar.
(async function () {
    const link = document.querySelector(".btn-login");
    if (!link) return;

    try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) return;                      // not logged in: keep the "Log in" button
        const { user } = await response.json();

        link.textContent = user.username + "  |  Log out";
        link.href = "#";
        link.addEventListener("click", async (event) => {
            event.preventDefault();
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.reload();
        });
    } catch {
        /* server not reachable: leave the button as it is */
    }
})();
