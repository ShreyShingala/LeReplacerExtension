const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const stopButton = document.getElementById('stop');
const errorDiv = document.getElementById('error');
const statusDiv = document.getElementById('status');
let stream = null;
let handpose = null;
let isDetecting = false;

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index finger
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle finger
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring finger
    [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [5, 9], [9, 13], [13, 17] // Palm connections
  ];

// Record hand positions, detect every 30 frames
let previousHandPositions = [];
const MOVEMENT_THRESHOLD = 30;

async function startCamera() {
  try {
    // Request camera access
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user' // Use front camera, change to 'environment' for back camera
      },
      audio: false
    });
    
    video.srcObject = stream;
    // Set canvas size to match video when metadata loads
    video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        statusDiv.textContent = 'Camera started. Loading hand detection model...';
        initHandDetection();
      });

    errorDiv.textContent = '';
    console.log('Camera started successfully');
  } catch (err) {
    console.error('Error accessing camera:', err);
    errorDiv.textContent = `Error: ${err.message || 'Could not access camera'}`;
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    console.log('Camera stopped');
  }
}

async function initHandDetection() {
    try {
      handpose = await ml5.handPose({
        video: video,
        flipHorizontal: true, // Mirror the video
        maxNumHands: 2
      });
      
      statusDiv.textContent = 'Hand detection model loaded! Move your hands to see detection.';
      console.log('ml5.js HandPose initialized');
      
      detectHands();
    } catch (err) {
      console.error('Error initializing hand detection:', err);
      errorDiv.textContent = `Hand detection error: ${err.message}`;
      statusDiv.textContent = 'Camera active but hand detection failed.';
    }
}

