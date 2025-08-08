// Ensure the script runs only once to avoid conflicts
if (!document.getElementById("annotation-canvas")) {
  // --- HELPER FUNCTIONS for DYNAMIC OVERLAY ---

  /**
   * Determines if a given CSS color string is "dark".
   * @param {string} colorStr The CSS color string (e.g., "rgb(255, 255, 255)").
   * @returns {boolean} True if the color is dark, false otherwise.
   */
  function isColorDark(colorStr) {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colorStr);
    if (!match) {
      return false;
    }
    const [, r, g, b] = match.map(Number);
    // A value below 140 is generally considered dark.
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance < 140;
  }

  /**
   * Gets the effective background color of the page by checking the body and html elements.
   * @returns {string} The effective CSS background color.
   */
  function getPageBackgroundColor() {
    const bodyStyle = window.getComputedStyle(document.body);
    let color = bodyStyle.backgroundColor;

    // If the body's background is transparent, check the <html> element.
    if (color === "rgba(0, 0, 0, 0)" || color === "transparent") {
      const htmlStyle = window.getComputedStyle(document.documentElement);
      color = htmlStyle.backgroundColor;
    }

    // If both are transparent, default to white.
    if (color === "rgba(0, 0, 0, 0)" || color === "transparent") {
      return "rgb(255, 255, 255)";
    }

    return color;
  }

  // Determine the overlay color based on the page's background
  const pageBgColor = getPageBackgroundColor();
  const isDarkTheme = isColorDark(pageBgColor);
  const overlayColor = isDarkTheme
    ? "rgba(255, 255, 255, 0.25)" // Dark theme overlay
    : "rgba(0, 0, 0, 0.25)"; // Light theme overlay

  // --- SETUP ---
  const body = document.body;

  // 0. Create and manage the custom crosshair
  const customCrosshair = document.createElement("div");
  customCrosshair.id = "custom-crosshair";
  body.appendChild(customCrosshair);

  const moveCrosshair = (e) => {
    // We use clientX/Y to position the crosshair relative to the viewport
    customCrosshair.style.left = `${e.clientX}px`;
    customCrosshair.style.top = `${e.clientY}px`;
  };

  // Show the crosshair and start tracking the mouse
  customCrosshair.style.display = "block";
  document.addEventListener("mousemove", moveCrosshair);

  // 1. Create the overlay
  const overlay = document.createElement("div");
  overlay.id = "snipping-overlay";
  body.appendChild(overlay);

  // 2. Create the canvas for drawing and selection
  const canvas = document.createElement("canvas");
  canvas.id = "annotation-canvas";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // 3. Inject the stylesheet for our elements
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = chrome.runtime.getURL("content/content.css");
  document.head.appendChild(link);

  // --- STATE MANAGEMENT ---
  let isSelecting = false;
  let isDrawing = false;
  let isTyping = false;
  let selectionRect = null;
  let startPos = { x: 0, y: 0 };
  let currentTool = "none"; // 'draw', 'text'
  let toolOptions = {
    color: "#ff3838", // A bright default color
    lineWidth: 5,
    fontSize: 24,
    fontFamily: "Arial", // Added default font family
  };

  // --- DRAWING LOGIC ---
  function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw the semi-transparent overlay everywhere
    // ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillStyle = overlayColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear the selected area if it exists
    if (selectionRect) {
      ctx.clearRect(
        selectionRect.x,
        selectionRect.y,
        selectionRect.w,
        selectionRect.h
      );
    }
  }
  redrawCanvas(); // Initial draw

  // --- EVENT LISTENERS ---
  function onMouseDown(e) {
    // Prevent interaction if a textbox is already active
    if (isTyping) return;

    if (currentTool === "none" && !selectionRect) {
      isSelecting = true;
      startPos = { x: e.clientX, y: e.clientY };
    } else if (currentTool === "draw") {
      isDrawing = true;
      ctx.beginPath();
      ctx.moveTo(e.clientX, e.clientY);
    } else if (currentTool === "text") {
      // FIXED: Allow creating a textbox anywhere after a selection has been made.
      if (selectionRect) {
        createTextbox(e.clientX, e.clientY);
      }
    }
  }

  function onMouseMove(e) {
    if (isSelecting) {
      const endPos = { x: e.clientX, y: e.clientY };
      selectionRect = {
        x: Math.min(startPos.x, endPos.x),
        y: Math.min(startPos.y, endPos.y),
        w: Math.abs(startPos.x - endPos.x),
        h: Math.abs(startPos.y - endPos.y),
      };
      redrawCanvas(); // Redraw to show selection rectangle
    } else if (isDrawing) {
      ctx.lineTo(e.clientX, e.clientY);
      ctx.strokeStyle = toolOptions.color;
      ctx.lineWidth = toolOptions.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }

  function onMouseUp() {
    if (isSelecting) {
      isSelecting = false;
      if (selectionRect && selectionRect.w > 10 && selectionRect.h > 10) {
        createToolbar();
        overlay.style.display = "none"; // Canvas now handles the visual overlay
        // Cursor logic is now handled by setActiveTool
        setActiveTool("none");
      } else {
        cleanup(); // Cancel if selection is too small
      }
    }
    if (isDrawing) {
      isDrawing = false;
      ctx.closePath();
    }
  }

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);

  // --- TOOLBAR & ANNOTATION ---
  function createToolbar() {
    const toolbar = document.createElement("div");
    toolbar.id = "annotation-toolbar";
    toolbar.innerHTML = `
            <!-- Tool Buttons with SVG Icons -->
            <button id="draw-btn" title="Draw Tool">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M36.4 353.2c4.1-14.6 11.8-27.9 22.6-38.7l181.2-181.2 33.9-33.9c16.6 16.6 51.3 51.3 104 104l33.9 33.9-33.9 33.9-181.2 181.2c-10.7 10.7-24.1 18.5-38.7 22.6L30.4 510.6c-8.3 2.3-17.3 0-23.4-6.2S-1.4 489.3 .9 481L36.4 353.2zm55.6-3.7c-4.4 4.7-7.6 10.4-9.3 16.6l-24.1 86.9 86.9-24.1c6.4-1.8 12.2-5.1 17-9.7L91.9 349.5zm354-146.1c-16.6-16.6-51.3-51.3-104-104L308 65.5C334.5 39 349.4 24.1 352.9 20.6 366.4 7 384.8-.6 404-.6S441.6 7 455.1 20.6l35.7 35.7C504.4 69.9 512 88.3 512 107.4s-7.6 37.6-21.2 51.1c-3.5 3.5-18.4 18.4-44.9 44.9z"/></svg>
            </button>
            <button id="text-btn" title="Text Tool">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M285.1 50.7C279.9 39.3 268.5 32 256 32s-23.9 7.3-29.1 18.7L59.5 416 48 416c-17.7 0-32 14.3-32 32s14.3 32 32 32l88 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-6.1 0 22-48 208.3 0 22 48-6.1 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l88 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-11.5 0-167.4-365.3zM330.8 304L181.2 304 256 140.8 330.8 304z"/></svg>
            </button>

            <!-- Drawing Tool Options (hidden by default) -->
            <div id="draw-tool-options" class="tool-options">
                <input type="color" id="color-picker-draw" title="Line Color" value="${toolOptions.color}">
                <select id="line-width" title="Line Width">
                    <option value="2">Thin</option>
                    <option value="5" selected>Medium</option>
                    <option value="10">Thick</option>
                    <option value="20">X-Thick</option>
                </select>
            </div>

            <!-- Text Tool Options (hidden by default) -->
            <div id="text-tool-options" class="tool-options">
                <input type="color" id="color-picker-text" title="Text Color" value="${toolOptions.color}">
                <select id="font-family" title="Font Family">
                    <option value="Arial">Arial</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                </select>
                <select id="font-size" title="Font Size">
                    <option value="14">14px</option>
                    <option value="16">16px</option>
                    <option value="18">18px</option>
                    <option value="24" selected>24px</option>
                    <option value="32">32px</option>
                    <option value="42">42px</option>
                    <option value="56">56px</option>
                    <option value="72">72px</option>
                </select>
            </div>

            <!-- Action Buttons -->
            <button id="save-btn" title="Save"><svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg></button>
            <button id="cancel-btn" title="Cancel"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg></button>
            <button id="help-btn" title="Help">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zm0-336c-17.7 0-32 14.3-32 32 0 13.3-10.7 24-24 24s-24-10.7-24-24c0-44.2 35.8-80 80-80s80 35.8 80 80c0 47.2-36 67.2-56 74.5l0 3.8c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-8.1c0-20.5 14.8-35.2 30.1-40.2 6.4-2.1 13.2-5.5 18.2-10.3 4.3-4.2 7.7-10 7.7-19.6 0-17.7-14.3-32-32-32zM224 368a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>
            </button>
        `;
    body.appendChild(toolbar);

    // Toolbar event listeners
    document
      .getElementById("draw-btn")
      .addEventListener("click", () => setActiveTool("draw"));
    document
      .getElementById("text-btn")
      .addEventListener("click", () => setActiveTool("text"));
    document.getElementById("save-btn").addEventListener("click", saveCapture);
    document.getElementById("cancel-btn").addEventListener("click", cleanup);

    // Option listeners
    const colorPickerDraw = document.getElementById("color-picker-draw");
    const colorPickerText = document.getElementById("color-picker-text");
    const lineWidth = document.getElementById("line-width");
    const fontSize = document.getElementById("font-size");
    const fontFamily = document.getElementById("font-family");

    colorPickerDraw.addEventListener("input", (e) => {
      toolOptions.color = e.target.value;
      colorPickerText.value = e.target.value;
    });
    colorPickerText.addEventListener("input", (e) => {
      toolOptions.color = e.target.value;
      colorPickerDraw.value = e.target.value;
    });
    lineWidth.addEventListener("change", (e) => {
      toolOptions.lineWidth = parseInt(e.target.value, 10);
    });
    fontSize.addEventListener("change", (e) => {
      toolOptions.fontSize = parseInt(e.target.value, 10);
    });
    fontFamily.addEventListener("change", (e) => {
      toolOptions.fontFamily = e.target.value;
    });
  }

  function setActiveTool(tool) {
    // Toggle tool state
    currentTool = currentTool === tool ? "none" : tool;

    const toolbar = document.getElementById("annotation-toolbar");
    document
      .getElementById("draw-btn")
      .classList.toggle("active", currentTool === "draw");
    document
      .getElementById("text-btn")
      .classList.toggle("active", currentTool === "text");

    // Show/hide tool options
    toolbar.classList.toggle("draw-options-visible", currentTool === "draw");
    toolbar.classList.toggle("text-options-visible", currentTool === "text");

    // UPDATED CURSOR LOGIC
    if (currentTool === "draw") {
      customCrosshair.style.display = "block";
      canvas.style.cursor = "none";
    } else if (currentTool === "text") {
      customCrosshair.style.display = "none";
      canvas.style.cursor = "text";
    } else {
      // 'none'
      customCrosshair.style.display = "none";
      canvas.style.cursor = "default";
    }
  }

  function createTextbox(x, y) {
    if (isTyping) return;
    isTyping = true;

    const input = document.createElement("textarea");
    input.style.position = "fixed";
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    // UPDATED: Make textbox transparent with a more visible border
    input.style.border = "2px dashed #ccc";
    input.style.borderRadius = "3px";
    input.style.background = "transparent";
    input.style.color = toolOptions.color;
    input.style.fontFamily = toolOptions.fontFamily;
    input.style.fontSize = `${toolOptions.fontSize}px`;
    input.style.zIndex = "2147483647"; // Ensure it's on top
    input.style.padding = "5px";
    input.style.resize = "none";
    input.style.outline = "none";

    const finishTyping = () => {
      try {
        const text = input.value;
        // Only draw if there's non-whitespace content
        if (text.trim()) {
          const textLines = text.split("\n");
          ctx.font = `${toolOptions.fontSize}px ${toolOptions.fontFamily}`;
          ctx.fillStyle = toolOptions.color;
          ctx.textBaseline = "top";

          const lineHeight = toolOptions.fontSize * 1.2; // Set line height for multiline text
          textLines.forEach((line, index) => {
            ctx.fillText(line, x + 5, y + 5 + index * lineHeight);
          });
        }
      } catch (error) {
        console.error("Snipping Tool: Error drawing text.", error);
      } finally {
        // This block ensures the input is removed and state is reset
        if (input.parentElement) {
          input.parentElement.removeChild(input);
        }
        isTyping = false;
      }
    };

    input.addEventListener("blur", finishTyping);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        input.blur();
      }
    });

    // FIXED: Use a timeout to prevent the mousedown event that creates the
    // textbox from immediately triggering a blur event on it.
    setTimeout(() => {
      body.appendChild(input);
      input.focus();
    }, 0);
  }

  // --- FINAL ACTIONS ---
  function saveCapture() {
    document.getElementById("annotation-toolbar")?.remove();

    // Use a small timeout to ensure the toolbar is visually gone before capture
    setTimeout(() => {
      // Create a temporary canvas with the screenshot and our drawing on top
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = canvas.width;
      finalCanvas.height = canvas.height;
      const finalCtx = finalCanvas.getContext("2d");

      // Send message to background script to get screenshot
      chrome.runtime.sendMessage(
        { action: "captureVisibleTab" },
        (response) => {
          if (response && response.imageDataUrl) {
            const img = new Image();
            img.onload = () => {
              // Draw the screenshot first
              finalCtx.drawImage(img, 0, 0);
              // Draw our annotation canvas on top of it
              finalCtx.drawImage(canvas, 0, 0);

              // Convert the combined canvas to a data URL and download
              const a = document.createElement("a");
              a.href = finalCanvas.toDataURL("image/png");
              a.download = `capture-${Date.now()}.png`;
              a.click();
              cleanup(); // Clean up everything after saving
            };
            img.src = response.imageDataUrl;
          } else {
            console.error("Failed to capture tab:", response.error);
            alert(
              "Could not capture the page. Try reloading the page and attempting again."
            );
            cleanup();
          }
        }
      );
    }, 100);
  }

  function cleanup() {
    // Remove the custom crosshair and its event listener
    document.removeEventListener("mousemove", moveCrosshair);
    document.getElementById("custom-crosshair")?.remove();

    // Original cleanup
    document.getElementById("annotation-canvas")?.remove();
    document.getElementById("snipping-overlay")?.remove();
    document.getElementById("annotation-toolbar")?.remove();
    document.head.removeChild(link);
  }
}
