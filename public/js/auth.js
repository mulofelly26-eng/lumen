const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");

// Where to go after logging in: only pages of this site (login.html?next=movie.html?id=5)
function nextPage() {
    const next = new URLSearchParams(window.location.search).get("next") || "";
    return /^[a-z0-9_-]+\.html(\?[\w=&%-]*)?$/i.test(next) ? next : "index.html";
}

function showTab(which) {
    const isLogin = which === "login";
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    tabLogin.classList.toggle("active", isLogin);
    tabRegister.classList.toggle("active", !isLogin);
}

tabLogin.addEventListener("click", () => showTab("login"));
tabRegister.addEventListener("click", () => showTab("register"));

async function send(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
}

function handle(form, url, buildBody, check) {
    const errorEl = form.querySelector(".form-error");
    const button = form.querySelector("button[type=submit]");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorEl.textContent = "";

        const values = Object.fromEntries(new FormData(form));
        const problem = check ? check(values) : null;
        if (problem) {
            errorEl.textContent = problem;
            return;
        }

        button.disabled = true;
        try {
            await send(url, buildBody(values));
            window.location.href = nextPage();
        } catch (error) {
            errorEl.textContent = error.message;
            button.disabled = false;
        }
    });
}

handle(loginForm, "/api/auth/login", (v) => ({ email: v.email, password: v.password }));

handle(
    registerForm,
    "/api/auth/register",
    (v) => ({ username: v.username, email: v.email, password: v.password }),
    (v) => {
        if (v.password.length < 8) return "Password must be at least 8 characters.";
        if (v.password !== v.confirm) return "The two passwords don't match.";
        return null;
    }
);

if (window.location.hash === "#register") showTab("register");
