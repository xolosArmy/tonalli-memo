import { expect } from "vitest";

import { ChronikAdapterError } from "../src/index.js";

import type { ChronikAdapterErrorCode, ChronikTxSource } from "../src/index.js";

export class FakeChronikTxSource implements ChronikTxSource {
  readonly calls: string[] = [];

  constructor(private readonly result: unknown | ((txid: string) => unknown | Promise<unknown>)) {}

  async tx(txid: string): Promise<unknown> {
    this.calls.push(txid);
    if (typeof this.result === "function") {
      return this.result(txid);
    }
    return this.result;
  }
}

export class ThrowingChronikTxSource implements ChronikTxSource {
  readonly calls: string[] = [];

  constructor(private readonly error: unknown) {}

  async tx(txid: string): Promise<unknown> {
    this.calls.push(txid);
    throw this.error;
  }
}

export const expectAdapterError = (fn: () => unknown, code: ChronikAdapterErrorCode): void => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ChronikAdapterError);
    expect((error as ChronikAdapterError).code).toBe(code);
    return;
  }
  throw new Error("Expected ChronikAdapterError with code " + code + ".");
};

export const expectAsyncAdapterError = async (fn: () => Promise<unknown>, code: ChronikAdapterErrorCode): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ChronikAdapterError);
    expect((error as ChronikAdapterError).code).toBe(code);
    return;
  }
  throw new Error("Expected ChronikAdapterError with code " + code + ".");
};

export const utf8Hex = (value: string): string => Buffer.from(value, "utf8").toString("hex");
export const repeatHexByte = (byteHex: string, byteCount: number): string => byteHex.repeat(byteCount);

const pushHex = (hex: string): string => {
  const byteLength = hex.length / 2;
  if (byteLength <= 75) {
    return byteLength.toString(16).padStart(2, "0") + hex;
  }
  if (byteLength <= 255) {
    return "4c" + byteLength.toString(16).padStart(2, "0") + hex;
  }
  throw new Error("Test helper only supports pushes up to OP_PUSHDATA1.");
};

export const opReturnScript = (...pushes: readonly string[]): string => "6a" + pushes.map(pushHex).join("");
export const hexToBytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, "hex"));
