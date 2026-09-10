import { mapVerificationResult, type MappedAttachmentInfo } from "./mapper.js";
import { systemClock, validateUnixSeconds, type IndexingEngineOptions, type IndexingOutcome, type IndexTransactionOptions } from "./types.js";
import { parseTm1Attachment } from "../attachment/parser.js";
import { verifyNftAttachmentOwnership } from "../attachment/verifier.js";

export class IndexingEngine {
  private readonly options: IndexingEngineOptions;

  constructor(options: IndexingEngineOptions) {
    this.options = options;
  }

  async indexTransaction(txid: string, options: IndexTransactionOptions = {}): Promise<IndexingOutcome> {
    const verificationResult = await this.options.verificationService.verifyTransaction(
      txid,
      options.tipHeight === undefined ? {} : { tipHeight: options.tipHeight }
    );
    const clock = this.options.clock ?? systemClock;
    const nowSeconds = validateUnixSeconds(clock.nowSeconds());

    let attachmentInfo: MappedAttachmentInfo | null = null;
    if (verificationResult.status === "VERIFIED_TM1") {
      const parsed = parseTm1Attachment(verificationResult.memo.eventData);
      if (parsed.attachment !== null) {
        if (this.options.chronik !== undefined) {
          const ownership = await verifyNftAttachmentOwnership({
            chronik: this.options.chronik,
            authorizingAddress: verificationResult.authorizingAddress,
            attachedTokenId: parsed.attachment.tokenId,
            nowSeconds
          });
          attachmentInfo = {
            attachedTokenId: parsed.attachment.tokenId,
            attachmentOwnershipStatus: ownership.status,
            attachmentCheckedAt: ownership.checkedAt,
            attachmentOwnershipReason: ownership.reason
          };
        } else {
          attachmentInfo = {
            attachedTokenId: parsed.attachment.tokenId,
            attachmentOwnershipStatus: "UNVERIFIED",
            attachmentCheckedAt: nowSeconds,
            attachmentOwnershipReason: "chronik-unavailable"
          };
        }
      }
    }

    const mappedResult = mapVerificationResult(verificationResult, txid, options.tipHeight ?? null, attachmentInfo);
    const persisted = this.options.store.persistIndexingResult({
      mappedResult,
      nowSeconds
    });

    return {
      verificationResult,
      attemptId: persisted.attemptId,
      persistedRecord: persisted.persistedRecord
    };
  }
}
