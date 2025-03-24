// This script will be injected into the page and will run in the page context
// It can access the shadow DOM directly
(function() {
  console.log("Shadow DOM extractor loaded");
  
  // Function to extract media from shadow DOM
  function extractMediaFromShadowDOM() {
    console.log("Extracting media from all shadow DOMs");
    
    // Get all shreddit-post elements
    const posts = document.querySelectorAll('shreddit-post');
    console.log(`Found ${posts.length} shreddit-post elements`);
    
    const results = [];
    
    // For each post, extract media information
    posts.forEach(post => {
      try {
        // Get the post ID from attribute or content
        const postId = post.id || post.getAttribute('id');
        
        // Check if the post is selected (has our checkbox checked)
        // We can look for a checkbox in front of the post
        const previousSibling = post.previousElementSibling;
        const isCheckboxWrapper = previousSibling && 
                                  previousSibling.classList.contains('reddit-media-dl-checkbox-wrapper');
        
        const isSelected = isCheckboxWrapper && 
                         previousSibling.querySelector('input[type="checkbox"]')?.checked;
        
        if (!isSelected) {
          return; // Skip if not selected
        }
        
        console.log(`Processing selected post: ${postId}`);
        
        // Look in the shadow DOM for media
        if (post.shadowRoot) {
          const media = {
            postId,
            images: [],
            videos: [],
            links: []
          };
          
          // Extract images
          const images = post.shadowRoot.querySelectorAll('img');
          images.forEach(img => {
            if (img.src && 
                (img.width > 100 || img.height > 100 || 
                 img.src.includes('preview.redd.it') || 
                 img.src.includes('i.redd.it'))) {
              // Clean up URL
              let url = img.src.replace(/\?.*$/, '');
              if (url.includes('preview.redd.it')) {
                url = url.replace(/preview\.redd\.it/, 'i.redd.it');
              }
              
              media.images.push({ url });
            }
          });
          
          // Extract videos
          const videos = post.shadowRoot.querySelectorAll('video');
          videos.forEach(video => {
            const sources = video.querySelectorAll('source');
            if (sources.length > 0) {
              media.videos.push({ url: sources[0].src.replace(/\?.*$/, '') });
            } else if (video.src) {
              media.videos.push({ url: video.src.replace(/\?.*$/, '') });
            }
          });
          
          // Extract permalink for direct access
          const permalinks = post.shadowRoot.querySelectorAll('a[href*="/comments/"]');
          permalinks.forEach(link => {
            if (link.href && link.href.includes('/comments/')) {
              media.links.push({ url: link.href });
            }
          });
          
          // Check if we have valid media
          if (media.images.length > 0 || media.videos.length > 0 || media.links.length > 0) {
            results.push(media);
          } else if (postId) {
            // If we have a post ID but no media, still add it for JSON fetching
            results.push({ postId, fallbackUrl: true });
          }
        }
      } catch (e) {
        console.error("Error processing post:", e);
      }
    });
    
    return results;
  }
  
  // Listen for messages from content script
  window.addEventListener('message', function(event) {
    // Only accept messages from the same frame
    if (event.source !== window) return;
    
    // Check if it's our message
    if (event.data.type && event.data.type === 'EXTRACT_MEDIA') {
      console.log("Received extract media request");
      const mediaData = extractMediaFromShadowDOM();
      
      // Send the results back to the content script
      window.postMessage({
        type: 'EXTRACTED_MEDIA_RESULT',
        data: mediaData
      }, '*');
    }
  });
  
  console.log("Shadow DOM extractor ready");
})();