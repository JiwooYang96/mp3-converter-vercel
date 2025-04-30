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
  
  if (!url || !validUrl.isUri(url)) {
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }
  
  if (!isYoutubeUrl(url)) {
    return res.status(400).json({ error: 'Only YouTube URLs are supported' });
  }
  
  try {
    const videoInfo = await getVideoInfo(url);
    return res.json(videoInfo);
  } catch (error) {
    console.error('Error getting video info:', error);
    return res.status(500).json({ error: 'Failed to get video information' });
  }
});

// Convert YouTube video to MP3
router.post('/extract', convertLimiter, async (req, res) => {
  const { url } = req.body;
  
  if (!url || !validUrl.isUri(url)) {
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }
  
  if (!isYoutubeUrl(url)) {
    return res.status(400).json({ error: 'Only YouTube URLs are supported' });
  }
  
  try {
    // First get video info to check if it's available
    const videoInfo = await getVideoInfo(url);
    
    // Check for already converted files with the same YouTube ID to avoid duplicate work
    const existingFile = await checkExistingFile(videoInfo.id);
    if (existingFile) {
      return res.json({
        message: 'Audio extraction already completed',
        extractionId: existingFile.extractionId,
        title: videoInfo.title,
        downloadUrl: `/api/convert/download/${existingFile.extractionId}`
      });
    }
    
    // Start extraction (this will be async, we'll return a job ID)
    const extractionResult = await extractAudio(url);
    
    return res.json({
      message: 'Audio extraction started',
      extractionId: extractionResult.id,
      title: extractionResult.title || videoInfo.title,
      downloadUrl: `/api/convert/download/${extractionResult.id}`
    });
  } catch (error) {
    console.error('Error converting video:', error);
    return res.status(500).json({ error: 'Failed to convert video to MP3' });
  }
});

// Check if we already have this video converted to avoid duplicate work
async function checkExistingFile(youtubeId) {
  const tempDir = require('os').tmpdir();
  const outputDir = path.join(tempDir, 'youtube-mp3-output');
  const metadataFile = path.join(outputDir, 'metadata.json');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
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

// Download the converted MP3
router.get('/download/:id', (req, res) => {
  const { id } = req.params;
  const tempDir = require('os').tmpdir();
  const outputDir = path.join(tempDir, 'youtube-mp3-output');
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
  const tempDir = require('os').tmpdir();
  const outputDir = path.join(tempDir, 'youtube-mp3-output');
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