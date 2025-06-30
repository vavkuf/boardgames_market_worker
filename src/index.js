const DataFetchJob = require('./jobs/dataFetchJob');
const Database = require('./utils/database');
const path = require('path');
const fs = require('fs-extra');

class BGMarketWorker {
  constructor() {
    this.database = new Database();
    this.jobs = [];
    this.isShuttingDown = false;
  }

  /**
   * Initialize the worker
   */
  async initialize() {
    try {
      console.log('🚀 Starting BG Market Worker...');
      
      // Connect to database
      await this.database.connect();
      
      // Setup data fetch job
      await this.setupDataFetchJob();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      console.log('✅ BG Market Worker initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize worker:', error);
      process.exit(1);
    }
  }

  /**
   * Setup the data fetch job
   */
  async setupDataFetchJob() {
    const dataFetchJob = new DataFetchJob({
      url: process.env.DATA_SOURCE_URL,
      schedule: process.env.CRON_SCHEDULE || '0 */6 * * *', // Every 6 hours
      dataDir: './data',
      onSuccess: async (csvPath) => {
        await this.handleJobSuccess(csvPath);
      },
      onError: async (error) => {
        await this.handleJobError(error);
      }
    });

    this.jobs.push(dataFetchJob);
    
    // Start the job
    dataFetchJob.start();
    
    console.log(`📅 Data fetch job scheduled: ${dataFetchJob.getStatus().schedule}`);
    
    // Run immediately if requested
    if (process.env.RUN_IMMEDIATELY === 'true') {
      console.log('🏃 Running data fetch job immediately...');
      try {
        await dataFetchJob.runNow();
      } catch (error) {
        console.error('Failed to run job immediately:', error);
      }
    }
  }

  /**
   * Handle successful job execution
   * @param {string} csvPath - Path to the extracted CSV file
   */
  async handleJobSuccess(csvPath) {
    try {
      // Get file stats
      const stats = await fs.stat(csvPath);
      const fileName = path.basename(csvPath);
      
      // Store metadata in database
      const metadata = await this.database.storeCsvMetadata({
        fileName,
        filePath: csvPath,
        fileSize: stats.size,
        lastModified: stats.mtime,
        jobType: 'data_fetch',
        status: 'success'
      });

      // Log job execution
      await this.database.logJobExecution({
        jobType: 'data_fetch',
        status: 'success',
        csvPath,
        fileName,
        fileSize: stats.size,
        executionTime: new Date()
      });

      // Update job status
      await this.database.updateJobStatus('data_fetch', 'completed', {
        lastCsvFile: fileName,
        lastExecutionTime: new Date()
      });

      console.log(`✅ Job completed successfully. CSV: ${fileName} (${stats.size} bytes)`);
      
    } catch (error) {
      console.error('Error handling job success:', error);
    }
  }

  /**
   * Handle job execution error
   * @param {Error} error - The error that occurred
   */
  async handleJobError(error) {
    try {
      // Log job execution error
      await this.database.logJobExecution({
        jobType: 'data_fetch',
        status: 'error',
        error: error.message,
        stack: error.stack,
        executionTime: new Date()
      });

      // Update job status
      await this.database.updateJobStatus('data_fetch', 'failed', {
        lastError: error.message,
        lastErrorTime: new Date()
      });

      console.error(`❌ Job failed: ${error.message}`);
      
    } catch (dbError) {
      console.error('Error handling job error:', dbError);
    }
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      this.isShuttingDown = true;

      try {
        // Stop all jobs
        for (const job of this.jobs) {
          if (job.stop) {
            job.stop();
          }
        }

        // Disconnect from database
        await this.database.disconnect();

        console.log('✅ Worker shut down gracefully');
        process.exit(0);
        
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: !this.isShuttingDown,
      databaseConnected: this.database.isConnected(),
      jobs: this.jobs.map(job => job.getStatus ? job.getStatus() : { status: 'unknown' }),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Health check endpoint (for potential future HTTP server)
   */
  async healthCheck() {
    const status = this.getStatus();
    
    return {
      status: status.isRunning && status.databaseConnected ? 'healthy' : 'unhealthy',
      ...status,
      timestamp: new Date().toISOString()
    };
  }
}

// Create and start the worker
const worker = new BGMarketWorker();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Initialize the worker
worker.initialize().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});

module.exports = BGMarketWorker; 