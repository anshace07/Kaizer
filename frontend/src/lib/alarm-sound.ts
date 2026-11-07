"use client";

// Short two-tone alert beep made with the Web Audio API (no audio file, no Gnani credits).
// Always plays (there is no mute for safety alerts). Never throws.
export function playAlarmSound() {
  try {
    const ctx = new AudioContext();
    const tones = [880, 660, 880];
    tones.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // audio not available — the banner is still shown
  }
}
