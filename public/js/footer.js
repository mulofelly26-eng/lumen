// The footer used on every page: links to About, FAQ and Contact, plus the TMDB credit.
// Add <script src="js/footer.js" defer></script> before </body> on each page.
(function () {
    const LINKS = [
        ["About us", "about.html"],
        ["FAQ", "faq.html"],
        ["Contact", "contact.html"],
    ];
 
    const style = document.createElement("style");
    style.textContent = `
        .logo { display: inline-flex; align-items: center; gap: 10px; }
        .logo img { display: block; border-radius: 8px; }
        .site-footer-links { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 16px; }
        .site-footer-links a { color: var(--text); font-weight: 500; transition: color 0.2s; }
        .site-footer-links a:hover { color: var(--accent); }
        .site-footer p { margin: 0 0 6px; font-size: 0.88rem; line-height: 1.5; }
        .site-footer p a { color: var(--accent); }
        .site-footer p a:hover { text-decoration: underline; }
    `;
    document.head.appendChild(style);
 
    // ----- Brand: the logo in the navbar, and the icon in the browser tab -----
    const logoLink = document.querySelector(".logo");
    if (logoLink && !logoLink.querySelector("img")) {
        const mark = document.createElement("img");
        mark.src = "images/logo.svg";
        mark.alt = "";                       // the word next to it already names the site
        mark.width = 34;
        mark.height = 34;
        const word = document.createElement("span");
        word.textContent = "Lumen";
        logoLink.replaceChildren(mark, word);
    }
 
    [
        ["icon", "images/logo.svg", "image/svg+xml"],
        ["apple-touch-icon", "images/apple-touch-icon.png", ""],
    ].forEach(([rel, href, type]) => {
        if (document.querySelector('link[rel="' + rel + '"]')) return;
        const link = document.createElement("link");
        link.rel = rel;
        link.href = href;
        if (type) link.type = type;
        document.head.appendChild(link);
    });
 
    if (!document.querySelector('meta[name="theme-color"]')) {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = "#0e1118";
        document.head.appendChild(meta);
    }
 
    let footer = document.querySelector("footer");
    if (!footer) {
        footer = document.createElement("footer");
        footer.className = "footer";
        document.body.appendChild(footer);
    }
    footer.classList.add("site-footer");
    footer.replaceChildren();
 
    const nav = document.createElement("nav");
    nav.className = "site-footer-links";
    nav.setAttribute("aria-label", "Footer");
    LINKS.forEach(([label, href]) => {
        const a = document.createElement("a");
        a.href = href;
        a.textContent = label;
        nav.appendChild(a);
    });
 
    const credit = document.createElement("p");
    credit.append("This product uses the ");
    const tmdb = document.createElement("a");
    tmdb.href = "https://www.themoviedb.org/";
    tmdb.target = "_blank";
    tmdb.rel = "noopener noreferrer";
    tmdb.textContent = "TMDB";
    credit.append(tmdb, " API but is not endorsed or certified by TMDB.");
 
    const copy = document.createElement("p");
    copy.textContent = "\u00A9 " + new Date().getFullYear() + " Lumen. A learning project by Mulo.";
 
    footer.append(nav, credit, copy);
})();