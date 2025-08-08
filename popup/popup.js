// Get the button from the popup HTML
const startBtn = document.getElementById("start-capture-btn");
const reviewBtn = document.getElementById("reviewBtn");

// Add a click event listener to the button
startBtn.addEventListener("click", async () => {
  // Get the current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject the content script into the active tab
  // This will start the snipping process on the webpage
  if (tab) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/content.js"],
    });
    // Close the popup window after clicking the button
    window.close();
  }
});

// --- Review Button ---
reviewBtn.addEventListener("click", () => {
  chrome.tabs.create({
    url: "https://chromewebstore.google.com/detail/ID/reviews",
  });
});

// --- Footer Links ---
document.getElementById("donateLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://coff.ee/dizaraj" });
});

document.getElementById("aboutLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://dizaraj.github.io" });
});
