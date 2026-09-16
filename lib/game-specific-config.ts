import { prisma } from "@/lib/prisma";

export const GAME_CONFIG_CODES = ["VALORANT", "STUMBLE_GUYS"] as const;
export type GameConfigCode = (typeof GAME_CONFIG_CODES)[number];

type Scoring = Record<string, number>;

export type ValorantConfig = {
  version: 1;
  format: "5V5" | "3V3" | "1V1";
  teamSize: 1 | 3 | 5;
  gameMode: "COMPETITIVE" | "UNRATED" | "SWIFTPLAY" | "CUSTOM";
  map: "ANY" | "ASCENT" | "BIND" | "HAVEN" | "LOTUS" | "SUNSET" | "ICEBOX" | "PEARL" | "SPLIT" | "BREEZE" | "FRACTURE";
  rounds: number;
  scoring: Scoring;
};

export type StumbleGuysConfig = {
  version: 1;
  format: "SOLO" | "DUO" | "SQUAD";
  participantStructure: "INDIVIDUAL" | "TEAM";
  rounds: number;
  gameMode: "RACE" | "ELIMINATION" | "CUSTOM";
  scoring: Scoring;
};

export type GameSpecificConfig = ValorantConfig | StumbleGuysConfig;

export type GameConfigErrors = Record<string, string>;

const ALLOWED_KEYS: Record<GameConfigCode, readonly string[]> = {
  VALORANT: ["version", "format", "teamSize", "gameMode", "map", "rounds", "scoring"],
  STUMBLE_GUYS: ["version", "format", "participantStructure", "rounds", "gameMode", "scoring"],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function integerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function validateScoring(value: unknown, code: GameConfigCode, errors: GameConfigErrors) {
  if (!isPlainObject(value)) {
    errors.scoring = "Scoring must be an object.";
    return;
  }
  if (Object.keys(value).length > 8) errors.scoring = "Scoring contains too many fields.";
  for (const [key, points] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key) || !integerIn(points, -1000, 1000)) {
      errors.scoring = `${code} scoring values must use safe keys and integers from -1000 to 1000.`;
      break;
    }
  }
}

export function validateGameSpecificConfig(code: string, input: unknown): { ok: true; config: GameSpecificConfig } | { ok: false; errors: GameConfigErrors } {
  if (!GAME_CONFIG_CODES.includes(code as GameConfigCode)) return { ok: false, errors: { form: "This game does not have a supported game-specific configuration yet." } };
  if (!isPlainObject(input)) return { ok: false, errors: { form: "Game-specific configuration must be an object." } };
  const gameCode = code as GameConfigCode;
  const errors: GameConfigErrors = {};
  if (!hasOnlyKeys(input, ALLOWED_KEYS[gameCode])) errors.form = "Game-specific configuration contains unsupported fields.";
  if (input.version !== 1) errors.version = "Unsupported game configuration version.";

  if (gameCode === "VALORANT") {
    if (!["5V5", "3V3", "1V1"].includes(input.format as string)) errors.format = "Select a valid Valorant format.";
    const teamSize = input.teamSize;
    if (![1, 3, 5].includes(teamSize as number)) errors.teamSize = "Valorant team size must be 1, 3, or 5.";
    if (input.format === "5V5" && teamSize !== 5) errors.teamSize = "5V5 format requires a team size of 5.";
    if (input.format === "3V3" && teamSize !== 3) errors.teamSize = "3V3 format requires a team size of 3.";
    if (input.format === "1V1" && teamSize !== 1) errors.teamSize = "1V1 format requires a team size of 1.";
    if (!["COMPETITIVE", "UNRATED", "SWIFTPLAY", "CUSTOM"].includes(input.gameMode as string)) errors.gameMode = "Select a valid Valorant game mode.";
    if (!["ANY", "ASCENT", "BIND", "HAVEN", "LOTUS", "SUNSET", "ICEBOX", "PEARL", "SPLIT", "BREEZE", "FRACTURE"].includes(input.map as string)) errors.map = "Select a valid Valorant map.";
    if (!integerIn(input.rounds, 1, 99)) errors.rounds = "Valorant rounds must be an integer from 1 to 99.";
    validateScoring(input.scoring, gameCode, errors);
  } else {
    if (!["SOLO", "DUO", "SQUAD"].includes(input.format as string)) errors.format = "Select a valid Stumble Guys format.";
    if (!["INDIVIDUAL", "TEAM"].includes(input.participantStructure as string)) errors.participantStructure = "Select a valid participant structure.";
    if (!integerIn(input.rounds, 1, 10)) errors.rounds = "Stumble Guys rounds must be an integer from 1 to 10.";
    if (!["RACE", "ELIMINATION", "CUSTOM"].includes(input.gameMode as string)) errors.gameMode = "Select a valid Stumble Guys game mode.";
    validateScoring(input.scoring, gameCode, errors);
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, config: input as GameSpecificConfig };
}

export function parseGameConfigForm(code: string, raw: string): { ok: true; config: GameSpecificConfig } | { ok: false; errors: GameConfigErrors } {
  try {
    return validateGameSpecificConfig(code, JSON.parse(raw));
  } catch {
    return { ok: false, errors: { form: "Invalid game-specific configuration." } };
  }
}

export async function getTournamentGameConfig(tournamentId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; tournamentId: string; gameId: string; gameCode: string; configuration: unknown; version: number; createdAt: Date; updatedAt: Date }>>`
    SELECT "id", "tournamentId", "gameId", "gameCode", "configuration", "version", "createdAt", "updatedAt"
    FROM "TournamentGameConfig"
    WHERE "tournamentId" = ${tournamentId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertTournamentGameConfig(
  tournamentId: string,
  gameId: string,
  gameCode: GameConfigCode,
  config: GameSpecificConfig,
  tx: typeof prisma = prisma,
) {
  const json = JSON.stringify(config);
  await tx.$executeRaw`
    INSERT INTO "TournamentGameConfig" ("id", "tournamentId", "gameId", "gameCode", "configuration", "version", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${tournamentId}::uuid, ${gameId}::uuid, ${gameCode}, ${json}::jsonb, ${config.version}, NOW(), NOW())
    ON CONFLICT ("tournamentId") DO UPDATE SET
      "gameId" = EXCLUDED."gameId",
      "gameCode" = EXCLUDED."gameCode",
      "configuration" = EXCLUDED."configuration",
      "version" = EXCLUDED."version",
      "updatedAt" = NOW()
  `;
}

export async function deleteTournamentGameConfig(tournamentId: string, tx: typeof prisma = prisma) {
  await tx.$executeRaw`DELETE FROM "TournamentGameConfig" WHERE "tournamentId" = ${tournamentId}::uuid`;
}

export function publicGameConfigSummary(gameCode: string, configuration: unknown) {
  const validated = validateGameSpecificConfig(gameCode, configuration);
  if (!validated.ok) return null;
  if (gameCode === "VALORANT") {
    const config = validated.config as ValorantConfig;
    return [
      ["Format", config.format],
      ["Team Size", `${config.teamSize}v${config.teamSize}`],
      ["Game Mode", config.gameMode],
      ["Map", config.map],
      ["Rounds", String(config.rounds)],
    ] as const;
  }
  const config = validated.config as StumbleGuysConfig;
  return [
    ["Format", config.format],
    ["Participants", config.participantStructure],
    ["Rounds", String(config.rounds)],
    ["Game Mode", config.gameMode],
  ] as const;
}
