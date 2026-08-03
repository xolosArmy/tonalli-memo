import { describe, expect, it } from "vitest";

import {
  isTm1CandidateScript,
  isTm1ErrorCode,
  isTm1ProtocolError,
  parseTm1Output,
  TM1_ERROR_CODES,
  type Tm1ErrorCode
} from "../src/index.js";
import vectors from "../tm1-test-vectors.json" with { type: "json" };

const OP_RETURN = 0x6a;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;

const TM1_LOKAD_ID = Uint8Array.of(0x54, 0x4d, 0x4d, 0x00);
const TEXT_ENCODER = new TextEncoder();

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce(
    (sum, chunk) => sum + chunk.length,
    0
  );

  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function repeatedByte(value: number, count: number): Uint8Array {
  return new Uint8Array(count).fill(value);
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/u.test(hex)) {
    throw new Error(`Invalid lowercase even-length hex: ${hex}`);
  }

  const result = new Uint8Array(hex.length / 2);

  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(
      hex.slice(index * 2, index * 2 + 2),
      16
    );
  }

  return result;
}

function encodeMinimalPush(data: Uint8Array): Uint8Array {
  if (data.length >= 1 && data.length <= 75) {
    return concatBytes(bytes(data.length), data);
  }

  if (data.length >= 76 && data.length <= 255) {
    return concatBytes(bytes(OP_PUSHDATA1, data.length), data);
  }

  throw new Error(`Unsupported test push length: ${data.length}`);
}

function tm1Envelope(
  eventData: Uint8Array,
  version = 0x01,
  eventType = 0x01,
  authorInputIndex = 0
): Uint8Array {
  return concatBytes(
    bytes(version, eventType, authorInputIndex),
    eventData
  );
}

function tm1Script(
  eventData: Uint8Array,
  version = 0x01,
  eventType = 0x01,
  authorInputIndex = 0
): Uint8Array {
  return concatBytes(
    bytes(OP_RETURN),
    encodeMinimalPush(TM1_LOKAD_ID),
    encodeMinimalPush(
      tm1Envelope(
        eventData,
        version,
        eventType,
        authorInputIndex
      )
    )
  );
}

function expectTm1Error(
  action: () => unknown,
  expectedCode: Tm1ErrorCode
): void {
  let caught: unknown;

  try {
    action();
  } catch (error: unknown) {
    caught = error;
  }

  if (!isTm1ProtocolError(caught)) {
    throw new Error(
      `Expected Tm1ProtocolError with code ${expectedCode}.`
    );
  }

  expect(caught.code).toBe(expectedCode);
}

describe("TM1 public error contract", () => {
  it("contains unique canonical parser error codes", () => {
    expect(new Set(TM1_ERROR_CODES).size).toBe(
      TM1_ERROR_CODES.length
    );

    for (const code of TM1_ERROR_CODES) {
      expect(isTm1ErrorCode(code)).toBe(true);
    }

    expect(isTm1ErrorCode("INVALID_AUTHOR_SIGNATURE")).toBe(false);
    expect(isTm1ErrorCode(null)).toBe(false);
  });
});

