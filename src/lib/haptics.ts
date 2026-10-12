// A short tap of vibration on key buttons (set done, finish, log, start).
//
// Android: navigator.vibrate. iPhone: Safari has no vibrate(), but since
// iOS 18 toggling a checkbox with the `switch` attribute plays the system
// haptic, and clicking a <label> around one toggles it. That's an
// unofficial trick, so everything here fails silently. It only works when
// called synchronously inside a tap handler, and never with the iPhone's
// "System Haptics" setting turned off.

const KEY = "streakly-haptics";

/** On unless turned off in Settings (saved per device). */
export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}

export function haptic() {
  if (typeof window === "undefined" || !hapticsEnabled()) return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
      return;
    }
    const label = document.createElement("label");
    label.ariaHidden = "true";
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {}
}
