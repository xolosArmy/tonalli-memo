import { describe, expect, it } from "vitest";
import {
  encodeTm1Post,
  getTm1LokadId,
  isTm1ProtocolError,
  parseTm1Output,
  MAX_TM1_EVENT_DATA_BYTES,
  TM1_LOKAD_ID
} from "../src/index.js";
import vectors from "../tm1-test-vectors.json" with { type: "json" };

describe("encodeTm1Post", () => {
  it("encodes valid string event_data with default author input index", () => {
    const encoded = encodeTm1Post({ eventData: "hello world" });
    expect(encoded.protocol).toBe("TM1");
    expect(encoded.version).toBe(1);
    expect(encoded.eventType).toBe("POST");
    expect(encoded.eventTypeCode).toBe(1);
    expect(encoded.authorInputIndex).toBe(0);
    expect(encoded.eventData).toBe("hello world");
    expect(encoded.eventDataByteLength).toBe(11);
    expect(encoded.envelopeHex).toBe("01010068656c6c6f20776f726c64");
    expect(encoded.scriptHex).toBe("6a04544d4d000e01010068656c6c6f20776f726c64");
  });

  it("encodes valid Uint8Array event_data with explicit author input index", () => {
    const dataBytes = new TextEncoder().encode("test memo");
    const encoded = encodeTm1Post({
      eventData: dataBytes,
      authorInputIndex: 5
    });
    expect(encoded.authorInputIndex).toBe(5);
    expect(encoded.eventData).toBe("test memo");
    expect(encoded.eventDataBytes).toEqual(dataBytes);

    const parsed = parseTm1Output({ valueSats: 0n, script: encoded.script });
    expect(parsed.version).toBe(1);
    expect(parsed.eventType).toBe("POST");
    expect(parsed.authorInputIndex).toBe(5);
    expect(parsed.eventData).toBe("test memo");
  });

  it("encodes all valid normative vectors byte-for-byte", () => {
    for (const vector of vectors.valid) {
      const authorIndex = vector.authorInputIndex ?? 0;
      const encoded = encodeTm1Post({
        eventData: vector.eventDataUtf8,
        authorInputIndex: authorIndex
      });

      expect(encoded.scriptHex).toBe(vector.scriptHex.toLowerCase());
      expect(encoded.version).toBe(vector.version);
      expect(encoded.eventType).toBe(vector.eventType);
      expect(encoded.authorInputIndex).toBe(authorIndex);
      expect(encoded.eventDataByteLength).toBe(vector.eventDataByteLength);

      const parsed = parseTm1Output({ valueSats: 0n, script: encoded.script });
      expect(parsed.version).toBe(vector.version);
      expect(parsed.eventType).toBe(vector.eventType);
      expect(parsed.authorInputIndex).toBe(authorIndex);
      expect(parsed.eventData).toBe(vector.eventDataUtf8);
      expect(parsed.eventDataByteLength).toBe(vector.eventDataByteLength);
    }
  });

  it("throws EMPTY_EVENT_DATA for empty string or empty byte array", () => {
    expect(() => encodeTm1Post({ eventData: "" })).toThrowError(
      expect.objectContaining({ code: "EMPTY_EVENT_DATA" })
    );
    expect(() => encodeTm1Post({ eventData: new Uint8Array(0) })).toThrowError(
      expect.objectContaining({ code: "EMPTY_EVENT_DATA" })
    );
  });

  it("throws PAYLOAD_TOO_LARGE when event_data exceeds 212 bytes", () => {
    const oversized = "a".repeat(MAX_TM1_EVENT_DATA_BYTES + 1);
    expect(() => encodeTm1Post({ eventData: oversized })).toThrowError(
      expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" })
    );

    const oversizedBytes = new Uint8Array(MAX_TM1_EVENT_DATA_BYTES + 1);
    oversizedBytes.fill(0x61);
    expect(() => encodeTm1Post({ eventData: oversizedBytes })).toThrowError(
      expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" })
    );
  });

  it("throws INVALID_UTF8 when eventData Uint8Array has invalid UTF-8 bytes", () => {
    const invalidUtf8 = Uint8Array.of(0xff, 0xfe);
    expect(() => encodeTm1Post({ eventData: invalidUtf8 })).toThrowError(
      expect.objectContaining({ code: "INVALID_UTF8" })
    );
  });

  it("throws INVALID_FORMAT for invalid authorInputIndex", () => {
    expect(() =>
      encodeTm1Post({ eventData: "ok", authorInputIndex: -1 })
    ).toThrowError(expect.objectContaining({ code: "INVALID_FORMAT" }));

    expect(() =>
      encodeTm1Post({ eventData: "ok", authorInputIndex: 256 })
    ).toThrowError(expect.objectContaining({ code: "INVALID_FORMAT" }));

    expect(() =>
      encodeTm1Post({ eventData: "ok", authorInputIndex: 1.5 })
    ).toThrowError(expect.objectContaining({ code: "INVALID_FORMAT" }));
  });

  it("rejects string with unpaired UTF-16 surrogate (\\uD800)", () => {
    expect(() => encodeTm1Post({ eventData: "\uD800" })).toThrowError(
      expect.objectContaining({ code: "INVALID_UTF8" })
    );

    try {
      encodeTm1Post({ eventData: "\uD800" });
      expect.unreachable("encodeTm1Post should have rejected unpaired surrogate \\uD800");
    } catch (error) {
      expect(isTm1ProtocolError(error)).toBe(true);
      if (isTm1ProtocolError(error)) {
        expect(error.code).toBe("INVALID_UTF8");
      }
    }
  });

  it("demonstrates TM1_LOKAD_ID is immutable against assignment, mutating methods, and shared backing buffers", () => {
    // 1. TM1_LOKAD_ID is a frozen readonly tuple/array
    expect(Object.isFrozen(TM1_LOKAD_ID)).toBe(true);
    expect(Array.isArray(TM1_LOKAD_ID)).toBe(true);
    expect(TM1_LOKAD_ID).toEqual([0x54, 0x4d, 0x4d, 0x00]);

    // 2. Direct property/index assignment throws TypeError
    expect(() => {
      (TM1_LOKAD_ID as unknown as number[])[0] = 0x99;
    }).toThrow(TypeError);
    expect(() => {
      (TM1_LOKAD_ID as unknown as Record<string, unknown>)["mutated"] = true;
    }).toThrow(TypeError);
    expect(TM1_LOKAD_ID[0]).toBe(0x54);

    // 3. Mutating Array methods throw TypeError
    expect(() => {
      (TM1_LOKAD_ID as unknown as number[]).push(0x99);
    }).toThrow(TypeError);
    expect(() => {
      (TM1_LOKAD_ID as unknown as number[]).pop();
    }).toThrow(TypeError);
    expect(() => {
      (TM1_LOKAD_ID as unknown as number[]).reverse();
    }).toThrow(TypeError);
    expect(() => {
      (TM1_LOKAD_ID as unknown as number[]).fill(0);
    }).toThrow(TypeError);
    expect(() => {
      (TM1_LOKAD_ID as unknown as number[]).sort();
    }).toThrow(TypeError);
    expect(() => {
      (TM1_LOKAD_ID as unknown as number[]).splice(0, 1);
    }).toThrow(TypeError);
    expect(TM1_LOKAD_ID).toEqual([0x54, 0x4d, 0x4d, 0x00]);

    // 4. No shared backing buffer: Array does not expose a typed ArrayBuffer
    expect((TM1_LOKAD_ID as unknown as { buffer?: unknown }).buffer).toBeUndefined();

    // 5. getTm1LokadId() returns fresh defensive Uint8Array instances with unshared buffers
    const copy1 = getTm1LokadId();
    const copy2 = getTm1LokadId();
    expect(copy1).toBeInstanceOf(Uint8Array);
    expect(copy2).toBeInstanceOf(Uint8Array);
    expect(copy1).not.toBe(copy2);
    expect(copy1.buffer).not.toBe(copy2.buffer);

    // Mutating copy1 directly or via its backing buffer does not alter copy2, TM1_LOKAD_ID, or future calls
    copy1[0] = 0x99;
    new Uint8Array(copy1.buffer)[1] = 0x88;
    expect(copy2[0]).toBe(0x54);
    expect(copy2[1]).toBe(0x4d);
    expect(getTm1LokadId()[0]).toBe(0x54);
    expect(TM1_LOKAD_ID[0]).toBe(0x54);
    expect(TM1_LOKAD_ID[1]).toBe(0x4d);

    // 6. Encoder still produces canonical marker bytes using private internal representation
    const encoded = encodeTm1Post({ eventData: "immutable check" });
    expect(encoded.script[0]).toBe(0x6a); // OP_RETURN
    expect(encoded.script[1]).toBe(4);    // push 4 bytes
    expect(Array.from(encoded.script.subarray(2, 6))).toEqual([0x54, 0x4d, 0x4d, 0x00]);

    // 7. Parser accepts canonical scripts and rejects mutated marker scripts
    const parsed = parseTm1Output({ valueSats: 0n, script: encoded.script });
    expect(parsed.eventData).toBe("immutable check");

    const mutatedScript = new Uint8Array(encoded.script);
    mutatedScript[2] = 0x99;
    expect(() => parseTm1Output({ valueSats: 0n, script: mutatedScript })).toThrowError(
      expect.objectContaining({ code: "INVALID_MARKER" })
    );
  });
});
