export const TOURNAMENT_FORMATS = ["SOLO", "DUO", "SQUAD", "TEAM"] as const;
export type TournamentFormatValue = (typeof TOURNAMENT_FORMATS)[number];
export type TournamentFormValues = { gameId: string; name: string; slug: string; description: string; rules: string; bannerUrl: string; startTime: string; registrationStartTime: string; registrationEndTime: string; entryFee: string; prizePool: string; maxParticipants: string; tournamentFormat: string; region: string; joiningWindowMinutes: string };
export type TournamentFieldErrors = Partial<Record<keyof TournamentFormValues | "form" | "status" | "gameConfig", string>>;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const MAX_PARTICIPANTS = 10000;
const MAX_JOINING_WINDOW_MINUTES = 120;
export function slugify(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-"); }
export function validateMoney(value: string, label: string) { const normalized = value.trim(); if (!MONEY_PATTERN.test(normalized)) return `${label} must be a valid non-negative amount with up to 2 decimal places.`; return null; }
export function validateTournamentInput(values: TournamentFormValues) {
  const errors: TournamentFieldErrors = {};
  const name = values.name.trim(); const slug = values.slug.trim(); const description = values.description.trim(); const rules = values.rules.trim(); const bannerUrl = values.bannerUrl.trim(); const region = values.region.trim();
  if (!values.gameId) errors.gameId = "Please select a game.";
  if (!name) errors.name = "Tournament name is required."; else if (name.length < 3) errors.name = "Tournament name must be at least 3 characters."; else if (name.length > 120) errors.name = "Tournament name cannot exceed 120 characters.";
  if (!slug) errors.slug = "Tournament slug is required."; else if (slug.length > 120) errors.slug = "Tournament slug cannot exceed 120 characters."; else if (!SLUG_PATTERN.test(slug)) errors.slug = "Slug must be lowercase and contain only letters, numbers, and single hyphens.";
  if (description.length > 5000) errors.description = "Description cannot exceed 5,000 characters.";
  if (rules.length > 10000) errors.rules = "Rules cannot exceed 10,000 characters.";
  if (bannerUrl) { try { const url = new URL(bannerUrl); if (!["http:", "https:"].includes(url.protocol)) errors.bannerUrl = "Banner URL must use HTTP or HTTPS."; } catch { errors.bannerUrl = "Please enter a valid banner URL."; } }
  if (!values.startTime) errors.startTime = "Start date and time are required.";
  if (!values.registrationStartTime) errors.registrationStartTime = "Registration start time is required.";
  if (!values.registrationEndTime) errors.registrationEndTime = "Registration end time is required.";
  const entryFeeError = validateMoney(values.entryFee, "Entry fee"); if (entryFeeError) errors.entryFee = entryFeeError;
  const prizePoolError = validateMoney(values.prizePool, "Prize pool"); if (prizePoolError) errors.prizePool = prizePoolError;
  const maxParticipants = Number.parseInt(values.maxParticipants, 10); if (!/^\d+$/.test(values.maxParticipants) || !Number.isSafeInteger(maxParticipants) || maxParticipants <= 0) errors.maxParticipants = "Maximum participants must be greater than zero."; else if (maxParticipants > MAX_PARTICIPANTS) errors.maxParticipants = `Maximum participants cannot exceed ${MAX_PARTICIPANTS.toLocaleString()}.`;
  if (!TOURNAMENT_FORMATS.includes(values.tournamentFormat as TournamentFormatValue)) errors.tournamentFormat = "Please select a valid tournament format.";
  if (!region) errors.region = "Region / Server is required."; else if (region.length > 100) errors.region = "Region / Server cannot exceed 100 characters.";
  const joiningWindowMinutes = Number.parseInt(values.joiningWindowMinutes, 10); if (!/^\d+$/.test(values.joiningWindowMinutes) || !Number.isSafeInteger(joiningWindowMinutes) || joiningWindowMinutes <= 0) errors.joiningWindowMinutes = "Joining window must be greater than zero."; else if (joiningWindowMinutes > MAX_JOINING_WINDOW_MINUTES) errors.joiningWindowMinutes = `Joining window cannot exceed ${MAX_JOINING_WINDOW_MINUTES} minutes.`;
  return errors;
}
