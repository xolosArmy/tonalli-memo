import { describe, expect, it } from "vitest";
import { parseTm1Attachment } from "../../src/attachment/parser.js";

const VALID_TOKEN_ID = "8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8";

describe("parseTm1Attachment", () => {
  it("parses a canonical TM1 NFT attachment with text body", () => {
    const rawPayload = `@nft1:${VALID_TOKEN_ID}\nMi xolo NFT acompañando este Memo`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.rawPayload).toBe(rawPayload);
    expect(result.displayPayload).toBe("Mi xolo NFT acompañando este Memo");
    expect(result.attachment).toEqual({
      type: "NFT",
      tokenId: VALID_TOKEN_ID
    });
  });

  it("parses an attachment with an empty body", () => {
    const rawPayload = `@nft1:${VALID_TOKEN_ID}\n`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.rawPayload).toBe(rawPayload);
    expect(result.displayPayload).toBe("");
    expect(result.attachment).toEqual({
      type: "NFT",
      tokenId: VALID_TOKEN_ID
    });
  });

  it("preserves multiline body content", () => {
    const rawPayload = `@nft1:${VALID_TOKEN_ID}\nline 1\nline 2\nline 3\n`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.rawPayload).toBe(rawPayload);
    expect(result.displayPayload).toBe("line 1\nline 2\nline 3\n");
    expect(result.attachment).toEqual({
      type: "NFT",
      tokenId: VALID_TOKEN_ID
    });
  });

  it("rejects uppercase tokenId hex", () => {
    const uppercaseTokenId = VALID_TOKEN_ID.toUpperCase();
    const rawPayload = `@nft1:${uppercaseTokenId}\nTexto`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.rawPayload).toBe(rawPayload);
    expect(result.displayPayload).toBe(rawPayload);
    expect(result.attachment).toBeNull();
  });

  it("rejects mixed-case tokenId hex", () => {
    const mixedCaseTokenId = VALID_TOKEN_ID.slice(0, 60) + "ABCD";
    const rawPayload = `@nft1:${mixedCaseTokenId}\nTexto`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.rawPayload).toBe(rawPayload);
    expect(result.displayPayload).toBe(rawPayload);
    expect(result.attachment).toBeNull();
  });

  it("rejects CRLF newline separator", () => {
    const rawPayload = `@nft1:${VALID_TOKEN_ID}\r\nTexto`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.rawPayload).toBe(rawPayload);
    expect(result.displayPayload).toBe(rawPayload);
    expect(result.attachment).toBeNull();
  });

  it("rejects tokenIds with length != 64", () => {
    const tooShort = VALID_TOKEN_ID.slice(0, 63);
    const tooLong = VALID_TOKEN_ID + "0";

    const resShort = parseTm1Attachment(`@nft1:${tooShort}\nTexto`);
    expect(resShort.attachment).toBeNull();
    expect(resShort.displayPayload).toBe(`@nft1:${tooShort}\nTexto`);

    const resLong = parseTm1Attachment(`@nft1:${tooLong}\nTexto`);
    expect(resLong.attachment).toBeNull();
    expect(resLong.displayPayload).toBe(`@nft1:${tooLong}\nTexto`);
  });

  it("rejects directives not located at the start of rawPayload", () => {
    const rawPayload = `Hola @nft1:${VALID_TOKEN_ID}\nTexto`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.attachment).toBeNull();
    expect(result.displayPayload).toBe(rawPayload);
  });

  it("rejects unknown or invalid directive prefixes", () => {
    expect(parseTm1Attachment(`@nft2:${VALID_TOKEN_ID}\nTexto`).attachment).toBeNull();
    expect(parseTm1Attachment(`nft1:${VALID_TOKEN_ID}\nTexto`).attachment).toBeNull();
    expect(parseTm1Attachment(`@nft:${VALID_TOKEN_ID}\nTexto`).attachment).toBeNull();
  });

  it("rejects directives missing a trailing newline", () => {
    const rawPayload = `@nft1:${VALID_TOKEN_ID}`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.attachment).toBeNull();
    expect(result.displayPayload).toBe(rawPayload);
  });

  it("rejects space separator instead of newline", () => {
    const rawPayload = `@nft1:${VALID_TOKEN_ID} Texto`;
    const result = parseTm1Attachment(rawPayload);

    expect(result.attachment).toBeNull();
    expect(result.displayPayload).toBe(rawPayload);
  });

  it("returns rawPayload as displayPayload when no directive is present", () => {
    const rawPayload = "Un memo normal sin ningun attachment";
    const result = parseTm1Attachment(rawPayload);

    expect(result.rawPayload).toBe(rawPayload);
    expect(result.displayPayload).toBe(rawPayload);
    expect(result.attachment).toBeNull();
  });
});
