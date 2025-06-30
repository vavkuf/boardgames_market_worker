# BoardGameGeek Data Integration Setup

This guide will help you set up your BG Market Worker to automatically download and process data from BoardGameGeek's data dumps.

## 🎯 Quick Start

### 1. Get the BGG Data Download URL

Since the BGG data dumps page (https://boardgamegeek.com/data_dumps/bg_ranks) requires access, you need to:

1. **Visit the BGG data dumps page** and log in if necessary
2. **Right-click on the "Click to download" link** for the RAR/ZIP file
3. **Copy the direct download URL**

### 2. Configure the Worker

Edit `config/bgg-config.js` and replace the placeholder URL:

```javascript
// Replace this line:
url: 'https://boardgamegeek.com/data_dumps/bg_ranks_DOWNLOAD_LINK.zip',

// With the actual URL you copied:
url: 'https://geek-export-stats.s3.amazonaws.com/boardgames_export/boardgames_ranks_2025-06-30.zip?...',
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start MongoDB

Make sure MongoDB is running on your local machine:

```bash
# MongoDB should be running on mongodb://localhost:27017
mongod
```

### 5. Run the BGG Worker

```bash
# Start the worker with scheduled processing
npm run simple-bgg
```

## 📊 What Gets Created

The worker will create these MongoDB collections in your `bg_market` database:

### Collections:
- **`board_games`** - Game information (see below for fields)
- **`games_search`** - `{ id, name }` for fast search
- **`data_updates`** - Metadata about processed files
- **`job_logs`** - Execution history
- **`job_status`** - Current job status

### Sample Data Structure:

**board_games collection:**
```javascript
{
  name: "Gloomhaven",
  year_published: 2017,
  rank: 4,
  bayes_average: 8.32,
  average: 8.56,
  users_rated: 65073,
  is_expansion: false,
  abstracts_rank: null
}
```

**games_search collection:**
```javascript
{
  id: 174430,
  name: "Gloomhaven"
}
```

## 🔧 Configuration Options

### Scheduling
Edit the cron schedule in `config/bgg-config.js`:

```javascript
schedule: {
  cron: '0 6 * * *',
  timezone: 'UTC'
}
```

### Database Settings
```javascript
database: {
  uri: 'mongodb://localhost:27017',
  name: 'bg_market'
}
```

## 🚀 Usage Examples

### Start the Worker
```bash
npm run simple-bgg
```

### Query Your Data

Connect to MongoDB and explore your data:

```bash
mongo
use bg_market

db.board_games.find().limit(5).pretty()
db.games_search.find().limit(5).pretty()
```

## 📈 Monitoring

The worker provides detailed logging:

- **Console output** - Real-time progress
- **File logs** - `./data/extraction.log`
- **Database logs** - `job_logs` collection
- **Status tracking** - `job_status` collection

## 🛠 Troubleshooting

### Common Issues

1. **"BGG data source URL is not configured"**
   - Update `config/bgg-config.js` with the actual download URL

2. **MongoDB Connection Failed**
   - Ensure MongoDB is running: `mongod`
   - Check connection string in config

3. **Download URL Expired**
   - BGG URLs expire after 10 minutes. Get a fresh one and update the config.

## 📋 Data Processing Details

- Only `boardgames_ranks.csv` is processed.
- All records are saved to `board_games` with the following fields:
  - `name`, `year_published`, `rank`, `bayes_average`, `average`, `users_rated`, `is_expansion`, `abstracts_rank`
- For each record, `{ id, name }` is also saved to `games_search`.
- Data is processed in batches for optimal performance.

## 💡 Tips

- **First run**: Use `npm run simple-bgg` to test everything works
- **Monitor progress**: Watch the console output for real-time updates
- **Check data**: Query MongoDB to verify data is being stored correctly 