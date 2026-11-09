"use client";

import { useEffect, useState } from "react";
import { AviatorGameOptimized } from "./aviator-game-optimized";
import { AVIATOR_DISCLAIMER_TITLE, AVIATOR_DISCLAIMER_PARAGRAPHS } from "@/lib/games/aviator/disclaimer";

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
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    // Audio is optional; the game remains fully functional when unavailable.
  }
}

export function AviatorGamePhase106() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [disclaimerLoading, setDisclaimerLoading] = useState(true);
  const [disclaimerError, setDisclaimerError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSoundEnabled(readPreference(SOUND_KEY, true));
      setMotionEnabled(readPreference(MOTION_KEY, true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/games/aviator/disclaimer", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 401 ? "Please sign in to continue to Aviator." : "Could not verify disclaimer acceptance.");
        if (active) setDisclaimerAccepted(payload.accepted === true);
      })
      .catch((error: unknown) => {
        if (active) setDisclaimerError(error instanceof Error ? error.message : "Could not verify disclaimer acceptance.");
      })
      .finally(() => {
        if (active) setDisclaimerLoading(false);
      });
    return () => { active = false; };
  }, []);

  const acceptDisclaimer = async () => {
    setDisclaimerError("");
    try {
      const response = await fetch("/api/games/aviator/disclaimer", { method: "POST", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.accepted !== true) throw new Error(payload.error || "Could not save your acceptance. Please try again.");
      setDisclaimerAccepted(true);
    } catch (error) {
      setDisclaimerError(error instanceof Error ? error.message : "Could not save your acceptance.");
    }
  };

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    main.classList.add("aviator-phase106");
    main.classList.toggle("aviator-motion-off", !motionEnabled);

    const getStatus = () => {
      const nodes = Array.from(main.querySelectorAll("span"));
      return nodes.find((node) =>
        /^(WAITING|LIVE|CRASHED|SETTLED)$/.test(node.textContent?.trim() ?? "")
      )?.textContent?.trim() ?? "";
    };

    let previousStatus = getStatus();
    let previousWonCount = Array.from(main.querySelectorAll("td"))
      .filter((node) => node.textContent?.trim() === "WON").length;
    let lastToneAt = 0;
    const timers = new Set<number>();

    const scheduleClassRemoval = (className: string, duration: number) => {
      main.classList.add(className);
      const timer = window.setTimeout(() => {
        main.classList.remove(className);
        timers.delete(timer);
      }, duration);
      timers.add(timer);
    };

    const observer = new MutationObserver(() => {
      const currentStatus = getStatus();

      if (currentStatus !== previousStatus) {
        if (currentStatus === "LIVE") {
          scheduleClassRemoval("aviator-round-start", 520);
          if (soundEnabled && Date.now() - lastToneAt > 350) {
            playTone("start");
            lastToneAt = Date.now();
          }
        } else if (currentStatus === "CRASHED") {
          scheduleClassRemoval("aviator-crash-pulse", 720);
          if (soundEnabled && Date.now() - lastToneAt > 350) {
            playTone("crash");
            lastToneAt = Date.now();
          }
        }
        previousStatus = currentStatus;
      }

      const wonCount = Array.from(main.querySelectorAll("td"))
        .filter((node) => node.textContent?.trim() === "WON").length;
      if (soundEnabled && wonCount > previousWonCount && Date.now() - lastToneAt > 350) {
        playTone("cashout");
        lastToneAt = Date.now();
      }
      previousWonCount = wonCount;
    });

    observer.observe(main, { subtree: true, childList: true, characterData: true });

    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      main.classList.remove(
        "aviator-phase106",
        "aviator-motion-off",
        "aviator-round-start",
        "aviator-crash-pulse"
      );
    };
  }, [motionEnabled, soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(SOUND_KEY, String(next));
    } catch {
      // Optional preference.
    }
    if (next) playTone("bet");
  };

  const toggleMotion = () => {
    const next = !motionEnabled;
    setMotionEnabled(next);
    try {
      window.localStorage.setItem(MOTION_KEY, String(next));
    } catch {
      // Optional preference.
    }
  };

  return (
    <div className="relative">
      {disclaimerLoading ? (
        <div className="grid min-h-[55vh] place-items-center text-sm text-slate-400">Checking game disclaimer…</div>
      ) : disclaimerAccepted ? (
        <AviatorGameOptimized />
      ) : (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#020914]/95 p-4 backdrop-blur-md">
          <section role="dialog" aria-modal="true" aria-labelledby="aviator-disclaimer-title" className="w-full max-w-xl rounded-3xl border border-amber-300/25 bg-[#0a1728] p-6 shadow-2xl sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Required before entry</p>
            <h1 id="aviator-disclaimer-title" className="mt-3 text-2xl font-black text-white">{AVIATOR_DISCLAIMER_TITLE}</h1>
            <div className="mt-5 space-y-4 text-sm leading-6 text-slate-300">
              {AVIATOR_DISCLAIMER_PARAGRAPHS.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            {disclaimerError ? <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{disclaimerError}</p> : null}
            <button type="button" onClick={() => void acceptDisclaimer()} className="mt-6 w-full rounded-xl bg-amber-300 px-5 py-3.5 text-sm font-black text-[#101827] transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
              I Understand &amp; Accept
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">You must accept this notice before entering the game.</p>
          </section>
        </div>
      )}
      <div className="pointer-events-none absolute right-4 top-[72px] z-30 sm:right-6">
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-label="Open game settings"
          className="pointer-events-auto grid size-10 place-items-center rounded-xl border border-white/10 bg-[#0a1728]/90 text-sm text-slate-200 shadow-xl backdrop-blur transition hover:bg-[#102139] focus-visible:outline-none"
        >
          ⚙
        </button>
        {settingsOpen ? (
          <div className="pointer-events-auto mt-2 w-52 rounded-2xl border border-white/10 bg-[#0a1728]/95 p-3 shadow-2xl backdrop-blur">
            <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Game settings
            </p>
            <button
              type="button"
              onClick={toggleSound}
              className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5"
            >
              <span>{soundEnabled ? "🔊 Sound" : "🔇 Sound"}</span>
              <span className="text-slate-500">{soundEnabled ? "ON" : "OFF"}</span>
            </button>
            <button
              type="button"
              onClick={toggleMotion}
              className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/5"
            >
              <span>Motion</span>
              <span className="text-slate-500">{motionEnabled ? "ON" : "OFF"}</span>
            </button>
            <p className="mt-2 px-2 text-[10px] leading-4 text-slate-600">
              Sound uses lightweight original browser tones. No external audio assets are required.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
