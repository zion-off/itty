const PushControl = Object.freeze({
    key: 'push_key',
    state: 'push',
    subscribe: 'push_subscribe',
    unsubscribe: 'push_unsubscribe',
});
const PushAvailability = Object.freeze({
    ready: 'ready',
    blocked: 'blocked',
    notInstalled: 'not-installed',
    unsupported: 'unsupported',
});
const Notifications = (() => {
    const Text = Object.freeze({
        notInstalled: 'add itty to your home screen to turn these on',
        unsupported: 'this browser does not support notifications',
        blocked: 'blocked in ios settings › notifications › itty',
        turnOnFailed: 'could not turn on notifications',
        turnOffFailed: 'could not turn off notifications',
    });
    const create = ({ platform, send, onChange }) => {
        let key = null;
        let subscribed = false;
        let busy = false;
        let target = null;
        let error = '';
        const settle = (next) => {
            if (next.subscribed !== undefined)
                subscribed = next.subscribed;
            error = next.error ?? '';
            busy = false;
            target = null;
            onChange();
        };
        const sendSubscribe = (data) => send(JSON.stringify({ type: PushControl.subscribe, subscription: data }));
        const sendUnsubscribe = (endpoint) => send(JSON.stringify({ type: PushControl.unsubscribe, endpoint }));
        const sync = async (serverKey) => {
            if (platform.availability() !== PushAvailability.ready) {
                onChange();
                return;
            }
            busy = true;
            onChange();
            try {
                const existing = await platform.existing();
                if (!existing) {
                    console.info('itty: notifications are off on this device');
                    settle({ subscribed: false });
                }
                else if (existing.serverKey !== serverKey) {
                    console.warn('itty: the push subscription belongs to an old server key, removing it');
                    const endpoint = await platform.unsubscribe();
                    if (endpoint)
                        sendUnsubscribe(endpoint);
                    else
                        settle({ subscribed: false });
                }
                else {
                    console.info('itty: refreshing the push subscription');
                    sendSubscribe(existing.data);
                }
            }
            catch (err) {
                console.warn('itty: reading the push subscription failed', err);
                settle({ subscribed: false });
            }
        };
        const turnOn = (serverKey) => {
            const pending = platform.subscribe(serverKey);
            busy = true;
            target = true;
            error = '';
            onChange();
            pending.then((data) => {
                console.info('itty: push subscription created');
                sendSubscribe(data);
            }, (err) => {
                const blocked = platform.availability() === PushAvailability.blocked;
                console.warn('itty: push subscription failed', blocked ? 'permission denied' : err);
                settle({ subscribed: false, error: blocked ? '' : Text.turnOnFailed });
            });
        };
        const turnOff = () => {
            busy = true;
            target = false;
            error = '';
            onChange();
            platform.unsubscribe().then((endpoint) => {
                console.info('itty: push subscription removed from this device');
                if (endpoint)
                    sendUnsubscribe(endpoint);
                else
                    settle({ subscribed: false });
            }, (err) => {
                console.warn('itty: removing the push subscription failed', err);
                settle({ error: Text.turnOffFailed });
            });
        };
        const state = () => {
            switch (platform.availability()) {
                case PushAvailability.notInstalled:
                    return { checked: false, enabled: false, busy: false, note: Text.notInstalled };
                case PushAvailability.unsupported:
                    return { checked: false, enabled: false, busy: false, note: Text.unsupported };
                case PushAvailability.blocked:
                    return { checked: false, enabled: false, busy: false, note: Text.blocked };
                case PushAvailability.ready:
                    return { checked: target ?? subscribed, enabled: key !== null && !busy, busy, note: error };
            }
        };
        return {
            connected() {
                const availability = platform.availability();
                if (availability === PushAvailability.notInstalled || availability === PushAvailability.unsupported)
                    return;
                send(JSON.stringify({ type: PushControl.key }));
            },
            receive(raw) {
                const message = Narrow.jsonRecord(raw);
                if (!message)
                    return false;
                if (message['type'] === PushControl.key && typeof message['key'] === 'string' && message['key'] !== '') {
                    key = message['key'];
                    void sync(key);
                    return true;
                }
                if (message['type'] === PushControl.state && typeof message['subscribed'] === 'boolean') {
                    const serverError = typeof message['error'] === 'string' ? message['error'] : '';
                    console.info('itty: notifications', message['subscribed'] ? 'on' : 'off', serverError);
                    settle({ subscribed: message['subscribed'], error: serverError });
                    return true;
                }
                return false;
            },
            toggle() {
                const current = state();
                if (!current.enabled || key === null)
                    return;
                if (current.checked)
                    turnOff();
                else
                    turnOn(key);
            },
            reset() {
                key = null;
                subscribed = false;
                busy = false;
                target = null;
                error = '';
            },
            state,
        };
    };
    return { create, Text };
})();
if (typeof module !== 'undefined')
    module.exports = Notifications;
