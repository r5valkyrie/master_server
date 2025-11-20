import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import { logger } from './logger.ts';

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
