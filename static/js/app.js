/**
 * Netra - AI Assistant for Visually Impaired Users
 * Main Application JavaScript
 */

class Netra {
  constructor() {
    this.currentLanguage =
      localStorage.getItem("blindmate_language") || "en-IN";
    // Apply saved language to on-screen text immediately, before waiting
    // on the async server preferences fetch, to avoid a flash of English.
    if (document.readyState !== "loading") {
      this.applyUITranslations(this.currentLanguage);
    } else {
      document.addEventListener("DOMContentLoaded", () =>
        this.applyUITranslations(this.currentLanguage),
      );
    }
    this.savedObjects = new Map();

    // Interaction history: what the user asked and how the assistant
    // responded, persisted across sessions. Powers both the History tab
    // and the "Assistant Response" panel (which previously never updated
    // at all - it always showed the same hardcoded placeholder message
    // regardless of actual usage).
    try {
      this.interactionHistory = JSON.parse(
        localStorage.getItem("blindmate_history") || "[]",
      );
    } catch (e) {
      this.interactionHistory = [];
    }
    this.lastCommandText = null;

    this.memoryCooldown = 60000;

    this.lastObstacleAlert = 0;
    this.obstacleCooldown = 4000; // 4 seconds
    this.video = document.getElementById("webcam");
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.model = null;
    this.isDetecting = false;
    this.stream = null;

    this.currentTone = "friendly";
    this.userLocation = null;

    // Voice synthesis and recognition
    this.synth = window.speechSynthesis;
    this.recognition = null;
    this.isListening = false;

    // UI elements
    this.elements = {
      startBtn: document.getElementById("startDetectionBtn"),
      stopBtn: document.getElementById("stopDetectionBtn"),
      voiceBtn: document.getElementById("voiceCommandBtn"),
      locationBtn: document.getElementById("locationBtn"),
      languageSelect: document.getElementById("languageSelect"),
      toneSelect: document.getElementById("toneSelect"),
      systemStatus: document.getElementById("systemStatus"),
      detectionStatus: document.getElementById("detectionStatus"),
      voiceStatus: document.getElementById("voiceStatus"),
      loadingOverlay: document.getElementById("loadingOverlay"),
      detectionIndicator: document.getElementById("detectionIndicator"),
    };

    // Language configurations
    this.languages = {
      "en-IN": {
        name: "English",
        voice: "en-IN",
        greeting: "Hello! Should I start detection, Sir?",
      },
      "kn-IN": {
        name: "Kannada",
        voice: "kn-IN",
        greeting: "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಸಹಾಯಕ.",
      },
      "hi-IN": {
        name: "Hindi",
        voice: "hi-IN",
        greeting: "नमस्ते! क्या मैं डिटेक्शन शुरू करूं, सर?",
      },
      "ta-IN": {
        name: "Tamil",
        voice: "ta-IN",
        greeting: "வணக்கம்! நான் கண்டறிதலைத் தொடங்க வேண்டுமா, ஐயா?",
      },
      "te-IN": {
        name: "Telugu",
        voice: "te-IN",
        greeting: "నమస్కారం! నేను గుర్తింపును ప్రారంభించాలా, సార్?",
      },
      "bn-IN": {
        name: "Bengali",
        voice: "bn-IN",
        greeting: "নমস্কার! আমি কি সনাক্তকরণ শুরু করব, স্যার?",
      },
      "mr-IN": {
        name: "Marathi",
        voice: "mr-IN",
        greeting: "नमस्कार! मी ओळख सुरू करावी का, सर?",
      },
      "gu-IN": {
        name: "Gujarati",
        voice: "gu-IN",
        greeting: "નમસ્તે! શું મારે ડિટેક્શન શરૂ કરવું જોઈએ, સર?",
      },
    };

    // Detection settings
    this.detectionThreshold = 0.45; // slightly lowered from 0.5 - small/
    // distant objects naturally produce lower confidence scores even when
    // correctly detected, so this threshold was silently filtering out
    // some genuinely-correct small-object detections. This threshold
    // controls what gets DRAWN/tracked, not what gets spoken - see below.

    // What actually gets SPOKEN uses a separate, higher bar than what
    // merely gets drawn. Lowering detectionThreshold to catch small
    // objects necessarily also let through more low-confidence, more
    // often WRONG detections - fine for drawing a box, not fine for
    // confidently announcing something incorrect out loud. This keeps
    // both benefits: small objects still get shown, but only confident
    // detections get spoken about.
    this.announcementConfidenceThreshold = 0.65;

    // Temporal confirmation: an object must appear in at least this many
    // of the last temporalConfirmWindow detection frames before it's
    // trusted enough to announce. This filters out one-off single-frame
    // misclassifications (a momentary wrong guess that doesn't repeat)
    // while still letting real, persistent objects through within a
    // second or so.
    this.temporalConfirmWindow = 4;
    this.temporalConfirmMinFrames = 2;
    this.recentDetectionHistory = [];
    this.lastDetections = [];
    this.lastAnnouncement = 0;
    this.announcementInterval = 3500; // seconds between REPEAT announcements of an already-seen object
    // First time an object is spotted, it gets a much shorter throttle
    // than a repeat, so it feels near-instant instead of waiting behind
    // the same gate as routine repeated narration.
    this.firstSightingInterval = 800;

    // Smart object announcement tracking system
    this.objectAnnouncementCount = new Map(); // Track how many times each object was announced
    this.objectLastSeen = new Map(); // Track when each object was last seen
    this.objectDisappearanceTime = new Map(); // Track when object disappeared
    this.maxAnnouncements = 3; // Maximum announcements per object
    this.cooldownPeriod = 7000; // 7 seconds cooldown after object disappears
    this.lastSpeechTime = 0;
    this.speechCooldown = 2000; // 2 seconds cooldown between speech
    this.isSpeaking = false;
    this.speechQueue = [];

    // Enhanced speech delay configuration for object announcements
    this.speechDelayTimer = null; // Timer for delaying speech
    this.minObjectAnnouncementDelay = 1500; // 1.5 second minimum delay between object announcements
    this.pendingAnnouncement = null; // Store pending announcement
    this.isAnnouncementDelayed = false; // Flag to track if announcement is delayed

    // Navigation settings
    this.isNavigating = false;
    this.currentRoute = null;
    this.currentStepIndex = 0;
    this.locationWatcher = null;
    this.routeDeviationThreshold = 15; // meters

    // Wake word detection
    this.isListeningForWakeWord = true;
    this.wakeWords = ["hey netra", "netra"];
    this.continuousRecognition = null;

    // Volume key detection
    this.volumeUpPressed = false;
    this.volumeKeyTimeout = null;
    this.currentListeningTimeout = null;
    this.speechDetected = false;

    // Mobile double-tap gesture detection
    this.lastTapTime = 0;
    this.tapTimeout = null;
    this.doubleTapDelay = 400; // milliseconds between taps (increased for better detection)
    this.isMobileDevice = this.detectMobileDevice();
    console.log("Mobile device detected:", this.isMobileDevice, {
      userAgent: navigator.userAgent,
      ontouchstart: "ontouchstart" in window,
      maxTouchPoints: navigator.maxTouchPoints,
    });

    this.init();
  }

  loadSettings() {
    const settings =
      JSON.parse(localStorage.getItem("AIVisualAssistantSettings")) || {};

    if (settings.language) {
      this.currentLanguage = settings.language;
    }

    if (settings.voiceTone) {
      this.currentTone = settings.voiceTone;
    }

    if (settings.userName) {
      console.log("Welcome", settings.userName);
    }
  }

