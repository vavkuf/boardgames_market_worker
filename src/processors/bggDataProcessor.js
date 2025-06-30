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

    const gamesCollection = this.database.getCollection(this.config.processing.collections.games);
    const searchCollection = this.database.getCollection(this.config.processing.collections.search);
    const isLocalhost = this.database.connectionString.includes('localhost') || this.database.connectionString.includes('127.0.0.1');
    const batchSize = isLocalhost ? 500 : 1000;
    let gamesBatch = [];
    let searchBatch = [];
    let totalProcessed = 0;
    let checked = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .pipe(new Transform({
          objectMode: true,
          transform: async (row, encoding, callback) => {
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
              Object.keys(gameDoc).forEach(key => {
                if (gameDoc[key] === undefined || gameDoc[key] === null || (typeof gameDoc[key] === 'number' && isNaN(gameDoc[key]))) {
                  delete gameDoc[key];
                }
              });
              
              gamesBatch.push({
                updateOne: {
                  filter: { id: gameDoc.id, name: gameDoc.name },
                  update: { $set: gameDoc },
                  upsert: true
                }
              });
              
              if (row.id && row.name) {
                searchBatch.push({
                  updateOne: {
                    filter: { id: parseInt(row.id) },
                    update: { $set: { id: parseInt(row.id), name: row.name } },
                    upsert: true
                  }
                });
              }

              checked++;

              if (gamesBatch.length >= batchSize) {
                try {
                  // Ensure connection is healthy before bulk operations
                  await this.database.ensureConnection();
                  
                  await gamesCollection.bulkWrite(gamesBatch, { 
                    ordered: false,
                    writeConcern: { w: 1, j: false }
                  });
                  await searchCollection.bulkWrite(searchBatch, { 
                    ordered: false,
                    writeConcern: { w: 1, j: false }
                  });
                  
                  totalProcessed += gamesBatch.length;
                  gamesBatch = [];
                  searchBatch = [];
                  console.log(`📊 Checked ${checked} records, upserted ${totalProcessed}...`);
                } catch (error) {
                  console.error('❌ Batch write failed, retrying...', error.message);
                  // Retry once after ensuring connection
                  try {
                    await this.database.ensureConnection();
                    await gamesCollection.bulkWrite(gamesBatch, { ordered: false });
                    await searchCollection.bulkWrite(searchBatch, { ordered: false });
                    totalProcessed += gamesBatch.length;
                    gamesBatch = [];
                    searchBatch = [];
                    console.log(`📊 Retry successful: ${totalProcessed} processed`);
                  } catch (retryError) {
                    console.error('❌ Retry failed:', retryError.message);
                    callback(retryError);
                    return;
                  }
                }
              }

              callback();
            } catch (error) {
              callback(error);
            }
          }
        }))
        .on('finish', async () => {
          try {
            if (gamesBatch.length > 0) {
              await gamesCollection.bulkWrite(gamesBatch, { ordered: false });
              await searchCollection.bulkWrite(searchBatch, { ordered: false });
              totalProcessed += gamesBatch.length;
            }
            console.log(`✅ Completed processing ${checked} records, upserted ${totalProcessed}`);
            resolve(totalProcessed);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
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