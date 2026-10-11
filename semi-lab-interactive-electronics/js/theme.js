/* Semi Lab – Theme Switcher */
(function () {
  var saved = localStorage.getItem('semilab-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('.theme-btn');
    var current = localStorage.getItem('semilab-theme') || 'light';

    buttons.forEach(function (btn) {
      if (btn.dataset.theme === current) btn.classList.add('active');
      btn.addEventListener('click', function () {
        var theme = btn.dataset.theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('semilab-theme', theme);
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        /* Dispatch a custom event so chart colours can update */
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }));
      });
    });
  });
})();
