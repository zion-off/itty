interface CredentialDescriptorJson extends Omit<PublicKeyCredentialDescriptor, 'id'> {
  id: string;
}

interface RequestOptionsJson extends Omit<PublicKeyCredentialRequestOptions, 'challenge' | 'allowCredentials'> {
  challenge: string;
  allowCredentials?: CredentialDescriptorJson[];
}

interface CreationOptionsJson
  extends Omit<PublicKeyCredentialCreationOptions, 'challenge' | 'user' | 'excludeCredentials'> {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string };
  excludeCredentials?: CredentialDescriptorJson[];
}

interface Ceremony<Options> {
  id: string;
  options: { publicKey: Options };
}

interface PasskeyCallOptions {
  signal?: AbortSignal;
}

const Passkey = (() => {
  const PAD_BLOCK = 4;
  const Endpoint = Object.freeze({
    challenge: '/auth/challenge',
    verify: '/auth/verify',
    enrollBegin: '/enroll/begin',
    enrollFinish: '/enroll/finish',
  });
  const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });

  const toBytes = (b64url: string) => {
    const pad = '='.repeat((PAD_BLOCK - (b64url.length % PAD_BLOCK)) % PAD_BLOCK);
    const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  };

  const toB64url = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const descriptors = (list: CredentialDescriptorJson[] | undefined): PublicKeyCredentialDescriptor[] =>
    (list || []).map((d) => ({ ...d, id: toBytes(d.id) }));

  const requestOptions = (o: RequestOptionsJson): PublicKeyCredentialRequestOptions => ({
    ...o,
    challenge: toBytes(o.challenge),
    allowCredentials: descriptors(o.allowCredentials),
  });

  const creationOptions = (o: CreationOptionsJson): PublicKeyCredentialCreationOptions => ({
    ...o,
    challenge: toBytes(o.challenge),
    user: { ...o.user, id: toBytes(o.user.id) },
    excludeCredentials: descriptors(o.excludeCredentials),
  });

  const encodeAssertion = (c: PublicKeyCredential, response: AuthenticatorAssertionResponse) => ({
    id: c.id,
    rawId: toB64url(c.rawId),
    type: c.type,
    response: {
      clientDataJSON: toB64url(response.clientDataJSON),
      authenticatorData: toB64url(response.authenticatorData),
      signature: toB64url(response.signature),
      userHandle: response.userHandle ? toB64url(response.userHandle) : null,
    },
  });

  const encodeAttestation = (c: PublicKeyCredential, response: AuthenticatorAttestationResponse) => ({
    id: c.id,
    rawId: toB64url(c.rawId),
    type: c.type,
    response: {
      clientDataJSON: toB64url(response.clientDataJSON),
      attestationObject: toB64url(response.attestationObject),
    },
  });

  const post = async (url: string, body?: unknown, signal?: AbortSignal): Promise<unknown> => {
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: JSON_HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${url}: ${res.status} ${(await res.text()).trim()}`);
    return res.json();
  };

  const unexpected = (url: string) => new Error(`${url}: unexpected response`);

  const publicKeyOf = (value: unknown): Record<string, unknown> | null => {
    if (!Narrow.isRecord(value)) return null;
    const options = value['options'];
    if (!Narrow.isRecord(options)) return null;
    const publicKey = options['publicKey'];
    return Narrow.isRecord(publicKey) ? publicKey : null;
  };

  const isRequestCeremony = (value: unknown): value is Ceremony<RequestOptionsJson> =>
    Narrow.isRecord(value) && typeof value['id'] === 'string' && typeof publicKeyOf(value)?.['challenge'] === 'string';

  const isCreationCeremony = (value: unknown): value is Ceremony<CreationOptionsJson> =>
    isRequestCeremony(value) && Narrow.isRecord(publicKeyOf(value)?.['user']);

  const ticketOf = (value: unknown): string => {
    if (Narrow.isRecord(value) && typeof value['ticket'] === 'string') return value['ticket'];
    throw unexpected(Endpoint.verify);
  };

  const login = async ({ signal }: PasskeyCallOptions = {}): Promise<string> => {
    const challenge = await post(Endpoint.challenge, undefined, signal);
    if (!isRequestCeremony(challenge)) throw unexpected(Endpoint.challenge);
    const { id, options } = challenge;
    const credential = await navigator.credentials.get({
      publicKey: requestOptions(options.publicKey),
      signal,
    });
    if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAssertionResponse)) {
      throw new Error('itty: the browser returned no passkey assertion');
    }
    const verified = await post(
      `${Endpoint.verify}?id=${encodeURIComponent(id)}`,
      encodeAssertion(credential, credential.response),
      signal,
    );
    return ticketOf(verified);
  };

  const enroll = async (token: string): Promise<void> => {
    const begun = await post(Endpoint.enrollBegin, { token });
    if (!isCreationCeremony(begun)) throw unexpected(Endpoint.enrollBegin);
    const { id, options } = begun;
    const credential = await navigator.credentials.create({ publicKey: creationOptions(options.publicKey) });
    if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAttestationResponse)) {
      throw new Error('itty: the browser returned no passkey attestation');
    }
    await post(`${Endpoint.enrollFinish}?id=${encodeURIComponent(id)}`, encodeAttestation(credential, credential.response));
  };

  return { login, enroll };
})();
