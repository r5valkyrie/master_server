import type { APIRoute } from 'astro';
import { createAdminSessionToken, getSessionCookieName } from '../../../../lib/session';
import { getPool } from '../../../../lib/db';
import bcrypt from 'bcrypt';

type LoginBody = {
    username: string;
    password: string;
};

function parseCookies(header: string | null): Record<string, string> {
    if (!header) return {};
    return header.split(';').reduce((acc, part) => {
        const [k, v] = part.trim().split('=');
        if (k) acc[k] = v || '';
        return acc;
    }, {} as Record<string, string>);
}

// --- Rate limiting for login ---
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; resetTime: number }>();

function getLoginRateLimitKey(request: Request): string {
    return request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
}

function isLoginRateLimited(key: string): { limited: boolean; retryAfterSec: number } {
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (!entry || now > entry.resetTime) {
        return { limited: false, retryAfterSec: 0 };
    }
    if (entry.count >= MAX_LOGIN_ATTEMPTS) {
        return { limited: true, retryAfterSec: Math.ceil((entry.resetTime - now) / 1000) };
    }
    return { limited: false, retryAfterSec: 0 };
}

function recordLoginAttempt(key: string): void {
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (!entry || now > entry.resetTime) {
        loginAttempts.set(key, { count: 1, resetTime: now + LOGIN_WINDOW_MS });
    } else {
        entry.count++;
    }
}

function resetLoginAttempts(key: string): void {
    loginAttempts.delete(key);
}

// Periodic cleanup of expired entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginAttempts.entries()) {
        if (now > entry.resetTime) loginAttempts.delete(key);
    }
}, 5 * 60 * 1000);

export const POST: APIRoute = async ({ request }) => {
    // Rate limit check
    const rateLimitKey = getLoginRateLimitKey(request);
    const { limited, retryAfterSec } = isLoginRateLimited(rateLimitKey);
    if (limited) {
        return new Response(
            JSON.stringify({ success: false, error: `Too many login attempts. Try again in ${retryAfterSec} seconds.` }),
            { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
        );
    }

    let username = '';
    let password = '';
    
    try {
        const ctype = request.headers.get('content-type') || '';
        if (ctype.includes('application/json')) {
            const body = await request.json() as Partial<LoginBody>;
            username = (body.username || '').toString();
            password = (body.password || '').toString();
        } else if (ctype.includes('application/x-www-form-urlencoded')) {
            const text = await request.text();
            const params = new URLSearchParams(text);
            username = (params.get('username') || '').toString();
            password = (params.get('password') || '').toString();
        } else {
            // Try JSON first, then URLSearchParams from text fallback
            try {
                const body = await request.json() as Partial<LoginBody>;
                username = (body.username || '').toString();
                password = (body.password || '').toString();
            } catch {
                const text = await request.text();
                const params = new URLSearchParams(text);
                username = (params.get('username') || '').toString();
                password = (params.get('password') || '').toString();
            }
        }
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), { status: 400 });
    }

    // DB auth
    const pool = getPool();
    if (!pool) return new Response(JSON.stringify({ success: false, error: 'Server not ready' }), { status: 503 });
    const [rows]: any = await pool.execute('SELECT username, password_hash, role, must_change_password FROM admin_users WHERE username=? LIMIT 1', [username]);
    if (!Array.isArray(rows) || rows.length === 0) {
        recordLoginAttempt(rateLimitKey);
        return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401 });
    }
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
        recordLoginAttempt(rateLimitKey);
        return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401 });
    }

    // Successful login — reset rate limit counter
    resetLoginAttempts(rateLimitKey);

    const role: 'master' | 'admin' | 'moderator' = user.role;
    const token = createAdminSessionToken({ username, role });
    const cookieName = getSessionCookieName();

    const response = new Response(JSON.stringify({ success: true, mustChangePassword: !!user.must_change_password }), { status: 200 });
    const isProd = process.env.NODE_ENV === 'production';
    response.headers.append('Set-Cookie', `${cookieName}=${token}; HttpOnly; Path=/; Max-Age=7200; SameSite=Strict${isProd ? '; Secure' : ''}`);
    return response;
};


