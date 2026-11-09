/**
 * Process-local switch for the explicitly enabled local Aviator demo controls.
 * This is intentionally not persisted and cannot be enabled outside development.
 */
let requestedBustRoundId: string | null = null;

export function isLocalAviatorDemoControlsEnabled() {
  return process.env.NODE_ENV === "development" && process.env.AVIATOR_LOCAL_DEMO_CONTROLS === "true";
}

export function requestLocalAviatorDemoBust(roundId: string) {
  if (!isLocalAviatorDemoControlsEnabled()) {
    throw new Error("LOCAL_DEMO_CONTROLS_DISABLED");
  }
  requestedBustRoundId = roundId;
}

export function consumeLocalAviatorDemoBust(roundId: string) {
  if (!isLocalAviatorDemoControlsEnabled() || requestedBustRoundId !== roundId) return false;
  requestedBustRoundId = null;
  return true;
}
