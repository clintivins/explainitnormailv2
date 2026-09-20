(() => {
  const film = document.getElementById('brand-film');
  const replay = document.getElementById('film-replay');
  if (!film || !replay) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let started = false;
  let automatic = false;
  film.addEventListener('play', () => { started = true; });
  film.addEventListener('pointerdown', () => { automatic = false; });
  film.addEventListener('keydown', () => { automatic = false; });
  film.addEventListener('volumechange', () => { if (!film.muted) automatic = false; });
  replay.addEventListener('click', () => {
    automatic = false;
    film.currentTime = 0;
    film.play().catch(() => { film.focus(); });
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries[0].intersectionRatio >= 0.6;
      if (visible && !started && !reducedMotion.matches) {
        automatic = true;
        film.muted = true;
        film.play().catch(() => { automatic = false; });
      } else if (!visible && automatic && !film.paused) {
        film.pause();
        automatic = false;
      }
    }, { threshold: [0, 0.6] });
    observer.observe(film);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) film.pause();
  });
})();
