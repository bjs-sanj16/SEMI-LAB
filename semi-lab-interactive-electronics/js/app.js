/* Semi Lab – Shared Application Logic */
document.addEventListener('DOMContentLoaded', function () {

  /* ---- Active nav link ---- */
  var page = location.pathname.split('/').pop() || 'index.html';
  if (page === '') page = 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    if (link.getAttribute('href') === page) link.classList.add('active');
  });

  /* ---- Mobile hamburger ---- */
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    /* Close menu when a link is clicked */
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); });
    });
  }

  /* ---- Navbar scroll shadow ---- */
  var navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  /* ---- Scroll-in animations ---- */
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.animate-on-scroll').forEach(function (el) { obs.observe(el); });
  } else {
    document.querySelectorAll('.animate-on-scroll').forEach(function (el) { el.classList.add('visible'); });
  }
});

/* ---- CSS variable helper (used by chart pages) ---- */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
