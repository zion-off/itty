(() => {
  const button = document.getElementById('enroll');
  const status = document.getElementById('status');
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);

  function showStatus(message, outcome) {
    status.textContent = message;
    status.dataset.outcome = outcome || '';
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    showStatus('');
    try {
      await Passkey.enroll(token);
      showStatus('Passkey registered. You can close this page.', 'success');
    } catch (err) {
      showStatus(`Enrollment failed: ${err.message}`, 'error');
      button.disabled = false;
    }
  });
})();
