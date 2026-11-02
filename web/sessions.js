const Sessions = (() => {
  const parse = (raw) => {
    if (typeof raw !== 'string') return null;
    try {
      const message = JSON.parse(raw);
      return message && typeof message === 'object' ? message : null;
    } catch (err) {
      return null;
    }
  };

  const isName = (value) => typeof value === 'string' && value !== '';

  const isSessionList = (message) =>
    isName(message.current) &&
    Array.isArray(message.sessions) &&
    message.sessions.every(isName) &&
    message.sessions.includes(message.current);

  const create = () => {
    let current = null;
    let list = [];
    let pending = null;

    const applySessions = (message) => {
      const reset = message.current !== current;
      current = message.current;
      list = [...message.sessions];
      pending = null;
      return { type: 'sessions', reset };
    };

    const applyError = (message) => {
      pending = null;
      return { type: 'error', message: typeof message.message === 'string' ? message.message : 'request failed' };
    };

    return {
      receive(raw) {
        const message = parse(raw);
        if (!message) return null;
        if (message.type === 'sessions' && isSessionList(message)) return applySessions(message);
        if (message.type === 'error') return applyError(message);
        return null;
      },
      switchMessage(name) {
        if (name === current || !list.includes(name)) return null;
        pending = name;
        return JSON.stringify({ type: 'switch', session: name });
      },
      listMessage: () => JSON.stringify({ type: 'list' }),
      forget() {
        current = null;
        list = [];
        pending = null;
      },
      state: () => ({ current, sessions: [...list], pending }),
    };
  };

  return { create };
})();

if (typeof module !== 'undefined') module.exports = Sessions;
