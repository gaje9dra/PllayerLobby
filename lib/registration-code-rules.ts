export const REGISTRATION_CODE_LENGTH = 12;
export const REGISTRATION_CODE_PATTERN = /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/;

export function normalizeRegistrationCode(input: string) {
  const compact = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z0-9]{12}$/.test(compact)) return null;
  return compact;
}

export function formatRegistrationCode(compactCode: string) {
  if (!/^[A-Z0-9]{12}$/.test(compactCode)) {
    throw new Error("Invalid registration code material.");
  }
  return `${compactCode.slice(0, 4)}-${compactCode.slice(4, 8)}-${compactCode.slice(8, 12)}`;
}

export function isRegistrationCodeFormatValid(input: string) {
  return REGISTRATION_CODE_PATTERN.test(input.trim().toUpperCase());
}
