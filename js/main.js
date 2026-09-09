// reveals au scroll — reveal(root) ré-observe les éléments injectés par content.js
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
function reveal(root = document){
  root.querySelectorAll('.sr:not(.in)').forEach(el => io.observe(el));
}
reveal();

// nav : thème selon la section (claire/sombre) + logo masqué sur l'affiche hero (accueil uniquement)
const nav = document.querySelector('nav');
const hero = document.querySelector('.hero');
const lightSections = [...document.querySelectorAll('.hero, .gallery, .light')];
function navTheme(){
  const y = scrollY + 40;
  const onLight = lightSections.some(s => y >= s.offsetTop && y < s.offsetTop + s.offsetHeight);
  nav.classList.toggle('on-light', onLight);
  nav.classList.toggle('hide-logo', !!hero && scrollY < innerHeight * .7);
}
addEventListener('scroll', navTheme, { passive: true });
navTheme();

// formulaire de contact : envoi vers Netlify Forms sans rechargement, message de confirmation inline
const form = document.querySelector('.contact-form');
if (form) {
  const status = form.querySelector('.cf-status'); const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    button.disabled = true; status.classList.remove('is-error'); status.textContent = 'Envoi en cours…';
    try {
      const response = await fetch(form.getAttribute('action') || '/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString()
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      form.reset(); form.classList.add('is-sent'); status.textContent = 'Bien reçu — je te réponds sous 24h.';
    } catch {
      status.classList.add('is-error'); status.textContent = "L'envoi a échoué. Écris-moi directement : ";
      const mail = document.createElement('a'); mail.href = 'mailto:tom.fj.carvalho@gmail.com'; mail.textContent = 'tom.fj.carvalho@gmail.com'; status.append(mail);
    } finally { button.disabled = false; }
  });
}

window.reveal = reveal;
window.navTheme = navTheme;
