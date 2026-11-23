interface WorkerPushData {
  text(): string;
}

interface WorkerExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerPushEvent extends WorkerExtendableEvent {
  data: WorkerPushData | null;
}

interface WorkerNotificationEvent extends WorkerExtendableEvent {
  notification: Notification;
}

interface WorkerWindowClient {
  url: string;
  focus(): Promise<unknown>;
}

interface WorkerClients {
  matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly WorkerWindowClient[]>;
  openWindow(url: string): Promise<unknown>;
}

interface WorkerScope {
  registration: ServiceWorkerRegistration;
  clients: WorkerClients;
  importScripts(...urls: string[]): void;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

interface PushNotificationContent {
  title: string;
  options: NotificationOptions;
}

const ServiceWorkerPush = (() => {
  const DEFAULT_TITLE = 'itty';
  const ICON = '/icons/icon-192.png';
  const APP_URL = '/';
  const DEPENDENCIES = Object.freeze(['/narrow.js']);

  const hasFunction = (value: unknown, name: string) =>
    Narrow.isRecord(value) && typeof value[name] === 'function';

  const isWorkerScope = (value: unknown): value is WorkerScope =>
    typeof value === 'object' &&
    value !== null &&
    'registration' in value &&
    'clients' in value &&
    'importScripts' in value;

  const isExtendable = (event: Event): event is WorkerExtendableEvent => hasFunction(event, 'waitUntil');

  const isPushEvent = (event: Event): event is WorkerPushEvent => isExtendable(event) && 'data' in event;

  const isNotificationEvent = (event: Event): event is WorkerNotificationEvent =>
    isExtendable(event) && 'notification' in event;

  const content = (text: string): PushNotificationContent => {
    const message = Narrow.jsonRecord(text);
    if (!message) return { title: DEFAULT_TITLE, options: { body: text, icon: ICON } };
    const title = typeof message['title'] === 'string' && message['title'] !== '' ? message['title'] : DEFAULT_TITLE;
    const body = typeof message['body'] === 'string' ? message['body'] : '';
    return { title, options: { body, icon: ICON } };
  };

  const focusOrOpen = async (scope: WorkerScope) => {
    const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows[0];
    if (existing) await existing.focus();
    else await scope.clients.openWindow(APP_URL);
  };

  const install = (scope: WorkerScope) => {
    scope.addEventListener('push', (event) => {
      if (!isPushEvent(event)) return;
      const { title, options } = content(event.data ? event.data.text() : '');
      event.waitUntil(scope.registration.showNotification(title, options));
    });
    scope.addEventListener('notificationclick', (event) => {
      if (!isNotificationEvent(event)) return;
      event.notification.close();
      event.waitUntil(focusOrOpen(scope));
    });
  };

  const scope: unknown = globalThis;
  if (isWorkerScope(scope)) {
    scope.importScripts(...DEPENDENCIES);
    install(scope);
  }

  return { content };
})();

if (typeof module !== 'undefined') module.exports = ServiceWorkerPush;
