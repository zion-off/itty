package server

import (
	"errors"

	"github.com/zion/itty/internal/push"
)

const (
	pushUnavailableMessage = "notifications are not available"
	pushInvalidMessage     = "the notification subscription is invalid"
	pushSaveFailedMessage  = "could not turn on notifications"
)

func (c *connection) sendPushKey() {
	key, err := c.srv.Push.PublicKey()
	if err != nil {
		c.log.Error("loading the push public key failed", "error", err)
		c.sendPushState(false, pushUnavailableMessage)
		return
	}
	c.log.Debug("push public key sent")
	c.writeControl(map[string]string{"type": "push_key", "key": key})
}

func (c *connection) subscribePush(sub *push.Subscription) {
	if sub == nil {
		c.log.Warn("push subscription rejected", "reason", "missing subscription")
		c.sendPushState(false, pushInvalidMessage)
		return
	}
	err := c.srv.Push.Subscribe(*sub)
	switch {
	case errors.Is(err, push.ErrInvalidSubscription):
		c.log.Warn("push subscription rejected", "reason", err.Error(), "push_host", sub.Host())
		c.sendPushState(false, pushInvalidMessage)
	case err != nil:
		c.log.Error("saving the push subscription failed", "subscription", sub.ID(), "error", err)
		c.sendPushState(false, pushSaveFailedMessage)
	default:
		c.log.Info("push subscription accepted", "subscription", sub.ID(), "push_host", sub.Host())
		c.sendPushState(true, "")
	}
}

func (c *connection) unsubscribePush(endpoint string) {
	id := push.Subscription{Endpoint: endpoint}.ID()
	if err := c.srv.Push.Unsubscribe(endpoint); err != nil {
		c.log.Error("removing the push subscription failed; the push service will reject it on the next send", "subscription", id, "error", err)
	} else {
		c.log.Info("push subscription withdrawn", "subscription", id)
	}
	c.sendPushState(false, "")
}

func (c *connection) sendPushState(subscribed bool, errMessage string) {
	msg := map[string]any{"type": "push", "subscribed": subscribed}
	if errMessage != "" {
		msg["error"] = errMessage
	}
	c.writeControl(msg)
}

func (c *connection) writeControl(v any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.writeJSONLocked(v); err != nil {
		c.log.Warn("sending control message failed", "error", err)
	}
}
