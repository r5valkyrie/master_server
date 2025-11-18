import jwt from 'jsonwebtoken';

const SESSION_COOKIE_NAME = 'admin_session';
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

type AdminSessionPayload = {
    username: string;
    role: 'master' | 'admin' | 'moderator';
};

export function getSessionCookieName(): string {
    return SESSION_COOKIE_NAME;
}

export function createAdminSessionToken(payload: AdminSessionPayload, ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS): string {
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret) {
        throw new Error('ADMIN_SESSION_SECRET is not set');
    }

    const token = jwt.sign(payload, secret, {
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
        const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AdminSessionPayload;
        if (!decoded || typeof decoded.username !== 'string') return null;
        return decoded;
    } catch {
        return null;
    }
}


