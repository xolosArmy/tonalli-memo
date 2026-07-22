import { expect } from "vitest";
import { MemoProtocolError, type MemoErrorCode } from "../src/index.js";

export function expectMemoError(action: () => unknown, code: MemoErrorCode): void {
  expect(action).toThrow(MemoProtocolError);

  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(MemoProtocolError);
    expect((error as MemoProtocolError).code).toBe(code);
    return;
  }

  throw new Error("Expected action to throw.");
}
