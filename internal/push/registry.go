package push

type Registry struct {
	keys KeyStore
	subs SubscriptionStore
}

func NewRegistry(keys KeyStore, subs SubscriptionStore) *Registry {
	return &Registry{keys: keys, subs: subs}
}

func (r *Registry) PublicKey() (string, error) {
	keys, err := r.keys.LoadOrCreate()
	if err != nil {
		return "", err
	}
	return keys.Public, nil
}

func (r *Registry) Subscribe(sub Subscription) error {
	return r.subs.Save(sub)
}

func (r *Registry) Unsubscribe(endpoint string) error {
	_, err := r.subs.Remove(endpoint)
	return err
}
