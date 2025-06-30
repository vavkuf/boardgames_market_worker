/**
 * BoardGameGeek Data Configuration
 * Configuration for processing BGG data dumps
 */

module.exports = {
  // Database configuration for local MongoDB
  database: {
    uri: 'mongodb://localhost:27017',
    name: 'bg_market'
  },

  // BGG Data source configuration
  dataSource: {
    // BGG Data Download URL (updates daily) - FRESH URL from successful test
    url: 'https://geek-export-stats.s3.amazonaws.com/boardgames_export/boardgames_ranks_2025-06-30.zip?X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAJYFNCT7FKCE4O6TA%2F20250630%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20250630T141336Z&X-Amz-SignedHeaders=host&X-Amz-Expires=600&X-Amz-Signature=3fd46a91e8e6bc729635380dc05f325647069a3b791a7afd6d65a006977f01e3',
    
    // Alternative: if you need to handle authentication
    headers: {
      // Add any required headers here if BGG requires authentication
      // 'Authorization': 'Bearer your-token',
      'User-Agent': 'BG-Market-Worker/1.0'
    }
  },

  // Cron schedule for BGG data updates
  schedule: {
    // Run daily at 6 AM (BGG data is typically updated daily)
    cron: '0 6 * * *',
    timezone: 'UTC'
  },

  // Data processing configuration
  processing: {
    // Expected CSV files in the BGG data dump
    expectedFiles: [
      'boardgames_ranks.csv',
    ],
    
    // MongoDB collections to update
    collections: {
      games: 'board_games',
      metadata: 'data_updates',
      search: 'games_search'
    }
  }
}; 