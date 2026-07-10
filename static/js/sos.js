/* ==========================================
   AIVisualAssistant SOS System

   Sends a real emergency alert (email, and SMS if Twilio is configured on
   the server) to the user's saved emergency contacts with their live
   location. If the server has no alert channel configured, falls back to
   opening the phone's native SMS app pre-filled with the message, since a
   website cannot silently send a text message on its own for security
   reasons - the user just needs to tap Send once.
========================================== */

class EmergencySOS {
  constructor() {
    // NOTE: contacts are saved server-side via /api/settings (see
    // settings.js) - they were never actually written to the
    // "AIVisualAssistantSettings" localStorage key, so reading from
    // localStorage here always returned an empty object. Settings are
    // fetched fresh from the server each time instead.
    this.settings = {};

    this.initialize();
    this.setupShakeToTrigger();
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const response = await fetch("/api/settings");
      this.settings = (await response.json()) || {};
    } catch (error) {
      console.error("Could not load settings for SOS:", error);
    }
  }

  initialize() {
    const btn1 = document.getElementById("emergencyBtn");
    const btn2 = document.getElementById("floatingSOS");

    if (btn1) {
      btn1.addEventListener("click", () => {
        this.triggerSOS();
      });
    }

    if (btn2) {
      btn2.addEventListener("click", () => {
        this.triggerSOS();
      });
    }
  }

  getContacts() {
    return [
      {
        name: this.settings.contact1Name,
        phone: this.settings.contact1Phone,
        email: this.settings.contact1Email,
      },
      {
        name: this.settings.contact2Name,
        phone: this.settings.contact2Phone,
        email: this.settings.contact2Email,
      },
      {
        name: this.settings.contact3Name,
        phone: this.settings.contact3Phone,
        email: this.settings.contact3Email,
      },
    ].filter((c) => c.phone || c.email);
  }

  async triggerSOS() {
    this.speak("Emergency mode activated. Getting your location.");

    // Always fetch fresh settings right now, rather than relying on
    // whatever was loaded at page load - the user may have just added a
    // contact, and this is safety-critical enough to not risk stale data.
    await this.loadSettings();

    const contacts = this.getContacts();
    if (contacts.length === 0) {
      this.speak(
        "No emergency contacts are saved yet. Please add one in settings first.",
      );
      return;
    }

    if (!navigator.geolocation) {
      this.speak(
        "Location is not supported on this device. Sending the alert without it.",
      );
      await this.sendAlert(null, null, contacts);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await this.sendAlert(
          position.coords.latitude,
          position.coords.longitude,
          contacts,
        );
      },
      async () => {
        this.speak(
          "Could not get your location, but I'm still sending the alert.",
        );
        await this.sendAlert(null, null, contacts);
      },
    );
  }

  async sendAlert(latitude, longitude, contacts) {
    try {
      const response = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude,
          longitude,
          contacts,
          user_name: this.settings.name || "",
          user_phone: this.settings.userPhone || "",
        }),
      });

      const result = await response.json();

      if (result.success) {
        this.speak(
          "Emergency alert has been sent to your contacts. Help is on the way.",
        );
      } else {
        // Server has no email/SMS channel configured - be honest about
        // that, and open the native SMS app as a fallback so at least one
        // message is ready to send with a single tap.
        console.warn("Emergency alert not auto-sent:", result.message);
        this.speak(
          "I could not send the alert automatically. Opening a text message for you now - please tap send.",
        );
        this.openFallbackSms(contacts, result.raw_message, latitude, longitude);
      }
    } catch (error) {
      console.error(error);
      this.speak(
        "I could not reach the server to send the alert. Opening a text message for you now - please tap send.",
      );
      this.openFallbackSms(contacts, null, latitude, longitude);
    }
  }

  /**
   * Open the phone's native SMS app pre-filled with an emergency message
   * to the first contact with a phone number. A website cannot send an
   * SMS silently - this is a hard platform/security limitation on every
   * browser - so the user must tap Send once themselves.
   */
  openFallbackSms(contacts, message, latitude, longitude) {
    const contactWithPhone = contacts.find((c) => c.phone);
    if (!contactWithPhone) {
      this.speak(
        "None of your saved contacts have a phone number, so I could not prepare a text message.",
      );
      return;
    }

    const mapsLink =
      latitude != null && longitude != null
        ? `https://maps.google.com/?q=${latitude},${longitude}`
        : "location unavailable";

    const body =
      message ||
      `EMERGENCY: ${this.settings.name || "I"} need help and cannot call. ${
        this.settings.userPhone
          ? `Call back at ${this.settings.userPhone}. `
          : ""
      }My location: ${mapsLink}. Please call right away.`;

    const smsUrl = `sms:${contactWithPhone.phone}?body=${encodeURIComponent(body)}`;
    window.location.href = smsUrl;
  }

  /**
   * Shake-to-trigger: shaking the phone firmly starts the emergency flow.
   * This works without needing to find or tap anything on screen, which
   * matters in a real emergency, and unlike hardware volume/power buttons,
   * motion sensors ARE accessible to web pages (with permission on iOS).
   */
  setupShakeToTrigger() {
    const SHAKE_THRESHOLD = 18; // acceleration in m/s^2 above gravity noise
    const SHAKE_COOLDOWN_MS = 5000;
    let lastShakeTime = 0;
    let lastX = null;
    let lastY = null;
    let lastZ = null;

    const handleMotion = (event) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;

      const { x, y, z } = acceleration;
      if (lastX === null) {
        lastX = x;
        lastY = y;
        lastZ = z;
        return;
      }

      const delta =
        Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
      lastX = x;
      lastY = y;
      lastZ = z;

      const now = Date.now();
      if (delta > SHAKE_THRESHOLD && now - lastShakeTime > SHAKE_COOLDOWN_MS) {
        lastShakeTime = now;
        console.log("Shake detected - triggering emergency SOS");
        this.triggerSOS();
      }
    };

    const enableShakeListener = () => {
      window.addEventListener("devicemotion", handleMotion);
      console.log("Shake-to-trigger SOS enabled");
    };

    // iOS 13+ requires an explicit user-gesture permission request before
    // motion sensors can be read. On Android and desktop this permission
    // API doesn't exist, so we just enable the listener directly.
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      // Request on first touch anywhere, since it must follow a user
      // gesture - can't be requested silently on page load on iOS.
      const requestOnce = () => {
        DeviceMotionEvent.requestPermission()
          .then((state) => {
            if (state === "granted") enableShakeListener();
          })
          .catch((err) => console.warn("Motion permission denied:", err));
        document.removeEventListener("touchend", requestOnce);
      };
      document.addEventListener("touchend", requestOnce, { once: true });
    } else {
      enableShakeListener();
    }
  }

  speak(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.emergencySOS = new EmergencySOS();
});