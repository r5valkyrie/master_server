import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import type { APIContext } from 'astro';
import { logger } from './logger.ts';

const AUTH_TYPE_NONE = 0;
const AUTH_TYPE_KEY  = 1; // auth using firstparty token
const AUTH_TYPE_USER = 2; // auth using the admin user database

// sign JWT using private key
// this key MUST be kept private as otherwise JWTs can be issued by unauthorized
// third parties
let PRIVATE_KEY: Buffer | null = null;
try {
    PRIVATE_KEY = fs.readFileSync("auth.key");
} catch (err) {
    logger.error('Error reading auth.key, JWTs will not be signed', { prefix: 'AUTH' });
}

export function CreateAuthToken(userId: string, userName: string, serverIp: string): string | null {
    if (!PRIVATE_KEY) {
        logger.error('Private key is not loaded, cannot sign auth token', { prefix: 'AUTH' });
        return null;
    }

    const hasher = crypto.createHash("sha256");

    let sessionId = `${userId}-${userName}-${serverIp}`;
    
    // Log session creation without sensitive data
    logger.debug('Creating session hash for user authentication', { prefix: 'AUTH' });

    let hashedSessionId = hasher.update(sessionId).digest("hex");
    
    // token payload data
    let tokenData = {
        sessionId: hashedSessionId
    };

    let signOptions: jwt.SignOptions = {
        expiresIn: 30, // token only lasts 30 seconds from creation time to minimise damage if leaked
        algorithm: "RS256", // maybe upgrade to 384/512?
    };

    return jwt.sign(tokenData, { key: PRIVATE_KEY, passphrase: process.env.AUTH_KEY_PASSPHRASE }, signOptions);
}

export function RequireAuth(req: Request, type = AUTH_TYPE_USER): boolean {
    switch(type) {
        case AUTH_TYPE_NONE:
            return true;
        case AUTH_TYPE_KEY:
        {
            const key = req.headers.get("x-r5v-key");
            if (!key) return false;
            
            const expectedKey = process.env.API_KEY;
            if (!expectedKey) {
                logger.error('API_KEY not configured', { prefix: 'AUTH' });
                return false;
            }
            
            // Use crypto.timingSafeEqual for constant-time comparison to prevent timing attacks
            try {
                const keyBuffer = Buffer.from(key, 'utf8');
                const expectedBuffer = Buffer.from(expectedKey, 'utf8');
                
                // Ensure buffers are same length to prevent length-based attacks
                if (keyBuffer.length !== expectedBuffer.length) {
                    return false;
                }
                
                return crypto.timingSafeEqual(keyBuffer, expectedBuffer);
            } catch (error) {
                logger.error(`Auth comparison error: ${error}`, { prefix: 'AUTH' });
                return false;
            }
        }
        case AUTH_TYPE_USER:
            logger.error('Attempted to auth with AUTH_TYPE_USER, however this auth type is not implemented', { prefix: 'AUTH' });
            return false;
    }

    return false;
}

export function RequireKeyAuth({ request, clientAddress }: APIContext): boolean {
    if (!RequireAuth(request, AUTH_TYPE_KEY)) {
        logger.warn(`Unauthorized access from '${clientAddress}' to endpoint '${new URL(request.url).pathname}'`, { prefix: 'AUTH' });
        return false;
    }
    return true;
}
