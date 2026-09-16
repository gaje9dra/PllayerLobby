const MAX_ROOM_ID_LENGTH = 120;
const MAX_ROOM_PASSWORD_LENGTH = 200;

export function normalizeMatchRoomValue(value: string, maxLength = MAX_ROOM_ID_LENGTH) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

export { MAX_ROOM_ID_LENGTH, MAX_ROOM_PASSWORD_LENGTH };
