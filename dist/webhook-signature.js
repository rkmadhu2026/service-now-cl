import crypto from "node:crypto";
export function computeHmacSha256(secret, payload) {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}
export function hasValidSignature(req, secret) {
    const signature = req.header("x-relayroom-signature");
    if (!signature || !req.rawBody)
        return false;
    const expected = computeHmacSha256(secret, req.rawBody);
    const incoming = Buffer.from(signature);
    const target = Buffer.from(expected);
    if (incoming.length !== target.length)
        return false;
    return crypto.timingSafeEqual(incoming, target);
}
