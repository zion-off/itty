(() => {
  const status = document.getElementById('status');
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);

  document.getElementById('enroll').addEventListener('click', async () => {
    status.textContent = '';
    try {
      await Passkey.enroll(token);
      status.textContent = 'Passkey registered. You can close this page.';
    } catch (err) {
      status.textContent = `Enrollment failed: ${err.message}`;
    }
  });
})();
