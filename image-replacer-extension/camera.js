const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const stopButton = document.getElementById('stop');
const errorDiv = document.getElementById('error');
const statusDiv = document.getElementById('status');
let stream = null;
let model = null;
let isDetecting = false;
let handPositionHistory = [];
const HISTORY_LENGTH = 30;
const STROKE_DETECTION_THRESHOLD = 10;
let lastStrokeDirection = null;

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });
    
    video.srcObject = stream;
    // Set canvas size to match video when metadata loads
    video.addEventListener('loadedmetadata', () => {
      canvas.width = 1280;
      canvas.height = 720;
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
  // Stop the detection loop
  isDetecting = false;
  
  // Stop camera stream
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    console.log('Camera stopped');
  }
  
  handPositionHistory = [];
}

async function initHandDetection() {
  try {
    statusDiv.textContent = 'Loading Handtrack.js model...';
    console.log('Loading Handtrack.js model...');
    
    // Load Handtrack.js model
    const modelParams = {
      flipHorizontal: true,
      maxNumBoxes: 4,
      scoreThreshold: 0.4,
      iouThreshold: 0.3,
    };
    
    model = await handTrack.load(modelParams);
    
    statusDiv.textContent = 'Hand detection model loaded! Move your hands to see detection.';
    console.log('Handtrack.js model loaded:', model);
    
    // Wait for video to be ready
    if (video.readyState >= 2) {
      detectHands();
    } else {
      video.addEventListener('loadeddata', () => {
        detectHands();
      }, { once: true });
    }

  } catch (err) {
    console.error('Error initializing hand detection:', err);
    errorDiv.textContent = `Hand detection error: ${err.message}`;
    statusDiv.textContent = 'Camera active but hand detection failed.';
  }
}

function detectHands() {
  if (isDetecting) return;
  if (!model || !stream) {
    console.error('Model or stream not ready');
    return;
  }
  
  isDetecting = true;
  console.log('Starting hand detection...');
  
  // Start detection loop
  function runDetection() {
    if (!isDetecting || !model || !stream) {
      return;
    }

    if (!validateVideo()) {
      console.warn('Skipping detection - video not ready');
      if (isDetecting) {
        requestAnimationFrame(runDetection);
      }
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Detect hands in the current video frame
    model.detect(canvas).then(predictions => {

    // Log each prediction to see its structure
      if (predictions && predictions.length > 0) {
        predictions
        .filter(pred => pred.label === 'open' || pred.label === 'closed')
        .forEach((pred, idx) => {
          // console.log(`Prediction ${idx}:`, {
          //   label: pred.label,
          //   score: pred.score,
          //   bbox: pred.bbox
          // });
          
          const [x, y, width, height] = pred.bbox;
          const centerX = Math.round(x + width / 2);
          const centerY = Math.round(y + height / 2);
          handPositionHistory.push([centerX, centerY]);

          // Keep history length constant
          if (handPositionHistory.length > HISTORY_LENGTH) {
            handPositionHistory.shift();
          }

          if (handPositionHistory.length >= 5) {
            detectStrokingMotion();
          }
        });
      }
      
      // Continue detection loop
      if (isDetecting) {
        requestAnimationFrame(runDetection);
      }

    }).catch(err => {
      console.error('Detection error:', err);
      if (isDetecting) {
        requestAnimationFrame(runDetection);
      }
    });
  }
  
  // Start detection
  runDetection();
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

// Check if the input video is valid
function validateVideo() {
  const checks = {
    videoExists: !!video,
    hasSrcObject: !!(video && video.srcObject),
    isPlaying: !!(video && !video.paused && !video.ended),
    hasDimensions: !!(video && video.videoWidth > 0 && video.videoHeight > 0),
    readyState: video ? video.readyState : 0,
    streamActive: !!(stream && stream.active),
    streamTracks: stream ? stream.getVideoTracks().length : 0
  };
  
  const videoInfo = {
    readyState: video?.readyState, // 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
    paused: video?.paused,
    ended: video?.ended,
    videoWidth: video?.videoWidth,
    videoHeight: video?.videoHeight,
    srcObject: video?.srcObject ? 'present' : 'null',
    currentTime: video?.currentTime,
    duration: video?.duration
  };
  
  // Check if video is valid for detection
  const isValid = checks.videoExists && 
                   checks.hasSrcObject && 
                   checks.hasDimensions && 
                   checks.readyState >= 2 && 
                   checks.streamActive;
  
  if (!isValid) {
    console.warn('⚠️ Video is NOT valid for detection:', {
      missing: Object.entries(checks)
        .filter(([key, value]) => !value)
        .map(([key]) => key)
    });
  }
  
  return isValid;
}

function detectStrokingMotion() {
  if (handPositionHistory.length < 5) return;
  
  // Get recent positions (last 5 frames)
  const recent = handPositionHistory.slice(-5);
  const currentY = recent[recent.length - 1][1];
  const previousY = recent[0][1];
  
  // Calculate Y movement
  const yMovement = previousY - currentY; // Positive = moving up, Negative = moving down
  
  // Determine current direction
  let currentDirection = null;
  if (yMovement > STROKE_DETECTION_THRESHOLD) {
    currentDirection = 'up';
  } else if (yMovement < -STROKE_DETECTION_THRESHOLD) {
    currentDirection = 'down';
  }
  
  // Detect direction change (stroke completion)
  if (currentDirection && lastStrokeDirection && currentDirection !== lastStrokeDirection) {
    console.log(`🔄 STROKE DETECTED!`);
    statusDiv.style.color = '#4CAF50';
  }
  
  // Update last direction
  if (currentDirection) {
    lastStrokeDirection = currentDirection;
  }
}