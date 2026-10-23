// theme.js — bascule clair/sombre (même logique que SideSWU).
// Le thème initial est posé dans <head> avant le rendu ; on suit le système tant que rien n'est choisi.
(() => {
  const KEY = "theme";
  const root = document.documentElement;
  const media = matchMedia("(prefers-color-scheme: light)");
  const saved = () => {
    try {
      const t = localStorage.getItem(KEY);
      return t === "light" || t === "dark" ? t : null;
    } catch {
      return null;
    }
  };
  const apply = (t) => {
    const swap = () => { root.dataset.theme = t; };
    if (document.startViewTransition) document.startViewTransition(swap);
    else swap();
  };

  media.addEventListener("change", () => { if (!saved()) apply(media.matches ? "light" : "dark"); });

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const t = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem(KEY, t); } catch {}
    apply(t);
  });
})();
