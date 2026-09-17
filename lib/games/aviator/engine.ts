import { randomUUID } from "node:crypto";
import { ProvablyFairService, type AviatorFairnessSecret } from "./provably-fair";
import type { AviatorPhase, AviatorRoundSnapshot } from "./types";

type EngineTimings = { waitingMs: number; settledMs: number; updateIntervalMs: number };

export type CrashPointGenerator = {
  generate: (context: { roundId: string; seed: string }) => number;
};

const DEFAULT_TIMINGS: EngineTimings = { waitingMs: 5_000, settledMs: 1_000, updateIntervalMs: 100 };
const MIN_CRASH_POINT = 1.01;
const MAX_CRASH_POINT = 50;

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
  private readonly crashPointGenerator?: CrashPointGenerator;
  private readonly provablyFairService: ProvablyFairService;
  private readonly now: () => number;
  private readonly onCrash?: (snapshot: AviatorRoundSnapshot, crashPoint: number) => void | Promise<void>;
  private readonly onRoundCreated?: (snapshot: AviatorRoundSnapshot, fairness: AviatorFairnessSecret) => void | Promise<void>;
  private readonly timings: EngineTimings;
  private snapshot: AviatorRoundSnapshot;
  private fairness: AviatorFairnessSecret;
  private crashPoint: number;
  private settledTimer: ReturnType<typeof setTimeout> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<(snapshot: AviatorRoundSnapshot) => void>();
  private lockTail: Promise<void> = Promise.resolve();

  constructor(options?: {
    crashPointGenerator?: CrashPointGenerator;
    provablyFairService?: ProvablyFairService;
    now?: () => number;
    onCrash?: (snapshot: AviatorRoundSnapshot, crashPoint: number) => void | Promise<void>;
    onRoundCreated?: (snapshot: AviatorRoundSnapshot, fairness: AviatorFairnessSecret) => void | Promise<void>;
    timings?: Partial<EngineTimings>;
  }) {
    this.crashPointGenerator = options?.crashPointGenerator;
    this.provablyFairService = options?.provablyFairService ?? new ProvablyFairService();
    this.now = options?.now ?? Date.now;
    this.onCrash = options?.onCrash;
    this.onRoundCreated = options?.onRoundCreated;
    this.timings = { ...DEFAULT_TIMINGS, ...options?.timings };
    const now = this.now();
    const created = this.createWaitingSnapshot(now);
    this.snapshot = created.snapshot;
    this.fairness = created.fairness;
    this.crashPoint = this.generateCrashPoint();
    this.notifyRoundCreated();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.timings.updateIntervalMs);
    this.timer.unref?.();
    void this.tick();
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
    return { ...this.snapshot, fairness: { ...this.snapshot.fairness } };
  }

  getFairnessSecretForPersistence() {
    return { ...this.fairness };
  }

  getCrashPointForPersistence() {
    return this.snapshot.phase === "CRASHED" || this.snapshot.phase === "SETTLED" ? this.crashPoint : null;
  }

  async withStateLock<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.lockTail;
    let release!: () => void;
    this.lockTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  forceTransition(to: AviatorPhase) {
    if (!canTransition(this.snapshot.phase, to)) {
      throw new Error(`INVALID_STATE_TRANSITION: ${this.snapshot.phase} -> ${to}`);
    }
    this.transition(to);
  }

  private async tick() {
    await this.withStateLock(async () => {
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
          await this.onCrash?.(crashedSnapshot, this.crashPoint);
          this.settledTimer = setTimeout(() => {
            void this.withStateLock(async () => {
              if (this.snapshot.phase !== "CRASHED") return;
              this.transition("SETTLED");
              this.startNextRound(this.now());
            });
          }, this.timings.settledMs);
          this.settledTimer.unref?.();
          return;
        }
      }

      this.emit();
    });
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
    const created = this.createWaitingSnapshot(now);
    this.snapshot = created.snapshot;
    this.fairness = created.fairness;
    this.crashPoint = this.generateCrashPoint();
    this.notifyRoundCreated();
    this.emit();
  }

  private createWaitingSnapshot(now: number) {
    const roundId = randomUUID();
    const fairness = this.provablyFairService.createRound(roundId);
    return {
      fairness,
      snapshot: {
        roundId,
        phase: "WAITING" as const,
        serverTime: now,
        multiplier: 1,
        startedAt: null,
        waitingEndsAt: now + this.timings.waitingMs,
        fairness: {
          roundId: fairness.roundId,
          serverSeedHash: fairness.serverSeedHash,
          clientSeed: fairness.clientSeed,
          nonce: fairness.nonce,
          algorithmVersion: fairness.algorithmVersion,
        },
      },
    };
  }

  private generateCrashPoint() {
    if (this.crashPointGenerator) {
      const point = this.crashPointGenerator.generate({ roundId: this.snapshot.roundId, seed: this.fairness.serverSeed });
      if (!Number.isFinite(point) || point < MIN_CRASH_POINT || point > MAX_CRASH_POINT) throw new Error("INVALID_CRASH_POINT");
      return Number(point.toFixed(2));
    }
    return this.provablyFairService.calculateCrashMultiplier(this.fairness);
  }

  private notifyRoundCreated() {
    try {
      void this.onRoundCreated?.(this.getSnapshot(), this.getFairnessSecretForPersistence());
    } catch (error) {
      console.error("[aviator] failed to schedule fairness commitment persistence", error);
    }
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
