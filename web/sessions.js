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

  const isWindow = (w) =>
    w && typeof w === 'object' && isName(w.id) && typeof w.name === 'string' && Number.isInteger(w.index) && typeof w.active === 'boolean';

  const isWindowList = (message) =>
    isName(message.session) && Array.isArray(message.windows) && message.windows.every(isWindow);

  const create = () => {
    let current = null;
    let list = [];
    let pending = null;
    const windows = new Map();

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

    const applyWindows = (message) => {
      windows.set(message.session, message.windows.map((w) => ({ ...w })));
      return { type: 'windows', session: message.session };
    };

    return {
      receive(raw) {
        const message = parse(raw);
        if (!message) return null;
        if (message.type === 'sessions' && isSessionList(message)) return applySessions(message);
        if (message.type === 'windows' && isWindowList(message)) return applyWindows(message);
        if (message.type === 'error') return applyError(message);
        return null;
      },
      switchMessage(name) {
        if (name === current || !list.includes(name)) return null;
        pending = name;
        return JSON.stringify({ type: 'switch', session: name });
      },
      windowsMessage(session) {
        return list.includes(session) ? JSON.stringify({ type: 'windows', session }) : null;
      },
      selectMessage(session, windowId) {
        const known = (windows.get(session) ?? []).some((w) => w.id === windowId);
        if (!known || !list.includes(session)) return null;
        if (session !== current) pending = session;
        return JSON.stringify({ type: 'select', session, window: windowId });
      },
      windowsOf: (session) => (windows.has(session) ? windows.get(session).map((w) => ({ ...w })) : null),
      listMessage: () => JSON.stringify({ type: 'list' }),
      forget() {
        current = null;
        list = [];
        pending = null;
        windows.clear();
      },
      state: () => ({ current, sessions: [...list], pending }),
    };
  };

  return { create };
})();

if (typeof module !== 'undefined') module.exports = Sessions;
