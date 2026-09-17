import "server-only";

export const AVIATOR_PHASES = ["WAITING", "RUNNING", "CRASHED", "SETTLED"] as const;
export type AviatorPhase = (typeof AVIATOR_PHASES)[number];

export type AviatorRoundSnapshot = {
  roundId: string;
  phase: AviatorPhase;
  serverTime: number;
  multiplier: number;
  startedAt: number | null;
  waitingEndsAt: number | null;
};

export type CrashPointGenerator = {
  generate: (context: { roundId: string; seed: string }) => number;
};

const WAITING_MS = 5_000;
const SETTLED_MS = 1_000;
const UPDATE_INTERVAL_MS = 100;

const defaultCrashPointGenerator: CrashPointGenerator = {
  generate({ seed }) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const unit = (hash >>> 0) / 4294967296;
    return Number((1 + unit * unit * 19).toFixed(2));
  },
};

function multiplierAt(startedAt: number, now: number) {
  const elapsed = Math.max(0, now - startedAt) / 1000;
  return Number(Math.exp(elapsed * 0.12).toFixed(2));
}

function canTransition(from: AviatorPhase, to: AviatorPhase) {
  return (
    (from === "WAITING" && to === "RUNNING") ||
    (from === "RUNNING" && to === "CRASHED") ||
    (from === "CRASHED" && to === "SETTLED") ||
    (from === "SETTLED" && to === "WAITING")
  );
}

export class AviatorGameEngine {
  private readonly crashPointGenerator: CrashPointGenerator;
  private readonly now: () => number;
  private readonly onCrash?: (snapshot: AviatorRoundSnapshot, crashPoint: number) => void | Promise<void>;
  private snapshot: AviatorRoundSnapshot;
  private crashPoint: number;
  private roundCreatedAt: number;
  private settledTimer: ReturnType<typeof setTimeout> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<(snapshot: AviatorRoundSnapshot) => void>();

  constructor(options?: {
    crashPointGenerator?: CrashPointGenerator;
    now?: () => number;
    onCrash?: (snapshot: AviatorRoundSnapshot, crashPoint: number) => void | Promise<void>;
  }) {
    this.crashPointGenerator = options?.crashPointGenerator ?? defaultCrashPointGenerator;
    this.now = options?.now ?? Date.now;
    this.onCrash = options?.onCrash;
    this.roundCreatedAt = this.now();
    this.snapshot = this.createWaitingSnapshot(this.roundCreatedAt);
    this.crashPoint = this.generateCrashPoint();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), UPDATE_INTERVAL_MS);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.settledTimer) clearTimeout(this.settledTimer);
    this.timer = null;
    this.settledTimer = null;
  }

  subscribe(listener: (snapshot: AviatorRoundSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): AviatorRoundSnapshot {
    return { ...this.snapshot };
  }

  getCrashPointForPersistence() {
    return this.snapshot.phase === "CRASHED" || this.snapshot.phase === "SETTLED" ? this.crashPoint : null;
  }

  forceTransition(to: AviatorPhase) {
    if (!canTransition(this.snapshot.phase, to)) {
      throw new Error(`INVALID_STATE_TRANSITION: ${this.snapshot.phase} -> ${to}`);
    }
    this.transition(to);
  }

  private tick() {
    const now = this.now();
    this.snapshot.serverTime = now;

    if (this.snapshot.phase === "WAITING" && now >= (this.snapshot.waitingEndsAt ?? Number.POSITIVE_INFINITY)) {
      this.snapshot.startedAt = now;
      this.snapshot.waitingEndsAt = null;
      this.transition("RUNNING");
      return;
    }

    if (this.snapshot.phase === "RUNNING" && this.snapshot.startedAt) {
      const multiplier = Math.max(1, multiplierAt(this.snapshot.startedAt, now));
      this.snapshot.multiplier = multiplier;
      if (multiplier >= this.crashPoint) {
        this.snapshot.multiplier = this.crashPoint;
        this.transition("CRASHED");
        const crashedSnapshot = this.getSnapshot();
        void this.onCrash?.(crashedSnapshot, this.crashPoint);
        this.settledTimer = setTimeout(() => {
          if (this.snapshot.phase !== "CRASHED") return;
          this.transition("SETTLED");
          this.startNextRound(this.now());
        }, SETTLED_MS);
        return;
      }
    }

    this.emit();
  }

  private transition(phase: AviatorPhase) {
    if (!canTransition(this.snapshot.phase, phase)) {
      throw new Error(`INVALID_STATE_TRANSITION: ${this.snapshot.phase} -> ${phase}`);
    }
    this.snapshot.phase = phase;
    this.snapshot.serverTime = this.now();
    this.emit();
  }

  private startNextRound(now: number) {
    if (this.snapshot.phase !== "SETTLED") return;
    this.snapshot = this.createWaitingSnapshot(now);
    this.roundCreatedAt = now;
    this.crashPoint = this.generateCrashPoint();
    this.emit();
  }

  private createWaitingSnapshot(now: number): AviatorRoundSnapshot {
    return {
      roundId: crypto.randomUUID(),
      phase: "WAITING",
      serverTime: now,
      multiplier: 1,
      startedAt: null,
      waitingEndsAt: now + WAITING_MS,
    };
  }

  private generateCrashPoint() {
    const point = this.crashPointGenerator.generate({ roundId: this.snapshot.roundId, seed: crypto.randomUUID() });
    if (!Number.isFinite(point) || point < 1) throw new Error("INVALID_CRASH_POINT");
    return Number(point.toFixed(2));
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
