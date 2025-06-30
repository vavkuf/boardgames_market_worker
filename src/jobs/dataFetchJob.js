const cron = require('node-cron');
const FileExtractor = require('../utils/fileExtractor');

class DataFetchJob {
  constructor(config = {}) {
    this.config = {
      url: config.url || process.env.DATA_SOURCE_URL,
      schedule: config.schedule || '0 */6 * * *', // Every 6 hours by default
      dataDir: config.dataDir || './data',
      ...config
    };
    
    this.extractor = new FileExtractor(this.config.dataDir);
    this.job = null;
  }

  /**
   * Start the cron job
   */
  start() {
    if (!this.config.url) {
      throw new Error('Data source URL is required. Set DATA_SOURCE_URL environment variable or pass url in config.');
    }

    this.extractor.log(`Starting data fetch job with schedule: ${this.config.schedule}`);
    this.extractor.log(`Data source URL: ${this.config.url}`);

    this.job = cron.schedule(this.config.schedule, async () => {
      await this.executeJob();
    }, {
      scheduled: false,
      timezone: "UTC"
    });

    this.job.start();
    this.extractor.log('Data fetch job started successfully');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.extractor.log('Data fetch job stopped');
    }
  }

  /**
   * Execute the job manually
   */
  async executeJob() {
    try {
      this.extractor.log('=== Starting data fetch job execution ===');
      
      const csvPath = await this.extractor.downloadAndExtract(this.config.url);
      
      this.extractor.log(`Job completed successfully. CSV file available at: ${csvPath}`);
      this.extractor.log('=== Data fetch job execution completed ===');
      
      // Emit event for other parts of the application
      if (this.config.onSuccess) {
        await this.config.onSuccess(csvPath);
      }
      
      return csvPath;
      
    } catch (error) {
      this.extractor.log(`Job failed with error: ${error.message}`);
      this.extractor.log('=== Data fetch job execution failed ===');
      
      // Emit error event
      if (this.config.onError) {
        await this.config.onError(error);
      }
      
      throw error;
    }
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.job ? this.job.running : false,
      schedule: this.config.schedule,
      url: this.config.url,
      dataDir: this.config.dataDir
    };
  }

  /**
   * Run job immediately (for testing)
   */
  async runNow() {
    this.extractor.log('Running data fetch job immediately...');
    return await this.executeJob();
  }
}

module.exports = DataFetchJob; 