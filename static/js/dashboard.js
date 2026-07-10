// ==============================================
// AIVisualAssistant Dashboard
// ==============================================

let recognition;
let listening = false;

const voiceBtn = document.getElementById("voiceButton");
const assistantMessage = document.getElementById("assistantMessage");
const voiceStatus = document.getElementById("voiceStatus");

const detectCard = document.getElementById("detectObjects");
const navigationCard = document.getElementById("navigation");
const ocrCard = document.getElementById("ocr");
const aiCard = document.getElementById("askAI");
const memoryCard = document.getElementById("memory");
const sosCard = document.getElementById("sos");

const floatingSOS = document.getElementById("floatingSOS");

// ==============================================
// Welcome
// ==============================================

window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("loadingScreen").style.display = "none";

    speak("Welcome back. I am ready to help you.");
  }, 2000);
});

// ==============================================
// Text To Speech
// ==============================================

function speak(text) {
  speechSynthesis.cancel();

  const msg = new SpeechSynthesisUtterance(text);

  msg.lang = "en-IN";

  speechSynthesis.speak(msg);

  assistantMessage.innerHTML = text;
}

// ==============================================
// Speech Recognition
// ==============================================

function startListening() {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Speech Recognition not supported");

    return;
  }

  recognition = new webkitSpeechRecognition();

  recognition.continuous = false;

  recognition.interimResults = false;

  recognition.lang = "en-IN";

  recognition.start();

  voiceStatus.innerHTML = "Listening...";

  recognition.onresult = function (event) {
    const speech = event.results[0][0].transcript.toLowerCase();

    voiceStatus.innerHTML = speech;

    processCommand(speech);
  };

  recognition.onend = function () {
    voiceStatus.innerHTML = "Tap microphone";

    listening = false;
  };
}

voiceBtn.addEventListener("click", () => {
  if (!listening) {
    listening = true;

    startListening();
  }
});

// ==============================================
// Process Commands
// ==============================================

function processCommand(command) {
  console.log(command);

  assistantMessage.innerHTML = "You said : " + command;
  // ==============================================
  // Voice Commands
  // ==============================================

  if (command.includes("start detection")) {
    assistantMessage.innerHTML = "Starting Object Detection";

    speak("Starting object detection");

    if (window.blindMate) {
      window.blindMate.startDetection();
    }

    return;
  }

  if (command.includes("stop detection")) {
    assistantMessage.innerHTML = "Stopping Object Detection";

    speak("Stopping object detection");

    if (window.blindMate) {
      window.blindMate.stopDetection();
    }

    return;
  }

  if (command.includes("navigate")) {
    assistantMessage.innerHTML = "Opening Navigation";

    speak("Where do you want to go?");

    if (window.navigation) {
      window.navigation.startVoiceNavigation();
    }

    return;
  }

  if (command.includes("read")) {
    assistantMessage.innerHTML = "Reading Text";

    speak("Reading nearby text");

    if (window.blindMate) {
      window.blindMate.readText();
    }

    return;
  }

  if (command.includes("emergency")) {
    assistantMessage.innerHTML = "Emergency Activated";

    speak("Emergency mode activated");

    activateSOS();

    return;
  }

  if (command.includes("settings")) {
    assistantMessage.innerHTML = "Opening Settings";

    window.location.href = "/settings";

    return;
  }

  if (command.includes("memory")) {
    assistantMessage.innerHTML = "Memory Assistant";

    speak("Ask me where you kept your belongings.");

    return;
  }

  if (command.includes("hello assistant")) {
    speak("Hello. How can I help you?");

    return;
  }

  askGemini(command);
}

// ==============================================
// Gemini Backend
// ==============================================

async function askGemini(command) {
  assistantMessage.innerHTML = "Thinking...";

  try {
    const response = await fetch("/api/process-command", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        command: command,

        language: "en-IN",

        tone: "friendly",
      }),
    });

    const data = await response.json();

    if (data.response) {
      assistantMessage.innerHTML = data.response;

      speak(data.response);
    } else {
      assistantMessage.innerHTML = "Done.";
    }
  } catch (err) {
    console.log(err);

    assistantMessage.innerHTML = "Unable to connect";
  }
}

// ==============================================
// Action Cards
// ==============================================

detectCard.onclick = () => {
  processCommand("start detection");
};

navigationCard.onclick = () => {
  processCommand("navigate");
};

ocrCard.onclick = () => {
  processCommand("read");
};

aiCard.onclick = () => {
  startListening();
};

memoryCard.onclick = () => {
  processCommand("memory");
};

sosCard.onclick = () => {
  activateSOS();
};

floatingSOS.onclick = () => {
  activateSOS();
};

// ==============================================
// SOS
// ==============================================

function activateSOS() {
  assistantMessage.innerHTML = "Emergency Activated";

  speak("Sending emergency alert.");

  const setup = JSON.parse(localStorage.getItem("AIVisualAssistantSetup"));

  if (setup) {
    console.log(setup);
  }

  // Later

  // Send SMS

  // Send Live Location

  // Make Call
}

// ==============================================
// Status
// ==============================================

window.addEventListener("online", () => {
  document.getElementById("internetStatus").innerHTML = "Connected";
});

window.addEventListener("offline", () => {
  document.getElementById("internetStatus").innerHTML = "Offline";
});

// ==============================================
// Camera
// ==============================================

navigator.mediaDevices
  .getUserMedia({
    video: true,
  })

  .then((stream) => {
    document.getElementById("webcam").srcObject = stream;

    document.getElementById("cameraStatus").innerHTML = "Ready";
  })

  .catch(() => {
    document.getElementById("cameraStatus").innerHTML = "Denied";
  });

// ==============================================
// GPS
// ==============================================

navigator.geolocation.getCurrentPosition(
  () => {
    document.getElementById("gpsStatus").innerHTML = "Ready";
  },

  () => {
    document.getElementById("gpsStatus").innerHTML = "Denied";
  },
);

// ==============================================
// Finished
// ==============================================

console.log("AIVisualAssistant Dashboard Loaded");
