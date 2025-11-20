/**
 * Input validation utilities to prevent common security vulnerabilities
 */

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Safely parse JSON with error handling
 */
export async function safeJsonParse(request: Request): Promise<{ data: any; error?: string }> {
    try {
        const contentType = request.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
            return { data: null, error: 'Invalid content type' };
        }

        const data = await request.json();
        if (!data || typeof data !== 'object') {
            return { data: null, error: 'Request body must be a JSON object' };
        }

        return { data };
    } catch (e) {
        return { data: null, error: 'Invalid JSON request' };
    }
}

/**
 * Validate string input length and characters
 */
export function validateString(value: any, minLength: number = 0, maxLength: number = 1000, pattern?: RegExp): ValidationResult {
    if (typeof value !== 'string') {
        return { valid: false, error: 'Must be a string' };
    }

    if (value.length < minLength) {
        return { valid: false, error: `Minimum length is ${minLength}` };
    }

    if (value.length > maxLength) {
        return { valid: false, error: `Maximum length is ${maxLength}` };
    }

    if (pattern && !pattern.test(value)) {
        return { valid: false, error: 'Invalid format' };
    }

    return { valid: true };
}

/**
 * Validate numeric input
 */
export function validateNumber(value: any, min?: number, max?: number, isInteger: boolean = false): ValidationResult {
    const num = typeof value === 'number' ? value : Number(value);

    if (isNaN(num)) {
        return { valid: false, error: 'Must be a number' };
    }

    if (isInteger && !Number.isInteger(num)) {
        return { valid: false, error: 'Must be an integer' };
    }

    if (min !== undefined && num < min) {
        return { valid: false, error: `Minimum value is ${min}` };
    }

    if (max !== undefined && num > max) {
        return { valid: false, error: `Maximum value is ${max}` };
    }

    return { valid: true };
}

/**
 * Validate boolean input
 */
export function validateBoolean(value: any): ValidationResult {
    if (typeof value === 'boolean') {
        return { valid: true };
    }

    // Allow string representations
    if (typeof value === 'string' && (value === 'true' || value === 'false')) {
        return { valid: true };
    }

    return { valid: false, error: 'Must be a boolean' };
}

/**
 * Validate email address
 */
export function validateEmail(value: any): ValidationResult {
    const result = validateString(value, 5, 255);
    if (!result.valid) return result;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value)) {
        return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true };
}

/**
 * Validate URL
 */
export function validateUrl(value: any): ValidationResult {
    const result = validateString(value, 5, 2000);
    if (!result.valid) return result;

    try {
        new URL(value);
        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'Invalid URL' };
    }
}

/**
 * Validate Steam ID format
 */
export function validateSteamId(value: any): ValidationResult {
    const result = validateString(value, 17, 17);
    if (!result.valid) return result;

    // Steam IDs are typically 17 digits
    if (!/^\d{17}$/.test(value)) {
        return { valid: false, error: 'Invalid Steam ID format' };
    }

    return { valid: true };
}

/**
 * Validate IP address (IPv4 or IPv6)
 */
export function validateIpAddress(value: any): ValidationResult {
    const result = validateString(value, 7, 45);
    if (!result.valid) return result;

    // Simple IPv4 check
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    // Simple IPv6 check
    const ipv6Pattern = /^[\da-f:]+$/i;

    if (!ipv4Pattern.test(value) && !ipv6Pattern.test(value)) {
        return { valid: false, error: 'Invalid IP address format' };
    }

    return { valid: true };
}

/**
 * Validate that object has required fields
 */
export function validateRequiredFields(obj: any, fields: string[]): ValidationResult {
    if (!obj || typeof obj !== 'object') {
        return { valid: false, error: 'Input must be an object' };
    }

    for (const field of fields) {
        if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
    }

    return { valid: true };
}

/**
 * Sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename: any): ValidationResult {
    const result = validateString(filename, 1, 255);
    if (!result.valid) return result;

    // Allow only alphanumeric, dots, hyphens, underscores
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
        return { valid: false, error: 'Invalid filename characters' };
    }

    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return { valid: false, error: 'Path traversal not allowed' };
    }

    return { valid: true };
}

/**
 * Validate enum value
 */
export function validateEnum(value: any, allowedValues: string[]): ValidationResult {
    if (typeof value !== 'string') {
        return { valid: false, error: 'Must be a string' };
    }

    if (!allowedValues.includes(value)) {
        return { valid: false, error: `Must be one of: ${allowedValues.join(', ')}` };
    }

    return { valid: true };
}
