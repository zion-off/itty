import test from 'node:test';
import assert from 'node:assert';

interface FakePlatform extends PushPlatform {
  setAvailability(next: PushAvailabilityName): void;
  setExisting(next: ExistingPushSubscription | null): void;
  failSubscribe(error: Error | null): void;
  subscribeCalls: string[];
  unsubscribeCalls: number;
}

const DATA: PushSubscriptionData = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };

const fakePlatform = (): FakePlatform => {
  let availability: PushAvailabilityName = 'ready';
  let existing: ExistingPushSubscription | null = null;
  let subscribeError: Error | null = null;
  const platform: FakePlatform = {
    subscribeCalls: [],
    unsubscribeCalls: 0,
    availability: () => availability,
    existing: () => Promise.resolve(existing),
    subscribe(serverKey) {
      platform.subscribeCalls.push(serverKey);
      if (subscribeError) return Promise.reject(subscribeError);
      existing = { data: DATA, serverKey };
      return Promise.resolve(DATA);
    },
    unsubscribe() {
      platform.unsubscribeCalls++;
      const endpoint = existing ? existing.data.endpoint : null;
      existing = null;
      return Promise.resolve(endpoint);
    },
    setAvailability: (next) => (availability = next),
    setExisting: (next) => (existing = next),
    failSubscribe: (error) => (subscribeError = error),
  };
  return platform;
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

const setup = () => {
  const platform = fakePlatform();
  const sent: unknown[] = [];
  let changes = 0;
  const notifications = Notifications.create({
    platform,
    send: (message) => sent.push(JSON.parse(message)),
    onChange: () => changes++,
  });
  return { platform, sent, notifications, changes: () => changes };
};

const keyMessage = (key: string) => JSON.stringify({ type: 'push_key', key });
const stateMessage = (subscribed: boolean, error?: string) => JSON.stringify({ type: 'push', subscribed, error });

test('connecting asks the server for its public key', () => {
  const { notifications, sent } = setup();
  notifications.connected();
  assert.deepStrictEqual(sent, [{ type: 'push_key' }]);
});

test('outside the home screen app the switch is disabled with a hint and nothing is sent', () => {
  const { notifications, platform, sent } = setup();
  platform.setAvailability('not-installed');
  notifications.connected();
  assert.deepStrictEqual(sent, []);
  assert.deepStrictEqual(notifications.state(), {
    checked: false,
    enabled: false,
    busy: false,
    note: Notifications.Text.notInstalled,
  });
});

test('blocked permission shows the switch off with the settings hint', () => {
  const { notifications, platform } = setup();
  platform.setAvailability('blocked');
  assert.strictEqual(notifications.state().enabled, false);
  assert.strictEqual(notifications.state().note, Notifications.Text.blocked);
});

test('the switch stays disabled until the key arrives, then shows off when there is no subscription', async () => {
  const { notifications } = setup();
  assert.strictEqual(notifications.state().enabled, false);
  assert.strictEqual(notifications.receive(keyMessage('K1')), true);
  await settle();
  assert.deepStrictEqual(notifications.state(), { checked: false, enabled: true, busy: false, note: '' });
});

test('an existing subscription for the same key is sent again to refresh the server', async () => {
  const { notifications, platform, sent } = setup();
  platform.setExisting({ data: DATA, serverKey: 'K1' });
  notifications.receive(keyMessage('K1'));
  await settle();
  assert.deepStrictEqual(sent, [{ type: 'push_subscribe', subscription: DATA }]);
  assert.strictEqual(notifications.state().busy, true);
  notifications.receive(stateMessage(true));
  assert.deepStrictEqual(notifications.state(), { checked: true, enabled: true, busy: false, note: '' });
});

test('a subscription made for an old server key is removed', async () => {
  const { notifications, platform, sent } = setup();
  platform.setExisting({ data: DATA, serverKey: 'OLD' });
  notifications.receive(keyMessage('K1'));
  await settle();
  assert.strictEqual(platform.unsubscribeCalls, 1);
  assert.deepStrictEqual(sent, [{ type: 'push_unsubscribe', endpoint: DATA.endpoint }]);
});

test('turning on subscribes synchronously with the server key and sends the subscription', async () => {
  const { notifications, platform, sent } = setup();
  notifications.receive(keyMessage('K1'));
  await settle();
  notifications.toggle();
  assert.deepStrictEqual(platform.subscribeCalls, ['K1']);
  assert.deepStrictEqual(notifications.state(), { checked: true, enabled: false, busy: true, note: '' });
  await settle();
  assert.deepStrictEqual(sent, [{ type: 'push_subscribe', subscription: DATA }]);
  notifications.receive(stateMessage(true));
  assert.strictEqual(notifications.state().checked, true);
});

test('declining the permission prompt leaves the switch off with the blocked hint', async () => {
  const { notifications, platform } = setup();
  notifications.receive(keyMessage('K1'));
  await settle();
  platform.failSubscribe(new Error('NotAllowedError'));
  notifications.toggle();
  platform.setAvailability('blocked');
  await settle();
  assert.deepStrictEqual(notifications.state(), {
    checked: false,
    enabled: false,
    busy: false,
    note: Notifications.Text.blocked,
  });
});

test('a failed subscription shows an error and allows another try', async () => {
  const { notifications, platform } = setup();
  notifications.receive(keyMessage('K1'));
  await settle();
  platform.failSubscribe(new Error('network'));
  notifications.toggle();
  assert.strictEqual(notifications.state().checked, true, 'the knob moves before the result is known');
  await settle();
  assert.deepStrictEqual(notifications.state(), {
    checked: false,
    enabled: true,
    busy: false,
    note: Notifications.Text.turnOnFailed,
  });
});

test('a server rejection is shown as the server wrote it', () => {
  const { notifications } = setup();
  notifications.receive(keyMessage('K1'));
  notifications.receive(stateMessage(false, 'could not turn on notifications'));
  assert.strictEqual(notifications.state().note, 'could not turn on notifications');
});

test('every message on screen is lowercase', () => {
  for (const text of Object.values(Notifications.Text)) assert.strictEqual(text, text.toLowerCase());
});

test('turning off removes the device subscription first and then tells the server', async () => {
  const { notifications, platform, sent } = setup();
  platform.setExisting({ data: DATA, serverKey: 'K1' });
  notifications.receive(keyMessage('K1'));
  await settle();
  notifications.receive(stateMessage(true));
  sent.length = 0;
  notifications.toggle();
  assert.strictEqual(notifications.state().checked, false, 'the knob moves before the result is known');
  await settle();
  assert.strictEqual(platform.unsubscribeCalls, 1);
  assert.deepStrictEqual(sent, [{ type: 'push_unsubscribe', endpoint: DATA.endpoint }]);
  notifications.receive(stateMessage(false));
  assert.strictEqual(notifications.state().checked, false);
});

test('toggling does nothing while disabled', () => {
  const { notifications, platform, sent } = setup();
  notifications.toggle();
  assert.deepStrictEqual(platform.subscribeCalls, []);
  assert.deepStrictEqual(sent, []);
});

test('other control messages are left for the session handler', () => {
  const { notifications } = setup();
  for (const raw of [JSON.stringify({ type: 'sessions', current: 'a', sessions: ['a'] }), 'nope', undefined, keyMessage('')]) {
    assert.strictEqual(notifications.receive(raw), false);
  }
});

test('reset forgets the key and the state', async () => {
  const { notifications } = setup();
  notifications.receive(keyMessage('K1'));
  notifications.receive(stateMessage(true));
  notifications.reset();
  await settle();
  assert.deepStrictEqual(notifications.state(), { checked: false, enabled: false, busy: false, note: '' });
});

test('the service worker reads the title and body from the payload', () => {
  assert.deepStrictEqual(ServiceWorkerPush.content(JSON.stringify({ title: 'deploy', body: 'done' })), {
    title: 'deploy',
    options: { body: 'done', icon: '/icons/icon-192.png' },
  });
  assert.deepStrictEqual(ServiceWorkerPush.content('plain text'), {
    title: 'itty',
    options: { body: 'plain text', icon: '/icons/icon-192.png' },
  });
  assert.strictEqual(ServiceWorkerPush.content(JSON.stringify({ title: '', body: 'x' })).title, 'itty');
});

test('base64url round-trips bytes without padding', () => {
  const bytes = Uint8Array.from([251, 255, 0, 1, 2]);
  const encoded = Base64Url.fromBytes(bytes.buffer);
  assert.strictEqual(encoded, '-_8AAQI');
  assert.deepStrictEqual([...Base64Url.toBytes(encoded)], [...bytes]);
});
