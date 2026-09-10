const TM1_NFT_ATTACHMENT_DIRECTIVE_PATTERN = /^@nft1:([0-9a-f]{64})\n/u;

export interface Tm1AttachmentDirective {
  readonly type: "NFT";
  readonly tokenId: string;
}

export interface ParsedTm1Attachment {
  readonly rawPayload: string;
  readonly displayPayload: string;
  readonly attachment: Tm1AttachmentDirective | null;
}

/**
 * Pure parser for canonical TM1 NFT attachment directives.
 *
 * Matches strictly `^@nft1:([0-9a-f]{64})\n` at the start of rawPayload.
 * - Uppercase hex, CRLF, partial syntax, or wrong tokenId length are not matched.
 * - displayPayload strips only the recognized directive prefix.
 * - Empty body after the newline is valid (displayPayload = "").
 */
export function parseTm1Attachment(rawPayload: string): ParsedTm1Attachment {
  const match = TM1_NFT_ATTACHMENT_DIRECTIVE_PATTERN.exec(rawPayload);
  if (match === null || match[1] === undefined) {
    return {
      rawPayload,
      displayPayload: rawPayload,
      attachment: null
    };
  }

  return {
    rawPayload,
    displayPayload: rawPayload.slice(match[0].length),
    attachment: {
      type: "NFT",
      tokenId: match[1]
    }
  };
}
