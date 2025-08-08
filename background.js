// Listens for a message from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Check if the message is for capturing the visible tab
  if (request.action === "captureVisibleTab") {
    // Use the Chrome Tabs API to capture the visible area of the current tab
    chrome.tabs.captureVisibleTab(
      null, // Captures the current active tab
      { format: "png" }, // The format of the resulting image
      (dataUrl) => {
        // This is a callback function that receives the image data as a base64 URL
        if (chrome.runtime.lastError) {
          // If there was an error, log it and send back an error response
          console.error(chrome.runtime.lastError.message);
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        // Send the image data URL back to the content script
        sendResponse({ imageDataUrl: dataUrl });
      }
    );

    // Return true to indicate that we will send a response asynchronously
    return true;
  }
});