describe("TM1 canonical wire vectors", () => {
  for (const vector of vectors.valid) {
    it(`parses valid vector: ${vector.name}`, () => {
      const script = hexToBytes(vector.scriptHex);

      expect(isTm1CandidateScript(script)).toBe(true);

      const parsed = parseTm1Output({
        valueSats: 0n,
        script
      });

      const expectedEventDataBytes =
        TEXT_ENCODER.encode(vector.eventDataUtf8);

      expect(parsed.protocol).toBe("TM1");
      expect(parsed.version).toBe(vector.version);
      expect(parsed.eventType).toBe(vector.eventType);
      expect(parsed.eventTypeCode).toBe(0x01);
      expect(parsed.authorInputIndex).toBe(
        vector.authorInputIndex
      );
      expect(parsed.eventData).toBe(vector.eventDataUtf8);
      expect(parsed.eventDataByteLength).toBe(
        vector.eventDataByteLength
      );
      expect(Array.from(parsed.eventDataBytes)).toEqual(
        Array.from(expectedEventDataBytes)
      );
      expect(parsed.scriptByteLength).toBe(script.length);
    });
  }

  for (const vector of vectors.invalid) {
    it(`rejects invalid vector: ${vector.name}`, () => {
      const expectedCode = vector.expected.errorCode;

      expect(isTm1ErrorCode(expectedCode)).toBe(true);

      if (!isTm1ErrorCode(expectedCode)) {
        throw new Error(
          `Unknown TM1 vector error code: ${expectedCode}`
        );
      }

      const script = hexToBytes(vector.scriptHex);

      expect(isTm1CandidateScript(script)).toBe(true);

      expectTm1Error(
        () => parseTm1Output({ valueSats: 0n, script }),
        expectedCode
      );
    });
  }

  it("covers direct-push, PUSHDATA1 and maximum script boundaries", () => {
    const direct = vectors.valid.find(
      (vector) => vector.name ===
        "72 byte event_data uses direct push"
    );
    const pushData1 = vectors.valid.find(
      (vector) => vector.name ===
        "73 byte event_data uses OP_PUSHDATA1"
    );
    const maximum = vectors.valid.find(
      (vector) => vector.name ===
        "212 byte maximum event_data"
    );

    expect(direct).toBeDefined();
    expect(pushData1).toBeDefined();
    expect(maximum).toBeDefined();

    if (
      direct === undefined ||
      pushData1 === undefined ||
      maximum === undefined
    ) {
      throw new Error("Required TM1 boundary vectors are missing.");
    }

    expect(hexToBytes(direct.scriptHex)[6]).toBe(75);
    expect(hexToBytes(pushData1.scriptHex)[6]).toBe(
      OP_PUSHDATA1
    );
    expect(hexToBytes(pushData1.scriptHex)[7]).toBe(76);
    expect(hexToBytes(maximum.scriptHex)).toHaveLength(223);
  });
});

describe("TM1 candidate recognition", () => {
  it("rejects scripts without a successfully decoded marker push", () => {
    expect(isTm1CandidateScript(new Uint8Array())).toBe(false);
    expect(isTm1CandidateScript(bytes(OP_RETURN))).toBe(false);
    expect(
      isTm1CandidateScript(bytes(OP_RETURN, 0x04, 0x54, 0x4d))
    ).toBe(false);
    expect(
      isTm1CandidateScript(
        concatBytes(
          bytes(OP_RETURN, 0x04),
          Uint8Array.of(0x54, 0x4d, 0x31, 0x00)
        )
      )
    ).toBe(false);
  });

  it("remains a candidate when bytes after the marker are malformed", () => {
    const markerOnly = concatBytes(
      bytes(OP_RETURN),
      encodeMinimalPush(TM1_LOKAD_ID)
    );

    expect(isTm1CandidateScript(markerOnly)).toBe(true);
    expect(
      isTm1CandidateScript(
        concatBytes(markerOnly, bytes(OP_PUSHDATA1))
      )
    ).toBe(true);
  });

  it("recognizes a marker encoded by a non-minimal data push", () => {
    const envelope = encodeMinimalPush(
      tm1Envelope(bytes(0x61))
    );

    const pushData1Marker = concatBytes(
      bytes(OP_RETURN, OP_PUSHDATA1, 0x04),
      TM1_LOKAD_ID,
      envelope
    );

    const pushData2Marker = concatBytes(
      bytes(OP_RETURN, OP_PUSHDATA2, 0x04, 0x00),
      TM1_LOKAD_ID,
      envelope
    );

    const pushData4Marker = concatBytes(
      bytes(
        OP_RETURN,
        OP_PUSHDATA4,
        0x04,
        0x00,
        0x00,
        0x00
      ),
      TM1_LOKAD_ID,
      envelope
    );

    expect(isTm1CandidateScript(pushData1Marker)).toBe(true);
    expect(isTm1CandidateScript(pushData2Marker)).toBe(true);
    expect(isTm1CandidateScript(pushData4Marker)).toBe(true);

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: pushData1Marker
      }),
      "INVALID_FORMAT"
    );

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: pushData2Marker
      }),
      "INVALID_FORMAT"
    );

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: pushData4Marker
      }),
      "INVALID_FORMAT"
    );
  });
});

