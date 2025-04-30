// Utility functions for YouTube video extraction and information
const { execFile } = require('child_process');
const { join } = require('path');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Use youtube-dl-exec package instead of yt-dlp-exec
const youtubeDl = require('youtube-dl-exec');
// Use ffmpeg-static package instead of local binary
const ffmpegPath = require('ffmpeg-static');

// Use system temp directory for temporary storage
const tempDir = os.tmpdir();
const downloadsDir = join(tempDir, 'youtube-mp3-downloads');
const outputDir = join(tempDir, 'youtube-mp3-output');
const metadataPath = join(outputDir, 'metadata.json');

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
    const urlParams = new URL(url).searchParams;
    id = urlParams.get('v');
  } else if (url.includes('youtube.com/embed/')) {
    id = url.split('youtube.com/embed/')[1].split(/[?&]/)[0];
  }
  
  return id;
}

// Get video information without downloading
async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    youtubeDl(url, {
      dumpSingleJson: true,
      noPlaylist: true,
      noCallHome: true
    })
    .then(output => {
      try {
        resolve({
          title: output.title,
          duration: output.duration,
          thumbnail: output.thumbnail,
          uploader: output.uploader,
          id: output.id
        });
      } catch (e) {
        reject(new Error('Failed to parse video information'));
      }
    })
    .catch(error => {
      console.error('Error getting video info:', error);
      reject(new Error('Failed to get video information'));
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
    // Make sure the directories exist
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

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
      noCallHome: true
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
      reject(new Error('Failed to extract audio'));
    });
  });
}

// Clean up old files (can be called periodically)
function cleanupOldFiles(maxAgeMinutes = 5) { // Reduced to 5 minutes for aggressive cleanup
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