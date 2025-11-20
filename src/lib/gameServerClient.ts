import { logger } from './logger.ts';
import { BitStream } from 'bit-buffer';
import crypto from 'crypto';
import dgram from 'dgram';
import { EventEmitter } from 'events';

// Constants for packet structure
const PACKET_HEADER_MAGIC = -1;
const PACKET_TYPE_CHALLENGE_RESPONSE = 73;
const CHALLENGE_MESSAGE_TYPE = 0x48; // 'H'
const PROTOCOL_VERSION = 2;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AAD_SEQUENCE = "\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10";
const CIPHER_ALGORITHM = "aes-128-gcm";
const MAX_PORT = 65535;
const MIN_PORT = 0;
const UID_LOWER_MASK = 0xffffffffn;
const UID_UPPER_SHIFT = 32n;

/**
 * Protocol message builder for server challenge requests
 */
class ProtocolMessageBuilder {
    /**
     * Constructs a challenge request packet
     * @param userIdentifier - Unique user identifier as BigInt
     * @returns Serialized challenge request buffer
     */
    static buildChallengeRequest(userIdentifier: bigint): Buffer {
        const buffer = Buffer.alloc(1600);
        const bitStream = new BitStream(buffer);

        // Write packet header
        bitStream.writeInt32(PACKET_HEADER_MAGIC);
        bitStream.writeUint8(CHALLENGE_MESSAGE_TYPE);
        bitStream.writeASCIIString("connect");
        
        // Split 64-bit UID into two 32-bit values
        const lowerBits = Number(userIdentifier & UID_LOWER_MASK);
        const upperBits = Number(userIdentifier >> UID_UPPER_SHIFT);
        
        bitStream.writeUint32(lowerBits);
        bitStream.writeUint32(upperBits);
        bitStream.writeUint8(PROTOCOL_VERSION);

        return bitStream.buffer.subarray(bitStream.buffer.byteOffset, bitStream.byteIndex);
    }
}

/**
 * Handles AES-GCM encryption and decryption for secure packet transmission
 */
class PacketCryptography {
    private readonly encryptionKey: Buffer;
    private readonly additionalAuthData: Buffer;
    private initVector!: Buffer;

    constructor(base64Key: string) {
        this.encryptionKey = Buffer.from(base64Key, "base64");
        this.additionalAuthData = Buffer.from(AAD_SEQUENCE, "ascii");
    }

    /**
     * Encrypts data using AES-128-GCM
     * @param plaintext - Data to encrypt
     * @param length - Optional length limit (-1 for full buffer)
     * @returns Encrypted packet with IV and auth tag prepended
     */
    encryptPacket(plaintext: Buffer, length: number = -1): Buffer {
        // Generate random initialization vector
        this.initVector = crypto.randomBytes(IV_LENGTH);
        
        const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, this.encryptionKey, this.initVector);
        cipher.setAAD(this.additionalAuthData);
        
        // Determine slice length
        const sliceLength = length > 0 ? length : plaintext.length;
        const dataSlice = plaintext.slice(0, sliceLength);
        
        const ciphertext = Buffer.concat([
            cipher.update(dataSlice),
            cipher.final()
        ]);
        
        const authTag = cipher.getAuthTag();
        
        // Construct final packet: IV + AuthTag + Ciphertext
        return Buffer.concat([this.initVector, authTag, ciphertext]);
    }

    /**
     * Decrypts an encrypted packet
     * @param encryptedPacket - Packet containing IV, auth tag, and ciphertext
     * @returns Decrypted plaintext or dummy buffer on failure
     */
    decryptPacket(encryptedPacket: Buffer): Buffer {
        // Extract components from packet
        const iv = encryptedPacket.slice(0, IV_LENGTH);
        const authTag = encryptedPacket.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const ciphertext = encryptedPacket.slice(IV_LENGTH + AUTH_TAG_LENGTH);
        
        const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, this.encryptionKey, iv);
        decipher.setAAD(this.additionalAuthData);
        decipher.setAuthTag(authTag);
        
        try {
            return Buffer.concat([
                decipher.update(ciphertext),
                decipher.final()
            ]);
        } catch (error) {
            // Return dummy buffer on decryption failure
            return Buffer.alloc(24);
        }
    }
}

