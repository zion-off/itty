const Base64Url = (() => {
    const PAD_BLOCK = 4;
    const toBytes = (b64url) => {
        const pad = '='.repeat((PAD_BLOCK - (b64url.length % PAD_BLOCK)) % PAD_BLOCK);
        const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
        return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    };
    const fromBytes = (buffer) => {
        const bytes = new Uint8Array(buffer);
        let s = '';
        for (const b of bytes)
            s += String.fromCharCode(b);
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    return { toBytes, fromBytes };
})();
if (typeof module !== 'undefined')
    module.exports = Base64Url;
