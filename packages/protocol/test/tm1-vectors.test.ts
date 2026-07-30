import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import vectors from "../tm1-test-vectors.json" with { type: "json" };

const OP_RETURN = 0x6a;
const OP_PUSHDATA1 = 0x4c;
const TM1_VERSION = 0x01;
const POST_EVENT_TYPE = 0x01;
const REPLY_EVENT_TYPE = 0x02;
const MAX_EVENT_DATA_BYTES = 212;
const MAX_SCRIPT_BYTES = 223;

interface ExpectedError {
  errorCode: string;
}

interface Tm1Vector {
  name: string;
  scriptHex: string;
  version?: number;
  eventType?: string;
  eventTypeHex?: string;
  authorInputIndex?: number;
  eventDataByteLength?: number;
  eventDataUtf8?: string;
  unicodeNormalization?: string;
  expected?: ExpectedError;
}

interface ParsedScript {
  lokadIdHex: string;
  envelope: Buffer;
  secondPushOpcode: number;
  rest: Buffer;
}

function fromHex(hex: string): Buffer {
  expect(hex).toMatch(/^(?:[0-9a-f]{2})+$/u);
  return Buffer.from(hex, "hex");
}

function readTm1Script(scriptHex: string): ParsedScript {
  const script = fromHex(scriptHex);

  expect(script[0]).toBe(OP_RETURN);
  expect(script[1]).toBe(4);

  const lokadId = script.subarray(2, 6);
  const secondPushOpcode = script[6];
  expect(secondPushOpcode).toBeDefined();

  let envelopeStart = 7;
  let envelopeLength = secondPushOpcode;

  if (secondPushOpcode === OP_PUSHDATA1) {
    envelopeLength = script[7];
    envelopeStart = 8;
  }

  expect(envelopeLength).toBeDefined();
  const envelopeEnd = envelopeStart + Number(envelopeLength);

  return {
    lokadIdHex: lokadId.toString("hex"),
    envelope: script.subarray(envelopeStart, envelopeEnd),
    secondPushOpcode: Number(secondPushOpcode),
    rest: script.subarray(envelopeEnd)
  };
}

function eventData(envelopeBytes: Buffer): Buffer {
  return envelopeBytes.subarray(3);
}

