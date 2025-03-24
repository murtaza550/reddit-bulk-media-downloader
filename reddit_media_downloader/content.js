// Global variables
let selectionModeActive = false;
let selectedPosts = new Set();
let controlsElement = null;

// Initialize when the page loads
function initialize() {
  console.log("Reddit Media Downloader initialized");
  
  // Check if selection mode was previously activated
  chrome.storage.local.get(['selectionModeActive'], function(result) {
    if (result.selectionModeActive) {
      activateSelectionMode();
    }
  });
  
  // Listen for messages from popup or background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in content script:", message);
    if (message.action === 'activateSelectionMode') {
      activateSelectionMode();
      // Send immediate response
      sendResponse({success: true});
    }
    // Don't return true since we're sending an immediate response
  });
}

// Activate selection mode
function activateSelectionMode() {
  console.log("Activating selection mode");
  
  if (selectionModeActive) {
    console.log("Selection mode already active");
    return;
  }
  
  selectionModeActive = true;
  
  // Add checkboxes to all posts
  setTimeout(() => {
    addCheckboxesToPosts();
    
    // Create floating controls
    createControls();
    
    // Set up a mutation observer to handle dynamically loaded content
    setupMutationObserver();
    
    // Update UI
    updateSelectionUI();
  }, 500); // Small delay to ensure DOM is fully loaded
}

// Find Reddit posts using various selectors to accommodate different Reddit layouts
function findRedditPosts() {
  // Try multiple selectors to find Reddit posts
  let allPosts = [];
  
  // 1. Try the primary selector for new Reddit
  const posts1 = document.querySelectorAll('[data-testid="post-container"]');
  console.log(`Found ${posts1.length} posts with [data-testid="post-container"]`);
  if (posts1.length > 0) {
    allPosts.push(...posts1);
  }
  
  // 2. Alternative selector for new Reddit
  if (allPosts.length === 0) {
    const posts2 = document.querySelectorAll('.Post');
    console.log(`Found ${posts2.length} posts with .Post`);
    if (posts2.length > 0) {
      allPosts.push(...posts2);
    }
  }
  
  // 3. Try cards for new Reddit
  if (allPosts.length === 0) {
    const posts3 = document.querySelectorAll('div[data-testid="post"]');
    console.log(`Found ${posts3.length} posts with div[data-testid="post"]`);
    if (posts3.length > 0) {
      allPosts.push(...posts3);
    }
  }
  
  // 4. Try shreddit cards (newest Reddit version)
  if (allPosts.length === 0) {
    const posts4 = document.querySelectorAll('shreddit-post');
    console.log(`Found ${posts4.length} posts with shreddit-post`);
    if (posts4.length > 0) {
      allPosts.push(...posts4);
    }
  }
  
  // 5. Try for old.reddit.com
  if (allPosts.length === 0) {
    const posts5 = document.querySelectorAll('.thing.link');
    console.log(`Found ${posts5.length} posts with .thing.link (old Reddit)`);
    if (posts5.length > 0) {
      allPosts.push(...posts5);
    }
  }
  
  // 6. Articles as fallback
  if (allPosts.length === 0) {
    const posts6 = document.querySelectorAll('article');
    console.log(`Found ${posts6.length} posts with article`);
    if (posts6.length > 0) {
      allPosts.push(...posts6);
    }
  }
  
  return allPosts;
}

// Add checkboxes to Reddit posts
function addCheckboxesToPosts() {
  console.log("Adding checkboxes to posts");
  
  // Find posts using multiple selectors
  const posts = findRedditPosts();
  console.log(`Total posts found: ${posts.length}`);
  
  if (posts.length === 0) {
    alert("No Reddit posts found. The extension may not be compatible with this version of Reddit.");
    return;
  }
  
  posts.forEach((post, index) => {
    // Skip if already processed
    if (post.querySelector('.reddit-media-dl-checkbox')) {
      return;
    }
    
    console.log(`Adding checkbox to post ${index+1}`);
    
    // Create checkbox wrapper
    const checkboxWrapper = document.createElement('div');
    checkboxWrapper.className = 'reddit-media-dl-checkbox-wrapper';
    checkboxWrapper.style.position = 'absolute';
    checkboxWrapper.style.top = '5px';
    checkboxWrapper.style.left = '5px';
    checkboxWrapper.style.zIndex = '10000';
    
    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'reddit-media-dl-checkbox';
    checkbox.style.width = '24px';
    checkbox.style.height = '24px';
    checkbox.style.cursor = 'pointer';
    checkbox.style.opacity = '0.9';
    checkbox.style.backgroundColor = 'white';
    checkbox.style.border = '2px solid #ff4500';
    checkbox.dataset.postId = getPostId(post);
    
    // Add event listener to checkbox
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        selectedPosts.add(this.dataset.postId);
      } else {
        selectedPosts.delete(this.dataset.postId);
      }
      updateSelectionUI();
    });
    
    // Add checkbox to post
    checkboxWrapper.appendChild(checkbox);
    
    // Make sure the post has position relative for absolute positioning of checkbox
    const computedStyle = window.getComputedStyle(post);
    if (computedStyle.position === 'static') {
      post.style.position = 'relative';
    }
    
    post.prepend(checkboxWrapper);
  });
}

