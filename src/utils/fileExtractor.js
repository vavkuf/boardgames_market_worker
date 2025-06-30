const axios = require('axios');
const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { createExtractorFromData } = require('node-unrar-js');

class FileExtractor {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.logFile = path.join(dataDir, 'extraction.log');
  }

  /**
   * Main function to download and extract archive files
   * @param {string} url - URL pointing to .zip or .rar file
   * @returns {Promise<string>} - Path to extracted CSV file
   */
  async downloadAndExtract(url) {
    try {
      await this.ensureDataDir();
      
      const fileExtension = this.getFileExtension(url);
      const tempFileName = `temp_${Date.now()}${fileExtension}`;
      const tempFilePath = path.join(this.dataDir, tempFileName);

      this.log(`Starting download from: ${url}`);
      
      // Download the file
      await this.downloadFile(url, tempFilePath);
      this.log(`Downloaded file to: ${tempFilePath}`);

      let csvPath;
      
      // Extract based on file type
      if (fileExtension === '.zip') {
        csvPath = await this.extractZip(tempFilePath);
      } else if (fileExtension === '.rar') {
        csvPath = await this.extractRar(tempFilePath);
      } else {
        throw new Error(`Unsupported file extension: ${fileExtension}`);
      }

      // Clean up temp file
      await fs.remove(tempFilePath);
      this.log(`Cleaned up temp file: ${tempFilePath}`);

      this.log(`Successfully extracted CSV to: ${csvPath}`);
      return csvPath;

    } catch (error) {
      this.log(`Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download file from URL
   * @param {string} url - File URL
   * @param {string} filePath - Local file path to save
   */
  async downloadFile(url, filePath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  /**
   * Extract ZIP file and find CSV
   * @param {string} zipPath - Path to ZIP file
   * @returns {Promise<string>} - Path to extracted CSV
   */
  async extractZip(zipPath) {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    
    let csvEntry = null;
    
    // Find CSV file in the archive
    for (const entry of entries) {
      if (entry.entryName.toLowerCase().endsWith('.csv') && !entry.isDirectory) {
        csvEntry = entry;
        break;
      }
    }

    if (!csvEntry) {
      throw new Error('No CSV file found in the ZIP archive');
    }

    const csvFileName = path.basename(csvEntry.entryName);
    const csvPath = path.join(this.dataDir, csvFileName);

    // Check if CSV already exists
    if (await fs.pathExists(csvPath)) {
      this.log(`CSV file already exists: ${csvPath}`);
      return csvPath;
    }

    // Extract the CSV file
    zip.extractEntryTo(csvEntry, this.dataDir, false, true);
    
    return csvPath;
  }

  /**
   * Extract RAR file and find CSV
   * @param {string} rarPath - Path to RAR file
   * @returns {Promise<string>} - Path to extracted CSV
   */
  async extractRar(rarPath) {
    try {
      // Try node-unrar-js first
      return await this.extractRarWithNodeUnrar(rarPath);
    } catch (error) {
      this.log(`node-unrar-js failed: ${error.message}, trying system unrar`);
      // Fallback to system unrar
      return await this.extractRarWithSystemUnrar(rarPath);
    }
  }

  /**
   * Extract RAR using node-unrar-js
   * @param {string} rarPath - Path to RAR file
   * @returns {Promise<string>} - Path to extracted CSV
   */
  async extractRarWithNodeUnrar(rarPath) {
    const buf = await fs.readFile(rarPath);
    const extractor = await createExtractorFromData({ data: buf });
    
    const list = extractor.getFileList();
    const csvFile = list.fileHeaders.find(file => 
      file.name.toLowerCase().endsWith('.csv')
    );

    if (!csvFile) {
      throw new Error('No CSV file found in the RAR archive');
    }

    const csvFileName = path.basename(csvFile.name);
    const csvPath = path.join(this.dataDir, csvFileName);

    // Check if CSV already exists
    if (await fs.pathExists(csvPath)) {
      this.log(`CSV file already exists: ${csvPath}`);
      return csvPath;
    }

    // Extract the CSV file
    const extracted = extractor.extract({ files: [csvFile.name] });
    const csvContent = extracted.files[0].extraction;
    
    await fs.writeFile(csvPath, csvContent);
    
    return csvPath;
  }

  /**
   * Extract RAR using system unrar command
   * @param {string} rarPath - Path to RAR file
   * @returns {Promise<string>} - Path to extracted CSV
   */
  async extractRarWithSystemUnrar(rarPath) {
    return new Promise((resolve, reject) => {
      // First, list contents to find CSV file
      const listProcess = spawn('unrar', ['l', rarPath]);
      let listOutput = '';

      listProcess.stdout.on('data', (data) => {
        listOutput += data.toString();
      });

      listProcess.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error('Failed to list RAR contents. Make sure unrar is installed.'));
          return;
        }

        // Find CSV file in the list
        const lines = listOutput.split('\n');
        let csvFileName = null;
        
        for (const line of lines) {
          if (line.toLowerCase().includes('.csv')) {
            const parts = line.trim().split(/\s+/);
            csvFileName = parts[parts.length - 1];
            break;
          }
        }

        if (!csvFileName) {
          reject(new Error('No CSV file found in the RAR archive'));
          return;
        }

        const csvPath = path.join(this.dataDir, path.basename(csvFileName));

        // Check if CSV already exists
        if (await fs.pathExists(csvPath)) {
          this.log(`CSV file already exists: ${csvPath}`);
          resolve(csvPath);
          return;
        }

        // Extract the RAR file
        const extractProcess = spawn('unrar', ['e', rarPath, this.dataDir]);
        
        extractProcess.on('close', (extractCode) => {
          if (extractCode === 0) {
            resolve(csvPath);
          } else {
            reject(new Error('Failed to extract RAR file'));
          }
        });
      });

      listProcess.on('error', (error) => {
        reject(new Error(`unrar command failed: ${error.message}. Make sure unrar is installed.`));
      });
    });
  }

  /**
   * Get file extension from URL
   * @param {string} url - File URL
   * @returns {string} - File extension (.zip or .rar)
   */
  getFileExtension(url) {
    const urlPath = new URL(url).pathname;
    const extension = path.extname(urlPath).toLowerCase();
    
    if (!['.zip', '.rar'].includes(extension)) {
      throw new Error(`Unsupported file extension: ${extension}`);
    }
    
    return extension;
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDir() {
    await fs.ensureDir(this.dataDir);
  }

  /**
   * Log messages with timestamp
   * @param {string} message - Log message
   */
  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    console.log(logMessage.trim());
    
    // Append to log file
    fs.appendFileSync(this.logFile, logMessage);
  }
}

module.exports = FileExtractor; 