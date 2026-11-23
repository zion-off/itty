const ControlType = Object.freeze({
    sessions: 'sessions',
    windows: 'windows',
    error: 'error',
    switch: 'switch',
    select: 'select',
    newWindow: 'new_window',
    closeWindow: 'close_window',
    list: 'list',
    resize: 'resize',
});
const Sessions = (() => {
    const GENERIC_ERROR = 'request failed';
    const isName = (value) => typeof value === 'string' && value !== '';
    const isNameList = (value) => Array.isArray(value) && value.every(isName);
    const isSessionList = (message) => isName(message['current']) &&
        isNameList(message['sessions']) &&
        message['sessions'].includes(message['current']);
    const isWindow = (w) => Narrow.isRecord(w) &&
        isName(w['id']) &&
        typeof w['name'] === 'string' &&
        Number.isInteger(w['index']) &&
        typeof w['active'] === 'boolean';
    const isWindowList = (message) => isName(message['session']) && Array.isArray(message['windows']) && message['windows'].every(isWindow);
    const create = () => {
        let current = null;
        let list = [];
        let pending = null;
        const windows = new Map();
        const copyWindows = (stored) => stored.map((w) => ({ ...w }));
        const applySessions = (message) => {
            const reset = message.current !== current;
            current = message.current;
            list = [...message.sessions];
            pending = null;
            return { type: ControlType.sessions, reset };
        };
        const applyError = (message) => {
            pending = null;
            return {
                type: ControlType.error,
                message: typeof message['message'] === 'string' ? message['message'] : GENERIC_ERROR,
            };
        };
        const applyWindows = (message) => {
            windows.set(message.session, copyWindows(message.windows));
            return { type: ControlType.windows, session: message.session };
        };
        const hasWindow = (session, windowId) => (windows.get(session) ?? []).some((w) => w.id === windowId);
        return {
            receive(raw) {
                const message = Narrow.jsonRecord(raw);
                if (!message)
                    return null;
                if (message['type'] === ControlType.sessions && isSessionList(message))
                    return applySessions(message);
                if (message['type'] === ControlType.windows && isWindowList(message))
                    return applyWindows(message);
                if (message['type'] === ControlType.error)
                    return applyError(message);
                return null;
            },
            switchMessage(name) {
                if (name === current || !list.includes(name))
                    return null;
                pending = name;
                return JSON.stringify({ type: ControlType.switch, session: name });
            },
            windowsMessage(session) {
                return list.includes(session) ? JSON.stringify({ type: ControlType.windows, session }) : null;
            },
            selectMessage(session, windowId) {
                if (!hasWindow(session, windowId) || !list.includes(session))
                    return null;
                if (session !== current)
                    pending = session;
                return JSON.stringify({ type: ControlType.select, session, window: windowId });
            },
            newWindowMessage(session) {
                if (!list.includes(session))
                    return null;
                if (session !== current)
                    pending = session;
                return JSON.stringify({ type: ControlType.newWindow, session });
            },
            closeWindowMessage(session, windowId) {
                if (!hasWindow(session, windowId) || !list.includes(session))
                    return null;
                return JSON.stringify({ type: ControlType.closeWindow, session, window: windowId });
            },
            windowsOf(session) {
                const stored = windows.get(session);
                return stored ? copyWindows(stored) : null;
            },
            listMessage: () => JSON.stringify({ type: ControlType.list }),
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
if (typeof module !== 'undefined')
    module.exports = Sessions;
