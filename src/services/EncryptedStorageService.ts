/**
 * Encrypted Raw Storage Service
 * 
 * Provides encrypted storage for raw conversation data with configurable retention policies.
 * Uses AES-256-GCM encryption for data at rest and supports automatic data lifecycle management.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// TYPES
// ============================================================================

export interface EncryptedStorageConfig {
  encryptionKey: string; // 32-byte base64 encoded key
  algorithm: 'aes-256-gcm';
  retentionDays: number;
  autoPurgeEnabled: boolean;
}

export interface RawDataRecord {
  id: string;
  source: string;
  externalId: string;
  encryptedData: string;
  iv: string;
  authTag: string;
  metadata: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
}

export interface StorageMetrics {
  totalRecords: number;
  totalSizeBytes: number;
  expiredRecords: number;
  oldestRecord: Date | null;
  newestRecord: Date | null;
}

// ============================================================================
// ENCRYPTION SERVICE
// ============================================================================

class EncryptedStorageService {
  private config: EncryptedStorageConfig;
  private static instance: EncryptedStorageService | null = null;

  constructor(config: EncryptedStorageConfig) {
    this.config = config;
    
    // Validate encryption key
    if (!this.isValidEncryptionKey(config.encryptionKey)) {
      throw new Error('Invalid encryption key: must be 32 bytes (256 bits) base64 encoded');
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): EncryptedStorageService {
    if (!EncryptedStorageService.instance) {
      const config: EncryptedStorageConfig = {
        encryptionKey: process.env.ENCRYPTION_KEY || this.generateEncryptionKey(),
        algorithm: 'aes-256-gcm',
        retentionDays: parseInt(process.env.STORAGE_RETENTION_DAYS || '365'),
        autoPurgeEnabled: process.env.AUTO_PURGE_ENABLED === 'true',
      };
      
      EncryptedStorageService.instance = new EncryptedStorageService(config);
    }
    return EncryptedStorageService.instance;
  }

  /**
   * Generate a new 256-bit encryption key
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Validate encryption key format
   */
  private isValidEncryptionKey(key: string): boolean {
    try {
      const buffer = Buffer.from(key, 'base64');
      return buffer.length === 32; // 256 bits
    } catch {
      return false;
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(data: string): { encryptedData: string; iv: string; authTag: string } {
    const key = Buffer.from(this.config.encryptionKey, 'base64');
    const iv = crypto.randomBytes(16); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(this.config.algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(encryptedData: string, iv: string, authTag: string): string {
    const key = Buffer.from(this.config.encryptionKey, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    
    const decipher = crypto.createDecipheriv(this.config.algorithm, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // ============================================================================
  // STORAGE OPERATIONS
  // ============================================================================

  /**
   * Store raw data with encryption
   */
  async storeRawData(
    source: string,
    externalId: string,
    rawData: any,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    try {
      // Serialize data
      const dataString = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
      
      // Encrypt data
      const { encryptedData, iv, authTag } = this.encrypt(dataString);
      
      // Calculate expiration date
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + (this.config.retentionDays * 24 * 60 * 60 * 1000));
      
      // Store in database
      const record = await prisma.rawData.create({
        data: {
          source,
          externalId,
          encryptedData,
          iv,
          authTag,
          metadata,
          createdAt,
          expiresAt,
        },
      });

      return record.id;
    } catch (error) {
      console.error('Error storing raw data:', error);
      throw new Error(`Failed to store raw data: ${error.message}`);
    }
  }

  /**
   * Retrieve and decrypt raw data
   */
  async retrieveRawData(id: string): Promise<any> {
    try {
      const record = await prisma.rawData.findUnique({
        where: { id },
      });

      if (!record) {
        throw new Error('Raw data record not found');
      }

      // Check if expired
      if (record.expiresAt < new Date()) {
        throw new Error('Raw data has expired');
      }

      // Decrypt data
      const decryptedData = this.decrypt(record.encryptedData, record.iv, record.authTag);
      
      // Parse JSON if it was stored as JSON
      try {
        return JSON.parse(decryptedData);
      } catch {
        return decryptedData;
      }
    } catch (error) {
      console.error('Error retrieving raw data:', error);
      throw error;
    }
  }

  /**
   * Retrieve raw data by source and external ID
   */
  async retrieveRawDataBySource(
    source: string,
    externalId: string
  ): Promise<any> {
    try {
      const record = await prisma.rawData.findFirst({
        where: {
          source,
          externalId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!record) {
        throw new Error('Raw data record not found');
      }

      return this.retrieveRawData(record.id);
    } catch (error) {
      console.error('Error retrieving raw data by source:', error);
      throw error;
    }
  }

  /**
   * Update existing raw data
   */
  async updateRawData(id: string, newData: any): Promise<void> {
    try {
      // Retrieve existing record
      const existing = await prisma.rawData.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error('Raw data record not found');
      }

      // Encrypt new data
      const dataString = typeof newData === 'string' ? newData : JSON.stringify(newData);
      const { encryptedData, iv, authTag } = this.encrypt(dataString);

      // Update record
      await prisma.rawData.update({
        where: { id },
        data: {
          encryptedData,
          iv,
          authTag,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error updating raw data:', error);
      throw error;
    }
  }

  /**
   * Delete raw data
   */
  async deleteRawData(id: string): Promise<void> {
    try {
      await prisma.rawData.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting raw data:', error);
      throw error;
    }
  }

  // ============================================================================
  // RETENTION MANAGEMENT
  // ============================================================================

  /**
   * Get storage metrics
   */
  async getStorageMetrics(): Promise<StorageMetrics> {
    try {
      const totalRecords = await prisma.rawData.count();
      const expiredRecords = await prisma.rawData.count({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      const records = await prisma.rawData.findMany({
        select: {
          createdAt: true,
          encryptedData: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 1,
      });

      const newestRecord = await prisma.rawData.findFirst({
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      });

      const oldestRecord = records.length > 0 ? records[0].createdAt : null;
      const newest = newestRecord?.createdAt || null;

      // Calculate total size (approximate)
      const sizeResult = await prisma.rawData.aggregate({
        _sum: {
          encryptedData: true,
        },
      });

      const totalSizeBytes = sizeResult._sum.encryptedData || 0;

      return {
        totalRecords,
        totalSizeBytes,
        expiredRecords,
        oldestRecord,
        newestRecord: newest,
      };
    } catch (error) {
      console.error('Error getting storage metrics:', error);
      throw error;
    }
  }

  /**
   * Purge expired records
   */
  async purgeExpiredRecords(): Promise<number> {
    try {
      const result = await prisma.rawData.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      console.log(`Purged ${result.count} expired raw data records`);
      return result.count;
    } catch (error) {
      console.error('Error purging expired records:', error);
      throw error;
    }
  }

  /**
   * Purge all records for a specific source
   */
  async purgeSourceData(source: string): Promise<number> {
    try {
      const result = await prisma.rawData.deleteMany({
        where: {
          source,
        },
      });

      console.log(`Purged ${result.count} records for source: ${source}`);
      return result.count;
    } catch (error) {
      console.error('Error purging source data:', error);
      throw error;
    }
  }

  /**
   * Purge all records older than specified days
   */
  async purgeOldRecords(days: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await prisma.rawData.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      console.log(`Purged ${result.count} records older than ${days} days`);
      return result.count;
    } catch (error) {
      console.error('Error purging old records:', error);
      throw error;
    }
  }

  /**
   * Run automatic retention cleanup
   */
  async runAutoRetention(): Promise<void> {
    if (!this.config.autoPurgeEnabled) {
      console.log('Auto retention is disabled');
      return;
    }

    try {
      const purgedCount = await this.purgeExpiredRecords();
      console.log(`Auto retention completed: purged ${purgedCount} expired records`);
    } catch (error) {
      console.error('Auto retention failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * List all sources with record counts
   */
  async listSources(): Promise<Array<{ source: string; count: number; oldest: Date; newest: Date }>> {
    try {
      const sources = await prisma.rawData.groupBy({
        by: ['source'],
        _count: {
          _all: true,
        },
        _min: {
          createdAt: true,
        },
        _max: {
          createdAt: true,
        },
        orderBy: { _count: { _all: 'desc' } },
      });

      return sources.map(s => ({
        source: s.source,
        count: s._count._all,
        oldest: s._min.createdAt!,
        newest: s._max.createdAt!,
      }));
    } catch (error) {
      console.error('Error listing sources:', error);
      throw error;
    }
  }

  /**
   * Check if a record exists
   */
  async recordExists(id: string): Promise<boolean> {
    try {
      const count = await prisma.rawData.count({
        where: { id },
      });
      return count > 0;
    } catch (error) {
      console.error('Error checking record existence:', error);
      return false;
    }
  }

  /**
   * Get record metadata without decryption
   */
  async getRecordMetadata(id: string): Promise<{
    id: string;
    source: string;
    externalId: string;
    metadata: Record<string, any>;
    createdAt: Date;
    expiresAt: Date;
    size: number;
  } | null> {
    try {
      const record = await prisma.rawData.findUnique({
        where: { id },
        select: {
          id: true,
          source: true,
          externalId: true,
          metadata: true,
          createdAt: true,
          expiresAt: true,
          encryptedData: true,
        },
      });

      if (!record) {
        return null;
      }

      return {
        id: record.id,
        source: record.source,
        externalId: record.externalId,
        metadata: record.metadata,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        size: record.encryptedData.length,
      };
    } catch (error) {
      console.error('Error getting record metadata:', error);
      throw error;
    }
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING SYSTEMS
// ============================================================================

/**
 * Integration wrapper for storing conversation data
 */
class ConversationStorageIntegration {
  private storageService: EncryptedStorageService;

  constructor() {
    this.storageService = EncryptedStorageService.getInstance();
  }

  /**
   * Store conversation transcript with encryption
   */
  async storeConversationTranscript(
    source: string,
    externalId: string,
    transcript: any,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    return this.storageService.storeRawData(
      source,
      externalId,
      transcript,
      {
        ...metadata,
        type: 'conversation_transcript',
        storedAt: new Date().toISOString(),
      }
    );
  }

  /**
   * Store Slack message history
   */
  async storeSlackHistory(
    workspaceId: string,
    channelId: string,
    messages: any[],
    metadata: Record<string, any> = {}
  ): Promise<string> {
    return this.storageService.storeRawData(
      'slack',
      `${workspaceId}:${channelId}`,
      messages,
      {
        ...metadata,
        type: 'slack_history',
        workspaceId,
        channelId,
        messageCount: messages.length,
      }
    );
  }

  /**
   * Store Zoom meeting data
   */
  async storeZoomMeetingData(
    meetingId: string,
    meetingData: any,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    return this.storageService.storeRawData(
      'zoom',
      meetingId,
      meetingData,
      {
        ...metadata,
        type: 'zoom_meeting',
        meetingId,
      }
    );
  }

  /**
   * Retrieve conversation transcript
   */
  async retrieveConversationTranscript(
    source: string,
    externalId: string
  ): Promise<any> {
    return this.storageService.retrieveRawDataBySource(source, externalId);
  }
}

export { EncryptedStorageService, ConversationStorageIntegration };
