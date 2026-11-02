(() => {
  const button = document.getElementById('enroll');
  const status = StatusLine.create(document.getElementById('status'));
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  Press.attach(button, { scale: 0.97 });

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.show('Waiting for your passkey…', 'pending');
    try {
      await Passkey.enroll(token);
      status.show('Passkey registered. You can close this page.', 'success');
    } catch (err) {
      console.warn('itty: enrollment failed', err);
      status.show(`Enrollment failed: ${err.message}`, 'error');
      button.disabled = false;
    }
  });
})();
