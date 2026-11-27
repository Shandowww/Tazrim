// The public Shortcut guide follows Budgit's appearance on this device.
(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    let choice;
    try {
      choice = localStorage.getItem('budgit-react-appearance') ?? localStorage.getItem('monthly-flow-theme');
    } catch {}
    const theme = choice === 'light' || choice === 'dark' ? choice : media.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme === 'dark' ? '#191c26' : '#f8f5f0');
  };
  apply();
  media.addEventListener('change',apply);
  window.addEventListener('storage',apply);
})();
