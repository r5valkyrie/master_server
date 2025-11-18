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
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net", // Allow Chart.js CDN
        "style-src 'self' 'unsafe-inline'", // Allow inline styles
        "img-src 'self' data: https:", // Allow images from self, data URLs, and HTTPS
        "font-src 'self' https://cdn.jsdelivr.net", // Allow fonts from CDN
        "connect-src 'self' https://api.steampowered.com https://cdn.jsdelivr.net", // Allow Steam API and CDN
        "media-src 'self'",
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

    // Remove server information
    newResponse.headers.delete('Server');
    newResponse.headers.delete('X-Powered-By');

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
 * CORS headers for API endpoints
 */
export function addCorsHeaders(response: Response, allowOrigins: string[] = []): Response {
    const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers),
    });

    // Default to same-origin only
    if (allowOrigins.length > 0) {
        newResponse.headers.set('Access-Control-Allow-Origin', allowOrigins.join(', '));
    } else {
        newResponse.headers.set('Access-Control-Allow-Origin', 'same-origin');
    }
    
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    newResponse.headers.set('Access-Control-Max-Age', '86400'); // 24 hours

    return newResponse;
}
