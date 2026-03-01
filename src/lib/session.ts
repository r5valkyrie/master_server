import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'admin_session';
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours

type AdminSessionPayload = {
    username: string;
    role: 'master' | 'admin' | 'moderator';
};

type JwtPayloadWithMeta = AdminSessionPayload & {
    jti: string;
    iat: number;
    exp: number;
};

// ============================================================================
// Session revocation store
// ============================================================================

/** Set of revoked JWT IDs (jti) */
const revokedTokens = new Set<string>();

/** Per-user invalidation timestamps — tokens issued before this time are invalid */
const userInvalidatedBefore = new Map<string, number>();

/** Revoke a single token by its jti */
export function revokeToken(jti: string): void {
    revokedTokens.add(jti);
}

/** Revoke ALL sessions for a given username (tokens issued before now are invalid) */
export function revokeAllUserSessions(username: string): void {
    userInvalidatedBefore.set(username, Math.floor(Date.now() / 1000));
}

/** Extract the jti from a raw JWT string (without full verification) */
export function extractJti(token: string): string | null {
    try {
        const decoded = jwt.decode(token) as JwtPayloadWithMeta | null;
        return decoded?.jti ?? null;
    } catch {
        return null;
    }
}

// Periodic cleanup — remove revoked jti entries that would have expired anyway
setInterval(() => {
    // We can't know exact expiry per jti without storing it, so just cap the set size.
    // In practice tokens live max 8 hours, so purge every 9 hours worth of entries.
    // A more precise approach would store { jti, exp } pairs — kept simple here.
    if (revokedTokens.size > 10000) {
        revokedTokens.clear(); // Full reset if too large; expired tokens are harmless to forget
    }
}, 60 * 60 * 1000); // every hour

// ============================================================================
// Public API
// ============================================================================

export function getSessionCookieName(): string {
    return SESSION_COOKIE_NAME;
}

export function createAdminSessionToken(payload: AdminSessionPayload, ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS): string {
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret) {
        throw new Error('ADMIN_SESSION_SECRET is not set');
    }

    const jti = crypto.randomUUID();

    const token = jwt.sign({ ...payload, jti }, secret, {
        algorithm: 'HS256',
        expiresIn: ttlSeconds,
    });

    return token;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret) {
        return null;
    }
    try {
        const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayloadWithMeta;
        if (!decoded || typeof decoded.username !== 'string') return null;

        // Check if this specific token was revoked
        if (decoded.jti && revokedTokens.has(decoded.jti)) {
            return null;
        }

        // Check if all sessions for this user were invalidated after this token was issued
        const invalidatedBefore = userInvalidatedBefore.get(decoded.username);
        if (invalidatedBefore && decoded.iat && decoded.iat < invalidatedBefore) {
            return null;
        }

        return { username: decoded.username, role: decoded.role };
    } catch {
        return null;
    }
}


