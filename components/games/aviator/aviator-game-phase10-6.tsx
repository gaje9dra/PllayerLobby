"use client";

import { useEffect, useState } from "react";
import { AviatorGameOptimized } from "./aviator-game-optimized";

const SOUND_KEY = "playerlobby-aviator-sound";
const MOTION_KEY = "playerlobby-aviator-motion";

function readPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function playTone(kind: "start" | "cashout" | "crash" | "bet") {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const settings = {
      start: { frequency: 520, end: 720, duration: 0.12 },
      cashout: { frequency: 640, end: 980, duration: 0.16 },
      crash: { frequency: 180, end: 70, duration: 0.22 },
      bet: { frequency: 420, end: 560, duration: 0.08 },
    }[kind];
    oscillator.type = kind === "crash" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(settings.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(settings.end, now + settings.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + settings.duration + 0.02);
    window.setTimeout(() => void context.close().catch(() => undefined), 450);
  } catch {
    // Audio is optional; the game remains functional when unavailable.
  }
}

export function AviatorGamePhase106() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSoundEnabled(readPreference(SOUND_KEY, true));
    setMotionEnabled(readPreference(MOTION_KEY, true));
  }, []);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("aviator-phase106");
    main.classList.toggle("aviator-motion-off", !motionEnabled);

    const findMultiplier = () => {
      const candidates = Array.from(main.querySelectorAll("div"));
      return candidates.find((node) => {
        const text = node.textContent?.trim() ?? "";
        return /^\d+\.\d{2}x$/.test(text) && node.className.toString().includes("tabular-nums");
      }) as HTMLElement | undefined;
    };

    const getStatus = () => {
      const nodes = Array.from(main.querySelectorAll("span"));
      return nodes.find((node) => /^(WAITING|LIVE|CRASHED|SETTLED)$/.test(node.textContent?.trim() ?? ""))?.textContent?.trim() ?? "";
    };

    let previousStatus = getStatus();
    let previousMultiplier = Number.parseFloat(findMultiplier()?.textContent ?? "1");
    let previousWonCount = Array.from(main.querySelectorAll("td")).filter((node) => node.textContent?.trim() === "WON").length;
    let internalWrite = false;
    let frame = 0;
    let lastToneAt = 0;

    const animateMultiplier = (target: number) => {
      const node = findMultiplier();
      if (!node || !Number.isFinite(target)) return;
      const start = previousMultiplier;
      if (!Number.isFinite(start) || Math.abs(target - start) < 0.001 || !motionEnabled) {
        previousMultiplier = target;
        return;
      }
      const duration = Math.min(180, Math.max(70, Math.abs(target - start) * 90));
      const started = performance.now();
      cancelAnimationFrame(frame);
      const run = (time: number) => {
        const progress = Math.min(1, (time - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = start + (target - start) * eased;
        internalWrite = true;
        node.textContent = `${value.toFixed(2)}x`;
        internalWrite = false;
        if (progress < 1) frame = requestAnimationFrame(run);
        else previousMultiplier = target;
      };
      frame = requestAnimationFrame(run);
    };

    const observer = new MutationObserver(() => {
      if (internalWrite) return;
      const currentStatus = getStatus();
      const currentMultiplier = Number.parseFloat(findMultiplier()?.textContent ?? "1");

      if (currentStatus !== previousStatus) {
        if (currentStatus === "LIVE") {
          main.classList.add("aviator-round-start");
          window.setTimeout(() => main.classList.remove("aviator-round-start"), 520);
          if (soundEnabled && Date.now() - lastToneAt > 350) {
            playTone("start");
            lastToneAt = Date.now();
          }
        } else if (currentStatus === "CRASHED") {
          main.classList.add("aviator-crash-pulse");
          window.setTimeout(() => main.classList.remove("aviator-crash-pulse"), 720);
          if (soundEnabled && Date.now() - lastToneAt > 350) {
            playTone("crash");
            lastToneAt = Date.now();
          }
        }
        previousStatus = currentStatus;
      }

      if (Number.isFinite(currentMultiplier) && currentMultiplier !== previousMultiplier) {
        animateMultiplier(currentMultiplier);
      }

      const wonCount = Array.from(main.querySelectorAll("td")).filter((node) => node.textContent?.trim() === "WON").length;
      if (soundEnabled && wonCount > previousWonCount && Date.now() - lastToneAt > 350) {
        playTone("cashout");
        lastToneAt = Date.now();
      }
      previousWonCount = wonCount;
    });

    observer.observe(main, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      main.classList.remove("aviator-phase106", "aviator-motion-off", "aviator-round-start", "aviator-crash-pulse");
    };
  }, [motionEnabled, soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try { window.localStorage.setItem(SOUND_KEY, String(next)); } catch { /* Optional preference. */ }
    if (next) playTone("bet");
  };

  const toggleMotion = () => {
    const next = !motionEnabled;
    setMotionEnabled(next);
    try { window.localStorage.setItem(MOTION_KEY, String(next)); } catch { /* Optional preference. */ }
  };

  return (
    <div className="relative">
      <AviatorGameOptimized />
      <div className="pointer-events-none absolute right-4 top-[72px] z-30 sm:right-6">
        <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-label="Open game settings" className="pointer-events-auto grid size-10 place-items-center rounded-xl border border-white/10 bg-[#0a1728]/90 text-sm text-slate-200 shadow-xl backdrop-blur transition hover:bg-[#102139] focus-visible:outline-none">⚙</button>
        {settingsOpen ? (
          <div className="pointer-events-auto mt-2 w-52 rounded-2xl border border-white/10 bg-[#0a1728]/95 p-3 shadow-2xl backdrop-blur">
            <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Game settings</p>
            <button type="button" onClick={toggleSound} className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5"><span>{soundEnabled ? "🔊 Sound" : "🔇 Sound"}</span><span className="text-slate-500">{soundEnabled ? "ON" : "OFF"}</span></button>
            <button type="button" onClick={toggleMotion} className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5"><span>Motion</span><span className="text-slate-500">{motionEnabled ? "ON" : "OFF"}</span></button>
            <p className="mt-2 px-2 text-[10px] leading-4 text-slate-600">Sound uses lightweight original browser tones. No external audio assets are required.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
