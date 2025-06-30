#!/usr/bin/env node

/**
 * BGG Data Worker
 * Processes all BGG data and saves to MongoDB
 */

const Database = require('../src/utils/database');
const FileExtractor = require('../src/utils/fileExtractor');
const BGGDataProcessor = require('../src/processors/bggDataProcessor');
const bggConfig = require('../config/bgg-config');
const path = require('path');

class SimpleBGGWorker {
  constructor() {
    this.database = new Database();
    this.processor = null;
  }

  async initialize() {
    try {
      console.log('🎲 Starting Simple BGG Worker...');
      console.log(`📡 Database: ${bggConfig.database.uri}/${bggConfig.database.name}`);

      this.database.connectionString = bggConfig.database.uri;
      this.database.databaseName = bggConfig.database.name;
      
      await this.database.connect();
      this.processor = new BGGDataProcessor(this.database, bggConfig);

      console.log('✅ Simple BGG Worker initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize BGG worker:', error);
      process.exit(1);
    }
  }

  async processAllData() {
    try {
      console.log('\n🚀 === Starting BGG data processing ===');

      const csvPath = path.join('data', 'boardgames_ranks.csv');

      console.log(`📄 Using local file: ${csvPath}`);
      console.log('\n🔄 Step 1: Processing CSV data...');

      const recordCount = await this.processor.processCsvFile(csvPath);

      console.log('\n📝 Step 2: Updating metadata...');

      await this.processor.updateMetadata('boardgames_ranks.csv', recordCount);
      await this.database.logJobExecution({
        jobType: 'bgg_data_fetch',
        status: 'success',
        csvPath,
        recordCount,
        executionTime: new Date()
      });

      console.log('\n✅ === BGG data processing completed successfully ===');

      await this.showStats();
      return csvPath;
    } catch (error) {
      console.error('\n❌ BGG data processing failed:', error.message);

      await this.database.logJobExecution({
        jobType: 'bgg_data_fetch',
        status: 'error',
        error: error.message,
        executionTime: new Date()
      });

      throw error;
    }
  }

  async showStats() {
    try {
      console.log('\n📊 === Final Statistics ===');

      const gamesCollection = this.database.getCollection(bggConfig.processing.collections.games);
      const searchCollection = this.database.getCollection(bggConfig.processing.collections.search);
      const gamesCount = await gamesCollection.countDocuments();
      const searchCount = await searchCollection.countDocuments();

      console.log(`🎲 Total games in database: ${gamesCount.toLocaleString()}`);
      console.log(`🔎 Total search entries: ${searchCount.toLocaleString()}`);
      
      if (gamesCount > 0) {
        const topGames = await gamesCollection.find({})
          .sort({ rank: 1 })
          .limit(10)
          .toArray();
        console.log('\n🏆 Top 10 Board Games:');
        topGames.forEach((game, index) => {
          console.log(`   ${game.rank}. ${game.name} (${game.year_published}) - Bayes Avg: ${game.bayes_average}`);
        });
      }
    } catch (error) {
      console.error('Error showing stats:', error);
    }
  }

  async disconnect() {
    await this.database.disconnect();
    console.log('\n👋 Disconnected from database');
  }
}

async function main() {
  const worker = new SimpleBGGWorker();
  try {
    await worker.initialize();
    await worker.processAllData();
    await worker.disconnect();
    console.log('\n🎉 All done! Your BGG data is now in MongoDB.');
    console.log('\n💡 You can query your data with:');
    console.log('   mongo bg_market');
    console.log('   db.board_games.find().limit(5).pretty()');
    console.log('   db.games_search.find().limit(5).pretty()');
  } catch (error) {
    console.error('\n💥 Worker failed:', error.message);
    await worker.disconnect();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

main(); 