  /**
   * Get current position with error handling
   */
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          let errorMessage = "Location access failed. ";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage += "Please enable GPS in your browser settings.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += "Location information is unavailable.";
              break;
            case error.TIMEOUT:
              errorMessage += "Location request timed out.";
              break;
            default:
              errorMessage += "An unknown error occurred.";
              break;
          }
          this.showError(errorMessage);
          this.speak(
            "Location access is required. Please enable GPS in your browser settings.",
          );
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        },
      );
    });
  }

  /**
   * Update action status display
   */
  updateActionStatus(message, type = "info") {
    if (this.elements && this.elements.status && this.elements.statusText) {
      this.elements.statusText.textContent = message;
      this.elements.status.style.display = "block";
      this.elements.status.className = `alert alert-${type} mt-2`;

      // Auto-hide after 5 seconds for non-critical messages
      if (type !== "danger") {
        setTimeout(() => {
          if (
            this.elements.status &&
            this.elements.statusText.textContent === message
          ) {
            this.elements.status.style.display = "none";
          }
        }, 5000);
      }
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    if (
      this.elements &&
      this.elements.errorMessage &&
      this.elements.errorText
    ) {
      this.elements.errorText.textContent = message;
      this.elements.errorMessage.style.display = "block";

      // Auto-hide after 8 seconds
      setTimeout(() => {
        if (
          this.elements.errorMessage &&
          this.elements.errorText.textContent === message
        ) {
          this.elements.errorMessage.style.display = "none";
        }
      }, 8000);
    }
  }

  /**
   * Monitor user position for route deviation
   */
  monitorPosition(expectedPath) {
    if (this.locationWatcher) {
      navigator.geolocation.clearWatch(this.locationWatcher);
    }

    this.locationWatcher = navigator.geolocation.watchPosition(
      (position) => {
        const currentPos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Check if user has deviated from route
        if (this.isNavigating && this.currentRoute && this.currentRoute.legs) {
          const currentStep = this.getCurrentRouteStep();
          if (currentStep) {
            const distance = this.calculateDistanceCoords(currentPos, {
              lat: currentStep.end_location.lat(),
              lng: currentStep.end_location.lng(),
            });

            // If user is more than threshold distance away, re-route
            if (distance > this.routeDeviationThreshold) {
              this.handleRouteDeviation(currentPos);
            }
          }
        }
      },
      (error) => {
        console.warn("Position monitoring error:", error);
        this.showError(
          "GPS monitoring failed. Navigation accuracy may be reduced.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 10000,
      },
    );
  }

  /**
   * Handle route deviation and re-calculate route
   */
  async handleRouteDeviation(currentPosition) {
    try {
      this.speak("You have moved off the route, recalculating...", true);
      this.updateActionStatus("Re-routing...", "warning");

      // Get the destination from current route
      const destination = this.currentDestination;
      if (!destination) {
        this.showError("Cannot re-route: destination unknown");
        return;
      }

      // Re-calculate route from current position
      await this.getDirectionsToDestination(currentPosition, destination);

      this.updateActionStatus("Route recalculated", "success");
      this.speak("New route calculated. Continuing navigation.");
    } catch (error) {
      console.error("Re-routing failed:", error);
      this.showError("Failed to recalculate route");
      this.speak("Route recalculation failed. Please navigate manually.");
    }
  }

  /**
   * Get current route step
   */
  getCurrentRouteStep() {
    if (
      !this.currentRoute ||
      !this.currentRoute.legs ||
      !this.currentRoute.legs[0]
    ) {
      return null;
    }

    const steps = this.currentRoute.legs[0].steps;
    if (this.currentStepIndex < steps.length) {
      return steps[this.currentStepIndex];
    }

    return null;
  }

  /**
   * Calculate distance between two {lat,lng} coordinate objects (Haversine formula)
   */
  calculateDistanceCoords(pos1, pos2) {
    return this.calculateDistance(pos1.lat, pos1.lng, pos2.lat, pos2.lng);
  }

  /**
   * Get location coordinates (supports both hardcoded and saved locations)
   */
  getLocationCoordinates(destinationName) {
    // This function is deprecated - all destinations now go through Google Geocoding API
    // Return null to force use of the enhanced navigation system
    return null;
  }

  /**
   * Simple stop navigation function
   */
  stopNavigationSimple() {
    console.log("Stopping navigation");

    this.isNavigating = false;
    this.currentRoute = null;
    this.currentStepIndex = 0;
    this.currentDestination = null;

    // Stop position monitoring
    if (this.locationWatcher) {
      navigator.geolocation.clearWatch(this.locationWatcher);
      this.locationWatcher = null;
    }

    this.updateActionStatus("Navigation stopped", "warning");
    this.speak("Navigation has been stopped", true);
  }

  /**
   * Initialize the application
   */
  async init() {
    this.loadSettings();
    try {
      this.updateStatus("Initializing Netra...", "info");

      // Load user preferences and check if this is a first-time user
      await this.loadServerPreferences();
      this.checkFirstTimeUser();

      // Initialize DOM elements first
      this.initDOMElements();

      // Setup event listeners
      this.setupEventListeners();

      // Initialize speech recognition
      this.initSpeechRecognition();

      // Load TensorFlow model (optional - app works without it)
      await this.loadModel();
      document

        .getElementById("describeSceneBtn")

        .addEventListener(
          "click",

          () => this.describeScene(),
        );
      // Ensure loading overlay is hidden after initialization
      const loadingOverlay = document.getElementById("loadingOverlay");
      if (loadingOverlay) {
        loadingOverlay.style.display = "none";
        console.log("Initialization complete - loading overlay hidden");
      }

      // Start object detection and voice interaction immediately, every
      // time the app opens - no button press, no confirmation prompt,
      // no delay.
      this.startVoiceInteraction();
      if (this.model && !this.isDetecting) {
        await this.startDetection();
      }

      // Proactively request location on load too, same pattern as auto-
      // starting detection above, so it's already available by the time
      // the user asks for navigation instead of stalling mid-command.
      // Not awaited - runs in the background without blocking detection
      // or voice startup.
      this.requestLocation(true);
    } catch (error) {
      console.error("Initialization error:", error);
      this.updateStatus(
        "Failed to initialize. Please refresh the page.",
        "danger",
      );
      this.speak(
        "Sorry, there was an error initializing the application. Please refresh the page.",
      );
    }
  }

  /**
   * Initialize DOM elements with fallback for missing elements
   */
  initDOMElements() {
    this.elements = {
      video: document.getElementById("webcam"),
      canvas: document.getElementById("canvas"),
      startBtn: document.getElementById("startDetectionBtn"),
      stopBtn: document.getElementById("stopDetectionBtn"),
      voiceBtn: document.getElementById("voiceCommandBtn"),
      locationBtn: document.getElementById("locationBtn"),
      languageSelect: document.getElementById("languageSelect"),
      toneSelect: document.getElementById("toneSelect"),
      detectionStatus: document.getElementById("detectionStatus"),
      voiceStatus: document.getElementById("voiceStatus"),
      loadingOverlay: document.getElementById("loadingOverlay"),
      detectionIndicator: document.getElementById("detectionIndicator"),
      systemStatus: document.getElementById("systemStatus"),
      status: document.getElementById("status"),
      statusText: document.getElementById("statusText"),
      errorMessage: document.getElementById("error-message"),
      errorText: document.getElementById("errorText"),
      navigationStatus:
        document.getElementById("navigationStatus") ||
        this.createNavigationStatus(),
    };

    // Ensure all critical elements exist
    this.validateElements();
  }

  /**
   * Validate that essential elements exist and create fallbacks if needed
   */
  validateElements() {
    const requiredElements = [
      "video",
      "canvas",
      "startBtn",
      "stopBtn",
      "voiceBtn",
      "locationBtn",
      "languageSelect",
      "toneSelect",
      "systemStatus",
    ];

    for (const elementKey of requiredElements) {
      if (!this.elements[elementKey]) {
        console.warn(`Missing element: ${elementKey}`);

        // Create fallback element to prevent crashes
        if (elementKey === "systemStatus") {
          this.elements[elementKey] = this.createStatusElement();
        }
      }
    }
  }

  /**
   * Create fallback status element
   */
  createStatusElement() {
    const statusDiv = document.createElement("div");
    statusDiv.className = "alert alert-info";
    statusDiv.textContent = "System ready";
    return statusDiv;
  }

  /**
   * Detect if device is mobile
   */
  detectMobileDevice() {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) ||
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0
    );
  }

  /**
   * Shared UI-element check used by every touch gesture system (long-press,
   * double-tap, triple-tap). Previously each gesture handler had its own
   * independently-written copy of this check, which could silently drift
   * out of sync with each other over time - consolidated into one method
   * so there's exactly one source of truth.
   */
  isGestureUIElement(target) {
    if (!target) return false;
    return !!(
      target.tagName === "BUTTON" ||
      target.tagName === "SELECT" ||
      target.tagName === "INPUT" ||
      target.closest("button") ||
      target.closest("select") ||
      target.closest("input") ||
      target.closest(".btn") ||
      (target.id && target.id.includes("Btn")) ||
      (target.className &&
        typeof target.className === "string" &&
        (target.className.includes("btn") ||
          target.className.includes("form-control") ||
          target.className.includes("form-select")))
    );
  }

  /**
   * Setup mobile double-tap (voice command) and triple-tap (instant read
   * text / OCR) gesture detection, sharing the same tap counter.
   */
  setupMobileDoubleTap() {
    let firstTapTime = 0;
    let tapCount = 0;
    let tapTimeout = null;
    // Slightly shorter window used only while deciding between a double-tap
    // and a possible third tap, so double-tap (voice command) doesn't feel
    // sluggish for people who only ever tap twice.
    const tripleTapGraceMs = 350;

    console.log(
      "Setting up mobile double-tap (voice) / triple-tap (read text) gesture detection...",
    );

    // Reset the tap counter cleanly on touchcancel, which fires INSTEAD OF
    // touchend in common real-device scenarios (OS gesture interception,
    // scrolling, multi-touch confusion). Without this, a cancelled tap
    // left tapCount in a stale state for up to 400ms, silently causing the
    // next real tap to be miscounted.
    document.addEventListener(
      "touchcancel",
      () => {
        if (tapTimeout) {
          clearTimeout(tapTimeout);
          tapTimeout = null;
        }
        tapCount = 0;
        firstTapTime = 0;
      },
      { passive: true },
    );

    // Add touch event listener to entire document for full-screen gestures
    document.addEventListener(
      "touchend",
      (e) => {
        const currentTime = Date.now();

        // A long-press (a separate gesture system) just fired on this
        // exact touch - ignore this touchend entirely and reset the tap
        // counter, so it doesn't get miscounted as "tap 1" and cause a
        // stray double/triple-tap misfire from a quick tap shortly after.
        if (this._longPressJustFired) {
          this._longPressJustFired = false;
          if (tapTimeout) {
            clearTimeout(tapTimeout);
            tapTimeout = null;
          }
          tapCount = 0;
          firstTapTime = 0;
          return;
        }

        // Clear existing timeout
        if (tapTimeout) {
          clearTimeout(tapTimeout);
          tapTimeout = null;
        }

        // Prevent interference with UI elements that need single taps
        const target = e.target;
        const isUIElement = this.isGestureUIElement(target);

        // Skip gesture detection on UI elements
        if (isUIElement) {
          console.log(
            "Tap on UI element ignored:",
            target.tagName,
            target.id || target.className,
          );
          return;
        }

        tapCount++;

        if (tapCount === 1) {
          // First tap
          firstTapTime = currentTime;

          // Set timeout to reset tap count if no second tap
          tapTimeout = setTimeout(() => {
            tapCount = 0;
            firstTapTime = 0;
            console.log("Tap timeout - single tap detected");
          }, this.doubleTapDelay);

          console.log("First tap detected, waiting for next tap...");
        } else if (tapCount === 2) {
          // Second tap - check if within double-tap delay
          const timeDiff = currentTime - firstTapTime;

          if (timeDiff <= this.doubleTapDelay) {
            e.preventDefault(); // Prevent default zoom behavior
            e.stopPropagation(); // Stop event bubbling

            console.log(
              `Second tap detected (${timeDiff}ms) - waiting briefly for a possible third tap...`,
            );

            // Don't fire the double-tap action immediately - give the user
            // a short grace window to add a third tap for "read text"
            // instead.
            tapTimeout = setTimeout(() => {
              console.log("No third tap - treating as double-tap (voice)");
              navigator.vibrate && navigator.vibrate(50);
              this.speak("Listening started");

              setTimeout(() => {
                this.startVoiceCommand();
              }, 100);

              tapCount = 0;
              firstTapTime = 0;
            }, tripleTapGraceMs);
          } else {
            // Too slow, treat as new first tap
            tapCount = 1;
            firstTapTime = currentTime;

            tapTimeout = setTimeout(() => {
              tapCount = 0;
              firstTapTime = 0;
            }, this.doubleTapDelay);

            console.log("Second tap too slow, treating as new first tap");
          }
        } else if (tapCount === 3) {
          // Third tap within the grace window - instant "read text" (OCR),
          // no voice needed at all. This is the fastest way for a blind
          // user to get a medicine label or document read aloud: just tap
          // the screen three times while holding it up to the item.
          e.preventDefault();
          e.stopPropagation();

          console.log("Triple-tap detected! Triggering instant read-text.");

          navigator.vibrate && navigator.vibrate([40, 60, 40]);
          this.speak("Reading now.", true);
          this.captureAndReadText();

          tapCount = 0;
          firstTapTime = 0;
        }
      },
      { passive: false },
    );

    // Also add touchstart to prevent default behaviors during double-tap
    document.addEventListener(
      "touchstart",
      (e) => {
        // Only prevent default on non-UI elements during potential double-tap
        const isUIElement = this.isGestureUIElement(e.target);

        if (!isUIElement && tapCount === 1) {
          // During potential double-tap sequence, prevent default behaviors
          e.preventDefault();
        }
      },
      { passive: false },
    );

    console.log(
      "Mobile double-tap gesture enabled for voice commands with improved detection",
    );

    // Add visual hint for mobile users
    this.addMobileHint();
  }

  /**
   * Long-press anywhere on screen (not on a button/control) toggles object
   * detection on/off. This is the reliable, phone-friendly way for a blind
   * user to start/stop detection without needing to see or locate the
   * "Detect Objects" button - a real hardware volume key press cannot be
   * captured by a web page on Android/iOS, so this gesture replaces it.
   */
  setupMobileLongPress() {
    const LONG_PRESS_MS = 800;
    // Loosened from 15px - natural finger tremor during a real hold
    // easily exceeds a tight tolerance, causing legitimate long-presses
    // to silently cancel. 30px is much more forgiving while still
    // distinguishing a genuine long-press from an intentional swipe/scroll.
    const MOVE_TOLERANCE_PX = 30;
    let pressTimer = null;
    let startX = 0;
    let startY = 0;
    let longPressFired = false;

    document.addEventListener(
      "touchstart",
      (e) => {
        if (this.isGestureUIElement(e.target)) return;

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        longPressFired = false;

        pressTimer = setTimeout(() => {
          longPressFired = true;
          this._longPressJustFired = true; // shared flag - tells the
          // double-tap/triple-tap counter (a separate gesture system) to
          // ignore the touchend that's about to follow, so a long-press
          // release doesn't get miscounted as "tap 1" and cause a stray
          // double-tap misfire from a quick tap shortly afterward.
          this.toggleDetection();
        }, LONG_PRESS_MS);
      },
      { passive: true },
    );

    const cancelPress = (e) => {
      if (!pressTimer) return;
      // If the finger moved too much, treat it as a scroll/gesture, not a
      // long-press, and cancel the timer.
      if (e.touches && e.touches[0]) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }
    };

    document.addEventListener("touchmove", cancelPress, { passive: true });

    const endPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      // Prevent the long-press from also being interpreted as one half
      // of a double-tap for voice commands.
      if (longPressFired) {
        longPressFired = false;
      }
    };

    document.addEventListener("touchend", endPress, { passive: true });
    // touchcancel fires INSTEAD OF touchend in common real-device
    // scenarios - the OS intercepting the gesture, scrolling threshold
    // exceeded, multi-touch confusion, a notification pulling down, etc.
    // Without handling it, a pending long-press timer never gets cleared
    // in these cases, causing a delayed/unexpected toggle later. This was
    // previously unhandled entirely.
    document.addEventListener("touchcancel", endPress, { passive: true });

    console.log(
      "Mobile long-press gesture enabled for toggling object detection",
    );
  }

  /**
   * Add visual hint for mobile double-tap feature
   */
  addMobileHint() {
    // Create hint element
    const hintElement = document.createElement("div");
    hintElement.id = "mobileHint";
    hintElement.className = "alert alert-info mobile-hint";
    hintElement.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            background: rgba(0, 123, 255, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 14px;
            text-align: center;
            animation: fadeInOut 4s ease-in-out;
            pointer-events: none;
        `;
    hintElement.innerHTML = "💡 Double-tap anywhere to start voice commands";

    // Add CSS animation
    const style = document.createElement("style");
    style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
                15% { opacity: 1; transform: translateX(-50%) translateY(0); }
                85% { opacity: 1; transform: translateX(-50%) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            }
        `;
    document.head.appendChild(style);

    // Add to page
    document.body.appendChild(hintElement);

    // Remove after animation
    setTimeout(() => {
      if (hintElement.parentNode) {
        hintElement.parentNode.removeChild(hintElement);
      }
    }, 4000);
  }

  /**
   * Create navigation status element if it doesn't exist
   */
  createNavigationStatus() {
    const navStatus = document.createElement("span");
    navStatus.id = "navigationStatus";
    navStatus.className = "badge bg-secondary";
    navStatus.textContent = "Ready";
    return navStatus;
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Add event listeners with null checks
    if (this.elements.startBtn) {
      this.elements.startBtn.addEventListener("click", () =>
        this.startDetection(),
      );
    }
    if (this.elements.stopBtn) {
      this.elements.stopBtn.addEventListener("click", () =>
        this.stopDetection(),
      );
    }
    if (this.elements.voiceBtn) {
      this.elements.voiceBtn.addEventListener("click", () =>
        this.startVoiceCommand(),
      );
    }
    if (this.elements.locationBtn) {
      this.elements.locationBtn.addEventListener("click", () =>
        this.requestLocation(),
      );
    }

    const ocrBtn = document.getElementById("ocrBtn");
    if (ocrBtn) {
      ocrBtn.addEventListener("click", () => {
        this.captureAndReadText();
      });
    }

    const helpBtn = document.getElementById("helpBtn");
    if (helpBtn) {
      helpBtn.addEventListener("click", () => {
        window.location.href = "/help";
      });
    }

    if (this.elements.languageSelect) {
      this.elements.languageSelect.addEventListener("change", (e) =>
        this.changeLanguage(e.target.value),
      );
    }
    if (this.elements.toneSelect) {
      this.elements.toneSelect.addEventListener("change", (e) =>
        this.changeTone(e.target.value),
      );
    }

    // Mobile double-tap gesture for voice commands
    console.log(
      "Checking mobile device for double-tap setup:",
      this.isMobileDevice,
    );
    if (this.isMobileDevice) {
      this.setupMobileDoubleTap();
      // Long-press anywhere toggles object detection. This is the
      // phone-friendly equivalent of a "Volume Up" button - real hardware
      // volume keys are intercepted by the OS on Android/iOS and never
      // reach the browser, so a long-press gesture is what actually works.
      this.setupMobileLongPress();
    } else {
      console.log("Desktop device - double-tap not enabled");
    }

    // Keyboard shortcuts for accessibility and volume key detection
    document.addEventListener("keydown", (e) => {
      // Volume Up key detection (multiple key codes for different devices)
      if (
        e.key === "VolumeUp" ||
        e.keyCode === 175 ||
        e.keyCode === 174 ||
        e.code === "VolumeUp" ||
        e.code === "AudioVolumeUp"
      ) {
        e.preventDefault();
        this.handleVolumeUpPress();
        return;
      }

      // Ctrl + key shortcuts
      if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case "s":
            e.preventDefault();
            // Use toggleDetection() (not separate start/stop calls) so
            // this gives the same spoken confirmation as the mobile
            // long-press gesture does - previously this was silent, which
            // leaves a blind user with no way to know it actually worked.
            this.toggleDetection();
            break;
          case "v":
            e.preventDefault();
            this.startVoiceCommand();
            break;
          case "l":
            e.preventDefault();
            this.requestLocation();
            break;
        }

        // Ctrl+Shift combos - kept separate from the single-Ctrl switch
        // above to avoid colliding with browser-reserved shortcuts like
        // Ctrl+R (reload) or Ctrl+T (new tab), which cannot be reliably
        // overridden by a webpage.
        if (e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case "o":
              // Desktop equivalent of the mobile triple-tap gesture - this
              // gap existed before (mobile had it, desktop didn't).
              e.preventDefault();
              this.captureAndReadText();
              break;
            case "e":
              // Desktop equivalent of the mobile shake-to-trigger gesture.
              e.preventDefault();
              this.triggerSOS();
              break;
          }
        }
      }
    });
  }

  /**
   * Initialize speech recognition for voice commands
   */
  initSpeechRecognition() {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      console.warn("Speech recognition not supported");
      if (this.elements.voiceBtn) {
        this.elements.voiceBtn.disabled = true;
      }
      this.updateStatus(
        "Voice commands not supported. Use text input instead.",
        "warning",
      );
      this.showTextFallback();
      return;
    }

    // Initialize speech recognition
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    // Create recognition instance for voice commands
    this.commandRecognition = new SpeechRecognition();
    this.commandRecognition.continuous = false;
    this.commandRecognition.interimResults = false;
    this.commandRecognition.lang = this.currentLanguage;

    // Command recognition event handlers
    this.commandRecognition.onstart = () => {
      this.isListening = true;
      this.speechDetected = false; // Track if actual speech was detected
      this.updateStatus("🎤 Listening... Speak your command now", "primary");
      this.elements.voiceStatus.textContent = "Listening";
      this.elements.voiceStatus.className = "badge bg-primary";
      this.elements.voiceBtn.innerHTML =
        '<i class="fas fa-stop"></i> Stop Listening';
      console.log("Speech started successfully");
      // Only speak feedback if this wasn't triggered by volume button to avoid conflicts
      if (!this.volumeUpPressed) {
        this.speak("Speak your command now", true);
      }
    };

    this.commandRecognition.onresult = (event) => {
      // Clear any listening timeout since we got a result
      if (this.currentListeningTimeout) {
        clearTimeout(this.currentListeningTimeout);
        this.currentListeningTimeout = null;
      }

      const command = event.results[0][0].transcript.trim();
      const confidence = event.results[0][0].confidence;
      console.log(
        "Voice command received:",
        command,
        "Confidence:",
        confidence,
      );

      // Mark that speech was detected
      this.speechDetected = true;

      // Process all reasonable commands - many speech recognition engines return 0 confidence
      if (command.length > 2) {
        // Show command in UI
        this.showRecognizedCommand(command);
        this.routeVoiceCommand(command);
      } else {
        console.log(
          "Short command received, ignoring:",
          command,
          "Length:",
          command.length,
        );
        this.updateStatus(
          "Ready for voice commands. Press Voice Command button to try again.",
          "info",
        );
      }
    };

    this.commandRecognition.onerror = (event) => {
      console.error("Command recognition error:", event.error);
      this.isListening = false;
      this.elements.voiceStatus.textContent = "Ready";
      this.elements.voiceStatus.className = "badge bg-secondary";
      this.elements.voiceBtn.innerHTML =
        '<i class="fas fa-microphone"></i> Voice Command';

      // Handle different error types more gracefully - don't announce every error
      if (event.error === "not-allowed") {
        this.updateStatus(
          "Microphone access denied. Please allow microphone access.",
          "warning",
        );
        this.showTextFallback();
      } else if (event.error === "no-speech") {
        // For no-speech errors, just stay ready without error announcements
        this.updateStatus(
          "Ready for voice commands. Press Voice Command button to try again.",
          "info",
        );
        console.log("No speech detected - staying ready for next command");
      } else if (event.error === "aborted") {
        // Recognition was intentionally stopped, don't show error
        console.log("Speech recognition aborted - this is normal");
      } else {
        // Other errors - just stay ready
        this.updateStatus(
          "Ready for voice commands. Press Voice Command button to try again.",
          "info",
        );
        console.log("Speech recognition error handled:", event.error);
      }
    };

    this.commandRecognition.onend = () => {
      this.isListening = false;
      this.elements.voiceStatus.textContent = "Ready";
      this.elements.voiceStatus.className = "badge bg-secondary";
      this.elements.voiceBtn.innerHTML =
        '<i class="fas fa-microphone"></i> Voice Command';

      // Clear any listening timeout
      if (this.currentListeningTimeout) {
        clearTimeout(this.currentListeningTimeout);
        this.currentListeningTimeout = null;
      }

      // Only show completion message if we're not in an error state
      if (!this.updateStatus.lastWasError) {
        this.updateStatus(
          'Ready for voice commands. Say "Hey Netra", or long-press anywhere to toggle detection.',
          "success",
        );
      }

      // Restart continuous listening for wake words
      setTimeout(() => {
        this.startContinuousListening();
      }, 1000);
    };

    // Add click handler for voice button
    this.elements.voiceBtn.addEventListener("click", () => {
      if (this.isListening) {
        this.stopVoiceCommand();
      } else {
        this.startVoiceCommand();
      }
    });

    // Initialize continuous recognition for wake words separately
    this.initContinuousListening();
  }

  /**
   * Initialize continuous listening for wake words
   */
  initContinuousListening() {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    this.continuousRecognition = new SpeechRecognition();
    this.continuousRecognition.continuous = true;
    this.continuousRecognition.interimResults = true;
    this.continuousRecognition.lang = this.currentLanguage;

    this.continuousRecognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const command = result[0].transcript.toLowerCase().trim();

        console.log("Continuous listening heard:", command);

        // Check for wake words with better matching
        if (this.wakeWords.some((wake) => command.includes(wake))) {
          console.log("Wake word detected:", command);

          // Extract any command spoken right after the wake word
          let commandAfterWake = null;
          for (const wake of this.wakeWords) {
            if (command.includes(wake)) {
              const remainder = command.split(wake)[1];
              if (remainder && remainder.trim().length > 0) {
                commandAfterWake = remainder.trim();
              }
              break;
            }
          }

          this.handleWakeWordDetected(commandAfterWake);
          break;
        }
      }
    };

    this.continuousRecognition.onerror = (event) => {
      console.log("Continuous recognition error:", event.error);
      if (event.error !== "aborted") {
        // Restart continuous listening after a short delay
        setTimeout(() => {
          if (this.isListeningForWakeWord) {
            this.startContinuousListening();
          }
        }, 1000);
      }
    };

    this.continuousRecognition.onend = () => {
      // Restart continuous listening if it should be active
      if (this.isListeningForWakeWord && !this.isListening) {
        setTimeout(() => {
          this.startContinuousListening();
        }, 500);
      }
    };
  }

  /**
   * Start voice command
   */
  startVoiceCommand() {
    if (!this.commandRecognition) {
      this.updateStatus("Voice recognition not available.", "warning");
      this.showTextFallback();
      return;
    }

    if (this.isListening) {
      this.stopVoiceCommand();
      return;
    }

    try {
      // Stop continuous listening temporarily
      this.stopContinuousListening();

      // Clear any existing timeouts
      if (this.currentListeningTimeout) {
        clearTimeout(this.currentListeningTimeout);
        this.currentListeningTimeout = null;
      }

      // Force stop any existing recognition first
      try {
        this.commandRecognition.stop();
      } catch (e) {
        // Ignore errors when stopping
      }

      // Wait a moment then start fresh
      setTimeout(() => {
        try {
          if (!this.isListening) {
            // Only start if not already listening
            this.commandRecognition.lang = this.currentLanguage;
            this.commandRecognition.start();
            console.log("Speech recognition started");
          }
        } catch (error) {
          console.error("Speech start error:", error);
          this.updateStatus(
            "Voice recognition temporarily unavailable. Please try again.",
            "warning",
          );
        }
      }, 200);
    } catch (error) {
      console.error("Error starting voice recognition:", error);
      this.updateStatus(
        "Voice recognition temporarily unavailable. Please try again.",
        "warning",
      );

      // Restart continuous listening
      setTimeout(() => {
        this.startContinuousListening();
      }, 1000);
    }
  }

  /**
   * Stop voice command
   */
  stopVoiceCommand() {
    console.log("Stopping voice command, current state:", this.isListening);

    if (this.commandRecognition) {
      try {
        this.commandRecognition.stop();
      } catch (error) {
        console.log("Error stopping voice command:", error.message);
      }
    }

    // Clear any pending timeouts
    if (this.currentListeningTimeout) {
      clearTimeout(this.currentListeningTimeout);
      this.currentListeningTimeout = null;
    }

    if (this.volumeKeyTimeout) {
      clearTimeout(this.volumeKeyTimeout);
      this.volumeKeyTimeout = null;
    }

    // Reset state immediately
    this.isListening = false;
    this.volumeUpPressed = false;
    this.speechDetected = false;

    // Update UI
    if (this.elements.voiceStatus) {
      this.elements.voiceStatus.textContent = "Ready";
      this.elements.voiceStatus.className = "badge bg-secondary";
    }
    if (this.elements.voiceBtn) {
      this.elements.voiceBtn.innerHTML =
        '<i class="fas fa-microphone"></i> Voice Command';
    }
  }

  /**
   * Start continuous listening for wake words
   */
  startContinuousListening() {
    if (
      this.continuousRecognition &&
      this.isListeningForWakeWord &&
      !this.isListening
    ) {
      try {
        this.continuousRecognition.lang = this.currentLanguage;
        this.continuousRecognition.start();
      } catch (error) {
        console.log("Continuous listening start error:", error.message);
      }
    }
  }

  /**
   * Stop continuous listening
   */
  stopContinuousListening() {
    if (this.continuousRecognition) {
      try {
        this.continuousRecognition.stop();
      } catch (error) {
        console.log("Continuous listening stop error:", error.message);
      }
    }
  }

  /**
   * Handle wake word detection
   */
  handleWakeWordDetected(commandAfterWake = null) {
    console.log('Wake word "Hey Netra" detected!');
    this.updateStatus(
      "🎤 Wake word detected! Listening for command...",
      "success",
    );

    // Stop continuous listening temporarily
    this.stopContinuousListening();

    if (commandAfterWake) {
      // The user already spoke a command along with the wake word
      this.speak("Yes, how can I help?", true);
      this.routeVoiceCommand(commandAfterWake);
      return;
    }

    // Give audio feedback
    this.speak("Yes, how can I help you?", true);

    // Start command listening after response
    setTimeout(() => {
      this.startVoiceCommand();
    }, 1500);
  }

  /**
   * Handle volume up key press - toggles object detection on/off.
   * Note: this is a best-effort bonus, not a guaranteed shortcut, on
   * EITHER platform. On real phones (Chrome/Android, Safari/iOS) the OS
   * intercepts the physical volume rocker before it ever reaches page
   * JavaScript. On desktop, dedicated multimedia volume keys are also
   * often intercepted by the OS for system volume, and support for the
   * few browsers/keyboards that do pass it through varies. The actually
   * guaranteed shortcuts for this same action are: long-press anywhere
   * on mobile (setupMobileLongPress), and Ctrl+S on desktop.
   */
  handleVolumeUpPress() {
    console.log("Volume Up key pressed - toggling object detection");

    // Prevent multiple rapid presses
    if (this.volumeKeyTimeout) {
      clearTimeout(this.volumeKeyTimeout);
    }

    this.volumeUpPressed = true;

    this.volumeKeyTimeout = setTimeout(() => {
      if (this.volumeUpPressed) {
        this.toggleDetection();
        this.volumeUpPressed = false;
      }
    }, 200);
  }

  /**
   * Toggle object detection on/off, with spoken + vibration feedback.
   * Shared by the Volume Up handler and the mobile long-press gesture.
   */
  toggleDetection() {
    if (this.isDetecting) {
      this.stopDetection();
      this.updateStatus("Object detection stopped", "info");
      this.speak("Object detection stopped", true);
    } else {
      this.updateStatus("Object detection starting...", "info");
      this.speak("Starting object detection", true);
      this.startDetection();
    }
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }

  /**
   * Start voice command with automatic timeout to prevent hanging
   */
  startVoiceCommandWithTimeout() {
    // Set a timeout to automatically stop listening if no speech detected
    const listeningTimeout = setTimeout(() => {
      if (this.isListening && !this.speechDetected) {
        console.log(
          "Voice command timeout - no speech detected, stopping silently",
        );
        this.stopVoiceCommand();
        this.updateStatus(
          'Ready for voice commands. Say "Hey Netra", or long-press anywhere to toggle detection.',
          "info",
        );
      }
    }, 6000); // 6 seconds timeout

    // Store timeout ID to clear it if command succeeds
    this.currentListeningTimeout = listeningTimeout;

    // Start normal voice command
    this.startVoiceCommand();
  }

  /**
   * Check if a command is a navigation command
   */
  /**
   * Check if a spoken command is asking to read text out loud (medicine
   * labels, documents, small print, etc.)
   */
  isReadTextCommand(command) {
    const readTextKeywords = [
      "read this",
      "read that",
      "read text",
      "scan text",
      "read document",
      "read paper",
      "read medicine",
      "read label",
      "read the label",
      "read the medicine",
      "read the bottle",
      "read the packet",
      "read the box",
      "what does this say",
      "what does that say",
      "what does it say",
      "scan this",
      "scan the label",
    ];

    const lowercaseCommand = command.toLowerCase();
    return readTextKeywords.some((keyword) =>
      lowercaseCommand.includes(keyword),
    );
  }

  /**
   * Check if a command is asking to recall a personal object's last-seen
   * location (e.g. "where is my phone") - distinct from a real navigation
   * request like "where is the nearest hospital", which should still go
   * to maps. The word "my" (or "keep") is the disambiguating signal.
   */
  isMemoryQuery(command) {
    const lower = command.toLowerCase();
    const memoryPatterns = [
      /where\s+is\s+my\s+/,
      /where'?s\s+my\s+/,
      /where\s+did\s+i\s+keep\s+/,
      /find\s+my\s+/,
      /have\s+you\s+seen\s+my\s+/,
      /locate\s+my\s+/,
    ];
    return memoryPatterns.some((pattern) => pattern.test(lower));
  }

  /**
   * Check if a command is asking to remember the current location under a
   * name (e.g. "remember this place as bathroom").
   */
  isSavePlaceCommand(command) {
    const lower = command.toLowerCase();
    const savePatterns = [
      /remember\s+this\s+place\s+as\s+/,
      /remember\s+this\s+as\s+/,
      /save\s+this\s+place\s+as\s+/,
      /save\s+this\s+location\s+as\s+/,
      /mark\s+this\s+as\s+/,
      /save\s+place\s+as\s+/,
    ];
    return savePatterns.some((pattern) => pattern.test(lower));
  }

  /**
   * Extract the name to save from a "remember this place as X" style
   * command.
   */
  extractPlaceNameToSave(command) {
    const patterns = [
      /remember\s+this\s+place\s+as\s+(.+)/i,
      /remember\s+this\s+as\s+(.+)/i,
      /save\s+this\s+place\s+as\s+(.+)/i,
      /save\s+this\s+location\s+as\s+(.+)/i,
      /mark\s+this\s+as\s+(.+)/i,
      /save\s+place\s+as\s+(.+)/i,
    ];
    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  }

  /**
   * Save the user's current location under a name, e.g. "bathroom".
   */
  async saveCurrentPlace(placeName) {
    if (!this.userLocation) {
      this.speak(
        "I don't have your current location yet. Please enable location and try again.",
        true,
      );
      return;
    }

    try {
      await fetch("/api/memory/place/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: placeName,
          latitude: this.userLocation.latitude,
          longitude: this.userLocation.longitude,
          time: new Date().toLocaleString(),
          timestamp: Date.now(),
        }),
      });
      this.speak(`Got it. I'll remember this place as ${placeName}.`, true);
    } catch (error) {
      console.error("Error saving place:", error);
      this.speak("Sorry, I could not save that place.", true);
    }
  }

  /**
   * Fetch all saved places.
   */
  async getSavedPlaces() {
    try {
      const response = await fetch("/api/memory/places");
      return await response.json();
    } catch (error) {
      console.error("Error fetching saved places:", error);
      return [];
    }
  }

  /**
   * Find a saved place by name (case-insensitive, matches either way -
   * "bathroom" matches a saved "the bathroom" and vice versa).
   */
  async findSavedPlace(name) {
    const places = await this.getSavedPlaces();
    const lowerName = name.toLowerCase().trim();
    return (
      places.find((p) => {
        const placeName = (p.name || "").toLowerCase().trim();
        return (
          placeName === lowerName ||
          placeName.includes(lowerName) ||
          lowerName.includes(placeName)
        );
      }) || null
    );
  }

  /**
   * Announce a saved place's distance and rough direction from the user's
   * current position. Note: for short indoor distances this is only an
   * approximation - consumer GPS is not precise enough for reliable
   * room-to-room guidance, so this gives a rough hint rather than
   * step-by-step directions. For longer/outdoor distances, it also starts
   * full turn-by-turn navigation.
   */
  async announceSavedPlace(place) {
    if (!this.userLocation) {
      this.speak(
        `I found ${place.name}, but I don't have your current location to give you directions to it.`,
        true,
      );
      return;
    }

    const distance = this.calculateDistance(
      this.userLocation.latitude,
      this.userLocation.longitude,
      place.latitude,
      place.longitude,
    );
    const bearing = this.calculateBearing(
      this.userLocation.latitude,
      this.userLocation.longitude,
      place.latitude,
      place.longitude,
    );
    const direction = this.getDirectionFromBearing(bearing);
    const roundedDistance = Math.round(distance);

    this.speak(
      `${place.name} was last saved about ${roundedDistance} meters to the ${direction}.`,
      true,
    );

    // For anything farther than a room-scale distance, also kick off full
    // turn-by-turn navigation using the saved coordinates directly.
    if (distance >= 50) {
      const destinationCoords = `${place.latitude},${place.longitude}`;
      await this.navigateToLocation(destinationCoords);
    }
  }

  /**
   * Central place to decide what a recognized voice command should do.
   * Order matters: memory/place lookups must be checked BEFORE generic
   * navigation, because phrases like "where is my phone" would otherwise
   * get swallowed by the navigation matcher (which also triggers on
   * "where is") and mistakenly searched for on the map.
   */
  async routeVoiceCommand(command) {
    const lower = command.toLowerCase();

    // Emergency always takes priority over everything else - checked
    // first, directly, with no dependency on Gemini being available.
    if (this.isEmergencyCommand(command)) {
      console.log("Emergency command detected:", command);
      this.triggerSOS();
      return;
    }

    if (
      lower.includes("what are the shortcuts") ||
      lower.includes("show shortcuts") ||
      lower.includes("how do i use this") ||
      lower.includes("how to use this app") ||
      lower.includes("show me the instructions") ||
      lower.includes("open instructions") ||
      lower.includes("open help") ||
      lower === "help" ||
      lower === "instructions"
    ) {
      this.speak("Opening shortcuts and instructions.", true);
      window.location.href = "/help";
      return;
    }

    if (this.isSavePlaceCommand(command)) {
      const placeName = this.extractPlaceNameToSave(command);
      if (placeName) {
        await this.saveCurrentPlace(placeName);
      } else {
        this.speak("What would you like to call this place?", true);
      }
      return;
    }

    if (this.isMemoryQuery(command)) {
      console.log("Memory query detected:", command);
      this.findObjectFromMemory(command);
      return;
    }

    if (this.isReadTextCommand(command)) {
      // Handle "read this"/"read medicine label" etc. directly and
      // instantly - don't wait on a Gemini round-trip for something
      // this time-sensitive and this easy to detect from keywords.
      console.log("Direct read-text command:", command);
      this.captureAndReadText();
      return;
    }

    if (
      lower.includes("my history") ||
      lower.includes("read history") ||
      lower.includes("show history") ||
      lower.includes("what did i say")
    ) {
      this.showHistory();
      return;
    }

    if (
      lower.includes("start detection") ||
      lower.includes("start object detection")
    ) {
      // Handle start detection directly for faster response
      console.log("Direct start detection command:", command);
      this.fallbackCommandProcessing(command);
      return;
    }

    if (this.isNavigationCommand(command)) {
      // Before treating this as a real-world navigation search, check
      // whether it actually refers to a place the user saved earlier
      // (e.g. "where is the bathroom" / "take me to the bathroom").
      const possibleDestination = this.extractDestination(command);
      if (possibleDestination) {
        const savedPlace = await this.findSavedPlace(possibleDestination);
        if (savedPlace) {
          console.log("Saved place match found:", savedPlace.name);
          await this.announceSavedPlace(savedPlace);
          return;
        }
      }

      console.log("Navigation command detected:", command);
      this.processNavigationCommand(command);
      return;
    }

    // Everything else goes to Gemini
    this.processVoiceCommand(command);
  }

  /**
   * Check if a command is an emergency / help request. This is checked
   * before anything else in routeVoiceCommand, since it's safety-critical
   * and must never depend on Gemini being reachable or correctly
   * classifying the phrase.
   *
   * Deliberately does NOT match on a bare "help" or "help me" alone -
   * those appear constantly in ordinary requests ("help me read this",
   * "help me find my phone") and would otherwise hijack them into false
   * emergency alerts. Only clear, unambiguous emergency phrasing matches.
   */
  isEmergencyCommand(command) {
    const lower = command.toLowerCase();
    const emergencyPatterns = [
      /\bemergency\b/,
      /\bsos\b/,
      /call\s+for\s+help/,
      /i\s+need\s+help\s+now/,
      /i'?m\s+in\s+danger/,
      /i\s+am\s+in\s+danger/,
      /send\s+help/,
      /this\s+is\s+an?\s+emergency/,
    ];
    return emergencyPatterns.some((pattern) => pattern.test(lower));
  }

  /**
   * Static UI text translations - for on-screen labels/headings (button
   * text, nav labels, etc). This is separate from spoken responses:
   * speech goes through Gemini/translateMessage() for arbitrary text, but
   * these are a small fixed set of strings so they're translated once
   * here rather than round-tripping to the AI on every language change.
   */
  getUITranslations() {
    return {
      "en-IN": {
        goodMorning: "Good Morning 👋",
        readyToHelp: "Ready to help you.",
        tapOrSay: "Tap or Say",
        listeningForCommands: "Listening for your commands",
        talkToAssistant: "Talk to Assistant",
        detectObjects: "Detect Objects",
        stopDetection: "Stop Detection",
        enableGps: "Enable GPS",
        navigation: "Navigation",
        readText: "Read Text",
        memory: "Memory",
        describeScene: "Describe Scene",
        emergencySos: "Emergency SOS",
        helpShortcuts: "Help & Shortcuts",
        home: "Home",
        history: "History",
        settings: "Settings",
      },
      "hi-IN": {
        goodMorning: "सुप्रभात 👋",
        readyToHelp: "आपकी मदद के लिए तैयार हूं।",
        tapOrSay: "टैप करें या बोलें",
        listeningForCommands: "आपके कमांड सुन रहा हूं",
        talkToAssistant: "सहायक से बात करें",
        detectObjects: "वस्तु पहचानें",
        stopDetection: "पहचान बंद करें",
        enableGps: "जीपीएस सक्षम करें",
        navigation: "नेविगेशन",
        readText: "पाठ पढ़ें",
        memory: "स्मृति",
        describeScene: "दृश्य बताएं",
        emergencySos: "आपातकालीन एसओएस",
        helpShortcuts: "सहायता और शॉर्टकट",
        home: "होम",
        history: "इतिहास",
        settings: "सेटिंग्स",
      },
      "kn-IN": {
        goodMorning: "ಶುಭೋದಯ 👋",
        readyToHelp: "ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ಸಿದ್ಧ.",
        tapOrSay: "ಟ್ಯಾಪ್ ಮಾಡಿ ಅಥವಾ ಹೇಳಿ",
        listeningForCommands: "ನಿಮ್ಮ ಆಜ್ಞೆಗಳನ್ನು ಆಲಿಸುತ್ತಿದ್ದೇನೆ",
        talkToAssistant: "ಸಹಾಯಕರೊಂದಿಗೆ ಮಾತನಾಡಿ",
        detectObjects: "ವಸ್ತುಗಳನ್ನು ಪತ್ತೆ ಮಾಡಿ",
        stopDetection: "ಪತ್ತೆಯನ್ನು ನಿಲ್ಲಿಸಿ",
        enableGps: "ಜಿಪಿಎಸ್ ಸಕ್ರಿಯಗೊಳಿಸಿ",
        navigation: "ನ್ಯಾವಿಗೇಷನ್",
        readText: "ಪಠ್ಯ ಓದಿ",
        memory: "ಸ್ಮರಣೆ",
        describeScene: "ದೃಶ್ಯವನ್ನು ವಿವರಿಸಿ",
        emergencySos: "ತುರ್ತು ಎಸ್‌ಒಎಸ್",
        helpShortcuts: "ಸಹಾಯ ಮತ್ತು ಶಾರ್ಟ್‌ಕಟ್‌ಗಳು",
        home: "ಮುಖಪುಟ",
        history: "ಇತಿಹಾಸ",
        settings: "ಸಂಯೋಜನೆಗಳು",
      },
      "ta-IN": {
        goodMorning: "காலை வணக்கம் 👋",
        readyToHelp: "உங்களுக்கு உதவ தயார்.",
        tapOrSay: "தட்டவும் அல்லது சொல்லவும்",
        listeningForCommands: "உங்கள் கட்டளைகளைக் கேட்கிறேன்",
        talkToAssistant: "உதவியாளருடன் பேசுங்கள்",
        detectObjects: "பொருட்களைக் கண்டறியவும்",
        stopDetection: "கண்டறிதலை நிறுத்து",
        enableGps: "ஜிபிஎஸ் இயக்கு",
        navigation: "வழிசெலுத்தல்",
        readText: "உரையைப் படிக்கவும்",
        memory: "நினைவகம்",
        describeScene: "காட்சியை விவரிக்கவும்",
        emergencySos: "அவசர எஸ்ஓஎஸ்",
        helpShortcuts: "உதவி மற்றும் குறுக்குவழிகள்",
        home: "முகப்பு",
        history: "வரலாறு",
        settings: "அமைப்புகள்",
      },
      "te-IN": {
        goodMorning: "శుభోదయం 👋",
        readyToHelp: "మీకు సహాయం చేయడానికి సిద్ధంగా ఉన్నాను.",
        tapOrSay: "నొక్కండి లేదా చెప్పండి",
        listeningForCommands: "మీ ఆదేశాలను వింటున్నాను",
        talkToAssistant: "సహాయకుడితో మాట్లాడండి",
        detectObjects: "వస్తువులను గుర్తించండి",
        stopDetection: "గుర్తింపును ఆపండి",
        enableGps: "జిపిఎస్‌ను ప్రారంభించండి",
        navigation: "నావిగేషన్",
        readText: "వచనం చదవండి",
        memory: "జ్ఞాపకం",
        describeScene: "దృశ్యాన్ని వివరించండి",
        emergencySos: "అత్యవసర ఎస్ఓఎస్",
        helpShortcuts: "సహాయం మరియు షార్ట్‌కట్‌లు",
        home: "హోమ్",
        history: "చరిత్ర",
        settings: "సెట్టింగ్‌లు",
      },
    };
  }

  /**
   * Apply UI text translations to every element with a data-i18n
   * attribute, for the given language. Falls back to English for any
   * language not in the dictionary above (e.g. es-ES, fr-FR if ever
   * added to the dropdown) since those only have voice/speech support
   * via Gemini, not static UI translations yet.
   */
  applyUITranslations(langCode) {
    const translations = this.getUITranslations();
    const strings = translations[langCode] || translations["en-IN"];

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (strings[key]) {
        el.textContent = strings[key];
      }
    });
  }

  /**
   * Check whether the browser/OS actually has a text-to-speech voice
   * available for the given language. Many browsers (especially desktop
   * Chrome on Windows) only ship English voices by default - Kannada,
   * Tamil, Telugu, etc. often aren't installed. If we speak translated
   * text through a voice that doesn't support that script, it comes out
   * as garbled nonsense rather than actual speech - so it's important to
   * detect this rather than silently attempt it.
   */
  hasVoiceForLanguage(langCode) {
    if (!this.synth) return false;
    const voices = this.synth.getVoices();
    const prefix = langCode.split("-")[0];
    return voices.some(
      (v) => v.lang === langCode || v.lang.startsWith(prefix),
    );
  }

  isNavigationCommand(command) {
    const navigationKeywords = [
      "take me to",
      "go to",
      "navigate to",
      "direction to",
      "directions to",
      "route to",
      "find route to",
      "show route to",
      "how to get to",
      "where is",
      "location of",
      "find location",
      "search for",
    ];

    const lowercaseCommand = command.toLowerCase();

    // Exclude meaningless phrases from navigation detection
    const meaninglessPhases = [
      "sorry",
      "please try again",
      "try again",
      "didn't understand",
    ];
    if (meaninglessPhases.some((phrase) => lowercaseCommand.includes(phrase))) {
      return false;
    }

    return navigationKeywords.some((keyword) =>
      lowercaseCommand.includes(keyword),
    );
  }

  /**
   * Process navigation commands directly
   */
  processNavigationCommand(command) {
    console.log("Processing navigation command directly:", command);

    // Extract destination from command
    let destination = this.extractDestination(command);

    if (destination) {
      console.log("Direct navigation to:", destination);
      // Use the enhanced navigation system via navigateToLocation
      this.navigateToLocation(destination);
    } else {
      // If we can't extract destination with basic patterns, use Gemini AI
      console.log("Could not extract destination, using Gemini AI processing");
      this.processVoiceCommand(command);
    }
  }

  /**
   * Extract destination from navigation command
   */
  extractDestination(command) {
    const lowercaseCommand = command.toLowerCase();

    // Patterns to extract destination
    const patterns = [
      /(?:take me to|go to|navigate to|direction to|directions to|route to|find route to|show route to|how to get to)\s+(.+)/i,
      /(?:where is|location of|find location|search for)\s+(.+)/i,
      /(?:navigate|directions|route)\s+(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Show text fallback input for when voice is not available
   */
  showTextFallback() {
    if (document.getElementById("textCommandInput")) return; // Already shown

    const fallbackHtml = `
            <div class="mt-3 p-3 border rounded bg-light">
                <h6>Voice not available? Use text instead:</h6>
                <div class="input-group">
                    <input type="text" id="textCommandInput" class="form-control"
                           placeholder="Type your command (e.g., 'start detection', 'take me to library')">
                    <button class="btn btn-primary" id="textCommandBtn">
                        <i class="fas fa-paper-plane"></i> Send
                    </button>
                </div>
                <small class="text-muted">Commands: start detection, stop, where am i, take me to [place], enable location</small>
            </div>
        `;

    const controlsSection = document.querySelector(
      ".col-md-6:last-child .card-body",
    );
    if (controlsSection) {
      controlsSection.insertAdjacentHTML("beforeend", fallbackHtml);

      const textInput = document.getElementById("textCommandInput");
      const textBtn = document.getElementById("textCommandBtn");

      const processTextCommand = () => {
        const command = textInput.value.trim();
        if (command) {
          this.showRecognizedCommand(command);
          this.processVoiceCommand(command);
          textInput.value = "";
        }
      };

      textBtn.addEventListener("click", processTextCommand);
      textInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          processTextCommand();
        }
      });
    }
  }

  /**
   * Record an interaction (command + response) into persistent history.
   * Also updates the "Assistant Response" panel on screen, which
   * previously never changed from its hardcoded placeholder text.
   */
  logInteraction(command, response) {
    if (!response) return;

    const entry = {
      command: command || null,
      response: response,
      time: new Date().toLocaleString(),
      timestamp: Date.now(),
    };

    this.interactionHistory.push(entry);
    // Cap history length so localStorage doesn't grow unbounded
    if (this.interactionHistory.length > 50) {
      this.interactionHistory = this.interactionHistory.slice(-50);
    }

    try {
      localStorage.setItem(
        "blindmate_history",
        JSON.stringify(this.interactionHistory),
      );
    } catch (e) {
      console.warn("Could not persist history:", e);
    }

    // Update the on-screen "Assistant Response" panel with the latest
    // interaction, instead of it staying frozen on the placeholder text.
    const panel = document.getElementById("assistantMessage");
    if (panel) {
      panel.innerHTML = command
        ? `<b>You said:</b> ${this.escapeHtml(command)}<br><b>Response:</b> ${this.escapeHtml(response)}`
        : this.escapeHtml(response);
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show interaction history - both visually (for a sighted helper/family
   * member glancing at the screen) and spoken (for the blind user, since
   * a visual list alone isn't accessible to them).
   */
  showHistory() {
    if (this.interactionHistory.length === 0) {
      this.speak("You don't have any history yet.", true);
      return;
    }

    const recent = this.interactionHistory.slice(-5).reverse();

    // Visual list, most recent first
    const panel = document.getElementById("assistantMessage");
    if (panel) {
      panel.innerHTML =
        "<b>Recent History:</b><br>" +
        recent
          .map(
            (entry) =>
              `<div style="margin-top:8px;"><small>${entry.time}</small><br>` +
              (entry.command
                ? `<b>You said:</b> ${this.escapeHtml(entry.command)}<br>`
                : "") +
              `<b>Response:</b> ${this.escapeHtml(entry.response)}</div>`,
          )
          .join("");
    }

    // Spoken summary of the most recent interaction, since the blind user
    // can't read the visual list above.
    const latest = recent[0];
    let spoken = `You have ${this.interactionHistory.length} recent interactions. `;
    spoken += latest.command
      ? `Most recently, you said "${latest.command}", and I replied "${latest.response}".`
      : `Most recently, I said "${latest.response}".`;

    this.speak(spoken, true);
  }

  /**
   * Show the recognized command in UI
   */
  showRecognizedCommand(command) {
    this.lastCommandText = command;

    // Update the system status to show the command
    this.updateStatus(`Command received: "${command}"`, "info");

    // Show in dedicated command display
    let commandDisplay = document.getElementById("lastCommand");
    if (!commandDisplay) {
      const statusArea = document.getElementById("systemStatus").parentElement;
      statusArea.insertAdjacentHTML(
        "afterend",
        `
                <div class="alert alert-info mt-2" id="lastCommand" style="display: none;">
                    <strong>Last Command:</strong> <span id="commandText"></span>
                </div>
            `,
      );
      commandDisplay = document.getElementById("lastCommand");
    }

    document.getElementById("commandText").textContent = command;
    commandDisplay.style.display = "block";

    // Hide after 5 seconds
    setTimeout(() => {
      commandDisplay.style.display = "none";
    }, 5000);
  }

  /**
   * Load TensorFlow.js Coco SSD model
   */
  async loadModel() {
    try {
      this.updateStatus("Loading AI detection model...", "warning");

      // Check if TensorFlow.js is available
      if (typeof tf === "undefined") {
        throw new Error("TensorFlow.js not loaded");
      }

      // Set backend to CPU if WebGL is not available
      if (!tf.ENV.getBool("WEBGL_VERSION")) {
        console.warn("WebGL not available, falling back to CPU backend");
        await tf.setBackend("cpu");
      }

      // Ensure TensorFlow.js is ready
      await tf.ready();

      // Check if COCO-SSD is available
      if (typeof cocoSsd === "undefined") {
        throw new Error("COCO-SSD model not loaded");
      }

      // Load COCO-SSD model. The default base model (lite_mobilenet_v2) is
      // optimized for speed over accuracy, which noticeably hurts
      // detection quality - especially for smaller or partially visible
      // objects. mobilenet_v2 is meaningfully more accurate while still
      // running in real time on typical phones. Falls back to the lighter
      // model if the device can't handle the larger one (e.g. low memory).
      try {
        this.model = await cocoSsd.load({ base: "mobilenet_v2" });
      } catch (modelError) {
        console.warn(
          "mobilenet_v2 failed to load, falling back to lite_mobilenet_v2:",
          modelError,
        );
        this.model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      }

      this.updateStatus("AI model loaded successfully!", "success");

      // Hide loading overlay
      const loadingOverlay = document.getElementById("loadingOverlay");
      if (loadingOverlay) {
        loadingOverlay.style.display = "none";
        console.log("Loading overlay hidden successfully");
      } else {
        console.warn("Loading overlay element not found");
      }

      console.log("COCO-SSD model loaded successfully");
    } catch (error) {
      console.error("Error loading model:", error);
      this.updateStatus(
        "Object detection disabled. Voice commands and navigation still available.",
        "warning",
      );

      // Hide loading overlay even on error
      const loadingOverlay = document.getElementById("loadingOverlay");
      if (loadingOverlay) {
        loadingOverlay.style.display = "none";
      }

      // Don't throw error - allow app to continue without object detection
      console.log("Continuing without object detection...");
    }
  }

  /**
   * Start voice interaction flow
   */
  startVoiceInteraction() {
    const greeting =
      'Hello! I am Netra. Object detection is starting now. Say "Hey Netra" anytime for voice commands, or long-press anywhere on the screen to stop or start detection.';
    this.speak(greeting, true); // High priority

    // Start continuous listening for the wake word immediately - no
    // waiting for the greeting to finish first.
    this.startContinuousListening();
    this.updateStatus(
      '👂 Always listening for "Hey Netra" or Volume Up key',
      "info",
    );
  }

  /**
   * Setup voice-guided permission flow
   */
  setupVoicePermissionFlow() {
    if (this.recognition && !this.isListening) {
      this.recognition.continuous = false; // Short responses for permissions
      this.recognition.interimResults = false;

      this.recognition.onresult = (event) => {
        const command = event.results[event.results.length - 1][0].transcript
          .toLowerCase()
          .trim();
        console.log("Permission flow - heard:", command);

        if (
          command.includes("yes") ||
          command.includes("हाँ") ||
          command.includes("ওয়াই") ||
          command.includes("ஆம்")
        ) {
          this.handlePermissionYes();
        } else if (
          command.includes("no") ||
          command.includes("नहीं") ||
          command.includes("না") ||
          command.includes("இல்லை")
        ) {
          this.handlePermissionNo();
        }
      };

      this.recognition.onerror = (event) => {
        console.log("Permission recognition error:", event.error);
        this.isListening = false;
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };

      try {
        this.recognition.start();
        this.isListening = true;
      } catch (error) {
        console.log("Could not start permission recognition:", error);
      }
    }
  }

  /**
   * Handle "yes" response during permission flow
   */
  async handlePermissionYes() {
    if (!this.stream) {
      // First "yes" - start detection
      this.speak("Starting camera detection now.", true);
      await this.startDetection();

      // Ask for location
      setTimeout(() => {
        this.speak("Would you like to enable location for navigation?", true);
      }, 2000);
    } else if (!this.userLocation) {
      // Second "yes" - enable location
      this.speak("Enabling location services.", true);
      await this.requestLocation();
      this.finalizeSetup();
    }
  }

  /**
   * Handle "no" response during permission flow
   */
  handlePermissionNo() {
    this.speak(
      "Okay, you can enable features later using voice commands or buttons.",
      true,
    );
    this.finalizeSetup();
  }

  /**
   * Finalize setup and start continuous listening
   */
  finalizeSetup() {
    setTimeout(() => {
      this.speak(
        'Setup complete. Say "Hey Netra" followed by your command to interact with me.',
        true,
      );
      this.startContinuousListening();
    }, 2000);
  }

  /**
   * Start object detection
   */
  async startDetection() {
    try {
      if (!this.model) {
        this.speak("AI model is not ready. Please wait.");
        return;
      }

      this.updateStatus("Starting camera...", "warning");

      // Request camera access. Higher resolution gives the detection
      // model meaningfully more detail to work with - important for
      // smaller or farther-away objects, which is one of the biggest
      // drivers of missed/incorrect detections at low resolution.
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment", // Use back camera on mobile
        },
      });

      this.video.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      // Setup canvas dimensions
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      this.isDetecting = true;
      this.updateStatus(
        "Detection active - Scanning for objects...",
        "success",
      );
      this.elements.detectionStatus.textContent = "Active";
      this.elements.detectionStatus.className = "badge bg-success";

      // Show detection indicator
      this.elements.detectionIndicator.style.display = "block";
      this.elements.detectionIndicator.classList.add("active");

      this.elements.startBtn.disabled = true;
      this.elements.stopBtn.disabled = false;

      this.speak(
        "Object detection started. I will alert you about any obstacles or objects I detect.",
      );

      // Start detection loop
      this.detectObjects();
    } catch (error) {
      console.error("Error starting detection:", error);
      this.updateStatus(
        "Camera unavailable. Voice commands and navigation are still active.",
        "warning",
      );
      this.speak(
        "Camera is not available, but voice commands and navigation are ready to use.",
      );
    }
  }

  /**
   * Stop object detection
   */
  stopDetection() {
    this.isDetecting = false;

    // Clean up speech delay timer
    if (this.speechDelayTimer) {
      clearTimeout(this.speechDelayTimer);
      this.speechDelayTimer = null;
    }
    this.pendingAnnouncement = null;
    this.isAnnouncementDelayed = false;

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.video.srcObject = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.updateStatus("Detection stopped.", "secondary");
    this.elements.detectionStatus.textContent = "Inactive";
    this.elements.detectionStatus.className = "badge bg-secondary";

    // Hide detection indicator
    this.elements.detectionIndicator.style.display = "none";
    this.elements.detectionIndicator.classList.remove("active");

    this.elements.startBtn.disabled = false;
    this.elements.stopBtn.disabled = true;

    this.speak("Object detection stopped.");
  }

  /**
   * Main object detection loop
   */
  async detectObjects() {
    if (!this.isDetecting || !this.model) {
      return;
    }

    try {
      // Perform detection on the full frame. minScore here (0.4) is
      // intentionally slightly below this.detectionThreshold (0.45) -
      // otherwise the model would discard borderline small/distant object
      // detections before the final threshold ever got a chance to see
      // them, silently defeating the point of lowering that threshold.
      let predictions = await this.model.detect(this.video, 25, 0.4);

      // Every 2nd frame, ALSO run a zoomed center-crop detection pass.
      // COCO-SSD internally resizes every input down to a small fixed
      // resolution before running inference, so simply increasing camera
      // resolution doesn't fully help small/distant objects - they still
      // get shrunk to the same tiny footprint internally. Cropping into
      // the center of the frame and scaling that crop back up makes small
      // objects occupy proportionally more of the model's fixed input
      // size, meaningfully improving detection of things that are small
      // or far away.
      this.detectionFrameCount = (this.detectionFrameCount || 0) + 1;
      if (this.detectionFrameCount % 2 === 0) {
        const zoomedPredictions = await this.detectZoomedCenter();
        predictions = this.mergeDetections(predictions, zoomedPredictions);
      }

      this.currentPredictions = predictions;
      // Clear previous drawings
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Filter predictions by confidence threshold - this lower bar (0.45)
      // is what gets DRAWN and tracked, which is what makes small/distant
      // objects visible at all.
      const validPredictions = predictions.filter(
        (prediction) => prediction.score >= this.detectionThreshold,
      );

      if (validPredictions.length > 0) {
        this.drawPredictions(validPredictions);
        this.updateObjectTracking(validPredictions);

        // What actually gets SPOKEN uses a stricter, two-part check on
        // top of validPredictions:
        // 1. A higher confidence bar than what's merely drawn - a lower
        //    threshold helps small objects get detected/shown, but
        //    speaking about anything the model is only 45% sure about
        //    means confidently announcing things that are often wrong.
        // 2. Temporal confirmation - the object must show up consistently
        //    across recent frames, not just once. A single-frame
        //    misclassification (a flicker) won't survive this, but a
        //    real object that's actually there will.
        const confirmedForAnnouncement =
          this.getConfirmedAnnouncementPredictions(predictions);
        if (confirmedForAnnouncement.length > 0) {
          this.announceDetectionsSmart(confirmedForAnnouncement);
        }
      } else {
        // No objects detected, update tracking for disappearances
        this.updateObjectTracking([]);
        this.getConfirmedAnnouncementPredictions([]); // still advance history with an empty frame
      }

      // Continue detection loop
      if (this.isDetecting) {
        requestAnimationFrame(() => this.detectObjects());
      }
    } catch (error) {
      console.error("Detection error:", error);
      // Continue detection even if one frame fails
      if (this.isDetecting) {
        setTimeout(() => this.detectObjects(), 100);
      }
    }
  }

  /**
   * Decide which detections are trustworthy enough to actually speak
   * about, as opposed to merely drawing on screen. Two checks:
   *   1. A higher confidence bar (this.announcementConfidenceThreshold)
   *      than the general drawing/tracking threshold.
   *   2. Temporal confirmation - the class must appear in at least
   *      this.temporalConfirmMinFrames of the last
   *      this.temporalConfirmWindow detection frames. This filters out
   *      one-off single-frame misclassifications (a momentary wrong
   *      guess that doesn't repeat), while still letting real, persistent
   *      objects through quickly.
   */
  getConfirmedAnnouncementPredictions(allPredictions) {
    if (!this.recentDetectionHistory) {
      this.recentDetectionHistory = [];
    }

    const highConfidenceThisFrame = allPredictions.filter(
      (p) => p.score >= this.announcementConfidenceThreshold,
    );

    // Record which classes were high-confidence this frame
    const classesThisFrame = new Set(
      highConfidenceThisFrame.map((p) => p.class),
    );
    this.recentDetectionHistory.push(classesThisFrame);
    if (this.recentDetectionHistory.length > this.temporalConfirmWindow) {
      this.recentDetectionHistory.shift();
    }

    // Count how many of the recent frames each class appeared in
    const classFrameCounts = new Map();
    for (const frameClasses of this.recentDetectionHistory) {
      for (const cls of frameClasses) {
        classFrameCounts.set(cls, (classFrameCounts.get(cls) || 0) + 1);
      }
    }

    // A class is "confirmed" if it showed up consistently enough across
    // recent frames - not just once.
    const confirmedClasses = new Set(
      [...classFrameCounts.entries()]
        .filter(([, count]) => count >= this.temporalConfirmMinFrames)
        .map(([cls]) => cls),
    );

    if (confirmedClasses.size === 0) return [];

    // Return the current frame's best (highest-confidence) instance of
    // each confirmed class.
    const result = [];
    for (const cls of confirmedClasses) {
      const matches = highConfidenceThisFrame.filter((p) => p.class === cls);
      if (matches.length > 0) {
        const best = matches.reduce((a, b) => (a.score > b.score ? a : b));
        result.push(best);
      }
    }
    return result;
  }

  /**
   * Run detection on a zoomed crop of the center of the frame, then remap
   * the resulting bounding boxes back into full-frame coordinates so they
   * line up correctly with everything downstream (position/distance
   * announcements, drawing, tracking).
   */
  async detectZoomedCenter() {
    try {
      const video = this.video;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return [];

      // Crop the center 55% of the frame and scale it up to fill the
      // full frame size before detecting - this is what makes small/
      // distant objects appear proportionally larger to the model.
      const cropRatio = 0.45; // tightened from 0.55 - a more aggressive
      // zoom makes small/distant objects occupy proportionally more of
      // the model's fixed input resolution, improving detection further.
      const cropW = vw * cropRatio;
      const cropH = vh * cropRatio;
      const cropX = (vw - cropW) / 2;
      const cropY = (vh - cropH) / 2;

      if (!this.zoomCanvas) {
        this.zoomCanvas = document.createElement("canvas");
      }
      this.zoomCanvas.width = vw;
      this.zoomCanvas.height = vh;
      const zctx = this.zoomCanvas.getContext("2d");
      zctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, vw, vh);

      const zoomedPredictions = await this.model.detect(
        this.zoomCanvas,
        20,
        0.4,
      );

      // Remap bbox coordinates from the zoomed-canvas space back into
      // original full-frame coordinates
      const scaleX = cropW / vw;
      const scaleY = cropH / vh;

      return zoomedPredictions.map((p) => {
        const [zx, zy, zw, zh] = p.bbox;
        return {
          ...p,
          bbox: [
            cropX + zx * scaleX,
            cropY + zy * scaleY,
            zw * scaleX,
            zh * scaleY,
          ],
        };
      });
    } catch (error) {
      console.error("Zoomed detection error:", error);
      return [];
    }
  }

  /**
   * Merge full-frame and zoomed-pass detections, skipping duplicates (the
   * same real-world object often gets detected in both passes) using IoU
   * (intersection-over-union) overlap on matching classes.
   */
  mergeDetections(mainPredictions, zoomedPredictions) {
    const merged = [...mainPredictions];

    for (const zPred of zoomedPredictions) {
      const isDuplicate = mainPredictions.some(
        (mPred) =>
          mPred.class === zPred.class &&
          this.calculateIoU(mPred.bbox, zPred.bbox) > 0.3,
      );
      if (!isDuplicate) {
        merged.push(zPred);
      }
    }

    return merged;
  }

  /**
   * Intersection-over-union of two [x, y, width, height] bounding boxes,
   * used to detect when two detections are really the same object.
   */
  calculateIoU(boxA, boxB) {
    const [ax, ay, aw, ah] = boxA;
    const [bx, by, bw, bh] = boxB;

    const x1 = Math.max(ax, bx);
    const y1 = Math.max(ay, by);
    const x2 = Math.min(ax + aw, bx + bw);
    const y2 = Math.min(ay + ah, by + bh);

    const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const unionArea = aw * ah + bw * bh - interArea;

    return unionArea > 0 ? interArea / unionArea : 0;
  }

  /**
   * Draw bounding boxes and labels on canvas with improved styling
   */
  drawPredictions(predictions) {
    // Clear previous drawings
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    predictions.forEach((prediction, index) => {
      const [x, y, width, height] = prediction.bbox;
      const confidence = Math.round(prediction.score * 100);
      const label = `${prediction.class} ${confidence}%`;

      // Color coding for different object types
      let boxColor = "#00ff00"; // Default green
      if (prediction.class === "person")
        boxColor = "#ff6b6b"; // Red for people
      else if (
        prediction.class.includes("vehicle") ||
        prediction.class === "car" ||
        prediction.class === "truck"
      )
        boxColor = "#ffa500"; // Orange for vehicles
      else if (prediction.class === "chair" || prediction.class === "couch")
        boxColor = "#4ecdc4"; // Teal for furniture

      // Draw bounding box with shadow for better visibility
      this.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      this.ctx.shadowBlur = 3;
      this.ctx.strokeStyle = boxColor;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(x, y, width, height);

      // Reset shadow for text
      this.ctx.shadowBlur = 0;

      // Measure text to create proper background
      this.ctx.font = "bold 16px Arial";
      const textMetrics = this.ctx.measureText(label);
      const textWidth = textMetrics.width + 10;
      const textHeight = 25;

      // Draw label background with some padding
      this.ctx.fillStyle = boxColor;
      this.ctx.fillRect(x, y - textHeight, textWidth, textHeight);

      // Draw label text
      this.ctx.fillStyle = "#000000";
      this.ctx.fillText(label, x + 5, y - 7);

      // Add distance indicator
      const distance = this.estimateDistance(prediction.bbox);
      this.ctx.font = "bold 12px Arial";
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillText(distance, x + 5, y + height - 5);
    });
  }

  /**
   * Update object tracking system for smart announcements
   */
  updateObjectTracking(predictions) {
    const now = Date.now();
    const currentDetectedObjects = new Set();

    // Extract object names from current predictions
    predictions.forEach((prediction) => {
      currentDetectedObjects.add(prediction.class);
    });

    // Update last seen time for currently detected objects
    for (const objectName of currentDetectedObjects) {
      this.objectLastSeen.set(objectName, now);

      // Remove from disappearance tracking if it reappeared
      if (this.objectDisappearanceTime.has(objectName)) {
        this.objectDisappearanceTime.delete(objectName);
      }
    }

    // Check for disappeared objects and mark their disappearance time
    for (const [objectName, lastSeenTime] of this.objectLastSeen.entries()) {
      if (
        !currentDetectedObjects.has(objectName) &&
        !this.objectDisappearanceTime.has(objectName)
      ) {
        // Object just disappeared, mark the time
        this.objectDisappearanceTime.set(objectName, now);
      }
    }

    // Clean up objects that have been gone for longer than cooldown period
    for (const [
      objectName,
      disappearanceTime,
    ] of this.objectDisappearanceTime.entries()) {
      if (now - disappearanceTime > this.cooldownPeriod) {
        // Reset announcement count for objects that have been gone long enough
        this.objectAnnouncementCount.delete(objectName);
        this.objectLastSeen.delete(objectName);
        this.objectDisappearanceTime.delete(objectName);
      }
    }
  }

  /**
   * Announce detected objects via speech with priority system and smart tracking
   */
  announceDetectionsSmart(predictions) {
    const now = Date.now();

    // Obstacle/danger warnings run on EVERY frame, completely independent
    // of the general announcement throttle below - safety warnings should
    // never wait behind a cooldown meant only for descriptive narration.
    // (Previously this call was placed after the throttle's early return,
    // so it was actually being silently gated by it too, contradicting
    // its own comment - fixed here.)
    const justWarnedClass = this.checkObstacleWarning(predictions);

    // Save detected objects to memory - also independent of the
    // announcement throttle.
    predictions.forEach((prediction) => {
      this.autoSaveMemory(prediction);
    });

    const currentInterval =
      this.isNavigating && this.currentRoute
        ? this.announcementInterval * 1.5
        : this.announcementInterval;

    // Priority objects (most important for navigation)
    const priorityObjects = [
      "person",
      "chair",
      "car",
      "truck",
      "bus",
      "bicycle",
      "motorcycle",
    ];

    // Filter predictions that can be announced based on smart tracking.
    // A brand-new object (never announced before) is allowed through
    // using a much shorter throttle than a repeat announcement, so
    // spotting something for the first time feels near-instant rather
    // than waiting behind the same 5-second gate as routine repeats.
    const announcablePredictions = predictions.filter((prediction) => {
      // Already warned about this exact object in this same detection
      // cycle (via checkObstacleWarning above) - don't also queue a
      // redundant regular narration for it right on top of that.
      if (justWarnedClass && prediction.class === justWarnedClass) {
        return false;
      }

      const announcementCount =
        this.objectAnnouncementCount.get(prediction.class) || 0;

      if (announcementCount >= this.maxAnnouncements) {
        return false; // Already announced 3 times
      }

      // Check if object was missing and came back (reset scenario)
      const disappearanceTime = this.objectDisappearanceTime.get(
        prediction.class,
      );
      if (disappearanceTime && now - disappearanceTime < this.cooldownPeriod) {
        return false; // Object reappeared too quickly, don't announce
      }

      const isFirstSighting = announcementCount === 0;
      const effectiveInterval = isFirstSighting
        ? this.firstSightingInterval
        : currentInterval;

      if (now - this.lastAnnouncement < effectiveInterval) {
        return false;
      }

      return true;
    });

    if (announcablePredictions.length === 0) {
      // Debug: Show why objects weren't announced
      predictions.forEach((prediction) => {
        const count = this.objectAnnouncementCount.get(prediction.class) || 0;
        const disappearanceTime = this.objectDisappearanceTime.get(
          prediction.class,
        );
        const timeSinceDisappearance = disappearanceTime
          ? now - disappearanceTime
          : null;

        if (count >= this.maxAnnouncements) {
          console.log(
            `${prediction.class}: Max announcements reached (${count}/${this.maxAnnouncements})`,
          );
        } else if (
          timeSinceDisappearance !== null &&
          timeSinceDisappearance < this.cooldownPeriod
        ) {
          console.log(
            `${prediction.class}: In cooldown (${Math.round(timeSinceDisappearance / 1000)}s/${Math.round(this.cooldownPeriod / 1000)}s)`,
          );
        }
      });
      return; // No objects to announce
    }

    // Sort predictions by priority and distance
    const sortedPredictions = announcablePredictions.sort((a, b) => {
      const aPriority = priorityObjects.includes(a.class) ? 1 : 0;
      const bPriority = priorityObjects.includes(b.class) ? 1 : 0;

      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }

      // If same priority, sort by size (closer objects are larger)
      const aSize = a.bbox[2] * a.bbox[3];
      const bSize = b.bbox[2] * b.bbox[3];
      return bSize - aSize;
    });

    // Take only the most important objects (max 2)
    const importantObjects = sortedPredictions.slice(0, 2);

    if (importantObjects.length > 0) {
      // Increment announcement count for announced objects
      importantObjects.forEach((prediction) => {
        const currentCount =
          this.objectAnnouncementCount.get(prediction.class) || 0;
        this.objectAnnouncementCount.set(prediction.class, currentCount + 1);

        // Debug logging for smart announcement system
        console.log(
          `Smart Announcement: ${prediction.class} (count: ${currentCount + 1}/${this.maxAnnouncements})`,
        );
      });

      const objectsWithDistance = importantObjects.map((prediction) => {
        const distance = this.estimateDistance(prediction.bbox);
        const position = this.getRelativePosition(prediction.bbox);
        return {
          name: prediction.class,
          distance: distance,
          position: position,
          confidence: Math.round(prediction.score * 100),
        };
      });

      // Create contextual announcement with specific object names
      let announcement = "";
      objectsWithDistance.forEach((obj, index) => {
        if (index > 0) announcement += ". Also, ";

        // More natural language for all objects
        if (obj.name === "person") {
          announcement += `person ${obj.position}, ${obj.distance}`;
        } else {
          announcement += `${obj.name} ${obj.position}, ${obj.distance}`;
        }
      });

      // During navigation, treat object detection as higher priority to avoid conflicts with turn instructions
      const isNavigationMode = this.isNavigating && this.currentRoute;

      // Keep the full scene description (all current predictions) available for follow-up questions
      this.currentSceneDescription = this.generateSceneDescription(predictions);

      this.speak(announcement, isNavigationMode, true);
      this.lastAnnouncement = now;
    }
  }

  generateSceneDescription(predictions) {
    if (!predictions || predictions.length === 0) {
      return "The area around you appears clear.";
    }

    let people = [];
    let furniture = [];
    let objects = [];
    let vehicles = [];

    predictions.forEach((prediction) => {
      const name = prediction.class;
      const position = this.getRelativePosition(prediction.bbox);
      const distance = this.estimateDistance(prediction.bbox);
      const text = `${name} ${position}, ${distance}`;

      if (name === "person") {
        people.push(text);
      } else if (["chair", "couch", "bench", "table", "bed"].includes(name)) {
        furniture.push(text);
      } else if (
        ["car", "truck", "bus", "motorcycle", "bicycle"].includes(name)
      ) {
        vehicles.push(text);
      } else {
        objects.push(text);
      }
    });

    let sentence = "";

    if (people.length) {
      sentence += "I can see " + people.join(", ") + ". ";
    }

    if (furniture.length) {
      sentence += "Nearby furniture includes " + furniture.join(", ") + ". ";
    }

    if (objects.length) {
      sentence += "Nearby objects include " + objects.join(", ") + ". ";
    }

    if (vehicles.length) {
      sentence += "Vehicles detected: " + vehicles.join(", ") + ". ";
    }

    sentence += "Please move carefully.";

    return sentence;
  }

  /**
   * Legacy announcement method for backwards compatibility
   */
  announceDetections(predictions) {
    // Redirect to smart announcement system
    this.announceDetectionsSmart(predictions);
  }

  /**
   * Get relative position of object (left, center, right)
   */
  getRelativePosition(bbox) {
    const [x, y, width, height] = bbox;
    const centerX = x + width / 2;
    const canvasCenter = this.canvas.width / 2;
    const threshold = this.canvas.width * 0.25; // 25% threshold

    if (centerX < canvasCenter - threshold) {
      return "on your left";
    } else if (centerX > canvasCenter + threshold) {
      return "on your right";
    } else {
      return "ahead of you";
    }
  }

  /**
   * Estimate distance based on bounding box size (simplified)
   */
  estimateDistance(bbox) {
    const [x, y, width, height] = bbox;
    const area = width * height;
    const videoArea = this.video.videoWidth * this.video.videoHeight;
    const relativeSize = area / videoArea;

    if (relativeSize > 0.3) return "very close";
    if (relativeSize > 0.15) return "1 meter away";
    if (relativeSize > 0.05) return "2 meters away";
    return "far away";
  }

  /**
   * Process voice commands via Gemini API
   */
  /**
   * After the AI answers a voice command, automatically reopen the
   * microphone for a follow-up question - the user doesn't need to repeat
   * "Hey Netra" for every single question in a row. If nothing is said,
   * it falls back to wake-word-only listening automatically (no change
   * needed there - the existing commandRecognition.onend handler already
   * does that).
   */
  startFollowUpListening() {
    const waitForSpeechToFinish = () => {
      if (this.isSpeaking) {
        setTimeout(waitForSpeechToFinish, 200);
        return;
      }
      if (!this.isListening && this.commandRecognition) {
        console.log("Reopening mic for a follow-up question");
        this.updateStatus(
          "🎤 Listening for a follow-up question...",
          "info",
        );
        this.startVoiceCommand();
      }
    };
    setTimeout(waitForSpeechToFinish, 300);
  }

  async processVoiceCommand(command) {
    console.log("Processing voice command:", command);

    // Filter out common meaningless phrases that might trigger false processing
    const meaninglessPatterns = [
      /^(um|uh|ah|er|hm|hmm|yes|yeah|no|okay|ok)$/i,
      /^sorry.*didn'?t.*understand/i,
      /^please try again/i,
      /^try again/i,
      /^what$/i,
      /^\s*$/, // Empty or whitespace only
      /^.{1,2}$/, // Very short commands (1-2 characters)
    ];

    const isEmptyCommand = meaninglessPatterns.some((pattern) =>
      pattern.test(command.trim()),
    );

    if (isEmptyCommand) {
      console.log("Filtering out meaningless command:", command);
      this.updateStatus(
        'Ready for voice commands. Say "Hey Netra", or long-press anywhere to toggle detection.',
        "info",
      );
      return;
    }

    try {
      this.updateStatus("Processing your command...", "primary");

      // Send command to Gemini API for processing
      const response = await fetch("/api/process-command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: command,
          language: this.currentLanguage,
          tone: this.currentTone,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Gemini response:", result);

      // Execute the action based on Gemini's response
      console.log(
        "About to execute action:",
        result.action,
        "with destination:",
        result.destination,
      );
      await this.executeAction(result);
      this.startFollowUpListening();
    } catch (error) {
      console.error("Error processing command:", error);

      // Fallback to basic command processing without announcement
      console.log("Using fallback processing for command:", command);
      await this.fallbackCommandProcessing(command);
      this.startFollowUpListening();
    }
  }

  /**
   * Fallback command processing when Gemini is unavailable
   */
  async fallbackCommandProcessing(command) {
    const cmd = command.toLowerCase();

    if (
      (cmd.includes("start") && cmd.includes("detection")) ||
      cmd === "start detection"
    ) {
      if (!this.isDetecting) {
        this.speak("Starting object detection", true);
        await this.startDetection();
        this.updateStatus(
          "Object detection started via voice command",
          "success",
        );
      } else {
        this.speak("Detection is already running", true);
      }
    } else if (cmd.includes("stop") && !cmd.includes("navigation")) {
      if (this.isDetecting) {
        this.speak("Stopping detection", true);
        this.stopDetection();
        this.updateStatus(
          "Object detection stopped via voice command",
          "success",
        );
      } else {
        this.speak("Detection is not currently running", true);
      }
    } else if (cmd.includes("location") || cmd.includes("where am i")) {
      this.speak("Enabling location services", true);
      this.requestLocation();
    } else if (
      cmd.includes("take me") ||
      cmd.includes("navigate") ||
      cmd.includes("go to")
    ) {
      // Extract destination
      let destination = cmd.replace(/take me to|navigate to|go to/g, "").trim();

      // Handle common phrase variations
      if (cmd.includes("take me to the")) {
        destination = cmd.replace(/take me to the/g, "").trim();
      }

      if (destination) {
        console.log(
          "Navigation command detected:",
          cmd,
          "Destination:",
          destination,
        );
        this.speak(`Navigating to ${destination}`, true);
        await this.navigateToLocation(destination);
      } else {
        this.speak(
          "Where would you like to go? Please say the name of any place, landmark, or address.",
          true,
        );
      }
    } else if (cmd.includes("preview") || cmd.includes("route to")) {
      // Extract destination for route preview
      let destination = cmd
        .replace(/preview route to|route to|preview/g, "")
        .trim();
      if (destination) {
        console.log(
          "Preview command detected:",
          cmd,
          "Destination:",
          destination,
        );
        await this.previewRoute(destination);
      } else {
        this.speak("Which location would you like to preview?", true);
      }
    } else if (
      cmd.includes("stop navigation") ||
      cmd.includes("cancel navigation")
    ) {
      this.stopNavigation();
    } else if (cmd.includes("language") && cmd.includes("hindi")) {
      this.changeLanguage("hi-IN");
    } else if (cmd.includes("language") && cmd.includes("english")) {
      this.changeLanguage("en-IN");
    } else if (
      cmd.includes("tutorial") ||
      cmd.includes("help") ||
      cmd.includes("guide") ||
      cmd.includes("learn")
    ) {
      this.speak(
        "Starting Netra tutorial. This will help you learn all the features.",
        true,
      );
      setTimeout(() => {
        window.location.href = "/tutorial";
      }, 2000);
    } else if (
      cmd.includes("what's in front of me") ||
      cmd.includes("what is in front of me") ||
      cmd.includes("what is ahead") ||
      cmd.includes("what's ahead") ||
      cmd.includes("describe surroundings")
    ) {
      this.describeCurrentScene();
    } else if (
      cmd.includes("read this") ||
      cmd.includes("read text") ||
      cmd.includes("scan text") ||
      cmd.includes("read document") ||
      cmd.includes("read paper") ||
      cmd.includes("read medicine") ||
      cmd.includes("read label")
    ) {
      this.captureAndReadText();
    } else if (
      cmd.startsWith("where is") ||
      cmd.startsWith("where's") ||
      cmd.startsWith("where did i keep")
    ) {
      this.findObjectFromMemory(cmd);
    } else if (
      cmd.includes("help") ||
      cmd.includes("emergency") ||
      cmd.includes("call for help") ||
      cmd.includes("i need help")
    ) {
      this.triggerSOS();
    } else if (
      cmd.includes("can i") ||
      cmd.includes("is there") ||
      cmd.includes("describe") ||
      cmd.includes("what is") ||
      cmd.includes("what's") ||
      cmd.includes("is it safe")
    ) {
      this.askGemini(command);
    } else {
      this.speak(
        "Command not recognized. Try saying start detection, navigate to a place, or tutorial for help.",
        true,
      );
    }
  }

  /* ==========================================
       OCR Capture and Read
    ========================================== */
  async captureAndReadText() {
    if (!this.video || !this.video.srcObject) {
      this.speak("Please start object detection first.", true);
      return;
    }

    this.updateStatus("Reading text...", "info");

    const canvas = document.createElement("canvas");
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(this.video, 0, 0);

    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append("image", blob, "ocr.jpg");

      try {
        const response = await fetch("/api/ocr", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (result.success) {
          this.updateStatus("Text detected", "success");
          this.speak("I found the following text. " + result.text, true);
        } else {
          this.updateStatus("OCR unavailable", "warning");
          this.speak(
            result.message ||
              "I couldn't detect any readable text. Please move the camera closer.",
            true,
          );
        }
      } catch (error) {
        console.error(error);
        this.updateStatus("OCR failed", "danger");
        this.speak("Sorry, OCR is currently unavailable.", true);
      }
    }, "image/jpeg");
  }

  /* ==========================================
       Describe Current Scene
    ========================================== */
  describeCurrentScene() {
    if (!this.currentPredictions || this.currentPredictions.length === 0) {
      this.speak("I cannot detect anything in front of you right now.", true);
      return;
    }

    const description = this.generateSceneDescription(this.currentPredictions);
    this.speak(description, true);
  }

  /* ==========================================
       Memory Voice Search
    ========================================== */
  async findObjectFromMemory(command) {
    let object = command
      .toLowerCase()
      .replace(/where\s+is/, "")
      .replace(/where'?s/, "")
      .replace(/where\s+did\s+i\s+keep/, "")
      .replace(/find/, "")
      .replace(/have\s+you\s+seen/, "")
      .replace(/locate/, "")
      .trim();

    // Strip a leading possessive/article left over after removing the
    // trigger phrase, e.g. "my phone" -> "phone".
    object = object.replace(/^(my|the)\s+/, "").trim();

    if (!object) {
      this.speak("Please tell me the object name.", true);
      return;
    }

    try {
      const response = await fetch("/api/memory");
      const memories = await response.json();

      const found = memories.find(
        (item) => item.object.toLowerCase() === object.toLowerCase(),
      );

      if (found) {
        const answer = `Your ${found.object} was last seen ${found.location}, on ${found.time}.`;
        this.updateStatus(answer, "success");
        this.speak(answer, true);
      } else {
        this.speak(`I could not find any memory for ${object}.`, true);
      }
    } catch (error) {
      console.error(error);
      this.speak("Unable to access memory.", true);
    }
  }

  /* ==================================
       Auto Save Memory
    ================================== */
  autoSaveMemory(prediction) {
    const now = Date.now();
    const key = prediction.class;

    if (
      this.savedObjects.has(key) &&
      now - this.savedObjects.get(key) < this.memoryCooldown
    ) {
      return;
    }

    this.savedObjects.set(key, now);

    if (window.memoryAssistant) {
      window.memoryAssistant.saveObject(
        prediction.class,
        this.getRelativePosition(prediction.bbox),
        this.estimateDistance(prediction.bbox),
        this.generateSceneDescription(this.currentPredictions),
      );
    }
  }

  checkObstacleWarning(objects) {
    const now = Date.now();

    if (now - this.lastObstacleAlert < this.obstacleCooldown) {
      return;
    }

    const dangerObjects = [
      "person",
      "chair",
      "table",
      "car",
      "truck",
      "bus",
      "motorcycle",
      "bicycle",
      "dog",
      "stairs",
    ];

    for (const object of objects) {
      // Share the same per-object announcement budget as regular
      // narration (announceDetectionsSmart) - previously this system had
      // NO cap at all, only a 4-second cooldown, so an object that stayed
      // close (e.g. a person standing still) would get warned about every
      // 4 seconds indefinitely. Now the same object gets at most
      // maxAnnouncements (3) total mentions, whether from this warning or
      // regular narration, before going silent until it's gone long
      // enough to reset or a genuinely different object shows up.
      const announcementCount =
        this.objectAnnouncementCount.get(object.class) || 0;
      if (announcementCount >= this.maxAnnouncements) {
        continue;
      }

      const distance = this.estimateDistance(object.bbox);
      const position = this.getRelativePosition(object.bbox);

      if (
        dangerObjects.includes(object.class) &&
        (distance.includes("very close") || distance.includes("close"))
      ) {
        this.lastObstacleAlert = now;
        this.objectAnnouncementCount.set(object.class, announcementCount + 1);
        this.speak(
          `Warning. ${object.class} ${position}. Please be careful.`,
          true,
        );
        return object.class;
      }
    }
    return null;
  }
  /* ==========================================
       Ask Gemini About Current Scene
    ========================================== */
  async askGemini(question) {
    try {
      this.updateStatus("Thinking...", "info");

      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: question,
          scene: this.currentSceneDescription || "No scene available.",
          objects: this.currentPredictions || [],
          language: this.currentLanguage || "en-IN",
        }),
      });

      const result = await response.json();

      if (result.success) {
        this.updateStatus("AI response ready", "success");
        this.speak(result.answer, true);
      } else {
        this.speak("Sorry, I couldn't answer that.", true);
      }
    } catch (error) {
      console.error(error);
      this.speak("Gemini is unavailable.", true);
    }
  }

  /* ==========================================
       SOS
    ========================================== */
  /**
   * Trigger emergency SOS. Delegates to window.emergencySOS (sos.js),
   * which is the single real implementation - it knows about saved
   * contacts, sends real email/SMS alerts via the server, and falls back
   * to opening a pre-filled SMS if no server channel is configured.
   * (Previously this method had its own separate, broken implementation
   * that posted to a "/api/sos" endpoint that didn't exist anywhere in
   * the backend and never included emergency contacts at all.)
   */
  async triggerSOS() {
    if (window.emergencySOS) {
      await window.emergencySOS.triggerSOS();
    } else {
      console.error("Emergency SOS system not loaded.");
      this.speak(
        "Emergency system is not available right now. Please call your emergency contact directly.",
        true,
      );
    }
  }

  async describeScene() {
    if (!this.video || !this.video.srcObject) {
      this.speak("Please start the camera first.", true);

      return;
    }

    const canvas = document.createElement("canvas");

    canvas.width = this.video.videoWidth;

    canvas.height = this.video.videoHeight;

    const ctx = canvas.getContext("2d");

    ctx.drawImage(this.video, 0, 0);

    canvas.toBlob(async (blob) => {
      const formData = new FormData();

      formData.append("image", blob, "scene.jpg");

      formData.append(
        "objects",

        JSON.stringify(this.currentPredictions),
      );

      try {
        const response = await fetch(
          "/api/scene/describe",

          {
            method: "POST",

            body: formData,
          },
        );

        const result = await response.json();

        if (result.success) {
          this.currentSceneDescription = result.description;

          this.speak(result.description, true);
        } else {
          this.speak(
            "Unable to describe the scene.",

            true,
          );
        }
      } catch (error) {
        console.error(error);

        this.speak(
          "Scene description failed.",

          true,
        );
      }
    }, "image/jpeg");
  }
  /**
   * Execute actions based on Gemini response
   */
  async executeAction(result) {
    console.log("Executing action:", result);

    if (!result.action) {
      this.speak("I could not understand that command.");
      return;
    }

    // Update action status
    this.updateActionStatus(result.response || "Processing command...", "info");

    // Execute the requested action
    switch (result.action) {
      case "silent":
        // Do nothing for meaningless commands - prevents false error messages
        this.updateStatus(
          'Ready for voice commands. Say "Hey Netra", or long-press anywhere to toggle detection.',
          "info",
        );
        return;

      case "start_detection":
        if (!this.isDetecting) {
          await this.startDetection();
          this.updateStatus(
            "Object detection started via voice command",
            "success",
          );
        } else {
          this.speak("Detection is already running", true);
        }
        break;

      case "stop_detection":
      case "stop":
        if (this.isDetecting) {
          this.stopDetection();
          this.updateStatus(
            "Object detection stopped via voice command",
            "success",
          );
        } else {
          this.speak("Detection is not currently running", true);
        }
        break;

      case "navigate":
        console.log(
          "Processing navigate action with destination:",
          result.destination,
        );
        this.speak(result.response || "Starting navigation...", true);
        if (result.destination) {
          console.log("Calling navigateToLocation with:", result.destination);
          await this.navigateToLocation(result.destination);
        } else {
          this.speak(
            "I need a destination to navigate to. Please say the name of any place, landmark, or address.",
            true,
          );
        }
        break;

      case "show_map":
        console.log("Showing navigation map");
        this.speak(result.response || "Showing navigation map...", true);
        if (
          window.blindMateNavigation &&
          window.blindMateNavigation.showNavigationMap
        ) {
          window.blindMateNavigation.showNavigationMap();
        } else {
          this.speak(
            "Navigation map is not available. Please start navigation first.",
            true,
          );
        }
        break;

      case "emergency_stop":
        console.log("Emergency stop navigation");
        this.speak(
          result.response || "Stopping navigation immediately...",
          true,
        );
        if (
          window.blindMateNavigation &&
          window.blindMateNavigation.emergencyStop
        ) {
          window.blindMateNavigation.emergencyStop();
        } else {
          this.speak("Navigation is not currently active.", true);
        }
        break;

      case "test_voice":
        console.log("Testing voice recognition");
        this.speak(result.response || "Testing voice recognition...", true);
        if (
          window.blindMateNavigation &&
          window.blindMateNavigation.testVoiceRecognition
        ) {
          window.blindMateNavigation.testVoiceRecognition();
        } else {
          // Fallback test using main app's voice system
          this.testVoiceRecognitionFallback();
        }
        break;

      case "toggle_obstacle_alerts":
        console.log("Toggling obstacle alerts");
        this.speak(result.response || "Toggling obstacle alerts...", true);
        if (
          window.blindMateNavigation &&
          window.blindMateNavigation.toggleObstacleAlerts
        ) {
          window.blindMateNavigation.toggleObstacleAlerts();
        } else {
          this.speak("Obstacle alert system is not available.", true);
        }
        break;

      case "preview_route":
        console.log("Gemini preview action:", result.destination);
        if (result.destination) {
          await this.previewRoute(result.destination);
        } else {
          this.speak("I need a destination to preview the route", true);
        }
        break;

      case "stop_navigation":
        console.log("Gemini stop navigation action");
        this.stopNavigation();
        break;

      case "enable_location":
        await this.requestLocation();
        break;

      case "change_language":
        if (result.language) {
          this.changeLanguage(result.language);
        } else {
          this.speak("Language not supported", true);
        }
        break;

      case "change_tone":
        if (result.tone) {
          this.changeTone(result.tone);
        } else {
          this.speak("Tone not supported", true);
        }
        break;

      case "get_location":
        if (this.userLocation) {
          this.speak(
            `You are currently at latitude ${this.userLocation.latitude.toFixed(4)}, longitude ${this.userLocation.longitude.toFixed(4)}`,
            true,
          );
        } else {
          this.speak(
            "Location not available. Please enable location services first.",
            true,
          );
        }
        break;

      case "answer_question":
        // General voice Q&A - Gemini has already generated the answer in
        // result.response, so just speak it directly to the user.
        if (result.response) {
          this.speak(result.response, true);
        } else {
          this.speak("Sorry, I don't have an answer for that.", true);
        }
        break;

      case "read_text":
        // Gemini recognized this as a request to read text aloud (medicine
        // label, document, etc.) - capture a frame and run OCR.
        this.captureAndReadText();
        break;

      case "emergency_sos":
        this.triggerSOS();
        break;

      case "recall_memory":
        if (result.object_name) {
          this.findObjectFromMemory(`where is my ${result.object_name}`);
        } else {
          this.speak("Which object would you like me to look up?", true);
        }
        break;

      case "save_place":
        if (result.place_name) {
          this.saveCurrentPlace(result.place_name);
        } else {
          this.speak("What would you like to call this place?", true);
        }
        break;

      case "find_place":
        if (result.place_name) {
          this.findSavedPlace(result.place_name).then((place) => {
            if (place) {
              this.announceSavedPlace(place);
            } else {
              this.speak(
                `I don't have a saved place called ${result.place_name}.`,
                true,
              );
            }
          });
        } else {
          this.speak("Which place would you like to find?", true);
        }
        break;

      default:
        console.log("Unknown action:", result.action);
        // If Gemini still returned a spoken response for this command, say
        // it rather than silently discarding it.
        if (result.response) {
          this.speak(result.response, true);
        } else {
          this.speak(
            "I understood your command but could not perform the action.",
            true,
          );
        }
    }
  }

  /**
   * Fallback voice recognition test using main app system
   */
  testVoiceRecognitionFallback() {
    console.log("Testing voice recognition via main app fallback");

    this.speak(
      "Voice recognition test starting. Please say something after the prompt.",
      true,
    );

    setTimeout(() => {
      if (!this.commandRecognition) {
        this.speak("Voice recognition is not available on this device.", true);
        return;
      }

      try {
        this.commandRecognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          console.log("Voice test result:", transcript);
          this.speak(
            `Voice recognition working perfectly. I heard: ${transcript}`,
            true,
          );

          // Restore normal command processing
          this.initSpeechRecognition();
        };

        this.commandRecognition.start();
        this.speak("Now listening for your test voice command.", true);
      } catch (error) {
        console.error("Voice test failed:", error);
        this.speak(
          "Voice recognition test failed. Please check your microphone permissions.",
          true,
        );
      }
    }, 2000);
  }

  /**
   * Navigate to any worldwide destination using Google APIs
   */
  async navigateToLocation(destination) {
    console.log("navigateToLocation called with:", destination);

    if (!this.userLocation) {
      this.speak(
        "Location access is required for navigation. Please enable location first.",
        true,
      );
      await this.requestLocation();
      if (!this.userLocation) {
        return;
      }
    }

    try {
      this.updateStatus(`Getting directions to ${destination}...`, "primary");
      this.speak(`Getting directions to ${destination}`, true);

      console.log("User location:", this.userLocation);
      console.log("Destination:", destination);

      // Use the enhanced navigation system that handles geocoding + directions
      if (
        window.blindMateNavigation &&
        typeof window.blindMateNavigation.startNavigation === "function"
      ) {
        console.log("Using enhanced navigation system");
        window.blindMateNavigation.currentDestination = destination;
        await window.blindMateNavigation.startNavigation(destination);
      } else {
        console.log("Enhanced navigation not available, using fallback");
        // Fallback to direct API call
        const response = await fetch("/api/directions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: `${this.userLocation.latitude},${this.userLocation.longitude}`,
            destination: destination,
          }),
        });

        const data = await response.json();

        if (data.success) {
          this.currentRoute = data;
          this.currentStepIndex = 0;
          this.isNavigating = true;
          this.currentDestination = destination;

          // Update navigation status
          if (this.elements.navigationStatus) {
            this.elements.navigationStatus.textContent = "Navigating";
            this.elements.navigationStatus.className = "badge bg-success";
          }

          // Speak route overview
          await this.speakRouteOverview(data, destination);

          // Start position tracking for rerouting
          this.startLocationTracking();

          this.updateStatus(`Navigating to ${destination}`, "success");
        } else {
          this.speak(
            data.message ||
              `Could not get directions to ${destination}. Please try again.`,
            true,
          );
        }
      }
    } catch (error) {
      console.error("Navigation error:", error);
      this.speak(
        `Sorry, I couldn't get directions to ${destination}. Please try again.`,
        true,
      );
    }
  }

  /**
   * Preview route to any destination without starting navigation
   */
  async previewRoute(destination) {
    console.log("previewRoute called with:", destination);

    if (!this.userLocation) {
      this.speak(
        "Location access is required for route preview. Please enable location first.",
        true,
      );
      await this.requestLocation();
      if (!this.userLocation) {
        return;
      }
    }

    try {
      this.updateStatus(`Previewing route to ${destination}...`, "primary");

      // Use the enhanced navigation system for route preview
      const response = await fetch("/api/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: `${this.userLocation.latitude},${this.userLocation.longitude}`,
          destination: destination,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await this.speakRoutePreview(data, destination);
        this.updateStatus(
          `Route preview completed for ${destination}`,
          "success",
        );
      } else {
        this.speak(
          data.message ||
            `Could not get route preview to ${destination}. Please try again.`,
          true,
        );
      }
    } catch (error) {
      console.error("Route preview error:", error);
      this.speak(`Sorry, I couldn't preview the route to ${destination}`, true);
    }
  }

  /**
   * Get directions from Google Maps API given raw lat/lng values
   */
  async getDirectionsByCoords(originLat, originLng, destLat, destLng) {
    try {
      // Use backend proxy to avoid exposing API key
      const response = await fetch("/api/directions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: `${originLat},${originLng}`,
          destination: `${destLat},${destLng}`,
          mode: "walking",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === "OK" && data.routes && data.routes.length > 0) {
        return data.routes[0];
      } else {
        throw new Error("No routes found");
      }
    } catch (error) {
      console.error("Directions API error:", error);
      // Fallback: calculate straight-line distance and basic directions
      return this.getFallbackDirections(originLat, originLng, destLat, destLng);
    }
  }

  /**
   * Get directions to a named destination from a {lat,lng} origin (used for rerouting)
   */
  async getDirectionsToDestination(originPos, destination) {
    const response = await fetch("/api/directions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: `${originPos.lat},${originPos.lng}`,
        destination: destination,
      }),
    });

    return response.json();
  }

  /**
   * Fallback directions when API is unavailable
   */
  getFallbackDirections(originLat, originLng, destLat, destLng) {
    const distance = this.calculateDistance(
      originLat,
      originLng,
      destLat,
      destLng,
    );
    const bearing = this.calculateBearing(
      originLat,
      originLng,
      destLat,
      destLng,
    );
    const direction = this.getDirectionFromBearing(bearing);

    return {
      legs: [
        {
          distance: { text: `${Math.round(distance)} meters`, value: distance },
          duration: {
            text: `${Math.round(distance / 1.4)} minutes`,
            value: Math.round(distance / 1.4) * 60,
          },
          steps: [
            {
              distance: {
                text: `${Math.round(distance)} meters`,
                value: distance,
              },
              duration: {
                text: `${Math.round(distance / 1.4)} minutes`,
                value: Math.round(distance / 1.4) * 60,
              },
              html_instructions: `Walk ${direction} for ${Math.round(distance)} meters`,
              start_location: { lat: originLat, lng: originLng },
              end_location: { lat: destLat, lng: destLng },
            },
          ],
        },
      ],
    };
  }

  async translateMessage(text) {
    if (!text) {
      return "";
    }

    if (this.currentLanguage === "en-IN") {
      return text;
    }

    try {
      const response = await fetch("/api/translate", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          text: text,

          language: this.currentLanguage,
        }),
      });

      const result = await response.json();

      if (result.success) {
        return result.translated;
      }
    } catch (error) {
      console.error(error);
    }

    return text;
  }
  /**
   * Speak route overview when starting navigation
   */
  async speakRouteOverview(route, destinationName) {
    const routeData = route.route || route;
    const totalDistance = routeData.distance;
    const totalTime = routeData.duration;

    this.speak(
      `Navigation started to ${destinationName}. You are ${totalDistance} away. Estimated walking time: ${totalTime}`,
      true,
    );

    // Speak first 2-3 steps
    const steps = routeData.steps ? routeData.steps.slice(0, 2) : [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const instruction =
        step.instruction ||
        this.cleanHtmlInstructions(step.html_instructions || step.instruction);

      setTimeout(
        () => {
          this.speak(`Step ${i + 1}: ${instruction}`, true);
        },
        (i + 1) * 3000,
      );
    }
  }

  /**
   * Speak route preview (first few steps only)
   */
  async speakRoutePreview(route, destinationName) {
    const leg = route.legs[0];
    const totalDistance = leg.distance.text;
    const totalTime = leg.duration.text;

    this.speak(
      `Route preview to ${destinationName}: ${totalDistance}, about ${totalTime} walking`,
      true,
    );

    setTimeout(() => {
      if (leg.steps.length > 0) {
        const firstStep = this.cleanHtmlInstructions(
          leg.steps[0].html_instructions,
        );
        this.speak(`First step: ${firstStep}`, true);
      }
    }, 2000);

    if (leg.steps.length > 1) {
      setTimeout(() => {
        const secondStep = this.cleanHtmlInstructions(
          leg.steps[1].html_instructions,
        );
        this.speak(`Then: ${secondStep}`, true);
      }, 4000);
    }
  }

  /**
   * Clean HTML instructions from Google Maps API
   */
  cleanHtmlInstructions(htmlInstructions) {
    return htmlInstructions
      .replace(/<[^>]*>/g, "") // Remove HTML tags
      .replace(/&nbsp;/g, " ") // Replace non-breaking spaces
      .replace(/&amp;/g, "&") // Replace HTML entities
      .trim();
  }

  /**
   * Start location tracking for rerouting
   */
  startLocationTracking() {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported for tracking");
      return;
    }

    // Watch position every 5 seconds
    this.locationWatcher = navigator.geolocation.watchPosition(
      (position) => {
        this.checkRouteDeviation(
          position.coords.latitude,
          position.coords.longitude,
        );
      },
      (error) => {
        console.error("Location tracking error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      },
    );
  }

  /**
   * Check if user has deviated from the route
   */
  checkRouteDeviation(currentLat, currentLng) {
    if (!this.isNavigating || !this.currentRoute) return;

    const currentStep = this.currentRoute.legs[0].steps[this.currentStepIndex];
    if (!currentStep) return;

    // Calculate distance to expected route point
    const expectedLat = currentStep.start_location.lat;
    const expectedLng = currentStep.start_location.lng;
    const deviation = this.calculateDistance(
      currentLat,
      currentLng,
      expectedLat,
      expectedLng,
    );

    // If user is too far off track, reroute
    if (deviation > this.routeDeviationThreshold) {
      this.speak("You have moved off the path. Recalculating route...", true);
      this.reroute(currentLat, currentLng);
    }
  }

  /**
   * Reroute from current position
   */
  async reroute(currentLat, currentLng) {
    if (!this.isNavigating) return;

    // Find the destination from current route
    const originalDestination = this.currentRoute.legs[0].end_location;

    try {
      const newRoute = await this.getDirectionsByCoords(
        currentLat,
        currentLng,
        originalDestination.lat,
        originalDestination.lng,
      );

      if (newRoute) {
        this.currentRoute = newRoute;
        this.currentStepIndex = 0;

        const leg = newRoute.legs[0];
        this.speak(
          `New route calculated. ${leg.distance.text} remaining.`,
          true,
        );

        // Speak next instruction
        if (leg.steps.length > 0) {
          setTimeout(() => {
            const instruction = this.cleanHtmlInstructions(
              leg.steps[0].html_instructions,
            );
            this.speak(instruction, true);
          }, 2000);
        }
      }
    } catch (error) {
      console.error("Rerouting error:", error);
      this.speak(
        "Could not recalculate route. Please use your navigation app.",
        true,
      );
    }
  }

  /**
   * Stop navigation and location tracking
   */
  stopNavigation() {
    this.isNavigating = false;
    this.currentRoute = null;
    this.currentStepIndex = 0;

    if (this.locationWatcher) {
      navigator.geolocation.clearWatch(this.locationWatcher);
      this.locationWatcher = null;
    }

    this.speak("Navigation stopped", true);
    this.updateStatus("Navigation stopped", "info");

    // Update navigation status
    if (this.elements.navigationStatus) {
      this.elements.navigationStatus.textContent = "Ready";
      this.elements.navigationStatus.className = "badge bg-secondary";
    }
  }

  /**
   * Calculate distance between two points in meters (Haversine formula)
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Calculate bearing between two points
   */
  calculateBearing(lat1, lng1, lat2, lng2) {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    const θ = Math.atan2(y, x);
    return ((θ * 180) / Math.PI + 360) % 360;
  }

  /**
   * Get direction name from bearing
   */
  getDirectionFromBearing(bearing) {
    const directions = [
      "north",
      "northeast",
      "east",
      "southeast",
      "south",
      "southwest",
      "west",
      "northwest",
    ];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  /**
   * Provide basic navigation assistance
   */
  provideNavigationGuidance(destination) {
    const guidance = [
      `I'm helping you navigate to ${destination}.`,
      "Since I opened navigation in your maps app, please follow the turn-by-turn directions there.",
      "You can still use voice commands with me:",
      "Say 'start detection' to scan for obstacles while walking.",
      "Say 'stop' to pause any features.",
      "Stay safe and be aware of your surroundings.",
    ];

    guidance.forEach((message, index) => {
      setTimeout(() => this.speak(message), index * 3000);
    });
  }

  /**
   * Request user location.
   * @param {boolean} silent - if true, don't speak the "granted" confirmation
   *   (used for the automatic background request on load, so returning
   *   users don't hear it every single time). Denial is always announced,
   *   since that's important feedback either way.
   */
  async requestLocation(silent = false) {
    try {
      this.updateStatus("Requesting location access...", "warning");

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      this.userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      this.updateStatus("Location access granted.", "success");
      if (this.elements.locationBtn) {
        this.elements.locationBtn.className = "btn btn-success btn-lg";
        this.elements.locationBtn.innerHTML =
          '<i class="fas fa-check" aria-hidden="true"></i> Location Enabled';
      }

      if (!silent) {
        this.speak(
          "Location access granted. I can now provide navigation assistance.",
        );
      }
    } catch (error) {
      console.error("Location error:", error);
      this.updateStatus("Location access denied.", "danger");
      this.speak(
        "Location access is required for navigation features. Please enable location in your browser settings.",
      );
    }
  }

  /**
   * Change application language
   */
  changeLanguage(langCode) {
    console.log("Changing language to:", langCode);

    this.currentLanguage = langCode;
    if (this.elements.languageSelect) {
      this.elements.languageSelect.value = langCode;
    }

    // Update recognition language
    if (this.commandRecognition) {
      this.commandRecognition.lang = langCode;
    }
    if (this.continuousRecognition) {
      this.continuousRecognition.lang = langCode;
    }

    // Update on-screen button/label text, not just speech
    this.applyUITranslations(langCode);

    // Persist locally and update on server
    localStorage.setItem("blindmate_language", langCode);
    this.updateServerPreferences();

    this.speak(`Language changed to ${this.getLanguageName(langCode)}`);
  }

  /**
   * Change voice tone
   */
  changeTone(tone) {
    console.log("Changing tone to:", tone);

    this.currentTone = tone;
    if (this.elements.toneSelect) {
      this.elements.toneSelect.value = tone;
    }

    // Update tone preference on server
    this.updateServerPreferences();

    // Speak confirmation with new tone
    this.speak(`Voice tone changed to ${tone}`, true);
  }

  /**
   * Update preferences on server
   */
  async updateServerPreferences() {
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: this.currentLanguage,
          tone: this.currentTone,
        }),
      });
    } catch (error) {
      console.error("Error updating preferences:", error);
    }
  }

  /**
   * Load preferences from server
   */
  async loadServerPreferences() {
    try {
      const response = await fetch("/api/preferences");
      const preferences = await response.json();

      if (preferences.language) {
        this.currentLanguage = preferences.language;
        if (this.elements.languageSelect) {
          this.elements.languageSelect.value = preferences.language;
        }
        this.applyUITranslations(preferences.language);
      }

      if (preferences.tone) {
        this.currentTone = preferences.tone;
        if (this.elements.toneSelect) {
          this.elements.toneSelect.value = preferences.tone;
        }
      }
    } catch (error) {
      console.error("Error loading preferences:", error);
    }
  }

  /**
   * Get display name for language code
   */
  getLanguageName(langCode) {
    const languageNames = {
      "en-IN": "English",
      "hi-IN": "Hindi",
      "kn-IN": "Kannada",
      "ta-IN": "Tamil",
      "te-IN": "Telugu",
      "bn-IN": "Bengali",
      "mr-IN": "Marathi",
      "gu-IN": "Gujarati",
      "es-ES": "Spanish",
      "fr-FR": "French",
      "de-DE": "German",
      "it-IT": "Italian",
      "pt-PT": "Portuguese",
      "ja-JP": "Japanese",
      "zh-CN": "Chinese",
      "ar-SA": "Arabic",
    };
    return languageNames[langCode] || langCode;
  }

  /**
   * Get tone-specific voice settings
   */
  getToneSettings(tone) {
    const toneSettings = {
      friendly: { rate: 0.9, pitch: 1.1, volume: 0.8 },
      formal: { rate: 0.7, pitch: 0.9, volume: 0.8 },
      energetic: { rate: 1.1, pitch: 1.2, volume: 0.9 },
      calm: { rate: 0.6, pitch: 0.8, volume: 0.7 },
      robotic: { rate: 0.8, pitch: 0.7, volume: 0.8 },
    };
    return toneSettings[tone] || toneSettings["friendly"];
  }

  /**
   * Find appropriate voice for tone
   */
  findVoiceForTone(voices, language, tone) {
    // Try to find voices that match tone characteristics
    const langVoices = voices.filter(
      (v) => v.lang === language || v.lang.startsWith(language.split("-")[0]),
    );

    if (langVoices.length === 0) return null;

    // Different tone preferences for voice selection
    switch (tone) {
      case "formal":
        return (
          langVoices.find(
            (v) =>
              v.name.toLowerCase().includes("professional") ||
              v.name.toLowerCase().includes("formal"),
          ) || langVoices[0]
        );
      case "energetic":
        return (
          langVoices.find(
            (v) =>
              v.name.toLowerCase().includes("young") ||
              v.name.toLowerCase().includes("bright"),
          ) || langVoices[0]
        );
      case "calm":
        return (
          langVoices.find(
            (v) =>
              v.name.toLowerCase().includes("calm") ||
              v.name.toLowerCase().includes("soft"),
          ) || langVoices[0]
        );
      case "robotic":
        return (
          langVoices.find(
            (v) =>
              v.name.toLowerCase().includes("robotic") ||
              v.name.toLowerCase().includes("computer"),
          ) || langVoices[0]
        );
      default:
        return langVoices[0];
    }
  }

  /**
   * Text-to-speech function with queue management and cooldown
   */
  async speak(text, priority = false, isObjectAnnouncement = false) {
    console.log("Current Language:", this.currentLanguage);
    console.log("Original Text:", text);
    if (!this.synth || !text) {
      return;
    }

    /* ==========================================
       Translate Text
    ========================================== */

    if (this.currentLanguage !== "en-IN") {
      if (this.hasVoiceForLanguage(this.currentLanguage)) {
        text = await this.translateMessage(text);
      } else {
        // No voice installed for this language on this device/browser -
        // speaking translated text through the wrong voice would come out
        // as garbled nonsense, so fall back to clear English instead of
        // failing silently or mispronouncing.
        console.warn(
          `No ${this.currentLanguage} voice found on this device - speaking in English instead.`,
        );
        if (!this._warnedMissingVoiceFor) this._warnedMissingVoiceFor = {};
        if (!this._warnedMissingVoiceFor[this.currentLanguage]) {
          this._warnedMissingVoiceFor[this.currentLanguage] = true;
          this.updateStatus(
            `${this.getLanguageName(this.currentLanguage)} voice not found on this device - using English voice instead.`,
            "warning",
          );
          // Prepend the notice to THIS SAME utterance (rather than firing
          // a separate speak call) so it's actually heard, instead of
          // being immediately cut off by the main text that follows it.
          text = `${this.getLanguageName(this.currentLanguage)} voice is not installed on this device, continuing in English. ${text}`;
        }
      }
    }
    console.log("Final Text:", text);

    // Log to interaction history - skip continuous object-detection
    // announcements ("person ahead of you", etc), since those would
    // flood the history with noise rather than meaningful interactions.
    if (!isObjectAnnouncement) {
      this.logInteraction(this.lastCommandText, text);
      this.lastCommandText = null;
    }

    /* ==========================================
       Navigation Speech
    ========================================== */

    if (window.blindMateNavigation && window.blindMateNavigation.speak) {
      console.log("Delegating speech:", text);

      const navPriority = priority
        ? "high"
        : isObjectAnnouncement
          ? "normal"
          : "normal";

      window.blindMateNavigation.speak(
        text,

        navPriority,
      );

      return;
    }

    const now = Date.now();

    /* ==========================================
       Smart Object Announcement
    ========================================== */

    if (isObjectAnnouncement && !priority) {
      this._handleObjectAnnouncement(
        text,

        now,
      );

      return;
    }

    /* ==========================================
       Speak Immediately
    ========================================== */

    if (
      priority ||
      (now - this.lastSpeechTime > this.speechCooldown && !this.isSpeaking)
    ) {
      this._speakNow(text);
    } else if (!priority) {
      this.speechQueue.push(text);

      if (!this.isSpeaking) {
        this._processNextSpeech();
      }
    }
  }

  /**
   * Handle object announcements with special delay logic
   */
  _handleObjectAnnouncement(text, now) {
    // Cancel any pending announcement
    if (this.speechDelayTimer) {
      clearTimeout(this.speechDelayTimer);
      this.speechDelayTimer = null;
    }

    // Store the pending announcement
    this.pendingAnnouncement = text;

    // Calculate delay needed
    const timeSinceLastSpeech = now - this.lastSpeechTime;
    const minimumDelay = this.minObjectAnnouncementDelay;

    if (this.isSpeaking || timeSinceLastSpeech < minimumDelay) {
      // Need to delay announcement
      const delayNeeded = this.isSpeaking
        ? minimumDelay // Wait full delay if currently speaking
        : minimumDelay - timeSinceLastSpeech; // Wait remaining time

      this.isAnnouncementDelayed = true;

      console.log(
        `Object announcement delayed by ${delayNeeded}ms for clarity`,
      );

      this.speechDelayTimer = setTimeout(() => {
        if (this.pendingAnnouncement) {
          this._speakNow(this.pendingAnnouncement);
          this.pendingAnnouncement = null;
          this.isAnnouncementDelayed = false;
        }
      }, delayNeeded);
    } else {
      // Can announce immediately
      this._speakNow(text);
      this.pendingAnnouncement = null;
    }
  }

  /**
   * Internal function to speak immediately
   */
  _speakNow(text) {
    try {
      // Cancel any ongoing speech immediately to prevent overlaps
      this.synth.cancel();

      // Clear any pending object announcements to avoid queue buildup
      if (this.speechDelayTimer) {
        clearTimeout(this.speechDelayTimer);
        this.speechDelayTimer = null;
      }
      this.pendingAnnouncement = null;

      // Small delay to ensure cancellation is processed
      setTimeout(() => {
        this.isSpeaking = true;
        this.lastSpeechTime = Date.now();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.currentLanguage;
        utterance.rate = 1;
        utterance.pitch = 1;

        // Apply tone-specific voice settings
        const toneSettings = this.getToneSettings(this.currentTone);
        utterance.rate = toneSettings.rate;
        utterance.pitch = toneSettings.pitch;
        utterance.volume = toneSettings.volume;

        // Find appropriate voice based on language and tone
        const voices = this.synth.getVoices();
        if (voices.length > 0) {
          let voice = this.findVoiceForTone(
            voices,
            this.currentLanguage,
            this.currentTone,
          );

          if (!voice) {
            voice =
              voices.find((v) => v.lang === this.currentLanguage) ||
              voices.find((v) =>
                v.lang.startsWith(this.currentLanguage.split("-")[0]),
              ) ||
              voices.find((v) => v.default);
          }

          if (voice) {
            utterance.voice = voice;
          }
        }

        utterance.onstart = () => {
          console.log("Speech started successfully");
        };

        utterance.onend = () => {
          console.log("Speech ended normally");
          this.isSpeaking = false;
          // Longer delay before next speech for better clarity
          setTimeout(() => this._processNextSpeech(), 750);
        };

        utterance.onerror = (event) => {
          console.warn("Speech error:", event);
          this.isSpeaking = false;
          setTimeout(() => this._processNextSpeech(), 750);
        };

        this.synth.speak(utterance);
      }, 50); // Small delay to ensure proper cancellation
    } catch (error) {
      this.isSpeaking = false;
      console.warn("Speech synthesis error:", error);
    }
  }

  /**
   * Process next item in speech queue
   */
  _processNextSpeech() {
    if (this.speechQueue.length > 0 && !this.isSpeaking) {
      const text = this.speechQueue.shift();
      this._speakNow(text);
    }
  }

  /**
   * Check whether the onboarding setup has already been completed.
   * The onboarding flow stores this flag under "AIVisualAssistantSetup"
   * in localStorage once the user finishes setup.
   */
  hasCompletedSetup() {
    try {
      const setup = JSON.parse(
        localStorage.getItem("AIVisualAssistantSetup"),
      );
      return !!(setup && setup.setupComplete === true);
    } catch (error) {
      console.warn("Could not read setup status:", error);
      return false;
    }
  }

  /**
   * Check if this is a first-time user and offer tutorial
   */
  checkFirstTimeUser() {
    const hasCompletedTutorial = localStorage.getItem(
      "blindmate_tutorial_completed",
    );
    const hasUsedApp = localStorage.getItem("blindmate_first_use");

    if (!hasCompletedTutorial && !hasUsedApp) {
      // Mark that the user has seen the app
      localStorage.setItem("blindmate_first_use", "true");

      // Wait a moment for the interface to load, then offer tutorial
      setTimeout(() => {
        this.speak(
          'Welcome to Netra! This is your first time using the app. Would you like to start with a guided tutorial to learn all the features? You can also access the tutorial anytime by saying "start tutorial" or clicking the tutorial button.',
        );

        // Show tutorial button prominently
        const tutorialButton = document.getElementById("tutorialButton");
        if (tutorialButton) {
          tutorialButton.classList.add("btn-warning");
          tutorialButton.innerHTML =
            '<i class="fas fa-graduation-cap"></i> Recommended: Start Tutorial';
        }
      }, 2000);
    }
  }

  /**
   * Update system status display
   */
  updateStatus(message, type = "info") {
    if (this.elements && this.elements.systemStatus) {
      this.elements.systemStatus.textContent = message;
      this.elements.systemStatus.className = `alert alert-${type}`;

      // Auto-clear success and warning messages
      if (type === "success" || type === "warning") {
        setTimeout(() => {
          if (
            this.elements.systemStatus &&
            this.elements.systemStatus.textContent === message
          ) {
            this.updateStatus("System ready", "info");
          }
        }, 5000);
      }
    } else {
      console.log("Status update:", message, type);
    }
  }
}

// Initialize the application when the page loads
document.addEventListener("DOMContentLoaded", () => {
  window.blindMate = new Netra();
});

// Handle page visibility changes to pause/resume detection
document.addEventListener("visibilitychange", () => {
  if (window.blindMate) {
    if (document.hidden && window.blindMate.isDetecting) {
      // Pause detection when page is hidden
      window.blindMate.isDetecting = false;
    } else if (!document.hidden && window.blindMate.stream) {
      // Resume detection when page becomes visible
      window.blindMate.isDetecting = true;
      window.blindMate.detectObjects();
    }
  }
});

const settingsBtn =
  document.getElementById("settingsTab") ||
  document.getElementById("settingsBtn");

if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    window.location.href = "/settings";
  });
}

const historyBtn = document.getElementById("historyTab");
if (historyBtn) {
  historyBtn.addEventListener("click", () => {
    if (window.blindMate) {
      window.blindMate.showHistory();
    }
  });
}

// Register Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")   // Change to "/service-worker.js" if that's your filename
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.error("Service Worker registration failed:", err));
  });
}