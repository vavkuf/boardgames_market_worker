# BG Market Worker

A Node.js worker application for the Board Games Market project that handles automated data fetching, extraction, and processing with MongoDB integration and cron job scheduling.

## Features

- **File Download & Extraction**: Supports both `.zip` and `.rar` archives
- **CSV Processing**: Automatically identifies and extracts CSV files from archives
- **Cron Job Scheduling**: Configurable periodic execution
- **MongoDB Integration**: Logs job executions and stores file metadata
- **Graceful Shutdown**: Proper cleanup on termination signals
- **Error Handling**: Comprehensive error handling and logging
- **RAR Support**: Uses `node-unrar-js` with fallback to system `unrar` command

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd bg-market-worker
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp config/env.example .env
# Edit .env with your configuration
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` | No |
| `DATABASE_NAME` | MongoDB database name | `bg_market` | No |
| `DATA_SOURCE_URL` | URL to the data archive (.zip or .rar) | - | Yes |
| `CRON_SCHEDULE` | Cron schedule expression | `0 */6 * * *` (every 6 hours) | No |
| `RUN_IMMEDIATELY` | Run job immediately on startup | `false` | No |
| `NODE_ENV` | Node environment | `production` | No |

### Cron Schedule Examples

- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight
- `0 0 * * 1` - Weekly on Monday at midnight
- `*/30 * * * *` - Every 30 minutes

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Run with Custom Environment
```bash
DATA_SOURCE_URL=https://example.com/data.zip npm start
```

### Run Job Immediately
```bash
RUN_IMMEDIATELY=true npm start
```

## File Structure

```
bg-market-worker/
├── src/
│   ├── index.js              # Main worker application
│   ├── jobs/
│   │   └── dataFetchJob.js   # Data fetch cron job
│   └── utils/
│       ├── fileExtractor.js  # File download & extraction utility
│       └── database.js       # MongoDB connection & operations
├── data/                     # Data directory (auto-created)
├── config/
│   └── env.example          # Environment variables example
├── package.json
└── README.md
```

## How It Works

1. **Initialization**: Worker connects to MongoDB and sets up cron jobs
2. **Scheduled Execution**: Cron job runs based on the configured schedule
3. **File Download**: Downloads the archive file from the specified URL
4. **Extraction**: Extracts the archive and identifies CSV files
5. **Database Logging**: Stores job execution logs and file metadata in MongoDB
6. **Cleanup**: Removes temporary files and maintains clean state

## Database Collections

The worker creates and uses the following MongoDB collections:

- `job_logs`: Execution logs with timestamps and results
- `job_status`: Current status of each job type
- `csv_files`: Metadata of processed CSV files

## RAR File Support

The worker supports RAR files through two methods:

1. **node-unrar-js**: JavaScript-based RAR extraction (primary method)
2. **System unrar**: Falls back to system `unrar` command if needed

### Installing unrar (if needed)

**Ubuntu/Debian:**
```bash
sudo apt-get install unrar
```

**macOS:**
```bash
brew install unrar
```

**Windows:**
Download from: https://www.rarlab.com/download.htm

## Error Handling

- Network errors during download are logged and retried on next schedule
- Extraction errors are logged with detailed error messages
- Database connection issues are handled gracefully
- All errors are logged both to console and database

## Monitoring

The worker provides status information through:

- Console logging with timestamps
- Database logging in `job_logs` collection
- File-based logging in `./data/extraction.log`

## Graceful Shutdown

The worker handles shutdown signals properly:
- Stops running cron jobs
- Closes database connections
- Cleans up resources

Send `SIGINT` (Ctrl+C), `SIGTERM`, or `SIGQUIT` to trigger graceful shutdown.

## Development

### Adding New Jobs

1. Create a new job class in `src/jobs/`
2. Add job initialization in `src/index.js`
3. Configure job-specific environment variables

### Testing

The worker can be tested by setting `RUN_IMMEDIATELY=true` to execute jobs immediately instead of waiting for the cron schedule.

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check `MONGODB_URI` configuration
   - Ensure MongoDB is running
   - Verify network connectivity

2. **RAR Extraction Failed**
   - Install system `unrar` command
   - Check RAR file format compatibility

3. **Download Failed**
   - Verify `DATA_SOURCE_URL` is accessible
   - Check network connectivity
   - Ensure URL points to a valid archive file

4. **CSV Not Found**
   - Verify the archive contains CSV files
   - Check file naming conventions

### Logs

Check the following for debugging:
- Console output
- `./data/extraction.log` file
- MongoDB `job_logs` collection

## License

ISC 