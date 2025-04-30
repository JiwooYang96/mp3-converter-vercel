document.addEventListener('DOMContentLoaded', () => {
  const youtubeUrl = document.getElementById('youtube-url');
  const convertBtn = document.getElementById('youtube-url'); // Using the input as the trigger
  const videoThumbnail = document.getElementById('video-thumbnail');
  const videoTitle = document.getElementById('video-title');
  const videoDuration = document.getElementById('video-duration');
  const videoUploader = document.getElementById('video-uploader');
  const statusText = document.getElementById('status-text');
  const progressFill = document.getElementById('progress-fill');
  const downloadBtn = document.getElementById('download-btn');
  const errorContainer = document.getElementById('error-container');
  const errorMessage = document.getElementById('error-message');
  const currentTime = document.getElementById('current-time');
  const totalTime = document.getElementById('total-time');
  
  // API endpoints
  const API_INFO = '/api/convert/info';
  const API_EXTRACT = '/api/convert/extract';
  const API_STATUS = '/api/convert/status';
  const API_DOWNLOAD = '/api/convert/download';
  
  // Default iPod screen content
  videoThumbnail.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f0f0f0'/%3E%3Cpath d='M65,50 L42,36 L42,64 Z' fill='%23999999'/%3E%3C/svg%3E";
  videoTitle.textContent = "Song name";
  videoUploader.textContent = "Ready to convert";
  videoDuration.textContent = "0:00";
  
  // Initialize download button as inactive
  downloadBtn.classList.remove('active');
  downloadBtn.href = '#';
  
  // Format seconds to MM:SS
  function formatDuration(seconds) {
    if (!seconds) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  // Show error message
  function showError(message) {
    errorMessage.textContent = message;
    errorContainer.classList.remove('hidden');
    statusText.textContent = 'Error occurred';
    
    // Hide after 5 seconds
    setTimeout(() => {
      errorContainer.classList.add('hidden');
    }, 5000);
  }
  
  // Reset UI elements
  function resetUI() {
    // Make download button inactive but visible
    downloadBtn.classList.remove('active');
    downloadBtn.href = '#';
    
    errorContainer.classList.add('hidden');
    progressFill.style.width = '0%';
    progressFill.style.backgroundColor = '#000';
    statusText.textContent = 'Ready';
    statusText.style.color = '#333';
    statusText.style.fontWeight = 'normal';
    currentTime.textContent = '0:00';
  }
  
  // Simulate iPod-like progress animation
  function simulatePlayback(durationSeconds, callback) {
    let elapsed = 0;
    const interval = 1000; // Update every second
    const duration = durationSeconds || 30; // Default 30 seconds if no duration
    
    // Format the total time display
    totalTime.textContent = '-' + formatDuration(duration);
    
    statusText.textContent = 'Converting...';
    
    const timer = setInterval(() => {
      elapsed += 1;
      const percentage = (elapsed / duration) * 100;
      progressFill.style.width = `${Math.min(percentage, 100)}%`;
      currentTime.textContent = formatDuration(elapsed);
      totalTime.textContent = '-' + formatDuration(Math.max(duration - elapsed, 0));
      
      if (elapsed >= duration) {
        clearInterval(timer);
        if (callback) callback();
      }
    }, interval);
    
    // Return a function to stop the timer if needed
    return () => clearInterval(timer);
  }
  
  // Get video information when URL is pasted
  youtubeUrl.addEventListener('blur', async () => {
    const url = youtubeUrl.value.trim();
    if (!url) return;
    
    try {
      resetUI();
      statusText.textContent = 'Fetching video info...';
      
      const response = await fetch(`${API_INFO}?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        const data = await response.json();
        showError(data.error || 'Failed to fetch video information');
        return;
      }
      
      const videoData = await response.json();
      
      // Display video information in iPod style
      videoThumbnail.src = videoData.thumbnail || videoThumbnail.src;
      videoTitle.textContent = videoData.title || "Unknown Title";
      videoDuration.textContent = formatDuration(videoData.duration);
      videoUploader.textContent = videoData.uploader || "Unknown Artist";
      
      statusText.textContent = 'Ready to convert';
      
      // Auto start the conversion
      startConversion(url);
    } catch (error) {
      console.error('Error fetching video info:', error);
      showError('Failed to fetch video information. Please check the URL and try again.');
    }
  });
  
  // Start conversion process
  async function startConversion(url) {
    if (!url) {
      showError('Please enter a YouTube URL');
      return;
    }
    
    try {
      // Reset UI state
      resetUI();
      
      // Show conversion status
      statusText.textContent = 'Starting conversion...';
      
      // Request extraction
      const response = await fetch(API_EXTRACT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start conversion');
      }
      
      const data = await response.json();
      const extractionId = data.extractionId;
      const downloadUrl = `${API_DOWNLOAD}/${extractionId}`;
      
      // Get video information to estimate duration if not already displayed
      let duration = 60; // Default to 60 seconds if we can't determine
      if (videoDuration.textContent && videoDuration.textContent !== "0:00") {
        const parts = videoDuration.textContent.split(':');
        if (parts.length === 2) {
          duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }
      
      // Slightly shorter for UI feedback
      const uiDuration = Math.min(duration, 90);
      
      // Start iPod-like progress animation
      const stopSimulation = simulatePlayback(uiDuration, () => {
        // This will run when the simulation completes
        statusText.textContent = 'Conversion complete!';
        statusText.style.color = '#ffe066';
        statusText.style.fontWeight = 'bold';
        progressFill.style.backgroundColor = '#ffe066';
      });
      
      // Poll for actual status
      const checkStatus = async () => {
        try {
          const statusResponse = await fetch(`${API_STATUS}/${extractionId}`);
          const statusData = await statusResponse.json();
          
          if (statusData.status === 'completed') {
            // Conversion complete with yellow highlight
            statusText.textContent = 'Conversion complete!';
            statusText.style.color = '#ffe066';
            statusText.style.fontWeight = 'bold';
            
            // Set progress bar to yellow
            progressFill.style.width = '100%';
            progressFill.style.backgroundColor = '#ffe066';
            
            // Set the download button to active state
            downloadBtn.classList.add('active');
            downloadBtn.href = downloadUrl;
            
            if (data.title) {
              // Set a filename if we have the title
              const safeTitle = data.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
              downloadBtn.setAttribute('download', `${safeTitle}.mp3`);
            }
            
            return;
          }
          
          // Still processing, check again in 2 seconds
          setTimeout(checkStatus, 2000);
        } catch (error) {
          console.error('Error checking status:', error);
          statusText.textContent = 'Error checking conversion status';
        }
      };
      
      // Start polling
      checkStatus();
      
    } catch (error) {
      console.error('Error starting conversion:', error);
      showError(error.message || 'Failed to start conversion');
      statusText.textContent = 'Conversion failed';
    }
  }
  
  // Handle download button
  downloadBtn.addEventListener('click', (e) => {
    if (!downloadBtn.classList.contains('active') || !downloadBtn.href || downloadBtn.href === '#' || downloadBtn.href === window.location.href + '#') {
      e.preventDefault();
      showError('Download link not ready yet. Please wait for conversion to complete.');
      return;
    }
    
    // Otherwise, let the browser handle the download through the anchor tag
    
    // Reset the form for new conversions after download starts
    setTimeout(() => {
      youtubeUrl.value = '';
      resetUI();
      videoThumbnail.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f0f0f0'/%3E%3Cpath d='M65,50 L42,36 L42,64 Z' fill='%23999999'/%3E%3C/svg%3E";
      videoTitle.textContent = "No track selected";
      videoUploader.textContent = "Ready to convert";
      videoDuration.textContent = "0:00";
    }, 1000);
  });
  
  // When user presses Enter in the input field, trigger blur to start conversion
  youtubeUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      youtubeUrl.blur();
    }
  });
});