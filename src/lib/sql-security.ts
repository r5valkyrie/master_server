/**
 * SQL Security utilities to prevent injection attacks
 */

/**
 * Validates SQL query parameters to prevent injection
 */
export function validateSqlParams(params: any[]): boolean {
    for (const param of params) {
        if (typeof param === 'string') {
            // Check for SQL injection patterns
            const dangerousPatterns = [
                /;.*?--/i,           // SQL comments
                /union\s+select/i,   // UNION attacks
                /drop\s+table/i,     // DROP statements
                /delete\s+from/i,    // DELETE statements
                /insert\s+into/i,    // INSERT statements
                /update\s+.*?\s+set/i, // UPDATE statements
                /<script/i,          // XSS attempts
                /javascript:/i,      // JavaScript protocol
                /vbscript:/i,        // VBScript protocol
                /onload\s*=/i,       // Event handlers
                /onerror\s*=/i,      // Event handlers
            ];

            for (const pattern of dangerousPatterns) {
                if (pattern.test(param)) {
                    console.warn(`[SQL Security] Potential SQL injection attempt detected: ${param.substring(0, 100)}`);
                    return false;
                }
            }
        }
        
        // Check parameter length (prevent buffer overflow)
        if (typeof param === 'string' && param.length > 1000) {
            console.warn(`[SQL Security] Unusually long parameter detected: ${param.length} characters`);
            return false;
        }
    }
    
    return true;
}

/**
 * Sanitizes ORDER BY clauses (since they can't be parameterized)
 */
export function sanitizeOrderBy(orderBy: string, allowedColumns: string[]): string {
    if (!orderBy) return 'id ASC';
    
    // Parse order by (column name and direction)
    const parts = orderBy.trim().split(/\s+/);
    const column = parts[0];
    const direction = parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    // Check if column is in allowlist
    if (!allowedColumns.includes(column)) {
        console.warn(`[SQL Security] Invalid ORDER BY column attempted: ${column}`);
        return 'id ASC'; // Default safe ordering
    }
    
    return `${column} ${direction}`;
}

/**
 * Sanitizes LIMIT clauses
 */
export function sanitizeLimit(limit: any, maxLimit: number = 100): number {
    const parsedLimit = parseInt(limit, 10);
    
    if (isNaN(parsedLimit) || parsedLimit < 1) {
        return 10; // Default limit
    }
    
    if (parsedLimit > maxLimit) {
        console.warn(`[SQL Security] Limit ${parsedLimit} exceeds maximum ${maxLimit}, capping to ${maxLimit}`);
        return maxLimit;
    }
    
    return parsedLimit;
}

/**
 * Sanitizes OFFSET clauses
 */
export function sanitizeOffset(offset: any): number {
    const parsedOffset = parseInt(offset, 10);
    
    if (isNaN(parsedOffset) || parsedOffset < 0) {
        return 0; // Default offset
    }
    
    // Prevent excessive offsets that could cause performance issues
    if (parsedOffset > 100000) {
        console.warn(`[SQL Security] Offset ${parsedOffset} is very large, this may cause performance issues`);
    }
    
    return parsedOffset;
}

/**
 * Validates that a query string doesn't contain dangerous SQL
 */
export function validateQueryString(query: string): boolean {
    // List of dangerous SQL keywords that should never appear in user input
    const dangerousKeywords = [
        'DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE',
        'EXEC', 'EXECUTE', 'UNION', 'SCRIPT', 'JAVASCRIPT', 'VBSCRIPT'
    ];
    
    const upperQuery = query.toUpperCase();
    
    for (const keyword of dangerousKeywords) {
        if (upperQuery.includes(keyword)) {
            console.warn(`[SQL Security] Dangerous SQL keyword detected: ${keyword} in query: ${query.substring(0, 100)}`);
            return false;
        }
    }
    
    return true;
}

/**
 * Log SQL queries for security monitoring (in development)
 */
export function logSqlQuery(query: string, params: any[], userId?: string): void {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[SQL Query] ${query}`);
        console.log(`[SQL Params] ${JSON.stringify(params)}`);
        if (userId) {
            console.log(`[SQL User] ${userId}`);
        }
    }
}

/**
 * Escape special characters in LIKE patterns
 */
export function escapeLikePattern(pattern: string): string {
    return pattern
        .replace(/\\/g, '\\\\')  // Escape backslashes
        .replace(/%/g, '\\%')    // Escape percent signs
        .replace(/_/g, '\\_');   // Escape underscores
}
