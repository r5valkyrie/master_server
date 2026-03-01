/**
 * Security headers middleware for enhanced protection
 */

export function addSecurityHeaders(response: Response): Response {
    // Clone the response to modify headers
    const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
    });

    // Content Security Policy - Allow Chart.js and required resources
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net", // Chart.js CDN (no unsafe-eval)
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Allow inline styles and Google Fonts
        "img-src 'self' data: https:", // Allow images from self, data URLs, and HTTPS
        "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com", // Allow fonts from CDN and Google Fonts
        "connect-src 'self' https://api.steampowered.com https://cdn.jsdelivr.net", // Allow Steam API and CDN
        "media-src 'self' https://blaze.playvalkyrie.org",
        "frame-src 'none'", // Block iframes
        "object-src 'none'", // Block object/embed/applet
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'", // Prevent framing
        "upgrade-insecure-requests"
    ].join('; ');

    // Set security headers
    newResponse.headers.set('Content-Security-Policy', csp);
    newResponse.headers.set('X-Content-Type-Options', 'nosniff');
    newResponse.headers.set('X-Frame-Options', 'DENY');
    newResponse.headers.set('X-XSS-Protection', '1; mode=block');
    newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // HSTS for HTTPS (only in production)
    if (process.env.NODE_ENV === 'production') {
        newResponse.headers.set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );
    }

    // Remove server information / verbose headers
    newResponse.headers.delete('Server');
    newResponse.headers.delete('X-Powered-By');
    newResponse.headers.delete('X-AspNet-Version');
    newResponse.headers.delete('X-AspNetMvc-Version');
    newResponse.headers.set('Server', '');  // Overwrite with empty in case framework re-adds it

    // Permissions Policy (formerly Feature Policy)
    const permissionsPolicy = [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'screen-wake-lock=()'
    ].join(', ');
    newResponse.headers.set('Permissions-Policy', permissionsPolicy);

    return newResponse;
}

/**
 * CORS headers for API endpoints.
 * Uses proper single-origin matching per the CORS spec (only one origin value allowed).
 * Defaults to blocking all cross-origin requests if no origins are provided.
 */
export function addCorsHeaders(
    response: Response,
    requestOrigin: string | null,
    allowOrigins: string[] = [],
    allowMethods: string[] = ['GET', 'POST'],
): Response {
    const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
    });

    // Only set CORS headers if the request origin is in the allowlist
    if (requestOrigin && allowOrigins.includes(requestOrigin)) {
        newResponse.headers.set('Access-Control-Allow-Origin', requestOrigin);
        newResponse.headers.set('Vary', 'Origin'); // Required when origin varies
        newResponse.headers.set('Access-Control-Allow-Methods', allowMethods.join(', '));
        newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
        newResponse.headers.set('Access-Control-Max-Age', '7200'); // 2 hours
    }
    // If origin not in allowlist, no CORS headers → browser blocks cross-origin access

    return newResponse;
}
