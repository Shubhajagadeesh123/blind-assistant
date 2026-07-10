/* ==========================================
   AIVisualAssistant - Settings
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  document
    .getElementById("saveSettings")
    ?.addEventListener("click", saveSettings);

  document
    .getElementById("resetSettings")
    ?.addEventListener("click", resetSettings);

  document.getElementById("logoutApp")?.addEventListener("click", logoutApp);

  document.getElementById("darkMode")?.addEventListener("change", applyTheme);

  document
    .getElementById("largeText")
    ?.addEventListener("change", applyAccessibility);

  document
    .getElementById("highContrast")
    ?.addEventListener("change", applyAccessibility);
});

/* ==========================================
   Default Settings
========================================== */

const defaultSettings = {
  name: "",

  userPhone: "",

  homeAddress: "",

  language: "en",

  voiceSpeed: 1,

  wakeWord: "Hey BlindMate",

  contact1Name: "",

  contact1Phone: "",
  contact1Email: "",

  contact2Name: "",

  contact2Phone: "",
  contact2Email: "",

  contact3Name: "",

  contact3Phone: "",
  contact3Email: "",

  voiceFeedback: true,

  vibrationFeedback: true,

  highContrast: false,

  largeText: true,

  continuousListening: true,

  sceneDescription: true,

  objectDetection: true,

  memoryAssistant: true,

  darkMode: true,

  glassMode: true,

  animations: true,
};

/* ==========================================
   Save Settings
========================================== */

async function saveSettings() {
  const settings = {
    name: value("userName"),
    userPhone: value("userPhone"),
    homeAddress: value("homeAddress"),
    language: value("language"),
    voiceSpeed: value("voiceSpeed"),
    wakeWord: value("wakeWord"),

    contact1Name: value("contact1Name"),
    contact1Phone: value("contact1Phone"),
    contact1Email: value("contact1Email"),

    contact2Name: value("contact2Name"),
    contact2Phone: value("contact2Phone"),
    contact2Email: value("contact2Email"),

    contact3Name: value("contact3Name"),
    contact3Phone: value("contact3Phone"),
    contact3Email: value("contact3Email"),

    voiceFeedback: checked("voiceFeedback"),
    vibrationFeedback: checked("vibrationFeedback"),
    highContrast: checked("highContrast"),
    largeText: checked("largeText"),

    continuousListening: checked("continuousListening"),
    sceneDescription: checked("sceneDescription"),
    objectDetection: checked("objectDetection"),
    memoryAssistant: checked("memoryAssistant"),

    darkMode: checked("darkMode"),
    glassMode: checked("glassMode"),
    animations: checked("animations"),
  };

  try {
    const response = await fetch("/api/settings", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(settings),
    });

    const result = await response.json();

    if (result.success) {
      localStorage.setItem("blindmate_language", settings.language);
      alert("✅ Settings Saved Successfully");
    }
  } catch (error) {
    console.error(error);

    alert("Unable to save settings.");
  }
}
/* ==========================================
   Load Settings
========================================== */

async function loadSettings() {
  try {
    const response = await fetch("/api/settings");

    const settings = await response.json();

    if (!settings) return;

    setValue("userName", settings.name || "");
    setValue("userPhone", settings.userPhone || "");
    setValue("homeAddress", settings.homeAddress || "");

    setValue("language", settings.language || "en");
    setValue("voiceSpeed", settings.voiceSpeed || 1);

    setValue("wakeWord", settings.wakeWord || "Hey BlindMate");

    setValue("contact1Name", settings.contact1Name || "");
    setValue("contact1Phone", settings.contact1Phone || "");
    setValue("contact1Email", settings.contact1Email || "");

    setValue("contact2Name", settings.contact2Name || "");
    setValue("contact2Phone", settings.contact2Phone || "");
    setValue("contact2Email", settings.contact2Email || "");

    setValue("contact3Name", settings.contact3Name || "");
    setValue("contact3Phone", settings.contact3Phone || "");
    setValue("contact3Email", settings.contact3Email || "");

    setChecked("voiceFeedback", settings.voiceFeedback);
    setChecked("vibrationFeedback", settings.vibrationFeedback);

    setChecked("highContrast", settings.highContrast);
    setChecked("largeText", settings.largeText);

    setChecked("continuousListening", settings.continuousListening);
    setChecked("sceneDescription", settings.sceneDescription);
    setChecked("objectDetection", settings.objectDetection);
    setChecked("memoryAssistant", settings.memoryAssistant);

    setChecked("darkMode", settings.darkMode);
    setChecked("glassMode", settings.glassMode);
    setChecked("animations", settings.animations);
  } catch (error) {
    console.error(error);
  }
}

/* ==========================================
   Reset
========================================== */

function resetSettings() {
  if (confirm("Reset all settings?")) {
    localStorage.removeItem("AIVisualAssistantSettings");

    location.reload();
  }
}

/* ==========================================
   Logout
========================================== */

function logoutApp() {
  if (confirm("Exit AIVisualAssistant?")) {
    window.location.href = "/";
  }
}

/* ==========================================
   Theme
========================================== */

function applyTheme() {
  const dark = checked("darkMode");

  if (dark) {
    document.body.classList.remove("light");
  } else {
    document.body.classList.add("light");
  }
}

/* ==========================================
   Accessibility
========================================== */

function applyAccessibility() {
  if (checked("largeText")) {
    document.body.style.fontSize = "18px";
  } else {
    document.body.style.fontSize = "16px";
  }

  if (checked("highContrast")) {
    document.body.classList.add("high-contrast");
  } else {
    document.body.classList.remove("high-contrast");
  }
}

/* ==========================================
   Helpers
========================================== */

function value(id) {
  return document.getElementById(id)?.value;
}

function checked(id) {
  return document.getElementById(id)?.checked;
}

function setValue(id, val) {
  const e = document.getElementById(id);

  if (e) e.value = val;
}

function setChecked(id, val) {
  const e = document.getElementById(id);

  if (e) e.checked = val;
}

/* ==========================================
   Success Message
========================================== */

function showMessage(message) {
  let box = document.querySelector(".success-message");

  if (!box) {
    box = document.createElement("div");

    box.className = "success-message";

    document
      .querySelector(".settings-container")

      .prepend(box);
  }

  box.innerHTML = message;

  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 3000);
}