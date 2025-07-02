#!/usr/bin/env node

/**
 * Add Timestamps Script
 * Adds date_created and date_updated fields to existing documents
 */

const Database = require('../src/utils/database');
const bggConfig = require('../config/bgg-config');

class TimestampAdder {
  constructor() {
    this.database = new Database();
  }

  async initialize() {
    try {
      console.log('🕒 Initializing Timestamp Adder...');
      console.log(`📡 Database: ${bggConfig.database.uri}/${bggConfig.database.name}`);

      this.database.connectionString = bggConfig.database.uri;
      this.database.databaseName = bggConfig.database.name;
      
      await this.database.connect();
      console.log('✅ Timestamp Adder initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Timestamp Adder:', error);
      process.exit(1);
    }
  }

  async addTimestamps() {
    try {
      console.log('\n🚀 === Starting timestamp addition process ===');

      const gamesCollection = this.database.getCollection(bggConfig.processing.collections.games);
      const searchCollection = this.database.getCollection(bggConfig.processing.collections.search);

      // Get current data counts
      const gamesCount = await gamesCollection.countDocuments();
      const searchCount = await searchCollection.countDocuments();
      
      console.log(`\n📋 Current data counts:`);
      console.log(`   🎲 Board games: ${gamesCount.toLocaleString()}`);
      console.log(`   🔎 Search entries: ${searchCount.toLocaleString()}`);

      if (gamesCount === 0 && searchCount === 0) {
        console.log('❌ No data found to update!');
        return;
      }

      // Use current timestamp for both date_created and date_updated
      // Since this is existing data, we'll treat "now" as when it was first added to our database
      const currentTimestamp = new Date();

      // Step 1: Update board_games collection
      if (gamesCount > 0) {
        console.log('\n🎲 Step 1: Adding timestamps to board_games collection...');
        await this.addTimestampsToCollection(gamesCollection, 'board_games', currentTimestamp);
      }

      // Step 2: Update games_search collection
      if (searchCount > 0) {
        console.log('\n🔍 Step 2: Adding timestamps to games_search collection...');
        await this.addTimestampsToCollection(searchCollection, 'games_search', currentTimestamp);
      }

      console.log('\n✅ === Timestamp addition completed successfully ===');
      
      // Show sample of updated data
      await this.showSampleWithTimestamps();

    } catch (error) {
      console.error('\n❌ Timestamp addition failed:', error.message);
      throw error;
    }
  }

  async addTimestampsToCollection(collection, collectionName, timestamp) {
    try {
      console.log(`   ⏰ Adding timestamps to ${collectionName}...`);
      
      // Count documents that need updating (don't have timestamps)
      const documentsWithoutTimestamps = await collection.countDocuments({
        $or: [
          { date_created: { $exists: false } },
          { date_updated: { $exists: false } }
        ]
      });

      console.log(`   📊 Documents needing timestamps: ${documentsWithoutTimestamps.toLocaleString()}`);

      if (documentsWithoutTimestamps === 0) {
        console.log(`   ✅ All documents in ${collectionName} already have timestamps`);
        return;
      }

      // Update all documents that don't have timestamps
      const updateResult = await collection.updateMany(
        {
          $or: [
            { date_created: { $exists: false } },
            { date_updated: { $exists: false } }
          ]
        },
        {
          $set: {
            date_created: timestamp,
            date_updated: timestamp
          }
        }
      );

      console.log(`   ✅ ${collectionName} updated successfully!`);
      console.log(`   📊 Documents modified: ${updateResult.modifiedCount.toLocaleString()}`);
      console.log(`   📊 Documents matched: ${updateResult.matchedCount.toLocaleString()}`);

    } catch (error) {
      console.error(`   ❌ Failed to add timestamps to ${collectionName}:`, error.message);
      throw error;
    }
  }

  async showSampleWithTimestamps() {
    try {
      console.log('\n📊 === Sample Data with Timestamps ===');

      const gamesCollection = this.database.getCollection(bggConfig.processing.collections.games);
      
      console.log('\n🎲 Sample board_games with timestamps:');
      const sampleGames = await gamesCollection.find({})
        .limit(3)
        .toArray();

      sampleGames.forEach((game, index) => {
        console.log(`   ${index + 1}. ${game.name}`);
        console.log(`      📅 Created: ${game.date_created ? game.date_created.toISOString() : 'N/A'}`);
        console.log(`      🔄 Updated: ${game.date_updated ? game.date_updated.toISOString() : 'N/A'}`);
        console.log(`      🏆 Rank: ${game.rank || 'N/A'}`);
        console.log('');
      });

      const searchCollection = this.database.getCollection(bggConfig.processing.collections.search);
      
      console.log('🔍 Sample games_search with timestamps:');
      const sampleSearch = await searchCollection.find({})
        .limit(3)
        .toArray();

      sampleSearch.forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.name} (ID: ${entry.id})`);
        console.log(`      📅 Created: ${entry.date_created ? entry.date_created.toISOString() : 'N/A'}`);
        console.log(`      🔄 Updated: ${entry.date_updated ? entry.date_updated.toISOString() : 'N/A'}`);
        console.log('');
      });

    } catch (error) {
      console.error('Error showing sample data:', error);
    }
  }

  async createIndexes() {
    try {
      console.log('\n📊 Creating indexes for timestamp fields...');
      
      const gamesCollection = this.database.getCollection(bggConfig.processing.collections.games);
      const searchCollection = this.database.getCollection(bggConfig.processing.collections.search);

      // Create indexes for timestamp fields
      await gamesCollection.createIndex({ date_created: 1 }, { name: 'date_created_asc' });
      await gamesCollection.createIndex({ date_updated: 1 }, { name: 'date_updated_asc' });
      
      await searchCollection.createIndex({ date_created: 1 }, { name: 'date_created_asc' });
      await searchCollection.createIndex({ date_updated: 1 }, { name: 'date_updated_asc' });

      console.log('✅ Timestamp indexes created successfully');
      
    } catch (error) {
      console.error('❌ Failed to create timestamp indexes:', error);
    }
  }

  async disconnect() {
    await this.database.disconnect();
    console.log('\n👋 Disconnected from database');
  }
}

async function main() {
  const adder = new TimestampAdder();
  
  try {
    await adder.initialize();
    await adder.addTimestamps();
    await adder.createIndexes();
    
    console.log('\n🎉 Timestamp addition completed successfully!');
    console.log('\n💡 All your documents now have date_created and date_updated fields');
    console.log('   Query examples:');
    console.log('   mongo bg_market --eval "db.board_games.find({}, {name:1, date_created:1, date_updated:1}).limit(3).pretty()"');
    console.log('   mongo bg_market --eval "db.games_search.find({}, {name:1, date_created:1, date_updated:1}).limit(3).pretty()"');
    
  } catch (error) {
    console.error('\n💥 Timestamp addition failed:', error.message);
    process.exit(1);
  } finally {
    await adder.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

main(); 