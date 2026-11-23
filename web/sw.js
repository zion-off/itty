const ServiceWorkerPush = (() => {
    const DEFAULT_TITLE = 'itty';
    const ICON = '/icons/icon-192.png';
    const APP_URL = '/';
    const DEPENDENCIES = Object.freeze(['/narrow.js']);
    const hasFunction = (value, name) => Narrow.isRecord(value) && typeof value[name] === 'function';
    const isWorkerScope = (value) => typeof value === 'object' &&
        value !== null &&
        'registration' in value &&
        'clients' in value &&
        'importScripts' in value;
    const isExtendable = (event) => hasFunction(event, 'waitUntil');
    const isPushEvent = (event) => isExtendable(event) && 'data' in event;
    const isNotificationEvent = (event) => isExtendable(event) && 'notification' in event;
    const content = (text) => {
        const message = Narrow.jsonRecord(text);
        if (!message)
            return { title: DEFAULT_TITLE, options: { body: text, icon: ICON } };
        const title = typeof message['title'] === 'string' && message['title'] !== '' ? message['title'] : DEFAULT_TITLE;
        const body = typeof message['body'] === 'string' ? message['body'] : '';
        return { title, options: { body, icon: ICON } };
    };
    const focusOrOpen = async (scope) => {
        const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = windows[0];
        if (existing)
            await existing.focus();
        else
            await scope.clients.openWindow(APP_URL);
    };
    const install = (scope) => {
        scope.addEventListener('push', (event) => {
            if (!isPushEvent(event))
                return;
            const { title, options } = content(event.data ? event.data.text() : '');
            event.waitUntil(scope.registration.showNotification(title, options));
        });
        scope.addEventListener('notificationclick', (event) => {
            if (!isNotificationEvent(event))
                return;
            event.notification.close();
            event.waitUntil(focusOrOpen(scope));
        });
    };
    const scope = globalThis;
    if (isWorkerScope(scope)) {
        scope.importScripts(...DEPENDENCIES);
        install(scope);
    }
    return { content };
})();
if (typeof module !== 'undefined')
    module.exports = ServiceWorkerPush;
