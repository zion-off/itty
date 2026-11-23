const BrowserPush = (() => {
  const WORKER_URL = '/sw.js';
  const STANDALONE_QUERY = '(display-mode: standalone)';
  const PERMISSION_DENIED = 'denied';

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  const standalone = () => window.matchMedia(STANDALONE_QUERY).matches || Reflect.get(navigator, 'standalone') === true;

  const dataOf = (subscription: PushSubscription): PushSubscriptionData => {
    const { endpoint, keys } = subscription.toJSON();
    const p256dh = keys?.['p256dh'];
    const auth = keys?.['auth'];
    if (!endpoint || !p256dh || !auth) throw new Error('itty: the push subscription has no endpoint or keys');
    return { endpoint, keys: { p256dh, auth } };
  };

  const serverKeyOf = (subscription: PushSubscription) => {
    const key = subscription.options.applicationServerKey;
    return key ? Base64Url.fromBytes(key) : null;
  };

  const create = (): PushPlatform => {
    let registration: ServiceWorkerRegistration | null = null;

    if (supported()) {
      navigator.serviceWorker.register(WORKER_URL).then(
        (registered) => {
          registration = registered;
          console.info('itty: service worker registered', registered.scope);
        },
        (err: unknown) => console.warn('itty: service worker registration failed', err),
      );
    }

    const ready = async () => registration ?? (await navigator.serviceWorker.ready);

    const current = async () => (await ready()).pushManager.getSubscription();

    return {
      availability() {
        if (!supported()) return standalone() ? PushAvailability.unsupported : PushAvailability.notInstalled;
        return Notification.permission === PERMISSION_DENIED ? PushAvailability.blocked : PushAvailability.ready;
      },
      async existing() {
        const subscription = await current();
        return subscription ? { data: dataOf(subscription), serverKey: serverKeyOf(subscription) } : null;
      },
      subscribe(serverKey) {
        const options = { userVisibleOnly: true, applicationServerKey: Base64Url.toBytes(serverKey) };
        const pending = registration
          ? registration.pushManager.subscribe(options)
          : ready().then((r) => r.pushManager.subscribe(options));
        return pending.then(dataOf);
      },
      async unsubscribe() {
        const subscription = await current();
        if (!subscription) return null;
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        return endpoint;
      },
    };
  };

  return { create };
})();
