const fs = require('fs-extra');
const path = require('path');
const csv = require('csv-parser');
const { Transform } = require('stream');

class BGGDataProcessor {
  constructor(database, config) {
    this.database = database;
    this.config = config;
  }

  /**
   * Process extracted CSV file and update MongoDB
   * @param {string} csvPath - Path to the extracted CSV file
   */
  async processCsvFile(csvPath) {
    const fileName = path.basename(csvPath);
    console.log(`🔄 Processing BGG data file: ${fileName}`);

    if (!fileName.includes('boardgames_ranks')) {
      throw new Error('Only boardgames_ranks.csv is supported.');
    }

    // Create indexes first for optimal performance
    await this.database.createIndexes();

    const gamesCollection = this.database.getCollection(this.config.processing.collections.games);
    const searchCollection = this.database.getCollection(this.config.processing.collections.search);
    const isLocalhost = this.database.connectionString.includes('localhost') || this.database.connectionString.includes('127.0.0.1');
    const batchSize = isLocalhost ? 500 : 1000;
    
    // Collect all records first
    const allRecords = [];
    let checked = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            const gameDoc = {
              id: parseInt(row.id),
              name: row.name,
              year_published: parseInt(row.yearpublished),
              rank: parseInt(row.rank),
              bayes_average: parseFloat(row.bayesaverage),
              average: parseFloat(row.average),
              users_rated: parseInt(row.usersrated),
              is_expansion: row.is_expansion === '1' || row.is_expansion === 1,
              abstracts_rank: row.abstracts_rank ? parseInt(row.abstracts_rank) : undefined
            };
            
            // Clean up undefined/null values
            Object.keys(gameDoc).forEach(key => {
              if (gameDoc[key] === undefined || gameDoc[key] === null || (typeof gameDoc[key] === 'number' && isNaN(gameDoc[key]))) {
                delete gameDoc[key];
              }
            });
            
            if (gameDoc.name && gameDoc.id) {
              allRecords.push(gameDoc);
            }
            checked++;
          } catch (error) {
            console.error('Error processing row:', error);
          }
        })
        .on('end', async () => {
          try {
            console.log(`📋 Collected ${allRecords.length} records, checking for changes...`);
            
            // Get existing games with their current data for comparison
            console.log(`🔍 Loading existing games for change detection...`);
            const existingGamesMap = new Map();
            const existingGames = await gamesCollection.find({}).toArray();
            existingGames.forEach(game => {
              existingGamesMap.set(game.id, game);
            });
            console.log(`📊 Found ${existingGamesMap.size.toLocaleString()} existing games in database`);
            
            // Analyze changes
            const changesAnalysis = this.analyzeChanges(allRecords, existingGamesMap);
            
            console.log(`\n📊 === Change Analysis ===`);
            console.log(`🆕 New games to add: ${changesAnalysis.newGames.length.toLocaleString()}`);
            console.log(`🔄 Games with changes: ${changesAnalysis.updatedGames.length.toLocaleString()}`);
            console.log(`✅ Games unchanged: ${changesAnalysis.unchangedCount.toLocaleString()}`);
            
            const hasChanges = changesAnalysis.newGames.length > 0 || changesAnalysis.updatedGames.length > 0;
            
            if (!hasChanges) {
              console.log(`\n📝 No changes detected - database is already up to date!`);
              console.log(`🔤 Data remains sorted alphabetically (A-Z) by name`);
              resolve({ 
                totalProcessed: 0, 
                newGamesCount: 0, 
                updatedGamesCount: 0,
                noChanges: true 
              });
              return;
            }

            // Only process games that have changes
            const gamesToProcess = [...changesAnalysis.newGames, ...changesAnalysis.updatedGames];
            
            console.log(`\n🔄 Processing ${gamesToProcess.length.toLocaleString()} games with changes...`);
            
            // Sort only the games that need processing
            gamesToProcess.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            console.log(`🔤 Sorted changed games alphabetically for insertion...`);
            
            let gamesBatch = [];
            let searchBatch = [];
            let totalProcessed = 0;
            const currentTimestamp = new Date();
            
            for (const gameDoc of gamesToProcess) {
              const isNewGame = !existingGamesMap.has(gameDoc.id);
              
              // Add timestamps - only update date_updated for actual changes
              const gameDocWithTimestamps = {
                ...gameDoc,
                date_updated: currentTimestamp
              };

              gamesBatch.push({
                updateOne: {
                  filter: { id: gameDoc.id },
                  update: { 
                    $set: gameDocWithTimestamps,
                    $setOnInsert: { date_created: currentTimestamp }
                  },
                  upsert: true
                }
              });
              
              searchBatch.push({
                updateOne: {
                  filter: { id: gameDoc.id },
                  update: { 
                    $set: { 
                      id: gameDoc.id, 
                      name: gameDoc.name,
                      date_updated: currentTimestamp
                    },
                    $setOnInsert: { date_created: currentTimestamp }
                  },
                  upsert: true
                }
              });

              if (gamesBatch.length >= batchSize) {
                try {
                  await this.database.ensureConnection();
                  
                  await gamesCollection.bulkWrite(gamesBatch, { 
                    ordered: true,
                    writeConcern: { w: 1, j: false }
                  });
                  await searchCollection.bulkWrite(searchBatch, { 
                    ordered: true,
                    writeConcern: { w: 1, j: false }
                  });
                  
                  totalProcessed += gamesBatch.length;
                  gamesBatch = [];
                  searchBatch = [];
                  console.log(`📊 Processed ${totalProcessed} changed records...`);
                } catch (error) {
                  console.error('❌ Batch write failed, retrying...', error.message);
                  try {
                    await this.database.ensureConnection();
                    await gamesCollection.bulkWrite(gamesBatch, { ordered: true });
                    await searchCollection.bulkWrite(searchBatch, { ordered: true });
                    totalProcessed += gamesBatch.length;
                    gamesBatch = [];
                    searchBatch = [];
                    console.log(`📊 Retry successful: ${totalProcessed} processed`);
                  } catch (retryError) {
                    console.error('❌ Retry failed:', retryError.message);
                    reject(retryError);
                    return;
                  }
                }
              }
            }

            // Process remaining records
            if (gamesBatch.length > 0) {
              await this.database.ensureConnection();
              await gamesCollection.bulkWrite(gamesBatch, { ordered: true });
              await searchCollection.bulkWrite(searchBatch, { ordered: true });
              totalProcessed += gamesBatch.length;
            }
            
            // Re-sort entire collection only if there were changes
            console.log(`\n🔤 Re-sorting entire collection alphabetically due to changes...`);
            await this.resortCollection(gamesCollection, 'board_games');
            await this.resortCollection(searchCollection, 'games_search');
            
            // Display comprehensive results
            console.log(`\n✅ === Processing Complete ===`);
            console.log(`📊 Total records in CSV: ${checked.toLocaleString()}`);
            console.log(`📊 Records with changes: ${totalProcessed.toLocaleString()}`);
            console.log(`🆕 New games added: ${changesAnalysis.newGames.length.toLocaleString()}`);
            console.log(`🔄 Existing games updated: ${changesAnalysis.updatedGames.length.toLocaleString()}`);
            console.log(`✅ Games unchanged: ${changesAnalysis.unchangedCount.toLocaleString()}`);
            
            // Show new games added
            if (changesAnalysis.newGames.length > 0) {
              console.log(`\n🎮 === New Games Added ===`);
              if (changesAnalysis.newGames.length <= 20) {
                changesAnalysis.newGames.forEach((game, index) => {
                  console.log(`   ${index + 1}. ${game.name} (ID: ${game.id}, Rank: ${game.rank || 'N/A'})`);
                });
              } else {
                console.log(`   First 10 new games:`);
                changesAnalysis.newGames.slice(0, 10).forEach((game, index) => {
                  console.log(`   ${index + 1}. ${game.name} (ID: ${game.id}, Rank: ${game.rank || 'N/A'})`);
                });
                console.log(`   ... and ${changesAnalysis.newGames.length - 20} more games ...`);
                console.log(`   Last 10 new games:`);
                changesAnalysis.newGames.slice(-10).forEach((game, index) => {
                  const actualIndex = changesAnalysis.newGames.length - 10 + index + 1;
                  console.log(`   ${actualIndex}. ${game.name} (ID: ${game.id}, Rank: ${game.rank || 'N/A'})`);
                });
              }
            }
            
            console.log(`\n🔤 Collection re-sorted alphabetically (A-Z) by name`);
            resolve({ 
              totalProcessed, 
              newGamesCount: changesAnalysis.newGames.length, 
              updatedGamesCount: changesAnalysis.updatedGames.length 
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  /**
   * Analyze what games are new, updated, or unchanged
   */
  analyzeChanges(newRecords, existingGamesMap) {
    const newGames = [];
    const updatedGames = [];
    let unchangedCount = 0;

    for (const newGame of newRecords) {
      const existingGame = existingGamesMap.get(newGame.id);
      
      if (!existingGame) {
        // New game
        newGames.push(newGame);
      } else {
        // Check if any field has changed (excluding timestamps)
        const hasChanges = this.hasGameDataChanged(newGame, existingGame);
        
        if (hasChanges) {
          updatedGames.push(newGame);
        } else {
          unchangedCount++;
        }
      }
    }

    return { newGames, updatedGames, unchangedCount };
  }

  /**
   * Check if game data has actually changed
   */
  hasGameDataChanged(newGame, existingGame) {
    const fieldsToCompare = [
      'name', 'year_published', 'rank', 'bayes_average', 
      'average', 'users_rated', 'is_expansion', 'abstracts_rank'
    ];

    for (const field of fieldsToCompare) {
      const newValue = newGame[field];
      const existingValue = existingGame[field];
      
      // Handle undefined/null comparisons
      if (newValue !== existingValue) {
        // Special handling for numbers that might be NaN or undefined
        if (typeof newValue === 'number' && typeof existingValue === 'number') {
          if (isNaN(newValue) && isNaN(existingValue)) continue;
          if (Math.abs(newValue - existingValue) > 0.001) return true;
        } else {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Re-sort entire collection alphabetically
   */
  async resortCollection(collection, collectionName) {
    try {
      console.log(`   🔤 Sorting ${collectionName} collection...`);
      
      // Get all documents
      const allDocs = await collection.find({}).toArray();
      if (allDocs.length === 0) return;
      
      // Sort by name
      allDocs.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });

      // Create temporary collection
      const tempCollectionName = `${collectionName}_temp_${Date.now()}`;
      const tempCollection = this.database.getCollection(tempCollectionName);
      
      // Insert sorted documents
      const batchSize = 1000;
      for (let i = 0; i < allDocs.length; i += batchSize) {
        const batch = allDocs.slice(i, i + batchSize);
        const cleanBatch = batch.map(doc => {
          const { _id, ...cleanDoc } = doc;
          return cleanDoc;
        });
        await tempCollection.insertMany(cleanBatch, { ordered: true });
      }
      
      // Replace original collection
      await collection.deleteMany({});
      const sortedDocs = await tempCollection.find({}).toArray();
      
      for (let i = 0; i < sortedDocs.length; i += batchSize) {
        const batch = sortedDocs.slice(i, i + batchSize);
        const cleanBatch = batch.map(doc => {
          const { _id, ...cleanDoc } = doc;
          return cleanDoc;
        });
        await collection.insertMany(cleanBatch, { ordered: true });
      }
      
      // Clean up temp collection
      await this.database.getDb().collection(tempCollectionName).drop();
      
      console.log(`   ✅ ${collectionName} sorted successfully`);
      
    } catch (error) {
      console.error(`   ❌ Failed to sort ${collectionName}:`, error.message);
    }
  }

  async updateMetadata(fileName, recordCount) {
    try {
      const collection = this.database.getCollection(this.config.processing.collections.metadata);
      await collection.updateOne(
        { fileName },
        {
          $set: {
            fileName,
            recordCount,
            lastProcessed: new Date(),
            source: 'bgg_data_dump'
          }
        },
        { upsert: true }
      );
      console.log(`📝 Updated metadata for ${fileName}: ${recordCount} records`);
    } catch (error) {
      console.error('Error updating metadata:', error);
    }
  }
}

module.exports = BGGDataProcessor; 