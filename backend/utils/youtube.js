// Utility functions for YouTube video extraction and information
const { execFile } = require('child_process');
const { join } = require('path');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Use youtube-dl-exec with improved configuration options
const youtubeDl = require('youtube-dl-exec');
// Use ffmpeg-static package 
const ffmpegPath = require('ffmpeg-static');

// Create custom app directories instead of system temp for better reliability
const appDir = path.join(process.cwd(), '..', 'app_data');
const downloadsDir = join(appDir, 'youtube-mp3-downloads');
const outputDir = join(appDir, 'youtube-mp3-output');
const metadataPath = join(outputDir, 'metadata.json');

// Create directories if they don't exist
try {
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create app directories:', err);
}

// Check if the URL is a valid YouTube URL
function isYoutubeUrl(url) {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return youtubeRegex.test(url);
}

// Extract YouTube ID from URL
function extractYoutubeId(url) {
  let id = null;
  
  if (url.includes('youtu.be/')) {
    id = url.split('youtu.be/')[1].split(/[?&]/)[0];
  } else if (url.includes('youtube.com/watch')) {
    try {
      const urlParams = new URL(url).searchParams;
      id = urlParams.get('v');
    } catch (e) {
      console.error('Error parsing YouTube URL:', e);
    }
  } else if (url.includes('youtube.com/embed/')) {
    id = url.split('youtube.com/embed/')[1].split(/[?&]/)[0];
  }
  
  return id;
}

// Get video information without downloading
async function getVideoInfo(url) {
  console.log(`Getting info for video URL: ${url}`);
  
  return new Promise((resolve, reject) => {
    // Add more robust options for recent YouTube changes
    const options = {
      dumpSingleJson: true,
      noPlaylist: true,
      noCallHome: true,
      // Add options to help with modern YouTube
      forceIpv4: true,
      skipDownload: true,
      // Add updated user agent
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };
    
    youtubeDl(url, options)
    .then(output => {
      try {
        console.log('Successfully retrieved video info');
        resolve({
          title: output.title,
          duration: output.duration,
          thumbnail: output.thumbnail,
          uploader: output.uploader,
          id: output.id
        });
      } catch (e) {
        console.error('Failed to parse video information:', e);
        reject(new Error('Failed to parse video information'));
      }
    })
    .catch(error => {
      console.error('Error getting video info:', error);
      reject(new Error(`Failed to get video information: ${error.message}`));
    });
  });
}

// Update metadata file to track YouTube IDs and their corresponding extraction IDs
function updateMetadata(youtubeId, extractionId) {
  try {
    // Create metadata file if it doesn't exist
    if (!fs.existsSync(metadataPath)) {
      fs.writeFileSync(metadataPath, JSON.stringify({}));
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    metadata[youtubeId] = extractionId;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error updating metadata:', error);
  }
}

// Extract audio from YouTube video and save as MP3 with optimized settings
async function extractAudio(url) {
  // Create a unique ID for this extraction
  const extractionId = uuidv4();
  const outputFilename = `${extractionId}.mp3`;
  const outputPath = path.join(outputDir, outputFilename);

  return new Promise((resolve, reject) => {
    // Get the YouTube ID from the URL to store in our metadata
    const youtubeId = extractYoutubeId(url);

    // Extract audio with optimized settings for faster download
    const options = {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 2, // Slightly lower quality for faster conversion
      ffmpegLocation: ffmpegPath,
      output: outputPath,
      noPlaylist: true,
      noCallHome: true,
      // Add options to help with modern YouTube
      forceIpv4: true,
      // Add updated user agent
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    youtubeDl(url, options)
    .then(async () => {
      try {
        // Get the video info to return with the file details
        const info = await getVideoInfo(url);
        
        // Update our metadata to keep track of this conversion
        if (youtubeId) {
          updateMetadata(youtubeId, extractionId);
        }
        
        resolve({
          id: extractionId,
          filename: outputFilename,
          path: outputPath,
          title: info.title,
          originalUrl: url
        });
      } catch (infoError) {
        // Even if we can't get the info, resolve with the file details
        resolve({
          id: extractionId,
          filename: outputFilename,
          path: outputPath,
          originalUrl: url
        });
      }
    })
    .catch(error => {
      console.error('Error extracting audio:', error);
      reject(new Error(`Failed to extract audio: ${error.message}`));
    });
  });
}

// Clean up old files (can be called periodically)
function cleanupOldFiles(maxAgeMinutes = 5) {
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  const now = Date.now();
  
  // Clean output directory
  if (fs.existsSync(outputDir)) {
    fs.readdirSync(outputDir).forEach(file => {
      // Skip the metadata file
      if (file === 'metadata.json') return;
      
      const filePath = path.join(outputDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old file: ${filePath}`);
        }
      } catch (err) {
        console.log(`Error accessing file ${filePath}: ${err.message}`);
      }
    });
  }
  
  // Clean downloads directory
  if (fs.existsSync(downloadsDir)) {
    fs.readdirSync(downloadsDir).forEach(file => {
      const filePath = path.join(downloadsDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old file: ${filePath}`);
        }
      } catch (err) {
        console.log(`Error accessing file ${filePath}: ${err.message}`);
      }
    });
  }
}

module.exports = {
  isYoutubeUrl,
  getVideoInfo,
  extractAudio,
  cleanupOldFiles,
  extractYoutubeId
};