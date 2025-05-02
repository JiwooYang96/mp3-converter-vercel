const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const validUrl = require('valid-url');
const { isYoutubeUrl, getVideoInfo, extractAudio } = require('../utils/youtube');

// Rate limiting for conversion requests with adjusted limits
const rateLimit = require('express-rate-limit');
const convertLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many conversion requests, please try again after 5 minutes'
});

// Get video info without downloading
router.get('/info', async (req, res) => {
  const { url } = req.query;
  
  console.log(`Received info request for URL: ${url}`);
  
  if (!url || !validUrl.isUri(url)) {
    console.log('Invalid URL provided');
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }
  
  if (!isYoutubeUrl(url)) {
    console.log('Non-YouTube URL provided');
    return res.status(400).json({ error: 'Only YouTube URLs are supported' });
  }
  
  try {
    console.log('Attempting to get video info');
    const videoInfo = await getVideoInfo(url);
    console.log('Successfully retrieved video info', videoInfo);
    return res.json(videoInfo);
  } catch (error) {
    console.error('Error getting video info:', error);
    return res.status(500).json({ 
      error: 'Failed to get video information',
      details: error.message
    });
  }
});

// Create custom app directories instead of system temp for better reliability
const appDir = path.join(process.cwd(), '..', 'app_data');
const outputDir = path.join(appDir, 'youtube-mp3-output');

// Create directories if they don't exist
try {
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create app directories:', err);
}

// Check if we already have this video converted to avoid duplicate work
async function checkExistingFile(youtubeId) {
  const metadataFile = path.join(outputDir, 'metadata.json');
  
  // Create metadata file if it doesn't exist
  if (!fs.existsSync(metadataFile)) {
    fs.writeFileSync(metadataFile, JSON.stringify({}));
    return null;
  }
  
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    if (metadata[youtubeId]) {
      const filePath = path.join(outputDir, `${metadata[youtubeId]}.mp3`);
      if (fs.existsSync(filePath)) {
        return { extractionId: metadata[youtubeId] };
      }
    }
    return null;
  } catch (error) {
    console.error('Error checking existing files:', error);
    return null;
  }
}

// Convert YouTube video to MP3
router.post('/extract', convertLimiter, async (req, res) => {
  const { url } = req.body;
  
  console.log(`Received extraction request for URL: ${url}`);
  
  if (!url || !validUrl.isUri(url)) {
    console.log('Invalid URL provided');
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }
  
  if (!isYoutubeUrl(url)) {
    console.log('Non-YouTube URL provided');
    return res.status(400).json({ error: 'Only YouTube URLs are supported' });
  }
  
  try {
    // First get video info to check if it's available
    console.log('Getting video info before extraction');
    const videoInfo = await getVideoInfo(url);
    
    // Check for already converted files with the same YouTube ID to avoid duplicate work
    console.log('Checking for existing converted file');
    const existingFile = await checkExistingFile(videoInfo.id);
    if (existingFile) {
      console.log('Found existing converted file');
      return res.json({
        message: 'Audio extraction already completed',
        extractionId: existingFile.extractionId,
        title: videoInfo.title,
        downloadUrl: `/api/convert/download/${existingFile.extractionId}`
      });
    }
    
    // Start extraction (this will be async, we'll return a job ID)
    console.log('Starting audio extraction');
    const extractionResult = await extractAudio(url);
    console.log('Extraction result:', extractionResult);
    
    return res.json({
      message: 'Audio extraction started',
      extractionId: extractionResult.id,
      title: extractionResult.title || videoInfo.title,
      downloadUrl: `/api/convert/download/${extractionResult.id}`
    });
  } catch (error) {
    console.error('Error converting video:', error);
    return res.status(500).json({ 
      error: 'Failed to convert video to MP3',
      details: error.message
    });
  }
});

// Download the converted MP3
router.get('/download/:id', (req, res) => {
  const { id } = req.params;
  const filePath = path.join(outputDir, `${id}.mp3`);
  
  console.log('Download request for:', id);
  console.log('Looking for file at:', filePath);
  
  if (!fs.existsSync(filePath)) {
    console.log('File not found!');
    return res.status(404).json({ error: 'File not found or conversion not completed yet' });
  }
  
  console.log('File found, sending download...');
  
  // Get file info to set Content-Length header
  const stats = fs.statSync(filePath);
  
  // Set appropriate headers for better download experience
  res.setHeader('Content-Disposition', `attachment; filename="youtube-audio-${id}.mp3"`);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Accept-Ranges', 'bytes');
  
  // Create a read stream and pipe it to the response
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
  
  // Handle any errors
  fileStream.on('error', (err) => {
    console.error('Error streaming file:', err);
    res.status(500).end();
  });
  
  // After download completes, schedule file for deletion
  res.on('finish', () => {
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`File deleted after download: ${filePath}`);
        }
      } catch (err) {
        console.error(`Error deleting file after download: ${err.message}`);
      }
    }, 1000); // Wait 1 second after download completes
  });
});

// Check status of conversion
router.get('/status/:id', (req, res) => {
  const { id } = req.params;
  const filePath = path.join(outputDir, `${id}.mp3`);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    return res.json({
      status: 'completed',
      fileSize: stats.size,
      downloadUrl: `/api/convert/download/${id}`
    });
  } else {
    return res.json({
      status: 'processing'
    });
  }
});

module.exports = router;