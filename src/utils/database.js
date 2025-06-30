const { MongoClient } = require('mongodb');

class Database {
  constructor() {
    this.client = null;
    this.db = null;
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.databaseName = process.env.DATABASE_NAME || 'bg_market';
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    try {
      if (this.client && this.client.topology && this.client.topology.isConnected()) {
        return this.db;
      }

      console.log(`Connecting to MongoDB: ${this.connectionString}`);
      
      this.client = new MongoClient(this.connectionString, {
        useUnifiedTopology: true,
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 0,
        connectTimeoutMS: 30000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true
      });

      await this.client.connect();
      this.db = this.client.db(this.databaseName);
      
      console.log(`Connected to MongoDB database: ${this.databaseName}`);
      return this.db;
      
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('Disconnected from MongoDB');
    }
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Get collection
   * @param {string} collectionName - Name of the collection
   */
  getCollection(collectionName) {
    return this.getDb().collection(collectionName);
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.client && this.client.topology && this.client.topology.isConnected();
  }

  /**
   * Log job execution to database
   * @param {Object} jobData - Job execution data
   */
  async logJobExecution(jobData) {
    try {
      const collection = this.getCollection('job_logs');
      const logEntry = {
        ...jobData,
        timestamp: new Date(),
        createdAt: new Date()
      };
      
      await collection.insertOne(logEntry);
      console.log('Job execution logged to database');
      
    } catch (error) {
      console.error('Failed to log job execution:', error);
      // Don't throw error here to avoid breaking the main job
    }
  }

  /**
   * Update job status
   * @param {string} jobId - Job identifier
   * @param {string} status - Job status
   * @param {Object} additionalData - Additional data to store
   */
  async updateJobStatus(jobId, status, additionalData = {}) {
    try {
      const collection = this.getCollection('job_status');
      
      await collection.updateOne(
        { jobId },
        {
          $set: {
            status,
            updatedAt: new Date(),
            ...additionalData
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        },
        { upsert: true }
      );
      
      console.log(`Job status updated: ${jobId} -> ${status}`);
      
    } catch (error) {
      console.error('Failed to update job status:', error);
    }
  }

  /**
   * Store CSV data metadata
   * @param {Object} csvData - CSV file metadata
   */
  async storeCsvMetadata(csvData) {
    try {
      const collection = this.getCollection('csv_files');
      
      const metadata = {
        ...csvData,
        processedAt: new Date(),
        createdAt: new Date()
      };
      
      await collection.insertOne(metadata);
      console.log('CSV metadata stored in database');
      
      return metadata;
      
    } catch (error) {
      console.error('Failed to store CSV metadata:', error);
      throw error;
    }
  }

  /**
   * Get latest CSV file metadata
   */
  async getLatestCsvMetadata() {
    try {
      const collection = this.getCollection('csv_files');
      
      const latest = await collection
        .findOne({}, { sort: { processedAt: -1 } });
      
      return latest;
      
    } catch (error) {
      console.error('Failed to get latest CSV metadata:', error);
      throw error;
    }
  }

  /**
   * Ensure connection is healthy
   */
  async ensureConnection() {
    try {
      if (!this.isConnected()) {
        console.log('🔄 Reconnecting to database...');
        await this.connect();
      }
      // Ping to verify connection
      await this.db.admin().ping();
    } catch (error) {
      console.log('🔄 Connection lost, reconnecting...');
      await this.connect();
    }
  }
}

module.exports = Database; 