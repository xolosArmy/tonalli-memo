import { mapVerificationResult } from "./mapper.js";
import { systemClock, validateUnixSeconds, type IndexingEngineOptions, type IndexingOutcome, type IndexTransactionOptions } from "./types.js";

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
    const mappedResult = mapVerificationResult(verificationResult, txid, options.tipHeight ?? null);
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