function detectHands() {
    if (isDetecting) return;
    isDetecting = true;
    
    function detect() {
      if (!handpose || !stream) {
        isDetecting = false;
        return;
      }
      
      // Detect hands in the current video frame - pass video element to detect()
      handpose.detect(video, (results) => {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw video frame on canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if (results && results.length > 0) {
          // Process each detected hand
          results.forEach((hand, handIndex) => {
            const landmarks = hand.keypoints;
            
            // Draw hand landmarks and connections
            drawHand(landmarks);
            
            // Detect movement
            detectHandMovement(landmarks, handIndex);
          });
          
          statusDiv.textContent = `Detected ${results.length} hand(s). Move your hand to see movement tracking.`;
          statusDiv.style.color = '#4CAF50';
        } else {
          // No hands detected
          previousHandPositions = [];
          statusDiv.textContent = 'No hands detected. Show your hands to the camera.';
          statusDiv.style.color = '#FFA500';
        }
        
        // Continue detection loop
        if (isDetecting) {
          requestAnimationFrame(detect);
        }
      });
    }
    
    // Start detection loop
    detect();
  }
  
  function drawHand(landmarks) {
    // Draw connections (bones) with colors
    ctx.strokeStyle = '#00FF00';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    HAND_CONNECTIONS.forEach(([start, end]) => {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];
      
      if (startPoint && endPoint) {
        // Create gradient for each connection
        const gradient = ctx.createLinearGradient(
          startPoint.x, startPoint.y,
          endPoint.x, endPoint.y
        );
        gradient.addColorStop(0, '#00FF00');
        gradient.addColorStop(1, '#00CC00');
        
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.stroke();
      }
    });
    
    // Draw joints (landmarks) with different sizes for different importance
    landmarks.forEach((landmark, index) => {
      // Different sizes for different joint types
      let radius = 4;
      let color = '#FF0000';
      
      // Wrist (index 0) - larger
      if (index === 0) {
        radius = 6;
        color = '#FFFF00'; // Yellow for wrist
      }
      // Finger tips (4, 8, 12, 16, 20) - medium
      else if ([4, 8, 12, 16, 20].includes(index)) {
        radius = 5;
        color = '#00FFFF'; // Cyan for fingertips
      }
      // MCP joints (5, 9, 13, 17) - medium
      else if ([5, 9, 13, 17].includes(index)) {
        radius = 4.5;
        color = '#FF00FF'; // Magenta for knuckles
      }
      
      // Draw joint circle with outline
      ctx.fillStyle = color;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.arc(landmark.x, landmark.y, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // Draw joint numbers for better identification
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(index.toString(), landmark.x, landmark.y - radius - 5);
    });
    
    // Draw hand bounding box for reference
    if (landmarks.length > 0) {
      const xs = landmarks.map(p => p.x);
      const ys = landmarks.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);
    }
  }
  
  function detectHandMovement(currentLandmarks, handIndex) {
    // Get or initialize previous positions for this hand
    if (!previousHandPositions[handIndex]) {
      previousHandPositions[handIndex] = currentLandmarks.map(landmark => ({
        x: landmark.x,
        y: landmark.y,
        timestamp: Date.now()
      }));
      return;
    }
    
    // Calculate movement for ALL key points (not just 3)
    const keyPoints = [0, 4, 8, 12, 16, 20]; // wrist, all fingertips
    let totalMovement = 0;
    let maxMovement = 0;
    let movementVectors = [];
    
    keyPoints.forEach(index => {
      const current = {
        x: currentLandmarks[index].x,
        y: currentLandmarks[index].y
      };
      const previous = previousHandPositions[handIndex][index];
      
      if (previous) {
        const distance = Math.sqrt(
          Math.pow(current.x - previous.x, 2) + 
          Math.pow(current.y - previous.y, 2)
        );
        totalMovement += distance;
        
        if (distance > maxMovement) {
          maxMovement = distance;
        }
        
        // Store movement vector for visualization
        if (distance > 5) { // Only show significant movements
          movementVectors.push({
            start: previous,
            end: current,
            distance: distance,
            index: index
          });
        }
      }
    });
    
    // Calculate average movement
    const avgMovement = totalMovement / keyPoints.length;
    
    // Draw movement vectors on canvas
    if (movementVectors.length > 0) {
      drawMovementVectors(movementVectors, currentLandmarks);
    }
    
    // Update status with detailed movement info
    if (totalMovement > MOVEMENT_THRESHOLD) {
      const timeDiff = Date.now() - (previousHandPositions[handIndex][0]?.timestamp || Date.now());
      const movementSpeed = totalMovement / (timeDiff / 1000);
      
      statusDiv.textContent = `🚀 Movement detected! Total: ${Math.round(totalMovement)}px | Max: ${Math.round(maxMovement)}px | Speed: ${Math.round(movementSpeed)}px/s`;
      statusDiv.style.color = '#FFD700'; // Gold color for movement
      statusDiv.style.fontWeight = 'bold';
      
      // Trigger action on movement
      onHandMovementDetected(totalMovement, handIndex, avgMovement, maxMovement);
    } else {
      statusDiv.textContent = `Hand detected. Movement: ${Math.round(avgMovement)}px (threshold: ${MOVEMENT_THRESHOLD}px)`;
      statusDiv.style.color = '#4CAF50';
      statusDiv.style.fontWeight = 'normal';
    }
    
    // Update previous positions with timestamp
    previousHandPositions[handIndex] = currentLandmarks.map(landmark => ({
      x: landmark.x,
      y: landmark.y,
      timestamp: Date.now()
    }));
  }
  
  // New function to draw movement vectors
  function drawMovementVectors(vectors, landmarks) {
    vectors.forEach(({ start, end, distance, index }) => {
      // Draw arrow showing movement direction
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const angle = Math.atan2(dy, dx);
      const arrowLength = Math.min(distance, 50); // Cap arrow length
      
      // Color based on movement speed
      const intensity = Math.min(distance / 50, 1);
      const red = Math.floor(255 * intensity);
      const green = Math.floor(255 * (1 - intensity));
      
      ctx.strokeStyle = `rgb(${red}, ${green}, 0)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 2]);
      
      // Draw movement line
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      
      // Draw arrowhead
      const arrowSize = 6;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - arrowSize * Math.cos(angle - Math.PI / 6),
        end.y - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - arrowSize * Math.cos(angle + Math.PI / 6),
        end.y - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      
      ctx.setLineDash([]);
      
      // Draw movement magnitude indicator
      ctx.fillStyle = `rgba(${red}, ${green}, 0, 0.7)`;
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${Math.round(distance)}px`,
        (start.x + end.x) / 2,
        (start.y + end.y) / 2 - 5
      );
    });
  }
  
  function onHandMovementDetected(movementAmount, handIndex, avgMovement, maxMovement) {
    // This is where you can add custom actions
    console.log(`Hand ${handIndex} movement detected:`, {
      total: movementAmount,
      average: avgMovement,
      max: maxMovement
    });
    
    // Example: Send message to background script
    // chrome.runtime.sendMessage({
    //   type: 'hand-movement-detected',
    //   movement: movementAmount,
    //   avgMovement: avgMovement,
    //   maxMovement: maxMovement,
    //   handIndex: handIndex
    // });
    
    // Example: Send message to content script
    // chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    //   if (tabs[0]?.id) {
    //     chrome.tabs.sendMessage(tabs[0].id, {
    //       type: 'hand-movement',
    //       movement: movementAmount,
    //       avgMovement: avgMovement,
    //       maxMovement: maxMovement
    //     });
    //   }
    // });
}

stopButton.addEventListener('click', () => {
  stopCamera();
  window.close();
});

// Start camera when page loads
startCamera();

// Clean up when page is closed
window.addEventListener('beforeunload', () => {
  stopCamera();
});