/**
 * UDP network transport layer for game server communication
 */
class UdpTransport {
    private readonly parent: GameServerClient;
    private serverAddress!: string;
    private serverPort!: number;
    private udpSocket!: dgram.Socket;
    private localPort!: number;
    private connectionClosed: boolean = true;

    constructor(parentClient: GameServerClient) {
        this.parent = parentClient;
    }

    /**
     * Handles incoming UDP messages
     */
    private handleIncomingMessage = (message: Buffer, remoteInfo: dgram.RemoteInfo): void => {
        // Validate message source
        if (remoteInfo.address !== this.serverAddress || remoteInfo.port !== this.serverPort) {
            return;
        }
        
        const decryptedPayload = this.parent.crypto.decryptPacket(message);
        this.parent.emit("data", decryptedPayload);
    };

    /**
     * Transmits data to the server
     * @param payload - Data to send
     * @param byteLimit - Optional byte limit for encryption
     */
    transmit(payload: Buffer, byteLimit: number = -1): void {
        const encryptedPayload = this.parent.crypto.encryptPacket(payload, byteLimit);
        this.udpSocket.send(encryptedPayload, this.serverPort, this.serverAddress);
    }

    /**
     * Establishes connection to game server
     * @param address - Server IP address
     * @param port - Server port number
     */
    establish(address: string, port: number): void {
        this.serverAddress = address;
        this.serverPort = port;
        
        // Create UDP socket
        this.udpSocket = dgram.createSocket({ 
            type: "udp4", 
            reuseAddr: false 
        });
        
        this.connectionClosed = false;
        
        // Build and encrypt challenge request
        const challengeRequest = ProtocolMessageBuilder.buildChallengeRequest(
            this.parent.connectionSettings.uid
        );
        const encryptedRequest = this.parent.crypto.encryptPacket(challengeRequest);

        // Bind to ephemeral port and send initial packet
        this.udpSocket.bind({ port: 0, exclusive: true }, () => {
            this.localPort = this.udpSocket.address().port;
            
            // Validate port range
            const isValidPort = this.serverPort >= MIN_PORT && this.serverPort <= MAX_PORT;
            
            if (isValidPort) {
                this.udpSocket.send(encryptedRequest, this.serverPort, this.serverAddress);
            } else {
                logger.error(`Port out of valid range: ${this.serverPort} for ${this.serverAddress}`, { prefix: 'GAMESERVER' });
            }
        });

        // Register message handler
        this.udpSocket.on("message", this.handleIncomingMessage);
    }

    /**
     * Closes the UDP connection
     */
    terminate(): void {
        if (this.connectionClosed) {
            return;
        }
        
        this.connectionClosed = true;
        this.udpSocket.close();
    }
}

/**
 * Main client for game server challenge-response authentication
 */
export class GameServerClient extends EventEmitter {
    public readonly connectionSettings: any;
    public readonly crypto: PacketCryptography;
    private readonly transport: UdpTransport;

    constructor(configuration: any) {
        super();
        this.connectionSettings = configuration;
        this.crypto = new PacketCryptography(configuration.encryptionKey);
        this.transport = new UdpTransport(this);
        
        // Register data handler
        this.on("data", this.processResponse.bind(this));
    }

    /**
     * Initiates connection to game server
     */
    connect(): void {
        this.transport.establish(
            this.connectionSettings.ip, 
            this.connectionSettings.port
        );
    }

    /**
     * Processes challenge response from server
     * @param responseData - Raw response buffer
     */
    private processResponse(responseData: Buffer): void {
        // Validate packet structure
        const headerMagic = responseData.readInt32LE();
        if (headerMagic !== PACKET_HEADER_MAGIC) {
            return;
        }
        
        const packetType = responseData.readUint8(4);
        if (packetType !== PACKET_TYPE_CHALLENGE_RESPONSE) {
            return;
        }
        
        const responseUid = responseData.readBigInt64LE(9);
        if (responseUid !== this.connectionSettings.uid) {
            return;
        }
        
        // Extract challenge value
        const challengeValue = responseData.readInt32LE(5);
        
        // Emit challenge and close connection
        this.emit("challenge", challengeValue);
        this.transport.terminate();
    }

    /**
     * Closes the client connection
     */
    close(): void {
        this.transport.terminate();
    }
}
