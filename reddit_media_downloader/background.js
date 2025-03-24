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
  
  console.log(`Starting download of ${totalItems} media items`);
  
  for (const media of mediaItems) {
    try {
      if (media.type === 'reddit-video') {
        console.log("Processing Reddit video JSON:", media.url);
        // Handle special case for Reddit videos (requires JSON fetch)
        await downloadRedditVideo(media, tabId);
      } else {
        // Standard download for regular media
        console.log("Downloading direct media:", media.url);
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
    console.log("Fetching Reddit JSON data from:", media.url);
    // Fetch post JSON to get video details
    const response = await fetch(media.url);
    const json = await response.json();
    
    console.log("Received JSON data:", json);
    
    // Extract video URL from the JSON response
    if (!json || !json[0] || !json[0].data || !json[0].data.children || !json[0].data.children[0]) {
      throw new Error("Invalid JSON structure for Reddit post");
    }
    
    const postData = json[0].data.children[0].data;
    console.log("Post data extracted");
    
    let videoUrl = null;
    let audioUrl = null;
    let imageUrl = null;
    
    // First check for videos
    if (postData.secure_media && postData.secure_media.reddit_video) {
      console.log("Found reddit_video in secure_media");
      // Get highest quality video URL
      videoUrl = postData.secure_media.reddit_video.fallback_url;
      
      // Reddit videos often have separate audio
      // The audio URL follows a pattern
      if (videoUrl) {
        const baseUrl = videoUrl.split('DASH_')[0];
        audioUrl = `${baseUrl}DASH_audio.mp4`;
      }
    } 
    // Check for crosspost original media
    else if (postData.crosspost_parent_list && 
             postData.crosspost_parent_list[0] && 
             postData.crosspost_parent_list[0].secure_media && 
             postData.crosspost_parent_list[0].secure_media.reddit_video) {
      console.log("Found reddit_video in crosspost_parent_list");
      videoUrl = postData.crosspost_parent_list[0].secure_media.reddit_video.fallback_url;
      
      if (videoUrl) {
        const baseUrl = videoUrl.split('DASH_')[0];
        audioUrl = `${baseUrl}DASH_audio.mp4`;
      }
    }
    // Check for preview videos (GIFs)
    else if (postData.preview && 
             postData.preview.reddit_video_preview) {
      console.log("Found reddit_video_preview");
      videoUrl = postData.preview.reddit_video_preview.fallback_url;
    }
    // If no video, check for images
    else if (postData.url && 
            (postData.url.endsWith('.jpg') || 
             postData.url.endsWith('.png') || 
             postData.url.endsWith('.gif') ||
             postData.url.includes('i.redd.it') || 
             postData.url.includes('i.imgur.com'))) {
      console.log("Found image URL:", postData.url);
      imageUrl = postData.url;
    }
    // Check for gallery
    else if (postData.is_gallery && postData.gallery_data && postData.media_metadata) {
      console.log("Found gallery");
      const galleryItems = postData.gallery_data.items;
      
      for (const item of galleryItems) {
        const mediaId = item.media_id;
        if (postData.media_metadata[mediaId] && 
            postData.media_metadata[mediaId].s && 
            postData.media_metadata[mediaId].s.u) {
          
          // Get image URL and clean it (Reddit escapes URLs in JSON)
          let galleryImageUrl = postData.media_metadata[mediaId].s.u;
          galleryImageUrl = galleryImageUrl.replace(/&amp;/g, '&');
          
          console.log("Downloading gallery image:", galleryImageUrl);
          
          try {
            await chrome.downloads.download({
              url: galleryImageUrl,
              filename: `reddit_gallery_${mediaId}_${Date.now()}.jpg`,
              saveAs: false
            });
          } catch (e) {
            console.error("Error downloading gallery image:", e);
          }
        }
      }
      
      return; // We've handled the gallery, no need to continue
    }
    
    if (videoUrl) {
      console.log("Downloading video:", videoUrl);
      // Download video
      await chrome.downloads.download({
        url: videoUrl,
        filename: media.filename,
        saveAs: false
      });
      
      // Try to download audio if it exists (will 404 if it doesn't)
      if (audioUrl) {
        console.log("Downloading audio:", audioUrl);
        const audioFilename = media.filename.replace('.mp4', '_audio.mp4');
        try {
          await chrome.downloads.download({
            url: audioUrl,
            filename: audioFilename,
            saveAs: false
          });
        } catch (e) {
          // Audio may not exist, which is fine
          console.log('No separate audio track found or error downloading audio');
        }
      }
    } else if (imageUrl) {
      console.log("Downloading image:", imageUrl);
      // Download image
      await chrome.downloads.download({
        url: imageUrl,
        filename: getFilenameFromUrl(imageUrl),
        saveAs: false
      });
    } else {
      console.log("No media found in post data");
      throw new Error("No downloadable media found in post");
    }
  } catch (error) {
    console.error('Error processing Reddit media:', error);
    throw error; // Rethrow to handle in the main function
  }
}

// Helper function to extract filename from URL
function getFilenameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    
    // Add timestamp to ensure uniqueness
    const timestamp = Date.now();
    const extension = filename.includes('.') ? 
      filename.substring(filename.lastIndexOf('.')) : 
      '.jpg';
    
    const nameWithoutExtension = filename.includes('.') ? 
      filename.substring(0, filename.lastIndexOf('.')) : 
      filename;
    
    return `reddit_${nameWithoutExtension}_${timestamp}${extension}`;
  } catch (e) {
    console.error("Error parsing URL:", url, e);
    return `reddit_download_${Date.now()}.jpg`;
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