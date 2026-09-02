// reveals au scroll
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.sr').forEach(el => io.observe(el));

// nav : thème selon la section (claire/sombre) + logo masqué sur l'affiche hero
const nav = document.querySelector('nav');
const lightSections = [document.querySelector('.hero'), document.querySelector('.gallery')];
function navTheme(){
  const y = scrollY + 40;
  const onLight = lightSections.some(s => y >= s.offsetTop && y < s.offsetTop + s.offsetHeight);
  nav.classList.toggle('on-light', onLight);
  nav.classList.toggle('hide-logo', scrollY < innerHeight * .7);
}
addEventListener('scroll', navTheme, { passive: true });
navTheme();