// Create floating controls for downloading
function createControls() {
  if (controlsElement) return;
  
  controlsElement = document.createElement('div');
  controlsElement.className = 'reddit-media-dl-controls';
  controlsElement.style.position = 'fixed';
  controlsElement.style.bottom = '20px';
  controlsElement.style.right = '20px';
  controlsElement.style.backgroundColor = '#ff4500';
  controlsElement.style.color = 'white';
  controlsElement.style.padding = '10px 15px';
  controlsElement.style.borderRadius = '5px';
  controlsElement.style.zIndex = '10000';
  controlsElement.style.display = 'flex';
  controlsElement.style.flexDirection = 'column';
  controlsElement.style.gap = '10px';
  controlsElement.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  
  const statusElement = document.createElement('div');
  statusElement.className = 'reddit-media-dl-status';
  statusElement.textContent = 'No posts selected';
  
  const progressContainer = document.createElement('div');
  progressContainer.className = 'reddit-media-dl-progress';
  progressContainer.style.width = '100%';
  progressContainer.style.height = '5px';
  progressContainer.style.backgroundColor = '#ccc';
  progressContainer.style.borderRadius = '3px';
  progressContainer.style.overflow = 'hidden';
  progressContainer.style.display = 'none';
  
  const progressBar = document.createElement('div');
  progressBar.className = 'reddit-media-dl-progress-bar';
  progressBar.style.height = '100%';
  progressBar.style.backgroundColor = '#0079d3';
  progressBar.style.width = '0%';
  progressBar.style.transition = 'width 0.2s';
  progressContainer.appendChild(progressBar);
  
  const downloadButton = document.createElement('button');
  downloadButton.className = 'reddit-media-dl-button';
  downloadButton.textContent = 'Download Selected';
  downloadButton.style.padding = '8px 12px';
  downloadButton.style.backgroundColor = '#0079d3';
  downloadButton.style.color = 'white';
  downloadButton.style.border = 'none';
  downloadButton.style.borderRadius = '4px';
  downloadButton.style.cursor = 'pointer';
  downloadButton.style.fontWeight = 'bold';
  downloadButton.disabled = true;
  downloadButton.addEventListener('click', downloadSelectedMedia);
  
  const cancelButton = document.createElement('button');
  cancelButton.className = 'reddit-media-dl-button';
  cancelButton.textContent = 'Exit Selection Mode';
  cancelButton.style.padding = '8px 12px';
  cancelButton.style.backgroundColor = '#0079d3';
  cancelButton.style.color = 'white';
  cancelButton.style.border = 'none';
  cancelButton.style.borderRadius = '4px';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.fontWeight = 'bold';
  cancelButton.addEventListener('click', deactivateSelectionMode);
  
  controlsElement.appendChild(statusElement);
  controlsElement.appendChild(progressContainer);
  controlsElement.appendChild(downloadButton);
  controlsElement.appendChild(cancelButton);
  
  document.body.appendChild(controlsElement);
}

// Update selection UI
function updateSelectionUI() {
  if (!controlsElement) return;
  
  const statusElement = controlsElement.querySelector('.reddit-media-dl-status');
  const downloadButton = controlsElement.querySelector('.reddit-media-dl-button');
  
  statusElement.textContent = selectedPosts.size === 0 ? 
    'No posts selected' : 
    `${selectedPosts.size} posts selected`;
  
  downloadButton.disabled = selectedPosts.size === 0;
  
  // Update selected count in storage
  chrome.storage.local.set({selectedCount: selectedPosts.size});
  
  // Notify popup of selection update - use try-catch to handle errors
  try {
    chrome.runtime.sendMessage({
      type: 'selectionUpdate',
      count: selectedPosts.size
    }, (response) => {
      // Handle errors in sending message
      if (chrome.runtime.lastError) {
        console.log('Error sending selection update:', chrome.runtime.lastError.message);
        // This is fine - popup might be closed
      }
    });
  } catch (e) {
    console.log('Error sending message:', e);
    // This is also fine - popup might be closed
  }
}

