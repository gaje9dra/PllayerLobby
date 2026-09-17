import { isAviatorClientMessage } from "./state";

export function validateAviatorMessage(value: unknown) {
  return isAviatorClientMessage(value);
}
