(() => {
  const ENROLL_PRESSED_SCALE = 0.97;
  const Id = Object.freeze({ enroll: 'enroll', status: 'status' });

  const button = Dom.byId(Id.enroll, HTMLButtonElement);
  const status = StatusLine.create(Dom.byId(Id.status, HTMLElement));
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  Press.attach(button, { scale: ENROLL_PRESSED_SCALE });

  const register = async () => {
    button.disabled = true;
    status.show('Waiting for your passkey…', StatusTone.pending);
    try {
      await Passkey.enroll(token);
      status.show('Passkey registered. You can close this page.', StatusTone.success);
    } catch (err) {
      console.warn('itty: enrollment failed', err);
      status.show(`Enrollment failed: ${Narrow.errorMessage(err)}`, StatusTone.error);
      button.disabled = false;
    }
  };

  button.addEventListener(Dom.event.click, () => void register());
})();