// Extract post ID from post element
function getPostId(postElement) {
  // Try to get the post ID from various elements
  
  // 1. Try from permalink
  const permalink = postElement.querySelector('a[data-testid="post_timestamp"]') || 
                   postElement.querySelector('a.comments') || 
                   postElement.querySelector('a[data-click-id="comments"]');
  
  if (permalink) {
    const href = permalink.getAttribute('href');
    const matches = href.match(/comments\/([a-z0-9]+)\//i);
    if (matches && matches[1]) {
      return matches[1];
    }
  }
  
  // 2. Try from ID attribute for old Reddit
  if (postElement.id && postElement.id.startsWith('thing_')) {
    return postElement.id.replace('thing_', '');
  }
  
  // 3. For shreddit-post or newer components
  if (postElement.tagName === 'SHREDDIT-POST' && postElement.getAttribute('id')) {
    return postElement.getAttribute('id');
  }
  
  // Fallback to a unique identifier
  return Date.now() + '-' + Math.random().toString(36).substring(2, 15);
}

// Get selected posts with media URLs
async function getSelectedPostsMedia() {
  const mediaUrls = [];
  const posts = findRedditPosts();
  
  for (const post of posts) {
    const checkbox = post.querySelector('.reddit-media-dl-checkbox');
    if (!checkbox || !checkbox.checked) continue;
    
    // Get post media
    const media = extractMediaFromPost(post);
    if (media.length > 0) {
      mediaUrls.push(...media);
    }
  }
  
  return mediaUrls;
}

// Extract media URLs from a post
function extractMediaFromPost(postElement) {
  const mediaUrls = [];
  
  // Look for images
  const images = postElement.querySelectorAll('img:not([alt="User avatar"]):not([alt="Subreddit icon"]):not([alt="User profile picture"])');
  images.forEach(img => {
    // Skip small icons and UI elements
    if (img.width > 100 && img.height > 100) {
      // Get highest quality version by removing resolution modifiers
      let url = img.src;
      
      // Improve image URLs to get highest quality
      // Remove size restrictions from URLs
      url = url.replace(/\?.*$/, ''); // Remove query parameters
      
      // Improve imgur links
      if (url.includes('imgur.com')) {
        url = url.replace(/\.(jpg|png|gif)$/, '.$1');
      }
      
      // Fix Reddit's own image URLs for highest quality
      if (url.includes('preview.redd.it')) {
        url = url.replace(/preview\.redd\.it/, 'i.redd.it');
      }
      
      // Replace thumbnails with full images for Reddit
      if (url.includes('external-preview.redd.it')) {
        // Try to find the actual URL in an anchor tag
        const parentAnchor = findClosestAnchor(img);
        if (parentAnchor && parentAnchor.href) {
          url = parentAnchor.href;
        }
      }
      
      mediaUrls.push({url, type: 'image', filename: getFilenameFromUrl(url)});
    }
  });
  
  // Look for videos
  const videos = postElement.querySelectorAll('video');
  videos.forEach(video => {
    // Try to get source elements
    const sources = video.querySelectorAll('source');
    if (sources.length > 0) {
      // Use the first source (usually highest quality)
      let url = sources[0].src;
      url = url.replace(/\?.*$/, ''); // Remove query parameters
      mediaUrls.push({url, type: 'video', filename: getFilenameFromUrl(url)});
    } else if (video.src) {
      // If no source elements, try the video src directly
      let url = video.src;
      url = url.replace(/\?.*$/, ''); // Remove query parameters
      mediaUrls.push({url, type: 'video', filename: getFilenameFromUrl(url)});
    }
  });
  
  // Look for video poster frames that might indicate videos (DASH/HLS)
  const videoPosters = postElement.querySelectorAll('video[poster]');
  videoPosters.forEach(video => {
    // Skip if we already have the video from sources
    if (video.querySelector('source')) return;
    
    // Check for Reddit's video player
    const postUrl = findPostUrl(postElement);
    if (postUrl && postUrl.includes('/comments/')) {
      mediaUrls.push({
        url: postUrl + '.json',
        type: 'reddit-video',
        filename: 'reddit_video_' + Date.now() + '.mp4'
      });
    }
  });
  
  // Look for links to gifs
  const links = postElement.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = link.href;
    if (href.match(/\.(gif|gifv)$/i)) {
      // Convert gifv links to mp4 for imgur
      let url = href;
      if (url.endsWith('.gifv') && url.includes('imgur.com')) {
        url = url.replace('.gifv', '.mp4');
      }
      mediaUrls.push({url, type: 'gif', filename: getFilenameFromUrl(url)});
    }
  });
  
  // Look for embeds (for YouTube, Twitter, etc.)
  const iframes = postElement.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    const src = iframe.src;
    if (src.includes('youtube.com/embed/') || src.includes('youtu.be/')) {
      // YouTube embed - we'll just note it
      console.log("Found YouTube embed, but can't download: ", src);
      // You could expand this to extract the YouTube video ID and add to mediaUrls
      // if you want to handle this case in the background script
    }
  });
  
  return mediaUrls;
}

