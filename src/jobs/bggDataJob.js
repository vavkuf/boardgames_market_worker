const cron = require('node-cron');
const FileExtractor = require('../utils/fileExtractor');
const BGGDataProcessor = require('../processors/bggDataProcessor');
const bggConfig = require('../../config/bgg-config');

class BGGDataJob {
  constructor(database, config = {}) {
    this.database = database;
    this.config = {
      ...bggConfig,
      ...config
    };
    
    this.extractor = new FileExtractor('./data');
    this.processor = new BGGDataProcessor(database, this.config);
    this.job = null;
  }

  /**
   * Start the BGG data fetch job
   */
  start() {
    if (!this.config.dataSource.url || this.config.dataSource.url.includes('DOWNLOAD_LINK')) {
      throw new Error('BGG data source URL is not configured. Please update config/bgg-config.js with the actual download URL.');
    }

    this.extractor.log(`🎲 Starting BGG data fetch job with schedule: ${this.config.schedule.cron}`);
    this.extractor.log(`📡 BGG data source URL: ${this.config.dataSource.url}`);

    this.job = cron.schedule(this.config.schedule.cron, async () => {
      await this.executeJob();
    }, {
      scheduled: false,
      timezone: this.config.schedule.timezone || "UTC"
    });

    this.job.start();
    this.extractor.log('✅ BGG data fetch job started successfully');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.extractor.log('🛑 BGG data fetch job stopped');
    }
  }

  /**
   * Execute the BGG data job
   */
  async executeJob() {
    try {
      this.extractor.log('🚀 === Starting BGG data fetch job execution ===');
      
      // Step 1: Get a valid download URL (refresh if expired)
      const downloadUrl = await this.urlFetcher.getValidDownloadUrl(this.config.dataSource.url);
      
      // Step 2: Download and extract the file
      const csvPath = await this.extractor.downloadAndExtract(downloadUrl);
      this.extractor.log(`📁 CSV extracted to: ${csvPath}`);
      
      // Step 3: Process the CSV data and update MongoDB
      await this.processor.processCsvFile(csvPath);
      
      // Step 4: Update job status in database
      await this.database.updateJobStatus('bgg_data_fetch', 'completed', {
        lastCsvFile: csvPath,
        lastExecutionTime: new Date(),
        dataSource: 'boardgamegeek'
      });

      // Step 5: Log successful execution
      await this.database.logJobExecution({
        jobType: 'bgg_data_fetch',
        status: 'success',
        csvPath,
        dataSource: 'boardgamegeek',
        executionTime: new Date()
      });

      this.extractor.log('✅ === BGG data fetch job execution completed successfully ===');
      
      return csvPath;
      
    } catch (error) {
      this.extractor.log(`❌ BGG data job failed: ${error.message}`);
      
      // Log error to database
      await this.database.logJobExecution({
        jobType: 'bgg_data_fetch',
        status: 'error',
        error: error.message,
        stack: error.stack,
        dataSource: 'boardgamegeek',
        executionTime: new Date()
      });

      // Update job status
      await this.database.updateJobStatus('bgg_data_fetch', 'failed', {
        lastError: error.message,
        lastErrorTime: new Date()
      });

      this.extractor.log('❌ === BGG data fetch job execution failed ===');
      throw error;
    }
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      jobType: 'bgg_data_fetch',
      isRunning: this.job ? this.job.running : false,
      schedule: this.config.schedule.cron,
      url: this.config.dataSource.url,
      dataDir: './data',
      expectedFiles: this.config.processing.expectedFiles,
      collections: this.config.processing.collections
    };
  }

  /**
   * Run job immediately (for testing)
   */
  async runNow() {
    this.extractor.log('🏃 Running BGG data fetch job immediately...');
    return await this.executeJob();
  }

  /**
   * Get BGG data statistics from database
   */
  async getDataStats() {
    try {
      const stats = {};
      
      // Get game count
      const gamesCollection = this.database.getCollection(this.config.processing.collections.games);
      stats.totalGames = await gamesCollection.countDocuments();
      
      // Get rankings count
      const rankingsCollection = this.database.getCollection(this.config.processing.collections.rankings);
      stats.totalRankings = await rankingsCollection.countDocuments();
      
      // Get last update info
      const metadataCollection = this.database.getCollection(this.config.processing.collections.metadata);
      const lastUpdate = await metadataCollection.findOne({}, { sort: { lastProcessed: -1 } });
      stats.lastUpdate = lastUpdate ? lastUpdate.lastProcessed : null;
      
      return stats;
    } catch (error) {
      console.error('Error getting BGG data stats:', error);
      return { error: error.message };
    }
  }

  /**
   * Search games in the database
   * @param {string} query - Search query
   * @param {number} limit - Result limit
   */
  async searchGames(query, limit = 10) {
    try {
      const collection = this.database.getCollection(this.config.processing.collections.games);
      
      const results = await collection.find({
        name: { $regex: query, $options: 'i' }
      })
      .limit(limit)
      .toArray();
      
      return results;
    } catch (error) {
      console.error('Error searching games:', error);
      return [];
    }
  }

  /**
   * Get top ranked games
   * @param {number} limit - Number of top games to return
   */
  async getTopGames(limit = 100) {
    try {
      const collection = this.database.getCollection(this.config.processing.collections.rankings);
      
      const results = await collection.find({
        rank: { $exists: true, $ne: null }
      })
      .sort({ rank: 1 })
      .limit(limit)
      .toArray();
      
      return results;
    } catch (error) {
      console.error('Error getting top games:', error);
      return [];
    }
  }
}

module.exports = BGGDataJob; 