describe("TM1 test vectors", () => {
  it("declares stable top-level metadata", () => {
    expect(vectors.schemaVersion).toBe(1);
    expect(vectors.protocol).toBe("TM1");
    expect(vectors.specDraft).toBe("0.2");
    expect(vectors.lokadIdHex).toBe("544d4d00");
    expect(vectors.valid.length).toBeGreaterThan(0);
    expect(vectors.invalid.length).toBeGreaterThan(0);
  });

  it.each(vectors.valid as Tm1Vector[])("has coherent valid vector metadata: $name", (vector) => {
    const parsed = readTm1Script(vector.scriptHex);
    const data = eventData(parsed.envelope);

    expect(parsed.lokadIdHex).toBe(vectors.lokadIdHex);
    expect(parsed.rest).toHaveLength(0);
    expect(parsed.envelope).toHaveLength(3 + Number(vector.eventDataByteLength));
    expect(parsed.envelope[0]).toBe(TM1_VERSION);
    expect(parsed.envelope[1]).toBe(POST_EVENT_TYPE);
    expect(parsed.envelope[2]).toBe(vector.authorInputIndex);
    expect(vector.eventType).toBe("POST");
    expect(vector.eventTypeHex).toBe("01");
    expect(data).toHaveLength(Number(vector.eventDataByteLength));
    expect(data.toString("utf8")).toBe(vector.eventDataUtf8);
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data.length).toBeLessThanOrEqual(MAX_EVENT_DATA_BYTES);
    expect(fromHex(vector.scriptHex).length).toBeLessThanOrEqual(MAX_SCRIPT_BYTES);

    if (parsed.envelope.length <= 75) {
      expect(parsed.secondPushOpcode).toBe(parsed.envelope.length);
    } else {
      expect(parsed.secondPushOpcode).toBe(OP_PUSHDATA1);
    }
  });

  it("covers required valid byte boundaries and text preservation cases", () => {
    const valid = vectors.valid as Tm1Vector[];
    const lengths = new Set(valid.map((vector) => vector.eventDataByteLength));

    expect(Array.from(lengths)).toEqual(expect.arrayContaining([1, 72, 73, 212]));
    expect(valid.some((vector) => vector.eventDataUtf8 === "Señal café")).toBe(true);
    expect(valid.some((vector) => vector.eventDataUtf8 === "TM1 ✅")).toBe(true);
    expect(valid.find((vector) => vector.unicodeNormalization === "NFC")?.eventDataUtf8).not.toBe(
      valid.find((vector) => vector.unicodeNormalization === "NFD")?.eventDataUtf8
    );
    expect(valid.some((vector) => vector.eventDataUtf8?.startsWith(" ") === true)).toBe(true);
    expect(valid.some((vector) => vector.eventDataUtf8?.endsWith(" ") === true)).toBe(true);
    expect(valid.some((vector) => Number(vector.authorInputIndex) > 0)).toBe(true);
  });

  it.each(vectors.invalid as Tm1Vector[])("has coherent invalid vector metadata: $name", (vector) => {
    expect(vector.expected?.errorCode).toMatch(/^[A-Z0-9_]+$/u);

    const parsed = readTm1Script(vector.scriptHex);
    expect(parsed.lokadIdHex).toBe(vectors.lokadIdHex);

    if (vector.name.includes("Unknown version")) {
      expect(parsed.envelope[0]).not.toBe(TM1_VERSION);
    }

    if (vector.name.includes("REPLY")) {
      expect(parsed.envelope[1]).toBe(REPLY_EVENT_TYPE);
    }

    if (vector.name.includes("Empty event_data")) {
      expect(eventData(parsed.envelope)).toHaveLength(0);
    }

    if (vector.name.includes("Invalid UTF-8")) {
      expect(eventData(parsed.envelope).toString("utf8")).toContain("\ufffd");
    }

    if (vector.name.includes("213 byte")) {
      expect(eventData(parsed.envelope)).toHaveLength(213);
      expect(fromHex(vector.scriptHex).length).toBe(MAX_SCRIPT_BYTES + 1);
    }

    if (vector.name.includes("Non-minimal")) {
      expect(parsed.secondPushOpcode).toBe(OP_PUSHDATA1);
      expect(parsed.envelope.length).toBeLessThanOrEqual(75);
    }

    if (vector.name.includes("Truncated")) {
      expect(parsed.envelope.length).toBeLessThan(3);
    }

    if (vector.name.includes("third push")) {
      expect(parsed.rest[0]).toBe(1);
      expect(parsed.rest[1]).toBe(0);
    }

    if (vector.name.includes("non-push opcode")) {
      expect(parsed.rest[0]).toBe(0x51);
    }
  });

  it("covers required invalid cases and expected error codes", () => {
    const invalid = vectors.invalid as Tm1Vector[];
    const names = invalid.map((vector) => vector.name);
    const codes = invalid.map((vector) => vector.expected?.errorCode);

    expect(names).toEqual(
      expect.arrayContaining([
        "213 byte event_data exceeds maximum",
        "Unknown version",
        "Reserved REPLY event type",
        "Empty event_data",
        "Invalid UTF-8 event_data",
        "Non-minimal OP_PUSHDATA1 for short envelope",
        "Truncated envelope",
        "Additional third push",
        "Additional non-push opcode"
      ])
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        "PAYLOAD_TOO_LARGE",
        "UNSUPPORTED_VERSION",
        "UNSUPPORTED_EVENT_TYPE",
        "EMPTY_EVENT_DATA",
        "INVALID_UTF8",
        "INVALID_FORMAT"
      ])
    );
  });
});
