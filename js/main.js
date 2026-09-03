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

window.reveal = reveal;
window.navTheme = navTheme;
