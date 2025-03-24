document.addEventListener('DOMContentLoaded', function() {
  const activateBtn = document.getElementById('activateBtn');
  const selectionStatus = document.getElementById('selectionStatus');
  const downloadStatus = document.getElementById('downloadStatus');
  const downloadCount = document.getElementById('downloadCount');
  
  // Check if selection mode is already active
  chrome.storage.local.get(['selectionModeActive', 'selectedCount'], function(result) {
    if (result.selectionModeActive) {
      activateBtn.textContent = 'Selection Mode Active';
      activateBtn.disabled = true;
      
      if (result.selectedCount && result.selectedCount > 0) {
        selectionStatus.textContent = `${result.selectedCount} posts selected`;
        downloadStatus.style.display = 'block';
      }
    }
  });
  
  // Listen for updates from content script - Don't return true here
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === 'selectionUpdate') {
      selectionStatus.textContent = `${message.count} posts selected`;
      if (message.count > 0) {
        downloadStatus.style.display = 'block';
      } else {
        downloadStatus.style.display = 'none';
      }
    } else if (message.type === 'downloadUpdate') {
      downloadCount.textContent = message.completed;
    }
    // No need to return true since we're not sending an async response
  });
  
  // Enable selection mode when button is clicked
  activateBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0].url.includes('reddit.com')) {
        // Use try-catch to handle potential errors when sending message
        try {
          chrome.tabs.sendMessage(tabs[0].id, {action: 'activateSelectionMode'}, function(response) {
            // Handle response or lack thereof
            if (chrome.runtime.lastError) {
              console.log("Message sending failed: ", chrome.runtime.lastError.message);
              return;
            }
          });
        } catch (e) {
          console.error("Error sending message: ", e);
        }
        
        activateBtn.textContent = 'Selection Mode Active';
        activateBtn.disabled = true;
        chrome.storage.local.set({selectionModeActive: true});
      } else {
        selectionStatus.textContent = 'Not a Reddit page';
        selectionStatus.style.color = 'red';
      }
    });
  });
});