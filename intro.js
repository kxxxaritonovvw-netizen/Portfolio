(() => {
  const dock = document.querySelector('.contact-dock');
  const sayHi = dock.querySelector('.say-hi');
  const contacts = dock.querySelector('.contact-options');
  function setContacts(open, restoreFocus = false) {
    dock.classList.toggle('is-open', open);
    sayHi.setAttribute('aria-expanded', String(open));
    contacts.inert = !open;
    sayHi.inert = open;
    if (open) contacts.querySelector('button').focus({ preventScroll: true });
    else if (restoreFocus) sayHi.focus({ preventScroll: true });
  }
  sayHi.addEventListener('click', () => setContacts(true));
  document.addEventListener('click', event => {
    if (!dock.contains(event.target)) setContacts(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dock.classList.contains('is-open')) setContacts(false, true);
  });
  const screen = document.querySelector('.intro-screen');
  const typed = document.querySelector('.intro-typed');
  const letters = Array.from(document.querySelector('.intro-size').textContent);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let phase = 'badge', unavailable = false, touchY = null, timer, count = 0;
  function setPhase(value) { phase = value; document.body.dataset.phase = value; }
  setPhase('badge');
  function type() {
    if (phase !== 'intro' || document.hidden) return;
    count = reducedMotion.matches ? letters.length : Math.min(count + 1, letters.length);
    typed.textContent = letters.slice(0, count).join('');
    if (count < letters.length) timer = setTimeout(type, /[.!:]/.test(letters[count - 1]) ? 180 : 32);
  }
  function reveal() {
    if (phase !== 'leaving') return;
    setPhase('intro'); screen.hidden = false; count = 0; typed.textContent = ''; type();
  }
  function navigate(direction) {
    if (direction > 0 && phase === 'badge') {
      setPhase('leaving');
      document.dispatchEvent(new Event('portfolio:leave-badge'));
      if (unavailable) reveal();
    } else if (direction > 0 && phase === 'intro') {
      dock.inert = false;
      dock.classList.add('is-visible');
    } else if (direction < 0 && phase === 'intro' && !unavailable) {
      setContacts(false);
      dock.inert = true;
      dock.classList.remove('is-visible');
      clearTimeout(timer); setPhase('returning'); screen.hidden = true; typed.textContent = '';
      document.dispatchEvent(new Event('portfolio:return-badge'));
    }
  }
  let lastWheelTime = -Infinity;
  let wheelDistance = 0, wheelConsumed = false;
  window.addEventListener('wheel', event => {
    const now = performance.now();
    const newGesture = now - lastWheelTime > 180;
    lastWheelTime = now;
    if (newGesture) { wheelDistance = 0; wheelConsumed = false; }
    wheelDistance += event.deltaY;
    // A trackpad's inertial tail belongs to the same scroll gesture.
    if (!wheelConsumed && Math.abs(wheelDistance) > 2) {
      wheelConsumed = true;
      navigate(wheelDistance);
    }
  }, { passive: true });
  window.addEventListener('touchstart', event => {
    touchY = event.target.closest('.badge-handle') ? null : event.touches[0]?.clientY;
  }, { passive: true });
  window.addEventListener('touchmove', event => {
    if (touchY == null || !event.touches.length) return;
    const delta = touchY - event.touches[0].clientY;
    if (Math.abs(delta) > 24) { navigate(delta); touchY = null; }
  }, { passive: true });
  window.addEventListener('touchend', () => { touchY = null; }, { passive: true });
  window.addEventListener('touchcancel', () => { touchY = null; }, { passive: true });
  window.addEventListener('keydown', event => {
    if (event.repeat || event.target.closest('button, a, input, textarea, select')) return;
    const direction = ['ArrowUp', 'PageUp'].includes(event.key) || (event.key === ' ' && event.shiftKey) ? -1 :
      ['ArrowDown', 'PageDown', ' '].includes(event.key) ? 1 : 0;
    if (direction) { event.preventDefault(); navigate(direction); }
  });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden && phase === 'intro' && count < letters.length) type();
  });
  document.addEventListener('portfolio:badge-gone', reveal);
  document.addEventListener('portfolio:badge-returned', () => setPhase('badge'));
  document.addEventListener('portfolio:badge-unavailable', () => { unavailable = true; reveal(); });
})();
