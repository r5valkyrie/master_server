import { defineMiddleware } from 'astro:middleware';
import { getPlayerBanStatus } from './lib/bansystem';
import { getSessionCookieName, verifyAdminSessionToken } from './lib/session';
import { addSecurityHeaders } from './lib/security-headers';

let startupTasksInitialized = false;

// Initialize startup tasks on first request (for production builds)
async function ensureStartupTasksInitialized() {
    if (startupTasksInitialized) return;
    startupTasksInitialized = true;
    
    try {
        const { initializeStartup } = await import('./lib/startup.ts');
        const { logger } = await import('./lib/logger.ts');
        logger.info('Initializing background tasks on first request', { prefix: 'SERVER' });
        await initializeStartup();
    } catch (err) {
        const { logger } = await import('./lib/logger.ts');
        logger.error(`Failed to initialize startup tasks: ${err}`, { prefix: 'SERVER' });
    }
}

export async function ipFilter(request: Request) {
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for');
    if (ip) {
        try {
            const { isBanned } = await getPlayerBanStatus(null, ip);
            if (isBanned) {
                return new Response(JSON.stringify({ success: false, err: `Failed to handshake with r5v server.` }), { status: 401 });
            }
        } catch (error) {
            console.error('Error checking IP ban status:', error);
            // Continue without blocking if ban check fails
        }
    }
    return null; // Not banned or no IP found
}

export const onRequest = defineMiddleware(async (context, next) => {
    // Ensure startup tasks are initialized (especially important for production)
    await ensureStartupTasksInitialized();
    
    const { request, url } = context;
    
    // IP Filtering for specific endpoint
    if (url.pathname === '/api/servers/add') {
        const ipFilterResponse = await ipFilter(request);
        if (ipFilterResponse) {
            return ipFilterResponse;
        }
    }

    // Session auth for /admin routes (except login and static assets under /admin)
    if ((url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin')) &&
        !url.pathname.startsWith('/admin/login') &&
        !url.pathname.startsWith('/api/admin/auth/login')) {
        const cookieHeader = request.headers.get('cookie') || '';
        const cookieName = getSessionCookieName();
        const cookieValue = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.split('=')[1];

        const session = cookieValue ? verifyAdminSessionToken(cookieValue) : null;

        if (!session) {
            // If it's an API path, return 401 JSON; if it's a page, redirect to login
            if (url.pathname.startsWith('/api/')) {
                return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
            }
            return new Response(null, {
                status: 302,
                headers: { Location: '/admin/login' }
            });
        }

        // Role-based guards
        const isMaster = session.role === 'master';
        const isModerator = session.role === 'moderator';
        if (url.pathname.startsWith('/admin/userManagement') || url.pathname.startsWith('/api/admin/users/manage')) {
            if (!isMaster) {
                if (url.pathname.startsWith('/api/')) {
                    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 });
                }
                return new Response(null, { status: 302, headers: { Location: '/admin/dashboard' } });
            }
        }

        // Settings page - master only (combines Discord config and System Settings)
        if (url.pathname.startsWith('/admin/settings') || url.pathname.startsWith('/api/admin/settings')) {
            if (!isMaster) {
                if (url.pathname.startsWith('/api/')) {
                    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 });
                }
                return new Response(null, { status: 302, headers: { Location: '/admin/dashboard' } });
            }
        }

        // API Keys - master only
        if (url.pathname.startsWith('/admin/apiKeys') || url.pathname.startsWith('/api/admin/apiKeys')) {
            if (!isMaster) {
                if (url.pathname.startsWith('/api/')) {
                    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 });
                }
                return new Response(null, { status: 302, headers: { Location: '/admin/dashboard' } });
            }
        }

        // Launcher Config - master only
        if (url.pathname.startsWith('/admin/launcherConfig') || url.pathname.startsWith('/api/admin/launcherConfig')) {
            if (!isMaster) {
                if (url.pathname.startsWith('/api/')) {
                    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 });
                }
                return new Response(null, { status: 302, headers: { Location: '/admin/dashboard' } });
            }
        }

        // Moderators: allow dashboard, users list, banlist, userQuery, servers, content; deny MOTD admin API
        if (isModerator) {
            const allowedPages = ['/admin/dashboard', '/admin/users', '/admin/banlist', '/admin/userQuery', '/admin/servers', '/admin/content', '/admin/mods'];
            const allowedApiPrefixes = ['/api/admin/users', '/api/admin/banlist', '/api/admin/userQuery', '/api/admin/servers', '/api/admin/auth/changePassword', '/api/admin/motd', '/api/admin/playersChart', '/api/admin/bansChart', '/api/admin/eula', '/api/admin/recentActivity', '/api/admin/uptime', '/api/admin/systemHealth', '/api/admin/banStats', '/api/admin/userGrowth', '/api/admin/playerStats', '/api/admin/verifiedMods'];
            if (url.pathname.startsWith('/admin') && !allowedPages.some(p => url.pathname.startsWith(p))) {
                return new Response(null, { status: 302, headers: { Location: '/admin/dashboard' } });
            }
            if (url.pathname.startsWith('/api/admin') && !allowedApiPrefixes.some(p => url.pathname.startsWith(p))) {
                return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 });
            }
            // Allow moderators to view MOTD (GET) but block edits (POST/PUT/DELETE)
            if (url.pathname.startsWith('/api/admin/motd')) {
                if (request.method && request.method.toUpperCase() !== 'GET') {
                    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 });
                }
            }
            if (url.pathname.startsWith('/api/admin/eula')) {
                if (request.method && request.method.toUpperCase() !== 'GET') {
                    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 });
                }
            }
        }
    }

    // Continue to next middleware or route and add security headers
    const response = await next();
    return addSecurityHeaders(response);
});