describe("TM1 structural validation", () => {
  it("reports INVALID_MARKER for non-candidates", () => {
    const wrongMarker = concatBytes(
      bytes(OP_RETURN, 0x04),
      Uint8Array.of(0x54, 0x4d, 0x31, 0x00)
    );

    const shortMarker = concatBytes(
      bytes(OP_RETURN, 0x03),
      Uint8Array.of(0x54, 0x4d, 0x4d)
    );

    const longMarker = concatBytes(
      bytes(OP_RETURN, 0x05),
      TM1_LOKAD_ID,
      bytes(0x00)
    );

    for (const script of [
      new Uint8Array(),
      bytes(0x51),
      bytes(OP_RETURN),
      bytes(OP_RETURN, 0x04, 0x54, 0x4d),
      wrongMarker,
      shortMarker,
      longMarker
    ]) {
      expectTm1Error(
        () => parseTm1Output({ valueSats: 0n, script }),
        "INVALID_MARKER"
      );
    }
  });

  it("requires a second data push after a valid marker", () => {
    const markerOnly = concatBytes(
      bytes(OP_RETURN),
      encodeMinimalPush(TM1_LOKAD_ID)
    );

    const secondOpZero = concatBytes(markerOnly, bytes(0x00));

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: markerOnly
      }),
      "INVALID_FORMAT"
    );

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: secondOpZero
      }),
      "INVALID_FORMAT"
    );
  });

  it("rejects envelopes shorter than the three-byte header", () => {
    const markerPrefix = concatBytes(
      bytes(OP_RETURN),
      encodeMinimalPush(TM1_LOKAD_ID)
    );

    for (const envelope of [
      bytes(0x01),
      bytes(0x01, 0x01)
    ]) {
      const script = concatBytes(
        markerPrefix,
        encodeMinimalPush(envelope)
      );

      expectTm1Error(
        () => parseTm1Output({ valueSats: 0n, script }),
        "INVALID_FORMAT"
      );
    }
  });

  it("distinguishes empty event data", () => {
    const script = concatBytes(
      bytes(OP_RETURN),
      encodeMinimalPush(TM1_LOKAD_ID),
      encodeMinimalPush(bytes(0x01, 0x01, 0x00))
    );

    expectTm1Error(
      () => parseTm1Output({ valueSats: 0n, script }),
      "EMPTY_EVENT_DATA"
    );
  });

  it("rejects unsupported versions and event types", () => {
    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: tm1Script(bytes(0x61), 0x02)
      }),
      "UNSUPPORTED_VERSION"
    );

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: tm1Script(bytes(0x61), 0x01, 0x02)
      }),
      "UNSUPPORTED_EVENT_TYPE"
    );

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: tm1Script(bytes(0x61), 0x01, 0x03)
      }),
      "UNSUPPORTED_EVENT_TYPE"
    );
  });

  it("rejects invalid UTF-8 without replacement decoding", () => {
    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: tm1Script(bytes(0xff))
      }),
      "INVALID_UTF8"
    );
  });

  it("rejects non-minimal second pushes", () => {
    const markerPrefix = concatBytes(
      bytes(OP_RETURN),
      encodeMinimalPush(TM1_LOKAD_ID)
    );
    const envelope = tm1Envelope(bytes(0x61));

    const pushData1 = concatBytes(
      markerPrefix,
      bytes(OP_PUSHDATA1, envelope.length),
      envelope
    );

    const pushData2 = concatBytes(
      markerPrefix,
      bytes(
        OP_PUSHDATA2,
        envelope.length,
        0x00
      ),
      envelope
    );

    const pushData4 = concatBytes(
      markerPrefix,
      bytes(
        OP_PUSHDATA4,
        envelope.length,
        0x00,
        0x00,
        0x00
      ),
      envelope
    );

    for (const script of [pushData1, pushData2, pushData4]) {
      expectTm1Error(
        () => parseTm1Output({ valueSats: 0n, script }),
        "INVALID_FORMAT"
      );
    }
  });

  it("rejects truncated push headers and payloads", () => {
    const markerPrefix = concatBytes(
      bytes(OP_RETURN),
      encodeMinimalPush(TM1_LOKAD_ID)
    );

    const missingPushData1Length =
      concatBytes(markerPrefix, bytes(OP_PUSHDATA1));

    const truncatedDirectPush = concatBytes(
      markerPrefix,
      bytes(0x05, 0x01, 0x01, 0x00, 0x61)
    );

    const truncatedPushData1 = concatBytes(
      markerPrefix,
      bytes(OP_PUSHDATA1, 0x08, 0x01, 0x01, 0x00)
    );

    for (const script of [
      missingPushData1Length,
      truncatedDirectPush,
      truncatedPushData1
    ]) {
      expectTm1Error(
        () => parseTm1Output({ valueSats: 0n, script }),
        "INVALID_FORMAT"
      );
    }
  });

  it("rejects additional pushes and trailing non-push opcodes", () => {
    const valid = tm1Script(bytes(0x61));

    const thirdPush = concatBytes(
      valid,
      encodeMinimalPush(bytes(0x00))
    );

    const trailingOpcode = concatBytes(valid, bytes(0x51));

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: thirdPush
      }),
      "INVALID_FORMAT"
    );

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script: trailingOpcode
      }),
      "INVALID_FORMAT"
    );
  });

  it("maps non-zero TM1 output value to INVALID_FORMAT", () => {
    const script = tm1Script(bytes(0x61));

    expect(isTm1CandidateScript(script)).toBe(true);

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 1n,
        script
      }),
      "INVALID_FORMAT"
    );
  });

  it("rejects event_data above 212 bytes and scripts above 223 bytes", () => {
    const script = tm1Script(repeatedByte(0x61, 213));

    expect(script).toHaveLength(224);
    expect(isTm1CandidateScript(script)).toBe(true);

    expectTm1Error(
      () => parseTm1Output({
        valueSats: 0n,
        script
      }),
      "PAYLOAD_TOO_LARGE"
    );
  });

  it("accepts author_input_index 255", () => {
    const script = tm1Script(
      bytes(0x61),
      0x01,
      0x01,
      0xff
    );

    const parsed = parseTm1Output({
      valueSats: 0n,
      script
    });

    expect(parsed.authorInputIndex).toBe(255);
  });

  it("preserves spaces, line endings and exact event bytes", () => {
    const eventDataBytes =
      bytes(0x20, 0x0d, 0x0a, 0x20, 0x61, 0x20);

    const parsed = parseTm1Output({
      valueSats: 0n,
      script: tm1Script(eventDataBytes)
    });

    expect(parsed.eventData).toBe(" \r\n a ");
    expect(Array.from(parsed.eventDataBytes)).toEqual(
      Array.from(eventDataBytes)
    );
  });
});

describe("TM1 defensive copies", () => {
  it("does not expose a view into the original script", () => {
    const originalScript = tm1Script(bytes(0x61));
    const parsed = parseTm1Output({
      valueSats: 0n,
      script: originalScript
    });

    originalScript[originalScript.length - 1] = 0x62;

    expect(parsed.eventData).toBe("a");
    expect(Array.from(parsed.eventDataBytes)).toEqual([0x61]);
  });

  it("does not share event buffers across parse results", () => {
    const scriptHex = "6a04544d4d000401010061";

    const first = parseTm1Output({
      valueSats: 0n,
      script: hexToBytes(scriptHex)
    });

    first.eventDataBytes[0] = 0x00;

    const second = parseTm1Output({
      valueSats: 0n,
      script: hexToBytes(scriptHex)
    });

    expect(second.eventData).toBe("a");
    expect(Array.from(second.eventDataBytes)).toEqual([0x61]);
    expect(second.eventDataBytes).not.toBe(first.eventDataBytes);
  });
});
