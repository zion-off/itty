const Passkey = (() => {
  const toBytes = (b64url) => {
    const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
    const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  };

  const toB64url = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const descriptors = (list) => (list || []).map((d) => ({ ...d, id: toBytes(d.id) }));

  const requestOptions = (o) => ({
    ...o,
    challenge: toBytes(o.challenge),
    allowCredentials: descriptors(o.allowCredentials),
  });

  const creationOptions = (o) => ({
    ...o,
    challenge: toBytes(o.challenge),
    user: { ...o.user, id: toBytes(o.user.id) },
    excludeCredentials: descriptors(o.excludeCredentials),
  });

  const encodeAssertion = (c) => ({
    id: c.id,
    rawId: toB64url(c.rawId),
    type: c.type,
    response: {
      clientDataJSON: toB64url(c.response.clientDataJSON),
      authenticatorData: toB64url(c.response.authenticatorData),
      signature: toB64url(c.response.signature),
      userHandle: c.response.userHandle ? toB64url(c.response.userHandle) : null,
    },
  });

  const encodeAttestation = (c) => ({
    id: c.id,
    rawId: toB64url(c.rawId),
    type: c.type,
    response: {
      clientDataJSON: toB64url(c.response.clientDataJSON),
      attestationObject: toB64url(c.response.attestationObject),
    },
  });

  const post = async (url, body, signal) => {
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${url}: ${res.status} ${(await res.text()).trim()}`);
    return res.json();
  };

  const login = async ({ signal } = {}) => {
    const { id, options } = await post('/auth/challenge', undefined, signal);
    const credential = await navigator.credentials.get({ publicKey: requestOptions(options.publicKey), signal });
    const { ticket } = await post(`/auth/verify?id=${encodeURIComponent(id)}`, encodeAssertion(credential), signal);
    return ticket;
  };

  const enroll = async (token) => {
    const { id, options } = await post('/enroll/begin', { token });
    const credential = await navigator.credentials.create({ publicKey: creationOptions(options.publicKey) });
    await post(`/enroll/finish?id=${encodeURIComponent(id)}`, encodeAttestation(credential));
  };

  return { login, enroll };
})();
