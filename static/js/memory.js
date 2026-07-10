/* ==========================================
   AIVisualAssistant Memory System V2

   Tracks two kinds of memory:
   - Objects: things the camera detects (phone, keys, cup, etc.), saved
     automatically during object detection with their on-screen position.
   - Places: named locations (bathroom, kitchen, front door) saved with
     GPS coordinates when the user asks to remember one.

   All lookups/announcements happen by voice - there is no typed prompt()
   or visual alert(), since neither is usable by a blind user.
========================================== */

class MemoryAssistant {
  constructor() {
    this.initialize();
  }

  initialize() {
    const memoryBtn = document.getElementById("memoryBtn");
    const memoryTab = document.getElementById("memoryTab");

    // These buttons exist for sighted/discoverability purposes, but they
    // trigger the same voice-based flow as saying "Hey BlindMate, where is
    // my phone" - not a typed prompt.
    if (memoryBtn) {
      memoryBtn.addEventListener("click", () => {
        this.askMemoryByVoice();
      });
    }

    if (memoryTab) {
      memoryTab.addEventListener("click", () => {
        this.askMemoryByVoice();
      });
    }
  }

  /* ==========================================
       Save an Object Sighting
    ========================================== */
  async saveObject(objectName, position, distance, scene) {
    try {
      const memory = {
        object: objectName,
        location: `${position}, ${distance}`,
        position: position,
        distance: distance,
        scene: scene,
        time: new Date().toLocaleString(),
        timestamp: Date.now(),
        language: this.currentLanguage || "en-IN",
      };

      await fetch("/api/memory/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memory),
      });

      console.log("Memory Saved:", memory);
    } catch (error) {
      console.error("Memory Save Error:", error);
    }
  }

  /* ==========================================
       Voice-triggered "where is my X" flow, used by the Memory
       button/tab as an accessible alternative to just speaking the
       full command directly.
    ========================================== */
  askMemoryByVoice() {
    this.speak("Which object are you looking for?");

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.speak(
        "Voice recognition is not available on this browser. Please say the full command, for example: Hey BlindMate, where is my phone.",
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const object = event.results[0][0].transcript.trim();
      if (object) {
        this.lookupAndAnnounce(object);
      }
    };

    recognition.onerror = (event) => {
      console.error("Memory voice recognition error:", event.error);
      this.speak("Sorry, I did not catch that. Please try again.");
    };

    // Give the "Which object..." prompt a moment to finish before we
    // start listening.
    setTimeout(() => {
      try {
        recognition.start();
      } catch (e) {
        console.error("Could not start memory recognition:", e);
      }
    }, 1500);
  }

  /* ==========================================
       Look up an object's last-known location and speak it
    ========================================== */
  async lookupAndAnnounce(objectName) {
    const result = await this.getLastSeen(objectName);

    if (result) {
      const message = `Your ${result.object} was last seen ${result.position}, ${result.distance}, on ${result.time}.`;
      this.speak(message);
    } else {
      this.speak(`Sorry, I don't have any memory of a ${objectName}.`);
    }
  }

  /* ==========================================
       Get Last Seen Object
    ========================================== */
  async getLastSeen(objectName) {
    try {
      const response = await fetch("/api/memory");
      const memories = await response.json();

      return (
        memories.find(
          (memory) => memory.object.toLowerCase() === objectName.toLowerCase(),
        ) || null
      );
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  /* ==========================================
       Speak
    ========================================== */
  speak(text) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
  }
}

window.memoryAssistant = new MemoryAssistant();