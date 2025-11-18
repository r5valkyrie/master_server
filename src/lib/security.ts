/**
 * Security utilities for input validation and sanitization
 */

/**
 * Validates Steam ID format
 */
export function isValidSteamId(steamId: string): boolean {
    if (typeof steamId !== 'string') return false;
    return /^765611\d{11}$/.test(steamId);
}

/**
 * Validates and sanitizes user input for search queries
 */
export function sanitizeSearchInput(input: string): string {
    if (typeof input !== 'string') return '';
    
    // Remove null bytes, control characters, and limit length
    return input
        .replace(/\0/g, '') // Remove null bytes
        .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
        .trim()
        .slice(0, 100); // Limit to 100 characters
}

/**
 * Validates username format
 */
export function isValidUsername(username: string): boolean {
    if (typeof username !== 'string') return false;
    
    // Allow alphanumeric, spaces, and common special characters
    return /^[a-zA-Z0-9\s\-_\.]{1,50}$/.test(username);
}

/**
 * Validates ban reason
 */
export function isValidBanReason(reason: string): boolean {
    if (typeof reason !== 'string') return false;
    
    // Must be non-empty and reasonable length
    return reason.trim().length >= 3 && reason.trim().length <= 500;
}

/**
 * Validates and sanitizes ban duration
 */
export function validateBanDuration(days: string | number): number | null {
    if (typeof days === 'string') {
        const parsed = parseInt(days, 10);
        if (isNaN(parsed)) return null;
        days = parsed;
    }
    
    if (typeof days !== 'number') return null;
    
    // Must be positive and reasonable (max 3650 days = ~10 years)
    if (days < 1 || days > 3650) return null;
    
    return days;
}

/**
 * Escapes HTML to prevent XSS
 */
export function escapeHtml(unsafe: string): string {
    if (typeof unsafe !== 'string') return '';
    
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Rate limiting helper
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(identifier: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const existing = rateLimitMap.get(identifier);
    
    if (!existing || now > existing.resetTime) {
        rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
        return true;
    }
    
    if (existing.count >= maxRequests) {
        return false;
    }
    
    existing.count++;
    return true;
}

/**
 * IP address validation
 */
export function isValidIpAddress(ip: string): boolean {
    if (typeof ip !== 'string') return false;
    
    // IPv4 regex
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6 regex (simplified)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Clean up rate limit map periodically
 */
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
        if (now > value.resetTime) {
            rateLimitMap.delete(key);
        }
    }
}, 300000); // Clean up every 5 minutes
