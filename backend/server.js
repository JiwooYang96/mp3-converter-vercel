const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const { cleanupOldFiles } = require('./utils/youtube');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev')); // Logging

// Static cache time for assets (1 hour)
const staticOptions = {
  maxAge: '1h',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      // Don't cache HTML files
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
};

// API routes
app.use('/api/convert', require('./routes/convert'));

// Serve static files from the frontend directory with caching
app.use(express.static(path.join(__dirname, '..', 'frontend'), staticOptions));

// Catch-all route to serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initial cleanup on startup
  cleanupOldFiles(5); 
  
  // Set up periodic cleanup of old files (every 5 minutes)
  setInterval(() => {
    cleanupOldFiles(5); // Delete files older than 5 minutes
  }, 5 * 60 * 1000);
});