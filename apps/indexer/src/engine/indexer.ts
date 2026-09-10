import { mapVerificationResult, type MappedAttachmentInfo } from "./mapper.js";
import { systemClock, validateUnixSeconds, type IndexingEngineOptions, type IndexingOutcome, type IndexTransactionOptions } from "./types.js";
import { parseTm1Attachment } from "../attachment/parser.js";
import {
  verifyNftAttachmentOwnership,
  type AttachmentOwnershipReason,
  type AttachmentOwnershipStatus
} from "../attachment/verifier.js";

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
        const existingRecord = this.options.store.getVerificationRecord(txid);
        const hasPriorPositiveOwnership =
          existingRecord !== null &&
          existingRecord.attachedTokenId === parsed.attachment.tokenId &&
          existingRecord.attachmentOwnershipStatus === "VERIFIED_AT_INDEXING";

        let currentStatus: AttachmentOwnershipStatus = "UNVERIFIED";
        let currentCheckedAt = nowSeconds;
        let currentReason: AttachmentOwnershipReason = "chronik-unavailable";

        if (this.options.chronik !== undefined) {
          const ownership = await verifyNftAttachmentOwnership({
            chronik: this.options.chronik,
            authorizingAddress: verificationResult.authorizingAddress,
            attachedTokenId: parsed.attachment.tokenId,
            nowSeconds
          });
          currentStatus = ownership.status;
          currentCheckedAt = ownership.checkedAt;
          currentReason = ownership.reason;
        }

        if (hasPriorPositiveOwnership) {
          // Ownership evidence must be monotonic for the same txid + attachedTokenId.
          // VERIFIED_AT_INDEXING -> UNVERIFIED is forbidden.
          // A positive observation already persisted survives unconfirmed->confirmed,
          // manual reindex, subsequent transfer, and chronik failure/downtime.
          attachmentInfo = {
            attachedTokenId: parsed.attachment.tokenId,
            attachmentOwnershipStatus: "VERIFIED_AT_INDEXING",
            attachmentCheckedAt: existingRecord.attachmentCheckedAt ?? currentCheckedAt,
            attachmentOwnershipReason: "token-owned-and-verified-nft1-child"
          };
        } else {
          attachmentInfo = {
            attachedTokenId: parsed.attachment.tokenId,
            attachmentOwnershipStatus: currentStatus,
            attachmentCheckedAt: currentCheckedAt,
            attachmentOwnershipReason: currentReason
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
