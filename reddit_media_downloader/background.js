// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadMedia') {
    // Indicate we're going to respond asynchronously
    downloadMedia(message.media, sender.tab.id)
      .then(() => {
        // Try to send response but don't error if channel is closed
        try {
          sendResponse({success: true});
        } catch (e) {
          console.log("Could not send response, channel may be closed:", e);
        }
      })
      .catch(error => {
        console.error("Download error:", error);
        try {
          sendResponse({success: false, error: error.message});
        } catch (e) {
          console.log("Could not send error response, channel may be closed:", e);
        }
      });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  // For other messages that don't need async response, don't return true
});

// Process and download media
async function downloadMedia(mediaItems, tabId) {
  let completedDownloads = 0;
  const totalItems = mediaItems.length;
  
  for (const media of mediaItems) {
    try {
      if (media.type === 'reddit-video') {
        // Handle special case for Reddit videos (requires JSON fetch)
        await downloadRedditVideo(media, tabId);
      } else {
        // Standard download for regular media
        await chrome.downloads.download({
          url: media.url,
          filename: media.filename,
          saveAs: false
        });
      }
      
      // Update progress
      completedDownloads++;
      await updateProgress(completedDownloads, totalItems, tabId);
      
      // Small delay to prevent overwhelming the browser
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`Error downloading ${media.url}:`, error);
      // Still count as completed even if error
      completedDownloads++;
      await updateProgress(completedDownloads, totalItems, tabId);
    }
  }
}

// Download Reddit videos (requires special handling)
async function downloadRedditVideo(media, tabId) {
  try {
    // Fetch post JSON to get video details
    const response = await fetch(media.url);
    const json = await response.json();
    
    // Extract video URL from the JSON response
    const postData = json[0].data.children[0].data;
    let videoUrl = null;
    let audioUrl = null;
    
    if (postData.secure_media && 
        postData.secure_media.reddit_video) {
      // Get highest quality video URL
      videoUrl = postData.secure_media.reddit_video.fallback_url;
      
      // Reddit videos often have separate audio
      // The audio URL follows a pattern
      if (videoUrl) {
        const baseUrl = videoUrl.split('DASH_')[0];
        audioUrl = `${baseUrl}DASH_audio.mp4`;
      }
    }
    
    if (videoUrl) {
      // Download video
      await chrome.downloads.download({
        url: videoUrl,
        filename: media.filename,
        saveAs: false
      });
      
      // Try to download audio if it exists (will 404 if it doesn't)
      if (audioUrl) {
        const audioFilename = media.filename.replace('.mp4', '_audio.mp4');
        try {
          await chrome.downloads.download({
            url: audioUrl,
            filename: audioFilename,
            saveAs: false
          });
        } catch (e) {
          // Audio may not exist, which is fine
          console.log('No separate audio track found');
        }
      }
    }
  } catch (error) {
    console.error('Error processing Reddit video:', error);
    throw error; // Rethrow to handle in the main function
  }
}

// Update download progress
async function updateProgress(current, total, tabId) {
  // Send message to content script with progress
  try {
    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, {
        type: 'downloadProgress',
        current,
        total
      }, (response) => {
        // If there's a lastError, the content script may have been unloaded or disconnected
        if (chrome.runtime.lastError) {
          console.log('Error updating progress:', chrome.runtime.lastError.message);
        }
        resolve(); // Resolve anyway to continue downloads
      });
      
      // Set a timeout to resolve the promise in case the response never comes
      setTimeout(resolve, 1000);
    });
    
    // Also update popup if open
    try {
      chrome.runtime.sendMessage({
        type: 'downloadUpdate',
        completed: current,
        total: total
      }, (response) => {
        // It's okay if this fails - popup might be closed
        if (chrome.runtime.lastError) {
          console.log('Popup might be closed:', chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      // Suppress errors - popup might be closed
      console.log('Error sending to popup, might be closed:', e);
    }
  } catch (error) {
    console.error('Error in updateProgress:', error);
  }
}