// Find closest anchor element parent
function findClosestAnchor(element) {
  let current = element;
  while (current !== null) {
    if (current.tagName === 'A') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

// Find the post URL
function findPostUrl(postElement) {
  // Try multiple selectors to find the permalink
  const permalinkElement = 
    postElement.querySelector('a[data-testid="post_timestamp"]') || 
    postElement.querySelector('a.comments') || 
    postElement.querySelector('a[data-click-id="comments"]') ||
    postElement.querySelector('a.bylink');
    
  return permalinkElement ? permalinkElement.href : null;
}

// Get filename from URL
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

// Download selected media
async function downloadSelectedMedia() {
  const mediaUrls = await getSelectedPostsMedia();
  
  if (mediaUrls.length === 0) {
    alert('No media found in selected posts');
    return;
  }
  
  // Show progress bar
  const progressContainer = controlsElement.querySelector('.reddit-media-dl-progress');
  const progressBar = progressContainer.querySelector('.reddit-media-dl-progress-bar');
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  
  // Update status
  const statusElement = controlsElement.querySelector('.reddit-media-dl-status');
  statusElement.textContent = `Downloading 0/${mediaUrls.length}`;
  
  // Send request to background script to handle downloads
  try {
    chrome.runtime.sendMessage({
      action: 'downloadMedia',
      media: mediaUrls
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending download media message:', chrome.runtime.lastError.message);
        statusElement.textContent = 'Error: Could not start download';
        return;
      }
    });
  } catch (e) {
    console.error('Error sending download request:', e);
    statusElement.textContent = 'Error: Could not start download';
    return;
  }
  
  // Listen for progress updates
  const progressListener = function(message, sender, sendResponse) {
    if (message.type === 'downloadProgress') {
      const {current, total} = message;
      const percentage = (current / total) * 100;
      
      // Update UI
      progressBar.style.width = `${percentage}%`;
      statusElement.textContent = `Downloading ${current}/${total}`;
      
      // If download complete, remove listener
      if (current === total) {
        chrome.runtime.onMessage.removeListener(progressListener);
        
        // Show download complete message
        setTimeout(() => {
          statusElement.textContent = `Download complete: ${total} files`;
          progressContainer.style.display = 'none';
          
          // Reset selection
          selectedPosts.clear();
          updateSelectionUI();
          
          const checkboxes = document.querySelectorAll('.reddit-media-dl-checkbox');
          checkboxes.forEach(checkbox => {
            checkbox.checked = false;
          });
        }, 1000);
      }
      
      // Send response to avoid channel closing errors
      sendResponse({received: true});
    }
  };
  
  chrome.runtime.onMessage.addListener(progressListener);
}

// Deactivate selection mode
function deactivateSelectionMode() {
  selectionModeActive = false;
  
  // Remove controls
  if (controlsElement) {
    controlsElement.remove();
    controlsElement = null;
  }
  
  // Remove checkboxes
  const checkboxes = document.querySelectorAll('.reddit-media-dl-checkbox-wrapper');
  checkboxes.forEach(checkbox => checkbox.remove());
  
  // Reset storage
  chrome.storage.local.set({
    selectionModeActive: false,
    selectedCount: 0
  });
  
  // Disconnect mutation observer
  if (window.redditMediaMutationObserver) {
    window.redditMediaMutationObserver.disconnect();
  }
}

// Set up mutation observer for dynamically loaded content
function setupMutationObserver() {
  if (window.redditMediaMutationObserver) {
    window.redditMediaMutationObserver.disconnect();
  }
  
  const observer = new MutationObserver(mutations => {
    let shouldProcess = false;
    
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check for new posts
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for common Reddit post containers
            if (node.matches('[data-testid="post-container"]') || 
                node.matches('.Post') ||
                node.matches('shreddit-post') ||
                node.matches('article') ||
                node.matches('.thing.link') ||
                node.querySelector('[data-testid="post-container"]') ||
                node.querySelector('.Post') ||
                node.querySelector('shreddit-post') ||
                node.querySelector('article') ||
                node.querySelector('.thing.link')) {
              shouldProcess = true;
            }
          }
        });
      }
    });
    
    if (shouldProcess && selectionModeActive) {
      // Add a small delay to ensure the DOM is stable
      setTimeout(() => {
        addCheckboxesToPosts();
      }, 300);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  window.redditMediaMutationObserver = observer;
}

// Initialize on page load
initialize();

// Also try initializing after a delay to ensure everything is loaded
setTimeout(initialize, 1500);