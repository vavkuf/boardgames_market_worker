#!/usr/bin/env node

/**
 * Sort Existing Data Script
 * Sorts currently stored board game data alphabetically by name
 */

const Database = require('../src/utils/database');
const bggConfig = require('../config/bgg-config');

class DataSorter {
  constructor() {
    this.database = new Database();
  }

  async initialize() {
    try {
      console.log('🔧 Initializing Data Sorter...');
      console.log(`📡 Database: ${bggConfig.database.uri}/${bggConfig.database.name}`);

      this.database.connectionString = bggConfig.database.uri;
      this.database.databaseName = bggConfig.database.name;
      
      await this.database.connect();
      console.log('✅ Data Sorter initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Data Sorter:', error);
      process.exit(1);
    }
  }

  async sortExistingData() {
    try {
      console.log('\n🚀 === Starting data sorting process ===');

      const gamesCollection = this.database.getCollection(bggConfig.processing.collections.games);
      const searchCollection = this.database.getCollection(bggConfig.processing.collections.search);

      // Step 1: Create indexes for optimal performance
      console.log('\n📊 Step 1: Creating indexes...');
      await this.database.createIndexes();

      // Step 2: Get current data counts
      const gamesCount = await gamesCollection.countDocuments();
      const searchCount = await searchCollection.countDocuments();
      
      console.log(`\n📋 Current data counts:`);
      console.log(`   🎲 Board games: ${gamesCount.toLocaleString()}`);
      console.log(`   🔎 Search entries: ${searchCount.toLocaleString()}`);

      if (gamesCount === 0) {
        console.log('❌ No data found to sort!');
        return;
      }

      // Step 3: Sort board_games collection
      console.log('\n🔤 Step 2: Sorting board_games collection...');
      await this.sortCollection(gamesCollection, 'board_games');

      // Step 4: Sort games_search collection
      console.log('\n🔍 Step 3: Sorting games_search collection...');
      await this.sortCollection(searchCollection, 'games_search');

      console.log('\n✅ === Data sorting completed successfully ===');
      
      // Show sample of sorted data
      await this.showSortedSample();

    } catch (error) {
      console.error('\n❌ Data sorting failed:', error.message);
      throw error;
    }
  }

  async sortCollection(collection, collectionName) {
    try {
      console.log(`   📤 Reading all ${collectionName} data...`);
      
      // Read all data
      const allData = await collection.find({}).toArray();
      console.log(`   📋 Found ${allData.length.toLocaleString()} records`);

      if (allData.length === 0) {
        console.log(`   ⚠️  No data in ${collectionName} to sort`);
        return;
      }

      // Sort by name (case-insensitive, A-Z)
      console.log(`   🔤 Sorting ${allData.length.toLocaleString()} records by name...`);
      allData.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });

      // Create backup collection name
      const backupCollectionName = `${collectionName}_backup_${Date.now()}`;
      
      // Step 1: Create backup
      console.log(`   💾 Creating backup: ${backupCollectionName}`);
      const backupCollection = this.database.getCollection(backupCollectionName);
      
      if (allData.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < allData.length; i += batchSize) {
          const batch = allData.slice(i, i + batchSize);
          await backupCollection.insertMany(batch, { ordered: false });
        }
      }

      // Step 2: Clear original collection
      console.log(`   🗑️  Clearing original ${collectionName} collection...`);
      await collection.deleteMany({});

      // Step 3: Insert sorted data
      console.log(`   📥 Inserting sorted data back to ${collectionName}...`);
      const batchSize = 1000;
      let inserted = 0;

      for (let i = 0; i < allData.length; i += batchSize) {
        const batch = allData.slice(i, i + batchSize);
        
        // Remove _id field to avoid conflicts
        const cleanBatch = batch.map(doc => {
          const { _id, ...cleanDoc } = doc;
          return cleanDoc;
        });

        await collection.insertMany(cleanBatch, { ordered: true });
        inserted += cleanBatch.length;
        
        if (i % (batchSize * 10) === 0) {
          console.log(`   📊 Inserted ${inserted.toLocaleString()} / ${allData.length.toLocaleString()} records...`);
        }
      }

      console.log(`   ✅ ${collectionName} sorted successfully! ${inserted.toLocaleString()} records`);
      console.log(`   💾 Backup available at: ${backupCollectionName}`);

    } catch (error) {
      console.error(`   ❌ Failed to sort ${collectionName}:`, error.message);
      throw error;
    }
  }

  async showSortedSample() {
    try {
      console.log('\n📊 === Sorted Data Sample ===');

      const gamesCollection = this.database.getCollection(bggConfig.processing.collections.games);
      
      console.log('\n🔤 First 10 games (alphabetically):');
      const firstGames = await gamesCollection.find({})
        .sort({ name: 1 })
        .limit(10)
        .toArray();

      firstGames.forEach((game, index) => {
        console.log(`   ${index + 1}. ${game.name} (${game.year_published || 'N/A'}) - Rank: ${game.rank || 'N/A'}`);
      });

      console.log('\n🔤 Last 10 games (alphabetically):');
      const lastGames = await gamesCollection.find({})
        .sort({ name: -1 })
        .limit(10)
        .toArray();

      const totalCount = await gamesCollection.countDocuments();
      lastGames.reverse().forEach((game, index) => {
        const totalIndex = totalCount - 10 + index + 1;
        console.log(`   ${totalIndex}. ${game.name} (${game.year_published || 'N/A'}) - Rank: ${game.rank || 'N/A'}`);
      });

    } catch (error) {
      console.error('Error showing sorted sample:', error);
    }
  }

  async cleanup() {
    try {
      console.log('\n🧹 Cleanup options:');
      console.log('   To remove backup collections later, run:');
      console.log('   mongo bg_market --eval "db.getCollectionNames().filter(n=>n.includes(\'_backup_\')).forEach(n=>db[n].drop())"');
    } catch (error) {
      console.error('Error in cleanup:', error);
    }
  }

  async disconnect() {
    await this.database.disconnect();
    console.log('\n👋 Disconnected from database');
  }
}

async function main() {
  const sorter = new DataSorter();
  
  try {
    await sorter.initialize();
    await sorter.sortExistingData();
    await sorter.cleanup();
    
    console.log('\n🎉 Data sorting completed successfully!');
    console.log('\n💡 Your collections are now sorted alphabetically (A-Z) by name');
    console.log('   Query examples:');
    console.log('   mongo bg_market --eval "db.board_games.find().limit(5).pretty()"');
    console.log('   mongo bg_market --eval "db.games_search.find().limit(5).pretty()"');
    
  } catch (error) {
    console.error('\n💥 Sorting failed:', error.message);
    process.exit(1);
  } finally {
    await sorter.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

main(); 