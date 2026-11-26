const installButton = document.querySelector('#install-app');
const installGuide = document.querySelector('.install-guide');
let installPrompt;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', () => {
  const prompt = installPrompt;
  installPrompt = undefined;
  installButton.hidden = true;
  prompt?.prompt().catch(() => {
    installGuide.open = true;
  });
});

window.addEventListener('appinstalled', () => {
  installGuide.hidden = true;
});
