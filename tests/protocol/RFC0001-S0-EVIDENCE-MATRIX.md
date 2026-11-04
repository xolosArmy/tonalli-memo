# RFC-0001 S0 and M1.7.4 evidence matrix

Status of this file: audit record on PR #41. It adds no protocol behavior.
The normative source is PR #40 at `45ad15aa157a25f7f8e616682ccbfffad974e15c`.
The evidence snapshot is PR #41 at `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
plus the audit commit that adds this file. PR #42 is read at
`081d75a762889207283ab7d4434030db30c79b41` and is not modified.

RFC-0001 remains PROPOSED — NOT RATIFIED. SEC-17 production mitigation
remains pending. M1.7.4 remains OPEN. S0 remains OPEN. S1 remains
NOT AUTHORIZED. Social version `0x02` stays inactive.

## Status rule

Each row uses one of four statuses.

- `LAB_VALIDATED` means the row's own normative scope is a laboratory or
  repository-fixture check, and the cited test covers that scope.
  LAB_VALIDATED does not close the parent gate.
- `PARTIAL` means some cited evidence exists and at least one clause of the
  sentence is unmet. A synthetic or archival result does not meet a clause
  that requires regtest, mainnet, or production behavior.
- `NOT_DEMONSTRATED` means no cited execution covers the normative sentence.
- `BLOCKED` means a new governance decision is required before work toward
  the sentence can proceed. Evidence in the row does not remove the block.

A row about a regtest pair, a mainnet sample, or production `packages/`
behavior stays `PARTIAL`, `NOT_DEMONSTRATED`, or `BLOCKED` when the cited
execution is only a synthetic fixture. `PARTIAL` does not mean the unmet
clause has been met.

## Receipt index

Every commit below is an ancestor of the commit that publishes this
matrix, except `R-RFC` and `R-PR42`, which are the heads of the other
two draft PRs. `R-REACTION` is the laboratory snapshot for the reaction fixtures,
including the later-batch order repair. `R-TIPXEC` is the laboratory
snapshot for the native TIP_XEC fixtures, including the non-designated
funding and target-binding checks. `R-REPLY` is the laboratory
snapshot for the social v2 REPLY fixtures, including independent encoders and
decoders, thread replay, and target parent resolution. Their CI run, job, and Codex
columns are `unreviewed`.
Those cells are not a Codex receipt and they are not a CI result.
A Codex receipt contains `codex-review-receipt:v1` and a Reviewed
commit line. The receipt names that commit. It is not a review of a
later SHA. A row may cite more than one receipt. Every file named in
that row's evidence exists in at least one cited tree. An earlier
receipt does not cover a file added later. M1.10.1: a summary of no
major issues is short of protocol proof. CI job name is `test`.

| Key | Commit | CI run | Job | Codex comment | Reviewed | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `R-REGTEST` | `efe60360b4a276465975b603b833a8eb15f8e080` | 40920508207 | 123612128527 | 6503605241 | `efe60360b4` | no major issues; 2026-10-29T17:22:22Z |
| `R-BASELINE` | `907ba8a2b5f68d346e863187508f7ea5fa3ec070` | 41093546776 | 124193314679 | 6528344102 | `907ba8a2b5` | no major issues; 2026-10-30T16:52:32Z |
| `R-CANONICAL` | `af445925031630918cfdff3399be629a3b95793e` | 41103874545 | 124227829678 | 6530019849 | `af44592503` | no major issues; 2026-10-30T18:07:44Z |
| `R-D07` | `7796b3364a762013baa313b15e94ce48bfeacd88` | 41142525971 | 124359948447 | 6535420956 | `7796b3364a` | no major issues; 2026-10-30T23:08:54Z |
| `R-EMPP` | `72bd470df8e24eacdaaca59e83d9bea98badf272` | 41237252362 | 124643502607 | 6548510244 | `72bd470df8` | no major issues; 2026-10-31T20:07:20Z |
| `R-DISPATCH` | `a8130df67b46af2b0a589352d81c132ead3cb551` | 41318134086 | 124882444910 | 6559547625 | `a8130df67b` | no major issues; 2026-11-01T14:51:23Z |
| `R-COEX` | `6fbcbaa7996be8b001f4fd71257ad84f1b82ad63` | 41323455587 | 124898356165 | 6560279996 | `6fbcbaa799` | no major issues; 2026-11-01T15:54:59Z |
| `R-BURN` | `028d5c986f0d9ebdb9cfad092c813325d2274f88` | 41329832992 | 124917402267 | 6561174444 | `028d5c986f` | no major issues; 2026-11-01T17:11:08Z |
| `R-BIND` | `7308a3d51b5e607825ec05720611db0c79e5c19e` | 41332881781 | 124926491561 | 6561578581 | `7308a3d51b` | no major issues; 2026-11-01T17:45:59Z |
| `R-PREVOUT` | `27a22416059cc5f6aa5cc4b11723186f23fe6b91` | 41369658945 | 125037186957 | 6566525944 | `27a2241605` | no major issues; 2026-11-02T00:57:16Z |
| `R-REPLAY` | `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e` | 41388880882 | 125095690970 | 6569120767 | `c9ec63fbea` | no major issues; 2026-11-02T04:32:38Z |
| `R-REACTION` | `069ab86428dc17a76ce79e6669f27a2f5121cfb1` | unreviewed | unreviewed | unreviewed | unreviewed | snapshot only; this cell is not a Codex receipt |
| `R-TIPXEC` | `df7939b59068da46685010fca87943b6cb2d501a` | unreviewed | unreviewed | unreviewed | unreviewed | snapshot only; this cell is not a Codex receipt |
| `R-REPLY` | `5fb5ae863589a4be2c145b2452214f8db8765d37` | unreviewed | unreviewed | unreviewed | unreviewed | snapshot only; this cell is not a Codex receipt |
| `R-RFC` | `45ad15aa157a25f7f8e616682ccbfffad974e15c` | 41321121026 | 124891368477 | 6559961738 | `45ad15aa15` | no major issues on PR #40; 2026-11-01T15:26:35Z |
| `R-PR42` | `081d75a762889207283ab7d4434030db30c79b41` | 40917165744 | 123600365247 | 6503170078 | `081d75a762` | no major issues on PR #42; 2026-10-29T17:02:43Z |

Additional review ids, cited by rows that name them:

- Review `5728681059` on `b4ba187bad512f14694a9db2e8087a9053e2e714` required
  the authorization gate to reject a `NO_MEMO` result that still retained a
  memo. That gate is in `a8130df67b46af2b0a589352d81c132ead3cb551`.
- Review `5729233688` on `9dc05e054df1f802010c281b4fa40854f5a8a35d` opened P2
  `4436535560`. Later commits close it. CI run `41328714114`, job `124914052373`.
- Review `5729264637` on `0e97240d62276ace9635234d783d69a052793382` opened P2
  `4436560818` and P2 `4436560821`. CI run `41329229083`, job `124915606405`.
- Review `5729375258` on `fc90999146aa12fb8874da41409d18dc281a9f20` opened P2
  `4436660797` and P2 `4436660805`. CI run `41331923544`, job `124923644434`.
- Review `5732062351` on `5229b48c73df61e36889b40d25c37cb9314d1799` opened P2
  `4438888650`. CI run `41387866877`, job `125092605066`. The fix commit is
  `R-REPLAY`. Reply `4438930243` records the fix. The thread is resolved.

## Frozen bytes at the evidence snapshot

These digests were recomputed from the files at
`c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`. This audit does not regenerate
them.

| File | SHA-256 |
| --- | --- |
| `tests/fixtures/rfc0001-empp-tmm.json` | `3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8` |
| `tests/fixtures/rfc0001-empp-sec17-decisions.json` | `76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca` |
| `tests/fixtures/rfc0001-sec17-dispatch-matrix.json` | `24ae49302406bd9f2793f749fa96235d1ea6c368c03a72f850c96208d49c5633` |
| `tests/fixtures/rfc0001-alp-ancestry.json` | `5f5dbd942df0d12a1626830e8bbdbd3100770e2aec508b6a872a2e4c74b8bec8` |
| `tests/fixtures/rfc0001-alp-replay.json` | `443a8d07171a8c9e28008808f7f854cf22688f0e41fa7c577a9fc8b48d772712` |
| `tests/fixtures/rfc0001-mainnet-tm1-d07.json` | `53afea6a140146e3e483074b5c9ab36d1dac684c4ff58300a8cc8a1e93baed08` |
| `tests/fixtures/rfc0001-canonical-tm1-p2pkh.json` | `dad39e8b3b8965eda6c6241e3a822c2aace88abd51bdfbd765e2758f15f3e694` |
| `tests/fixtures/rfc0001-sec17-coexistence.json` | `8913aa8643b1553e7cd5e29b92e54c9ee83de2245aedbf80de91d6b0d05ec883` |
| `tests/fixtures/rfc0001_regtest_reference.json` | `b4fe3c176eac1144cd9b625c2daf65f09be2a4e060090eee5703a2d8b06f4bbf` |

The dispatch matrix has 127 rows. The 113 rows whose `corpus` is not
`sec17-coexistence` keep legacy change counts 63 `UNCHANGED`, 25
`AUTHORIZED_A`, 13 `AUTHORIZED_E`, 7 `AUTHORIZED_D`, 3 `AUTHORIZED_C`,
1 `AUTHORIZED_A_C`, and 1 `AUTHORIZED_B`. Their `JSON.stringify` digest,
locked by the dispatch and ancestry tests, is
`5f0a801d218a40624646a6fef7c8bfff3ebead122fdc81fecbd9288c93e4d3f2`.
The 14-row extension is 6 `B_TRUSTED_CHRONIK_UNPROVEN`, 4
`AUTHORIZED_B_LAB_CRYPTO`, 2 `AUTHORIZED_B`, and 2 `AUTHORIZED_A`.
All 127 settlements are `PENDING`. The extension does not rewrite the
113-row prototype claim recorded at `a8130df67b46af2b0a589352d81c132ead3cb551`.
Zero rows are `BLOCKED` inside that matrix. That word there is a dispatch
outcome. It is different from the status `BLOCKED` in this audit.

`tests/fixtures/rfc0001_regtest_reference.json` was left unchanged. Its
pending-reason strings still describe the regtest pair. Later laboratory
fixtures live in other files. Those reason strings are not a current
inventory of the whole repository.

## 1. Requirements

Normative wording is taken from PR #40. The evidence paths are on PR #41
unless the row names PR #42.

### `M174-ALL-COMBINATIONS`

- **Normative text:** Before acceptance, the repository MUST contain machine-readable positive and negative fixtures with fixed raw bytes, deterministic verdicts, and an independent encoder and decoder for every supported event and container combination, including ALP/eMPP (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001-canonical-tm1-p2pkh.json` exercised by `rfc0001_s0_07_historical.test.ts` `it("checks serialization, envelope, structure, trusted-chronik, and the independent signature")`. `tests/fixtures/rfc0001-empp-tmm.json` exercised by `rfc0001_empp_tmm.test.ts` `it("keeps the required cases and separates structural axes from production acceptance")`. `tests/fixtures/rfc0001-alp-ancestry.json` exercised by `rfc0001_alp_ancestry.test.ts` `it("proves a synthetic GENESIS, MINT and SEND chain that is not RMZ")`. `tests/fixtures/rfc0001-reactions.json` exercised by `rfc0001_reactions.test.ts` `it("accepts a 43-byte reaction script and Core still rejects version 0x02")`. `tests/fixtures/rfc0001-tip-xec.json` exercised by `rfc0001_tip_xec.test.ts` `it("accepts a 42-byte tip script and Core still rejects version 0x02")`. `tests/fixtures/rfc0001-reply.json` exercised by `rfc0001_reply.test.ts` `it("accepts 43..223 byte reply scripts and Core still rejects version 0x02")`.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`; `069ab86428dc17a76ce79e6669f27a2f5121cfb1`; `df7939b59068da46685010fca87943b6cb2d501a`; `5fb5ae863589a4be2c145b2452214f8db8765d37`
- **CI / Codex:** `R-BURN`, `R-REACTION`, `R-TIPXEC`, `R-REPLY`
- **Trust model:** Independent laboratory checker for canonical TM1. Structural eMPP corpus is unsigned. Synthetic ALP chain uses laboratory token `79dee0245d45dc842e82aa37f639c325b8c62cc5d151fc7778a33f5e1c20e251`. The reaction, tip, and reply corpora are separate laboratories. `R-REACTION`, `R-TIPXEC`, and `R-REPLY` are not Codex receipts.
- **Still required:** The TIP_XEC laboratory covers the native two-push script only. The reaction laboratory covers REACTION and REACTION_REMOVE only. The reply laboratory is an in-memory synthetic suite. The ALP corpus is one synthetic token. A complete combination matrix remains required before M1.7.4 can be accepted.

### `M174-PARSER-NOT-SETTLEMENT`

- **Normative text:** A parser-only success is insufficient for TIP settlement (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_alp_ancestry.test.ts` `it("separates container, chain, authorship, amount and settlement")` keeps `confirmation` and `settlement` at `NOT_DEMONSTRATED` and `realRmzTip` false. Every row of `tests/fixtures/rfc0001-sec17-dispatch-matrix.json` has `settlement` `PENDING`.
- **Commit:** `7308a3d51b5e607825ec05720611db0c79e5c19e`
- **CI / Codex:** `R-BIND`
- **Trust model:** Synthetic laboratory receipts. The positive laboratory label is `LABORATORY_ATTRIBUTED` with receipt state `PENDING`. Production `TipReceipt` settlement is a separate layer.
- **Still required:** An on-chain tip that settles under an active-chain rule remains required. This row records that parser success is kept distinct from settlement inside the laboratory fixtures.

### `M174-SCRIPT-LENGTHS`

- **Normative text:** Acceptance MUST separately prove deterministic script lengths (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_empp_tmm.test.ts` `it("shows the byte-budget disappearance separately from the independent section parse")`. `rfc0001_s0_07_historical.test.ts` `it("keeps the generated 80-byte and 81-byte boundaries owned by the existing suite")`. Canonical fixture lengths are rechecked by `it("rechecks the committed JSON against the isolated generator")`. `rfc0001_reactions.test.ts` `it("accepts a 43-byte reaction script and Core still rejects version 0x02")` measures the 43-byte REACTION and REACTION_REMOVE scripts in `tests/fixtures/rfc0001-reactions.json`. `rfc0001_tip_xec.test.ts` `it("accepts a 42-byte tip script and Core still rejects version 0x02")` measures the 42-byte TIP_XEC scripts in `tests/fixtures/rfc0001-tip-xec.json`. `rfc0001_reply.test.ts` `it("accepts 43..223 byte reply scripts and Core still rejects version 0x02")` measures the 43 to 223 byte REPLY scripts in `tests/fixtures/rfc0001-reply.json`.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`; `069ab86428dc17a76ce79e6669f27a2f5121cfb1`; `df7939b59068da46685010fca87943b6cb2d501a`; `5fb5ae863589a4be2c145b2452214f8db8765d37`
- **CI / Codex:** `R-EMPP`, `R-REACTION`, `R-TIPXEC`, `R-REPLY`
- **Trust model:** Ratified parser bytes on stored scripts, plus the independent eMPP reader. The 223-byte TM0 text stays a candidate. Scripts past that budget take the public `NO_MEMO` path. The 43-byte reaction measurement, 42-byte tip measurement, and 43..223-byte reply measurement are laboratory evidence. `R-REACTION`, `R-TIPXEC`, and `R-REPLY` are not Codex receipts.
- **Still required:** A productive ALP/eMPP tip profile remains required. The reaction, tip, and reply script lengths do not close this row.

### `M174-SIG-PREVOUT`

- **Normative text:** Acceptance MUST separately prove validated signature and prevout rules (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` canonical TM1 case, including `negative-signature-altered`, `negative-prevout-amount`, `negative-prevout-missing`, and `negative-pubkey-hash-mismatch`. `rfc0001_alp_ancestry.test.ts` `it("binds historical prevouts instead of fixture metadata")`. `rfc0001_sec17_coexistence.test.ts` `it("does not grant authorship when the signature, prevout, author index, or committed output is altered")`.
- **Commit:** `27a22416059cc5f6aa5cc4b11723186f23fe6b91`
- **CI / Codex:** `R-PREVOUT`
- **Trust model:** Independent laboratory BIP143/ForkID for the cited fixtures. Production `verifyTm1DesignatedInput` checks index, prevout, P2PKH, scriptSig, HASH160, and sighash, and stops before the sighash digest. `trustModel: trusted-chronik` is the production label.
- **Still required:** The production helper still has to grow an independent digest check before this sentence is met for production verification. Wallet preview of the signed bytes remains required.

### `M174-ACTIVE-TARGET`

- **Normative text:** Acceptance MUST separately prove active-chain target resolution (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_regtest_reference.test.mjs` `test("display-order parent bytes, authorship and spent output match the raw transactions")` records one regtest parent link. `rfc0001_alp_replay.test.ts` `it("rolls a branch back to the ancestor and applies the other branch once")` moves laboratory receipts to `NOT_ON_ACTIVE_CHAIN`. `tests/fixtures/rfc0001-reply.json` exercised by `rfc0001_reply.test.ts` `it("separates valid authorship from a verified parent link")` classifies parent links against active targets.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`; `5fb5ae863589a4be2c145b2452214f8db8765d37`
- **CI / Codex:** `R-REPLAY`, `R-REPLY`
- **Trust model:** The regtest pair is an isolated Bitcoin ABC 0.34.2 observation. The branch switch is a synthetic checkpoint in process memory. The reply laboratory verifies parent links in memory. `R-REPLY` is not a Codex receipt.
- **Still required:** Resolution of a target against a selected network active chain, including a parent that leaves that chain, remains required.

### `M174-TOKEN-ANCESTRY`

- **Normative text:** Acceptance MUST separately prove token ancestry (M1.7.4). The same section lists ALP ancestry and token validity as an explicit S0 blocker.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_alp_ancestry.test.ts` `it("proves a synthetic GENESIS, MINT and SEND chain that is not RMZ")` and `it("regenerates the synthetic chain without a node or a private key")`.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`
- **CI / Codex:** `R-BURN`
- **Trust model:** Synthetic laboratory ancestry. Token id `79dee0245d45dc842e82aa37f639c325b8c62cc5d151fc7778a33f5e1c20e251`. Public RMZ id `c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908` is recorded as identity and is a different token. `realRmzGenealogy` stays `NOT_DEMONSTRATED`.
- **Still required:** A genealogy of the public RMZ token on mainnet remains required. The synthetic chain cannot supply it.

### `M174-RECIPIENT-ATTRIBUTION`

- **Normative text:** Acceptance MUST separately prove recipient output attribution (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_alp_ancestry.test.ts` `it("separates container, chain, authorship, amount and settlement")` attributes `125` laboratory atoms on `lab-tip-author0`, `lab-tip-author1`, and `lab-author-owns-tokens-foreign-xec`. `lab-wrong-recipient` is `INVALID_RECIPIENT`. `lab-zero-atoms` is `NO_VALUE_TRANSFER`. `tests/fixtures/rfc0001-tip-xec.json` exercised by `rfc0001_tip_xec.test.ts` `it("attributes only the recipient outputs")` sums native satoshis to the designated POST author.
- **Commit:** `7308a3d51b5e607825ec05720611db0c79e5c19e`; `df7939b59068da46685010fca87943b6cb2d501a`
- **CI / Codex:** `R-BIND`, `R-TIPXEC`
- **Trust model:** Synthetic laboratory atoms of the LAB token, plus a separate native XEC laboratory. Receipts that pass the laboratory checks stay `PENDING` or `NOT_DEMONSTRATED`. `realRmzTip` stays false. `R-TIPXEC` is not a Codex receipt.
- **Still required:** Attribution of a real RMZ output remains required. The laboratory XEC sum is not an active-chain settlement.

### `M174-REORG`

- **Normative text:** Acceptance MUST separately prove reorg rollback (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_alp_replay.test.ts` `it("rolls a branch back to the ancestor and applies the other branch once")` and `it("matches a snapshot restore with a from-scratch replay and does not credit twice")`.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Synthetic laboratory checkpoint via `structuredClone`. Withdrawn tips are `NOT_ON_ACTIVE_CHAIN` with attributable atoms `0`. The oracle does not emit a productive `REORGED` label.
- **Still required:** Rollback of a network reorg, and of an indexer database, remains required.

### `M174-IDEMPOTENCE`

- **Normative text:** Acceptance MUST separately prove idempotence (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_alp_replay.test.ts` `it("matches a snapshot restore with a from-scratch replay and does not credit twice")`. The idempotency key is the transaction id.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Synthetic laboratory state. Applying the same txid again is an idempotent skip. This is not an indexer restart.
- **Still required:** Idempotence across process restart, partial migration, and a second delivery of the same network transaction remains required.

### `M174-MULTI-OWNER`

- **Normative text:** Acceptance MUST separately prove hostile and synthetic multi-owner transaction handling (M1.7.4).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_alp_ancestry.test.ts` `it("rejects the mandatory negative transfers even when the TMM entry is intact")`. `lab-multi-owner` and `lab-ambiguous-funding` are `AMBIGUOUS_TIP_FUNDING` with attributable atoms `0`. `lab-sponsor-signs-foreign-tokens` is the same receipt. `lab-author-owns-tokens-foreign-xec` stays `PENDING` when the designated author owns every fungible input of the section token.
- **Commit:** `7308a3d51b5e607825ec05720611db0c79e5c19e`
- **CI / Codex:** `R-BIND`
- **Trust model:** Synthetic laboratory rule: the designated author HASH160 must equal the sole owner of every fungible funding input of the section token. The section token is the laboratory token, not public RMZ.
- **Still required:** The XEC funding rule is recorded as PARTIAL under SEC-05 and does not extend this row. Public RMZ remains a separate requirement. This row covers the synthetic multi-owner handling named in M1.7.4. LAB_VALIDATED does not close the parent gate.

### `M174-REVIEW-TRIPLE`

- **Normative text:** The independently reviewed output MUST include the test command, the CI run reference, and the reviewed commit SHA (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** The receipt index in this file records the command-bearing CI job `test` and the Codex comment whose Reviewed commit line matches the cited SHA. Local suite command: `corepack pnpm exec vitest run --config tests/protocol/vitest.s0-07.config.ts`.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Each receipt is feedback on the commit it names. M1.10.1 records that a summary of no major issues is short of protocol proof.
- **Still required:** One reviewed package that covers every M1.7.4 blocker together, with one command, one CI run, and one SHA, remains required before acceptance.

### `M174-INCOMPLETE-STAYS-BLOCKING`

- **Normative text:** Any incomplete token-encoding or signature test MUST remain listed as a blocking gate rather than passed by inspection (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001_regtest_reference.json` still lists its M1.7.4 pending ids. `rfc0001_regtest_reference.test.mjs` `test("M1.7.4 items that this pair does not prove stay listed as S0 pending")`. This matrix lists the incomplete clauses with an unmet status. This audit does not edit `tests/protocol/RFC0001-S0-07-HISTORICAL.md`. That note, at the cited snapshot, still records M1.7.4 as open.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Repository record. The regtest reference file was left byte-for-byte unchanged. Its reason strings describe that pair and are an incomplete inventory of later laboratory fixtures.
- **Still required:** The blocking list has to stay visible until a later acceptance record withdraws each item. This audit does not withdraw any item.

### `M174-REAL-RMZ`

- **Normative text:** Real RMZ atom transfer and attribution remain an explicit S0 blocker (M1.7.4).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** `rfc0001_alp_ancestry.test.ts` sets `realRmzTip` false and `realRmzGenealogy` to `NOT_DEMONSTRATED` on every laboratory tip. The public id is stored as identity only.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`
- **CI / Codex:** `R-BURN`
- **Trust model:** Synthetic laboratory token. Public RMZ id `c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908`.
- **Still required:** A mainnet genealogy and an attributable transfer of that public token remain required.

### `M174-TIP-SETTLEMENT`

- **Normative text:** XEC and RMZ tip settlement, including the ambiguous-funding counterexample, remain an explicit S0 blocker (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** The ambiguous-funding counterexample is `lab-ambiguous-funding` and `lab-multi-owner` in `rfc0001_alp_ancestry.test.ts`, receipt `AMBIGUOUS_TIP_FUNDING`. `tests/fixtures/rfc0001-tip-xec.json` exercised by `rfc0001_tip_xec.test.ts` `it("rejects recipient funding, third-party inputs, and self tips")` credits zero for the native recipient-funded counterexample. Positive native rows keep `settlement` at `NOT_DEMONSTRATED`.
- **Commit:** `7308a3d51b5e607825ec05720611db0c79e5c19e`; `df7939b59068da46685010fca87943b6cb2d501a`
- **CI / Codex:** `R-BIND`, `R-TIPXEC`
- **Trust model:** Synthetic laboratory atoms, plus a separate native XEC laboratory. Settlement of those rows stays `NOT_DEMONSTRATED`. `R-TIPXEC` is not a Codex receipt.
- **Still required:** Settlement of an XEC tip and of a public RMZ tip on an active chain remains required. The laboratory counterexamples are not that settlement.

### `M174-TIP-AUTHORSHIP`

- **Normative text:** TIP signatures and authorship remain an explicit S0 blocker (M1.7.4). The RFC text at `45ad15aa` still calls cryptographic authorship of a genuine POST beside TMM pending; later PR #41 commits add laboratory evidence.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_sec17_coexistence.test.ts` `it("accepts laboratory authorship only for an independently verified signature")`, including `coex-schnorr-author1-sighash-41`, and `it("keeps MULTIPLE_MEMOS when a real second memo remains, even if one signature verifies")`. `rfc0001_alp_ancestry.test.ts` records `authorship: LAB_VALID` only together with a laboratory chain result. `rfc0001_tip_xec.test.ts` `it("checks Schnorr, ECDSA, sighash, and a nonzero tipper index")` checks signed native TIP_XEC rows in `tests/fixtures/rfc0001-tip-xec.json`.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`; `df7939b59068da46685010fca87943b6cb2d501a`
- **CI / Codex:** `R-BURN`, `R-TIPXEC`
- **Trust model:** Independent laboratory BIP143/ForkID beside a frozen eMPP container, and again on the native TIP_XEC corpus. Four coexistence matrix rows are `LAB_CRYPTOGRAPHIC`. Ten stay `NOT_DEMONSTRATED`. Production packages are unchanged. Experimental verdicts on empty-input fixtures stay `INVALID_TM1`. `R-TIPXEC` is not a Codex receipt.
- **Still required:** Production authorship for a POST that coexists with TMM, and a signed productive tip profile, remain required. Laboratory TIP_XEC signatures do not close this row.

### `M174-REACTIONS`

- **Normative text:** Reaction and unlike replay remain an explicit S0 blocker (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001-reactions.json` exercised by `rfc0001_reactions.test.ts` `it("replays likes without duplicating the active counter")`, `it("selects like state from the chosen synthetic branch")`, `it("reorders an older confirmed event that arrives in a later batch")`, and `it("promotes a mempool reaction when the same txid is confirmed")`. The laboratory note is `RFC0001-REACTIONS.md`.
- **Commit:** `069ab86428dc17a76ce79e6669f27a2f5121cfb1`
- **CI / Codex:** `R-REACTION`
- **Trust model:** Synthetic in-memory state. Declared prevouts are laboratory metadata, not mainnet history. No node, no broadcast, and no productive indexer. `R-REACTION` is a snapshot. It is not a Codex receipt. PR #42 was not modified.
- **Still required:** A persisted indexer, a network reorg, and activation of social version `0x02` remain required. This row does not close M1.7.4.

### `M174-REORG-RESTART`

- **Normative text:** Reorg rollback and restart idempotence remain an explicit S0 blocker (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** Same laboratory checkpoint as `M174-REORG` and `M174-IDEMPOTENCE` in `rfc0001_alp_replay.test.ts`. `it("keeps historical bytes for a consensus-valid ALP rejection and not for a consensus-invalid parent")` keeps `replay-absent-parent-external` at `CONSENSUS_INVALID_PARENT` with sources `UNAVAILABLE` and `EXTERNAL_NOT_DEMONSTRATED`.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Synthetic in-memory state. Review `5732062351` on `5229b48c73df61e36889b40d25c37cb9314d1799` recorded P2 `4438888650`. Commit `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e` records the rejected parent before the external hatch. Receipt `6569120767` reviews that commit.
- **Still required:** Restart of a persisted indexer, and a network reorg, remain required. The laboratory labels stay off the productive `SETTLED` and `REORGED` vocabulary.

### `M174-V2-BYTES-REJECT`

- **Normative text:** Any change that would make the production parser accept version `0x02` remains an explicit S0 blocker. The current ratified bytes MUST keep rejecting that version (M1.7.4, M1.2).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("rejects version 0x02 before an unknown event type")` and `it("parses the lab POST and rejects the lab version 0x02 REPLY")`. `rfc0001_empp_tmm.test.ts` `it("keeps social version 0x02 inactive and does not read an eMPP script as a POST")`.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`
- **CI / Codex:** `R-EMPP`
- **Trust model:** Ratified parser bytes at `228d1f036643ca9be8ba85e91f8200536f3242da`, executed on fixtures. Result `UNSUPPORTED_VERSION`. No chain event.
- **Still required:** A future edit under `packages/` reopens this row. The row covers the current bytes. LAB_VALIDATED does not close the parent gate and does not activate version `0x02`.

### `M174-AUTHOR-255`

- **Normative text:** An unsigned TMM author byte 255 does not close the author-index requirement (M1.7.4).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_empp_tmm.test.ts` records `tmm-author-index-255` as a structural negative. `rfc0001_s0_07_historical.test.ts` `it("rejects author byte 255 at the input-range stage after structural acceptance")`. Signed nonzero indexes are `canonical-schnorr-author1-sighash-41` and `canonical-schnorr-author2-sighash-c1` in `tests/fixtures/rfc0001-canonical-tm1-p2pkh.json`, `lab-tip-author1` in `tests/fixtures/rfc0001-alp-ancestry.json`, and `coex-schnorr-author1-sighash-41` in `tests/fixtures/rfc0001-sec17-coexistence.json`.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`
- **CI / Codex:** `R-BURN`
- **Trust model:** Laboratory signatures for canonical TM1 and for the synthetic ALP tip. The unsigned TMM byte 255 is a structural witness in the eMPP corpus.
- **Still required:** A productive TMM author index, checked in production code, remains required. The regtest POST/REPLY pair uses index 0 only.

### `M174-ENVELOPE-SHAPE`

- **Normative text:** Historical authorization fixtures push version, event, index, and data as separate pushes. They MUST NOT be presented as valid canonical TM1 transactions (M1.7.4). Commit `907ba8a2b5f68d346e863187508f7ea5fa3ec070` records the shape as `fixture-envelope-shape`.
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("matches structural stages and records the multi-push fixture shape")` and `it("keeps historical multi-push authorization fixtures unchanged")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Repository classification. The original files under `packages/verification/` stay byte-identical to the ratification baseline.
- **Still required:** The originals stay available as cryptographic evidence and as negative format cases. LAB_VALIDATED does not close the parent gate.

### `S005-GATE`

- **Normative text:** S0-05 requires M1.7 deterministic vectors AND independently reproducible signed and negative fixtures required by M1.7.4 (S0 acceptance table).
- **Status:** `PARTIAL`
- **Evidence:** The M1.7.4 rows in this matrix are the inventory. The regtest reference at `efe60360b4a276465975b603b833a8eb15f8e080` is one display-order pair. The RFC cell at `45ad15aa` still says reorg, reaction, and signed tip fixtures remain pending. Later laboratory commits add signed TM1, signed ALP tips, a synthetic reorg, the reaction corpus in `tests/fixtures/rfc0001-reactions.json`, the native tip corpus in `tests/fixtures/rfc0001-tip-xec.json`, and the reply corpus in `tests/fixtures/rfc0001-reply.json`. Those commits do not complete the gate.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`; `069ab86428dc17a76ce79e6669f27a2f5121cfb1`; `df7939b59068da46685010fca87943b6cb2d501a`; `5fb5ae863589a4be2c145b2452214f8db8765d37`
- **CI / Codex:** `R-REPLAY`, `R-REACTION`, `R-TIPXEC`, `R-REPLY`
- **Trust model:** Mixed. Each underlying row names its own trust model. The gate is the conjunction. `R-REACTION`, `R-TIPXEC`, and `R-REPLY` are not Codex receipts.
- **Still required:** S0-05 stays open while any M1.7.4 blocker in this matrix stays unmet. The reaction, tip, and reply laboratories do not complete the conjunction.

### `S005-VECTORS`

- **Normative text:** S0-05 requires the M1.7 deterministic vectors (S0 acceptance table).
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001_vectors.json` and the protocol suites cited by `M174-ALL-COMBINATIONS` and `M174-SCRIPT-LENGTHS`, including `tests/fixtures/rfc0001-reply.json`. Local historical command recorded by the RFC: `node --test tests/protocol/rfc0001_validation.test.mjs tests/protocol/rfc0001_regtest_reference.test.mjs`, 43 tests, at the regtest-reference commit.
- **Commit:** `efe60360b4a276465975b603b833a8eb15f8e080`; `5fb5ae863589a4be2c145b2452214f8db8765d37`
- **CI / Codex:** `R-REGTEST`, `R-REPLY`
- **Trust model:** Synthetic vectors plus one regtest reference. The production parser is not modified by that reference. `R-REPLY` is not a Codex receipt.
- **Still required:** Vectors for every supported social combination remain required.

### `S005-SIGNED`

- **Normative text:** S0-05 requires independently reproducible signed fixtures required by M1.7.4.
- **Status:** `PARTIAL`
- **Evidence:** Canonical TM1 positives in `rfc0001-canonical-tm1-p2pkh.json`. Coexistence fixture `rfc0001-sec17-coexistence.json`. ALP tips in `rfc0001-alp-ancestry.json`. Signed REACTION and REACTION_REMOVE rows in `tests/fixtures/rfc0001-reactions.json`, checked by `rfc0001_reactions.test.ts` `it("checks Schnorr, ECDSA, sighash, and nonzero author indexes")`. Signed TIP_XEC rows in `tests/fixtures/rfc0001-tip-xec.json`, checked by `rfc0001_tip_xec.test.ts` `it("checks Schnorr, ECDSA, sighash, and a nonzero tipper index")`. Signed REPLY rows in `tests/fixtures/rfc0001-reply.json`, checked by `rfc0001_reply.test.ts` `it("checks Schnorr, ECDSA, sighashes, and author indexes")`. Generators recheck bytes and refuse a private-key payload.
- **Commit:** `6fbcbaa7996be8b001f4fd71257ad84f1b82ad63`; `069ab86428dc17a76ce79e6669f27a2f5121cfb1`; `df7939b59068da46685010fca87943b6cb2d501a`; `5fb5ae863589a4be2c145b2452214f8db8765d37`
- **CI / Codex:** `R-COEX`, `R-REACTION`, `R-TIPXEC`, `R-REPLY`
- **Trust model:** Independent laboratory signatures over insecure published keys. The keys must stay unfunded. `R-REACTION`, `R-TIPXEC`, and `R-REPLY` are not Codex receipts.
- **Still required:** A productive tip profile remains required. Laboratory TIP_XEC, REACTION, REACTION_REMOVE, and REPLY signatures do not close this row.

### `S005-NEGATIVE`

- **Normative text:** S0-05 requires independently reproducible negative fixtures required by M1.7.4.
- **Status:** `PARTIAL`
- **Evidence:** Canonical negatives include altered signature, mutated output, P2SH designated input, missing prevout, and sighash `NONE|FORKID`. ALP negatives include the ids listed in `it("rejects the mandatory negative transfers even when the TMM entry is intact")`. eMPP negatives include malformed containers and author byte 255. Reaction negatives are `rfc0001_reactions.test.ts` `it("withholds altered signatures, bad scripts, and ineligible targets")` on `tests/fixtures/rfc0001-reactions.json`. TIP_XEC negatives are `rfc0001_tip_xec.test.ts` `it("withholds bad signatures, bad prevouts, and ineligible targets")` and `it("rejects recipient funding, third-party inputs, and self tips")` on `tests/fixtures/rfc0001-tip-xec.json`. REPLY negatives are `rfc0001_reply.test.ts` `it("withholds altered signatures, invalid scripts, and ineligible parent targets")` on `tests/fixtures/rfc0001-reply.json`.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`; `069ab86428dc17a76ce79e6669f27a2f5121cfb1`; `df7939b59068da46685010fca87943b6cb2d501a`; `5fb5ae863589a4be2c145b2452214f8db8765d37`
- **CI / Codex:** `R-CANONICAL`, `R-REACTION`, `R-TIPXEC`, `R-REPLY`
- **Trust model:** Independent laboratory checker for canonical TM1 negatives. Synthetic ALP negatives. Structural eMPP negatives. Reaction negatives, native tip negatives, and reply negatives are in-memory laboratories. `R-REACTION`, `R-TIPXEC`, and `R-REPLY` are not Codex receipts.
- **Still required:** A network reorg that must drop credit remains required. Laboratory reaction negatives, laboratory tip negatives, and laboratory reply negatives do not close this row.

### `S006-GATE`

- **Normative text:** S0-06 requires M1.8 threats reviewed with test evidence or approved residual risks, owner, and date (S0 acceptance table).
- **Status:** `PARTIAL`
- **Evidence:** M1.8 documents SEC-01 through SEC-17. The SEC rows below separate the regtest POST/REPLY pair from later laboratory evidence. Comment `6559174591` approves the SEC-17 design. No residual carries an owner and a date.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Design record plus the laboratory rows cited under each SEC id. A Codex receipt on the RFC is not a security acceptance.
- **Still required:** A passing production fixture or an accepted residual, with owner and date, for every SEC id remains required. S0-06 stays open.

### `S006-NO-RESIDUAL`

- **Normative text:** No severe risk may be silently waived. An accepted residual MUST name an owner and a date (M1.8.4).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** The RFC states that SEC-17 has no owner and no date. This matrix assigns no owner and no date.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Governance text. Absence of a residual record.
- **Still required:** An explicit residual, if one is ever accepted, needs a new governance decision that names the owner and the date. This audit accepts none.

### `SEC-01`

- **Normative text:** SEC-01: the wallet independently derives the verified target-author HASH160 from the target TXID, displays recipient and network, and refuses a mismatched script.
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** The regtest POST/REPLY pair has no wallet preview and no tip. No wallet test is in PR #41.
- **Commit:** `081d75a762889207283ab7d4434030db30c79b41`
- **CI / Codex:** `R-PR42`
- **Trust model:** The funded pair shows one P2PKH author at index 0. It has no recipient-substitution case.
- **Still required:** A wallet preview test that refuses a substituted recipient remains required.

### `SEC-02`

- **Normative text:** SEC-02: verify the selected in-range index, prevout P2PKH HASH160, unlocking script, signature, and supported sighash. An independent verifier MUST still check the signature under Core v1.0 section 8.6. The production helper stops before the digest.
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001-canonical-tm1-p2pkh.json` holds `canonical-schnorr-author1-sighash-41`, `canonical-schnorr-author2-sighash-c1`, and `negative-author-index-out-of-range` at index 5. `rfc0001_sec17_coexistence.test.ts` `it("does not grant authorship when the signature, prevout, author index, or committed output is altered")`. The regtest pair remains index 0, sighash `0x41`, HASH160 `b4aca63fbf60884195ee538475b6840650273d3f`.
- **Commit:** `6fbcbaa7996be8b001f4fd71257ad84f1b82ad63`
- **CI / Codex:** `R-COEX`
- **Trust model:** Independent laboratory digest on the canonical and coexistence fixtures. Production `trusted-chronik` on D-07 and on synthetic normalized transactions does not replace that digest check.
- **Still required:** The production helper's digest check remains required. The regtest pair does not add an index-1 observation.

### `SEC-03`

- **Normative text:** SEC-03: require an approved full-output SIGHASH_ALL variant and recalculate and re-preview the final raw transaction before signing.
- **Status:** `PARTIAL`
- **Evidence:** Canonical fixture `negative-sighash-all-output-mutated` and `negative-post-mutated` fail the independent check after the output changes. Sighash bytes `0x41` and `0xc1` appear on canonical positives. `negative-sighash-none-forkid` is rejected.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`
- **CI / Codex:** `R-CANONICAL`
- **Trust model:** Independent laboratory sighash. No wallet preview is executed.
- **Still required:** A fresh wallet preview of the final raw transaction before signing remains required.

### `SEC-04`

- **Normative text:** SEC-04: immutable history plus an idempotent key `(network, author, target, kind)` and a deterministic last event for likes.
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001-reactions.json` exercised by `rfc0001_reactions.test.ts` `it("replays likes without duplicating the active counter")`, `it("does not let the second author clear the first")`, and `it("reorders an older confirmed event that arrives in a later batch")`. The note is `RFC0001-REACTIONS.md`. ALP txid idempotence in `rfc0001_alp_replay.test.ts` is a different key.
- **Commit:** `069ab86428dc17a76ce79e6669f27a2f5121cfb1`; `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REACTION`, `R-REPLAY`
- **Trust model:** Synthetic in-memory reaction state. The ALP replay key is a different asset. `R-REACTION` is not a Codex receipt. PR #42 was not modified and is not a reaction ledger.
- **Still required:** A persisted indexer and a network reorg remain required. The laboratory key does not close SEC-04.

### `SEC-05`

- **Normative text:** SEC-05: for TIP_XEC, every funding prevout belongs to the designated tipper, with no recipient input and no third-party input.
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001-tip-xec.json` exercised by `rfc0001_tip_xec.test.ts` `it("rejects recipient funding, third-party inputs, and self tips")` and `it("checks Schnorr, ECDSA, sighash, and a nonzero tipper index")`. The note is `RFC0001-TIP-XEC.md`. The ALP ambiguous-funding rows remain a different asset under `M174-MULTI-OWNER`.
- **Commit:** `df7939b59068da46685010fca87943b6cb2d501a`
- **CI / Codex:** `R-TIPXEC`
- **Trust model:** Synthetic in-memory native XEC rule. Declared prevouts are laboratory metadata, not mainnet history. No node, no broadcast, and no productive indexer. `R-TIPXEC` is a snapshot. It is not a Codex receipt. PR #42 was not modified.
- **Still required:** A persisted indexer, an active-chain settlement, and activation of social version `0x02` remain required. This row does not close SEC-05.

### `SEC-06`

- **Normative text:** SEC-06: verify ALP ancestry, the exact RMZ id, token type, decimals, atom allocations, and the actual P2PKH receiver.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_alp_ancestry.test.ts` checks laboratory token id, decimals, atom mapping, and receiver scripts for the synthetic token. `lab-public-rmz-structural`, `lab-fake-token-id`, `lab-foreign-token`, and `lab-decimal-mismatch` are rejected.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`
- **CI / Codex:** `R-BURN`
- **Trust model:** Synthetic laboratory ancestry. Public RMZ genealogy stays `NOT_DEMONSTRATED`.
- **Still required:** The same checks on the public RMZ token remain required.

### `SEC-07`

- **Normative text:** SEC-07: container-specific strict parsing, minimal pushes, uniqueness, output constraints, and 223-byte compatibility tests for eMPP.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_empp_tmm.test.ts` `it("rejects malformed ALP, unsupported actions, order, attribution, and cardinality in their own axes")` and the byte-budget test. The 29-case corpus is unsigned.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`
- **CI / Codex:** `R-EMPP`
- **Trust model:** Structural corpus plus the isolated prototype. Production still classifies a canonical TMM entry as TM0.
- **Still required:** A production parser that meets the M1.6.8 criteria remains required. The prototype is not that parser.

### `SEC-08`

- **Normative text:** SEC-08: chain-aware rollback and replay, idempotency by TXID, and distinct `PENDING`, `SETTLED`, and `REORGED` states.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_alp_replay.test.ts` covers synthetic rollback and txid idempotence. Withdrawn laboratory tips are `NOT_ON_ACTIVE_CHAIN`. The oracle keeps settlement at `NOT_DEMONSTRATED` and does not emit `SETTLED` or `REORGED`.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Synthetic laboratory checkpoint. Tip-104 confirmation counts in the regtest reference are one observation.
- **Still required:** Network rollback and the productive three-way label set remain required. Laboratory replay does not meet those clauses.

### `SEC-09`

- **Normative text:** SEC-09: verify parent event, network, and chain status; bound retries; do not credit a pending or invalid target.
- **Status:** `PARTIAL`
- **Evidence:** The regtest REPLY parent is the observed POST in `tests/fixtures/rfc0001_regtest_reference.json`. `rfc0001_alp_ancestry.test.ts` rejects invalid targets with attributable atoms `0`. `tests/fixtures/rfc0001-reply.json` exercised by `rfc0001_reply.test.ts` `it("separates valid authorship from a verified parent link")` rejects missing, wrong network, wrong event, payment, and invalid parents without crediting the parent link.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`; `5fb5ae863589a4be2c145b2452214f8db8765d37`
- **CI / Codex:** `R-BURN`, `R-REPLY`
- **Trust model:** One regtest parent observation, synthetic tip-target rejection, and in-memory laboratory reply parent resolution. `R-REPLY` is not a Codex receipt.
- **Still required:** Network retry bounds and an indexer traversal queue remain required.

### `SEC-10`

- **Normative text:** SEC-10: strict script limits, typed validators, bounded traversal, pagination, rate limits, and no unbounded retries.
- **Status:** `PARTIAL`
- **Evidence:** Script and byte-budget tests in `rfc0001_empp_tmm.test.ts` and the TM0 80/81-byte boundary. No indexer pagination or rate-limit test is in this corpus.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`
- **CI / Codex:** `R-EMPP`
- **Trust model:** Parser limits on fixtures. Not an indexer under load.
- **Still required:** Traversal bounds, pagination, and rate limits for an indexer remain required.

### `SEC-11`

- **Normative text:** SEC-11: canonical P2PKH proof, an explicit no-delegation profile, compartmentalized wallet approvals, and preserved historical evidence.
- **Status:** `PARTIAL`
- **Evidence:** Canonical fixture `negative-designated-p2sh` fails closed. Positives are P2PKH. Delegation and wallet compartmentalization have no test.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`
- **CI / Codex:** `R-CANONICAL`
- **Trust model:** Independent laboratory P2PKH. Historical multi-push fixtures stay unmodified.
- **Still required:** A P2SH rejection in production social parsing, a no-delegation profile, and wallet compartmentalization remain required.

### `SEC-12`

- **Normative text:** SEC-12: zero credit for self-tips. Transfer totals stay on-chain value. Anti-abuse policy for human reputation sits outside consensus.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_alp_ancestry.test.ts` expects `lab-self-tip` to be `SELF_TIP_UNCREDITED`. `rfc0001_tip_xec.test.ts` `it("rejects recipient funding, third-party inputs, and self tips")` expects `neg-self-tip` in `tests/fixtures/rfc0001-tip-xec.json` to be `SELF_TIP_UNCREDITED` with credited satoshis `0`.
- **Commit:** `7308a3d51b5e607825ec05720611db0c79e5c19e`; `df7939b59068da46685010fca87943b6cb2d501a`
- **CI / Codex:** `R-BIND`, `R-TIPXEC`
- **Trust model:** Synthetic laboratory self-tip of the LAB token, and a separate native XEC self-tip. Receipt amounts stay `0`. `R-TIPXEC` is not a Codex receipt.
- **Still required:** The reputation policy outside consensus, and a self-tip rule for public RMZ, remain required. The laboratory receipts are the synthetic clauses only.

### `SEC-13`

- **Normative text:** SEC-13: a mempool view stays provisional. Settlement requires active-chain confirmation and an independent finality label.
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** Laboratory fixtures force `confirmation` and `settlement` to `NOT_DEMONSTRATED`. The regtest pair was observed after inclusion. No conflicting mempool case was executed.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Laboratory label discipline plus one confirmed regtest observation.
- **Still required:** A mempool-versus-finality test remains required.

### `SEC-14`

- **Normative text:** SEC-14: signing stays in the noncustodial wallet. The wallet displays recipient, amount, token, network, and fee. The web UI receives no seed.
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** No wallet UI test is in PR #41 or in the cited PR #42 evidence record. Omitting secrets from fixtures is a hygiene check in the generators, not this control.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Documentation and fixture hygiene. Not a wallet.
- **Still required:** A wallet preview and signing test remains required.

### `SEC-15`

- **Normative text:** SEC-15: key by network and TXID. Display-order serialization converts once. Mismatched-parent tests are required.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_regtest_reference.test.mjs` `test("serialization accepts display order once and rejects reversal, size and non-canonical hex")`. The parent wire hex equals POST `754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585`.
- **Commit:** `efe60360b4a276465975b603b833a8eb15f8e080`
- **CI / Codex:** `R-REGTEST`
- **Trust model:** One regtest display-order observation. Not a cross-network suite.
- **Still required:** The mismatched-parent suite and a second-network keying test remain required.

### `SEC-16`

- **Normative text:** SEC-16: client disclosures and opt-in visibility. The profile avoids a false anonymity promise, protects local browsing metadata, and offers no retroactive on-chain deletion.
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** No disclosure or browsing-metadata test is in the cited corpora.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** The threat is documented. The control is unexecuted.
- **Still required:** A client disclosure test remains required.

### `SEC-17`

- **Normative text:** SEC-17: a TMM entry inside `OP_RETURN OP_RESERVED` is scanned as TM0 because its bytes start with `TM`; that false candidate can hide a real TM1 POST behind `MULTIPLE_MEMOS`; malformed eMPP, an unrecognized container, and absence of a memo collapse into one visible result. The mandatory defense is the design in M1.6.8. Production packages still show the contamination. No residual is accepted.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_empp_tmm.test.ts` `it("records the false TM0 classification without treating the proposed shape as acceptance")`. `rfc0001_sec17_dispatch.test.ts` `it("meets the critical experimental acceptance cases")` on the 113-row prototype, extended later to 127 rows. Comment `6559174591` approves decisions A–E as design.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Production behavior is the before-state. The prototype is `tests/protocol/sec17-experimental-dispatch.ts`. It imports production functions and does not replace them. Every matrix row has `settlement` `PENDING`.
- **Still required:** The nine production criteria below stay unmet in `packages/`. A production change needs a new governance decision. The prototype does not supply that decision.

### `SEC17-C1-TMM-NOT-TM0`

- **Normative text:** On `alp-send-plus-one-tmm`, the TMM push MUST NOT appear as a TM0 candidate. Decision C still preserves a genuine TM0 text entry, and recognition is not authorship (M1.6.8 criterion 1).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_sec17_dispatch.test.ts` `it("meets the critical experimental acceptance cases")`. Production before-state keeps the TMM candidate. The prototype returns `NO_MEMO` and keeps no TM0 candidate. `c-empp-tm0-text` stays recognizable.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Isolated prototype on the frozen corpus. Production packages unchanged.
- **Still required:** Re-execution of this case against a future production build remains required. That build is blocked on a new governance decision.

### `SEC17-C2-NOT-TM1`

- **Normative text:** The `alp-send-plus-one-tmm` script MUST remain outside `isTm1CandidateScript`, and `parseTm1Output` MUST still throw `INVALID_MARKER`, while social version `0x02` has no independent approval (M1.6.8 criterion 2).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_empp_tmm.test.ts` `it("keeps social version 0x02 inactive and does not read an eMPP script as a POST")`. `rfc0001_sec17_dispatch.test.ts` expects `coreParseCodes` `INVALID_MARKER` for `alp-send-plus-one-tmm`.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Ratified parser bytes on the frozen script. The prototype does not change this Core result.
- **Still required:** The criterion is the current rejection. LAB_VALIDATED does not close SEC-17 and does not approve version `0x02`.

### `SEC17-C3-BESIDE-TM1`

- **Normative text:** On `empp-beside-one-tm1`, `findTm1Candidates` MUST return exactly one TM1 candidate. The TMM push MUST NOT add a TM0 candidate, MUST NOT force `MULTIPLE_MEMOS`, and MUST NOT hide the POST (M1.6.8 criterion 3).
- **Status:** `PARTIAL`
- **Evidence:** Production before-state is `MULTIPLE_MEMOS`. The prototype keeps one TM1 candidate. The fixture has no inputs, so the experimental verdict is `INVALID_TM1` / `AUTHOR_INPUT_OUT_OF_RANGE`. Coexistence tests later add laboratory signatures beside a frozen container.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Prototype on an input-less fixture, plus laboratory coexistence at `R-COEX`. Production packages unchanged.
- **Still required:** A production result that keeps the POST visible, and production authorship for that POST, remain required.

### `SEC17-C4-BESIDE-TM0`

- **Normative text:** On `empp-beside-tm0`, the conventional TM0 memo MUST remain a candidate. An eMPP entry that is not itself a real TM0 memo MUST NOT create a second TM0 candidate (M1.6.8 criterion 4).
- **Status:** `PARTIAL`
- **Evidence:** `c-empp-tmm-and-tm0-text` in the prototype keeps only the genuine TM0 text. Production still counts the TMM entry in the combined case.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Isolated prototype. Decision C is design-approved and provisional.
- **Still required:** The production candidate set remains to be changed under a new governance decision. A later restriction of historical TM0-in-eMPP text needs its own audit and decision.

### `SEC17-C5-NOT-UTF8`

- **Normative text:** On `tmm-non-utf8-target` and `tmm-author-index-255`, the TMM bytes MUST NOT be decoded as UTF-8 memo text and MUST NOT take the TM0 `INVALID_UTF8` or `INVALID_FORMAT` path only because a prefix scan selected them (M1.6.8 criterion 5).
- **Status:** `PARTIAL`
- **Evidence:** Production before-state uses those TM0 codes. The prototype drops the TMM candidate under decision A. `rfc0001_empp_sec17_decisions.test.ts` `it("locks getStackArray, candidates, decode, validate, and the verifier")` locks the production before-state.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Production before-state versus isolated prototype. The decisions corpus SHA-256 is `76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca`.
- **Still required:** Production behavior that stops the prefix scan from selecting these entries remains required.

### `SEC17-C6-DIAGNOSIS`

- **Normative text:** Malformed eMPP, an unrecognized container, absence of a memo, and a script past the 223-byte budget MUST be distinguishable in a diagnostic layer. Decision E is an internal diagnosis and does not add a public code (M1.6.8 criterion 6).
- **Status:** `PARTIAL`
- **Evidence:** The prototype records `BYTE_BUDGET_EXCEEDED` for `budget-natural-225` and `budget-exact-224` while the public code stays `NO_MEMO`. `truncated-script` is the malformed witness. `alp-send-only` is absence. `two-push-social-v2-inactive` stays unrecognized. A 223-byte script that still contains TM0 text stays a candidate.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Internal prototype diagnosis. Public codes of the ratified parser stay in place.
- **Still required:** A production diagnostic layer needs a new governance decision before any public code changes. Decision E does not grant that code.

### `SEC17-C7-V2-CORE`

- **Normative text:** `two-push-social-v2-inactive` MUST continue to be rejected by Core v1.0 with `UNSUPPORTED_VERSION`. Social version `0x02` stays inactive (M1.6.8 criterion 7).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("rejects version 0x02 before an unknown event type")`. `rfc0001_sec17_dispatch.test.ts` expects `beforeCode` and `afterCode` `UNSUPPORTED_VERSION` for that case.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Ratified parser bytes. The prototype preserves the Core code.
- **Still required:** LAB_VALIDATED covers the current rejection. It does not close SEC-17.

### `SEC17-C8-DUPLICATE-TMM`

- **Normative text:** `duplicate-tmm` MUST NOT be reported as two TM0 memos and MUST NOT be accepted as one settled tip (M1.6.8 criterion 8).
- **Status:** `PARTIAL`
- **Evidence:** The prototype does not count the duplicate as two TM0 memos. Matrix `settlement` is `PENDING`. Production before-state still follows the prefix scan.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Isolated prototype on the frozen corpus. No settled tip exists in the matrix.
- **Still required:** The production candidate count for this case remains to be changed under a new governance decision.

### `SEC17-C9-NO-SETTLED-TIP`

- **Normative text:** No corpus case is a settled tip, an attributable RMZ transfer, or an accepted social `0x02` event. A passing dispatch MUST preserve that negative result (M1.6.8 criterion 9).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_sec17_dispatch.test.ts` `it("locks the before/after matrix and the limitation record")` and `rfc0001_alp_replay.test.ts` `it("keeps the ancestry chain, the frozen corpora, and the SEC-17 matrix")`. All 127 rows have `settlement` `PENDING`. `socialEventCredited` stays false on the ancestry tips.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Frozen matrix plus laboratory ancestry labels. The integer 125 is a structural SEND quantity.
- **Still required:** A future production dispatch has to preserve this negative. No such dispatch exists.

### `EMPP-ALP-GATE`

- **Normative text:** `EMPP-ALP` is the named open compatibility block: structural ALP/eMPP evidence, the FALSE-TM0 production classification, laboratory ancestry, and the unproved productive tip. It is not a separately numbered RFC section. The RFC says the structural corpus does not close `EMPP-ALP`.
- **Status:** `PARTIAL`
- **Evidence:** The SEC-17, ancestry, and coexistence rows are the evidence inventory. `rfc0001_empp_tmm.test.ts` `it("keeps the S0-07 evidence open and records the compatibility block")`.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`
- **CI / Codex:** `R-EMPP`
- **Trust model:** The block mixes production observations, an isolated prototype, and a synthetic chain.
- **Still required:** `EMPP-ALP` stays open. Production dispatch, public RMZ attribution, settlement, and version `0x02` acceptance remain unmet.

### `EMPP-ALP-STRUCTURAL`

- **Normative text:** The 29-case structural corpus MUST be executable and MUST record the production FALSE-TM0 classification without treating that shape as acceptance.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_empp_tmm.test.ts` `it("rechecks the committed JSON against ecash-lib and the independent reader")`. File SHA-256 `3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8`.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`
- **CI / Codex:** `R-EMPP`
- **Trust model:** Unsigned structural corpus. ecash-lib 4.13.0 builds pushes. The independent reader does not use ecash-lib to decide conservation.
- **Still required:** Signatures, ancestry, and settlement are outside this corpus. They stay on their own rows.

### `EMPP-ALP-CORE-VS-APP`

- **Normative text:** On a canonical eMPP ALP SEND plus one TMM entry, Core throws `INVALID_MARKER` and the current application returns a TM0 candidate with `INVALID_MEMO`.
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_empp_tmm.test.ts` `it("records the false TM0 classification without treating the proposed shape as acceptance")`.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`
- **CI / Codex:** `R-EMPP`
- **Trust model:** Ratified parser and application bytes on the frozen script.
- **Still required:** This is the production observation. The mitigation row is `SEC17-C1-TMM-NOT-TM0`. LAB_VALIDATED does not close `EMPP-ALP`.

### `EMPP-ALP-ANCESTRY`

- **Normative text:** A structurally valid ALP SEND plus a structurally valid TMM entry is not, by itself, a valid RMZ tip. Token ancestry stays an open clause of `EMPP-ALP`.
- **Status:** `PARTIAL`
- **Evidence:** Same evidence as `M174-TOKEN-ANCESTRY`. A correct TMM does not repair a bad SEND: `it("rejects the mandatory negative transfers even when the TMM entry is intact")`.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`
- **CI / Codex:** `R-BURN`
- **Trust model:** Synthetic laboratory ancestry, separate from the structural 29-case corpus.
- **Still required:** Public RMZ ancestry remains required.

### `EMPP-ALP-REAL-RMZ`

- **Normative text:** Attributable transfer of the public RMZ token remains an open clause of `EMPP-ALP`.
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** Same negative labels as `M174-REAL-RMZ`.
- **Commit:** `028d5c986f0d9ebdb9cfad092c813325d2274f88`
- **CI / Codex:** `R-BURN`
- **Trust model:** Public token id recorded as identity. Laboratory token id is different.
- **Still required:** Mainnet genealogy and attribution of the public token remain required.

### `EMPP-ALP-SETTLEMENT`

- **Normative text:** Settlement of an ALP/eMPP tip remains an open clause of `EMPP-ALP`.
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** Ancestry tips keep `settlement` at `NOT_DEMONSTRATED`. Matrix rows keep `settlement` at `PENDING`.
- **Commit:** `7308a3d51b5e607825ec05720611db0c79e5c19e`
- **CI / Codex:** `R-BIND`
- **Trust model:** Laboratory and prototype labels. No productive settlement path exists.
- **Still required:** An active-chain settlement rule for a tip remains required.

### `EMPP-ALP-V2-ACCEPTANCE`

- **Normative text:** Acceptance of social version `0x02` inside the ALP/eMPP profile remains an open clause of `EMPP-ALP`. Current bytes reject ordinary two-push `0x02`.
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** The rejection is `M174-V2-BYTES-REJECT`. No approved social parser exists for the eMPP container.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Inactive version. Design text is not activation.
- **Still required:** Activation requires the decision named by M1.9.5. That decision is absent.

### `EMPP-ALP-DECISIONS`

- **Normative text:** Decisions A–E are characterized and approved as design by comment `6559174591`. The characterization does not put a container dispatch into `packages/`.
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_empp_sec17_decisions.test.ts` `it("records the unratified A-E matrix without closing SEC-17")`. The prototype at `R-DISPATCH` checks the design.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Design approval plus isolated prototype. Comment `6559174591` is not an RFC ratification and is not permission to edit `packages/`.
- **Still required:** Production mitigation remains pending a new governance decision.

### `EMPP-ALP-NO-PACKAGE-DISPATCH`

- **Normative text:** The current production tree contains no container dispatch that implements decisions A–E.
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("keeps the protected trees identical to the ratification commit")` and `it("keeps the experimental harness off the production parser")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Byte identity of `packages/protocol`, `packages/verification`, `packages/chronik`, and `packages/registry` with `228d1f036643ca9be8ba85e91f8200536f3242da`. The experimental file is `tests/protocol/sec17-experimental-dispatch.ts`.
- **Still required:** LAB_VALIDATED records the absence of a production dispatch. It does not close SEC-17.

### `HIST-GATE`

- **Normative text:** `HISTORICAL-MAINNET` remains open. A finite sample is not full-chain coverage (M1.9.2).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("checks the three recovered transactions without treating confirmation as authorship")` covers three transactions. The editorial catalog test keeps the wider list as TXIDs and URLs.
- **Commit:** `7796b3364a762013baa313b15e94ce48bfeacd88`
- **CI / Codex:** `R-D07`
- **Trust model:** Three archived mainnet transactions. Retrieval does not extend to every historic TM1 transaction.
- **Still required:** A disclosed coverage bound can stay in force only while the gate remains open. Full-chain compatibility remains unproved.

### `HIST-D07-SAMPLE`

- **Normative text:** The D-07 sample is three version `0x01` POST transactions, each with one two-push candidate, author index 0, Schnorr, and sighash `0x41`. Each has a correct Core envelope and `INDEPENDENT_SIGNATURE_VERIFIED` under the recovered prevout data. Production returns `VERIFIED_TM1` with `trustModel: trusted-chronik`, recorded as `STRUCTURALLY_COMPATIBLE`.
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001-mainnet-tm1-d07.json`, SHA-256 `53afea6a140146e3e483074b5c9ab36d1dac684c4ff58300a8cc8a1e93baed08`. Test: `it("checks the three recovered transactions without treating confirmation as authorship")`. TXIDs: `fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd` block `965957`; `8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8` block `966182`; `0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150` block `966215`.
- **Commit:** `7796b3364a762013baa313b15e94ce48bfeacd88`
- **CI / Codex:** `R-D07`
- **Trust model:** Archival read of `https://chronik.e.cash` by chronik-client 4.3.0 at `2026-10-30T23:02:05Z`. Independent checker on the recovered prevouts. Production trust model `trusted-chronik` is recorded separately. Prevout provenance is the recovered record, not a new cryptographic source.
- **Still required:** Full-chain coverage, cryptographically independent prevout provenance, and a link from the September 2026 timestamps to a producing software revision remain required. The sample does not close `HISTORICAL-MAINNET`.

### `HIST-ARTIFACT-LIMIT`

- **Normative text:** Artifact `12744812743` has block metadata and a `STRUCTURALLY_COMPATIBLE` verdict under `trusted-chronik`. It has no raw transaction, scriptSig, or prevout amount.
- **Status:** `PARTIAL`
- **Evidence:** The fixture `retrieval.archivedArtifact` records that limit. The later fixture file stores raw transactions for the three TXIDs. The artifact itself was not rewritten.
- **Commit:** `7796b3364a762013baa313b15e94ce48bfeacd88`
- **CI / Codex:** `R-D07`
- **Trust model:** The artifact is an earlier archive. The fixture is a later local record of the same three TXIDs.
- **Still required:** The artifact remains a partial archive. It is not the raw-byte source for the independent check.

### `HIST-NFT-LABEL`

- **Normative text:** The third label says Memo + NFT. Chronik reports `TOKEN_STATUS_NON_TOKEN`. The `nft1` reference is text inside the POST. That label is not an ALP transfer and does not attribute RMZ.
- **Status:** `PARTIAL`
- **Evidence:** Fixture entry `0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150` has `tokenStatus` `TOKEN_STATUS_NON_TOKEN` and `tokenEntryCount` consistent with the test. All three entries in the file report `TOKEN_STATUS_NON_TOKEN`.
- **Commit:** `7796b3364a762013baa313b15e94ce48bfeacd88`
- **CI / Codex:** `R-D07`
- **Trust model:** Archival token status from the Chronik read, stored in the fixture. The independent signature result is a separate field.
- **Still required:** The label reading covers this transaction. It does not survey other NFT-labeled transactions.

### `S007-GATE`

- **Normative text:** S0-07 requires a v1.0 backward-compatibility regression corpus and the TM0/TM1 application-profile decision. The decision is approved. The gate remains unsatisfied (S0 acceptance table).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("leaves S0-07 unsatisfied in the evidence record")`. Comment `6529195032` approves `S0-07-PROFILE-DECISION` as application policy and does not satisfy the gate.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** The corpus rows below are finite. Byte identity is not every historic transaction.
- **Still required:** S0-07 remains unsatisfied. This matrix does not change that disposition.

### `S007-BYTE-IDENTITY`

- **Normative text:** The cited comparisons execute ratified parser bytes when `packages/protocol`, `packages/verification`, `packages/chronik`, and `packages/registry` are byte-identical to baseline `228d1f036643ca9be8ba85e91f8200536f3242da`.
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("keeps the protected trees identical to the ratification commit")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Git byte identity. It is a repository fact about those four trees.
- **Still required:** The identity is not exhaustive proof of every historical transaction. LAB_VALIDATED does not close S0-07.

### `S007-RECORD-STAYS-UNSATISFIED`

- **Normative text:** The evidence record MUST keep S0-07 unsatisfied while the open items in M1.9.2 remain.
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("leaves S0-07 unsatisfied in the evidence record")` requires the phrase `S0-07 remains unsatisfied` and rejects a satisfied-gate sentence and a closed-gate banner.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Evidence-record lock on `tests/protocol/RFC0001-S0-07-HISTORICAL.md`. This audit does not edit that file.
- **Still required:** LAB_VALIDATED locks the record. It does not satisfy the gate.

### `S007-D07-SAMPLE`

- **Normative text:** The D-07 sample is later evidence on the same protected trees and does not close S0-07 (S0-07 traceability).
- **Status:** `PARTIAL`
- **Evidence:** Same fixture and test as `HIST-D07-SAMPLE`.
- **Commit:** `7796b3364a762013baa313b15e94ce48bfeacd88`
- **CI / Codex:** `R-D07`
- **Trust model:** Same archival trust split as `HIST-D07-SAMPLE`.
- **Still required:** The sample stays inside the open `HISTORICAL-MAINNET` limit.

### `S007-FALSE-TM0-OBSERVATION`

- **Normative text:** In production, a canonical eMPP ALP SEND plus one TMM entry is a TM0 candidate and `INVALID_MEMO`, while Core throws `INVALID_MARKER` (S0-07 open item FALSE-TM0-CLASSIFICATION).
- **Status:** `LAB_VALIDATED`
- **Evidence:** Same test as `EMPP-ALP-CORE-VS-APP`.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`
- **CI / Codex:** `R-EMPP`
- **Trust model:** Ratified application and Core bytes.
- **Still required:** The observation is why the open item remains. Mitigation is `SEC17-C1-TMM-NOT-TM0`. LAB_VALIDATED does not close S0-07.

### `S007-CANONICAL-COVERAGE`

- **Normative text:** Canonical two-push fixtures are required evidence, and they do not close S0-07. Historical multi-push fixtures stay unmodified.
- **Status:** `PARTIAL`
- **Evidence:** `tests/fixtures/rfc0001-canonical-tm1-p2pkh.json`, SHA-256 `dad39e8b3b8965eda6c6241e3a822c2aace88abd51bdfbd765e2758f15f3e694`. Test `it("checks serialization, envelope, structure, trusted-chronik, and the independent signature")`.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`
- **CI / Codex:** `R-CANONICAL`
- **Trust model:** Independent laboratory signatures and the production verifier's `trusted-chronik` result, reported separately.
- **Still required:** S0-07 stays open. The canonical corpus is not the whole historical chain.

### `S007-DIGEST-GAP`

- **Normative text:** `verifyTm1DesignatedInput` checks index, prevout, P2PKH, scriptSig, HASH160, and sighash. It does not reconstruct the signature digest. An independent verifier MUST check signatures under the applicable eCash rules (S0-07 cryptographic limits).
- **Status:** `PARTIAL`
- **Evidence:** The historical test records `trusted-chronik-gap`. Canonical, D-07, coexistence, and ALP prevout checks exercise an independent digest outside that helper.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`
- **CI / Codex:** `R-CANONICAL`
- **Trust model:** Two layers stay distinct: production `trusted-chronik`, and the independent laboratory checker.
- **Still required:** The production helper's digest check remains required. The independent fixtures do not patch `packages/verification`.

### `S009-FINAL-HEAD`

- **Normative text:** S0-09 requires a Codex or technical review of the final unchanged PR0 head, with inline P1 and P2 findings addressed, and a recorded CI result.
- **Status:** `PARTIAL`
- **Evidence:** PR #40 HEAD is `45ad15aa157a25f7f8e616682ccbfffad974e15c`. Issue comment `6559961738` is a `codex-review-receipt:v1` whose Reviewed commit line is `45ad15aa15`. CI run `41321121026`, job `test` `124891368477`, succeeded at `2026-11-01T15:25:08Z`. A GraphQL read of PR #40 review threads on 2026-11-02 returned zero unresolved threads. The two historical P2 threads named by the RFC, `4402833710` and `4405990197`, are not in that unresolved set. The RFC paragraph inside this same commit still says the head needs its own review, because that sentence was written before the receipt. PR #41 receipts do not satisfy S0-09.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Document review. M1.10.1: no major issues is not protocol proof. S0-10, the governance record of the final SHA, is a different criterion and is unmet.
- **Still required:** This audit does not edit PR #40 and does not treat the receipt as S0 acceptance. The in-document disposition on that head still says Pending. A governance record under S0-10 remains required before S0 can be accepted.

### `M183-NO-VERIFIED-ON-INVALID`

- **Normative text:** A structurally invalid event, unsupported script or sighash, wrong token, wrong recipient, ambiguous funding, bad signature, or invalid linked target MUST NOT receive `VERIFIED` or `TipReceipt` `SETTLED` (M1.8.3).
- **Status:** `PARTIAL`
- **Evidence:** Laboratory receipts for those cases are `INVALID_AUTHOR`, `INVALID_ASSET`, `INVALID_RECIPIENT`, `AMBIGUOUS_TIP_FUNDING`, `NO_VALUE_TRANSFER`, or `SELF_TIP_UNCREDITED`, with attributable atoms `0`. Fixture JSON used by the ancestry and replay generators contains neither a settled tip label nor a verified-fulfillment label. Canonical independent failures stay distinct from the production verifier's synthetic `VERIFIED_TM1` test result.
- **Commit:** `7308a3d51b5e607825ec05720611db0c79e5c19e`
- **CI / Codex:** `R-BIND`
- **Trust model:** Laboratory receipt vocabulary. Production `VERIFIED_TM1` on a synthetic normalized transaction is identified as a verifier test by the canonical suite.
- **Still required:** A production `TipReceipt` path that enforces this sentence remains required. The laboratory path is the fixture clause.

### `M183-RETRY-LABELS`

- **Normative text:** A transient Chronik outage, missing prevout, unconfirmed parent, unresolved token history, or chain reorg MUST be classified as `PENDING`, `PREVOUT_UNAVAILABLE`, `PARENT_PENDING`, or `REORGED`, with bounded retries (M1.8.3).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** The laboratory oracle uses `UNAVAILABLE`, `EXTERNAL_NOT_DEMONSTRATED`, `PREVOUT_NOT_IN_CHAIN`, `CONSENSUS_INVALID_PARENT`, and `NOT_ON_ACTIVE_CHAIN`. It does not emit the productive labels in this sentence.
- **Commit:** `27a22416059cc5f6aa5cc4b11723186f23fe6b91`
- **CI / Codex:** `R-PREVOUT`
- **Trust model:** Synthetic reasons. They are intentionally different from the productive vocabulary.
- **Still required:** An indexer that uses the productive labels, with bounded retries, remains required.

### `M183-CACHE-NOT-PROMOTE`

- **Normative text:** A pending item MUST NOT become valid merely because the indexer cache contains a matching display address (M1.8.3).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** No indexer cache is exercised by the cited tests.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Normative text only.
- **Still required:** An indexer cache test remains required.

### `M183-TRUST-DISCLOSED`

- **Normative text:** If trust is delegated to Chronik, clients MUST disclose that trust model and MUST NOT claim offline independent cryptographic verification (M1.8.3).
- **Status:** `PARTIAL`
- **Evidence:** D-07 and canonical tests record `trustModel: trusted-chronik` separately from `INDEPENDENT_SIGNATURE_VERIFIED`. `rfc0001_s0_07_historical.test.ts` requires the evidence record to contain `trusted-chronik-gap`. No client surface is executed.
- **Commit:** `7796b3364a762013baa313b15e94ce48bfeacd88`
- **CI / Codex:** `R-D07`
- **Trust model:** Fixture labels and wording in the evidence record. Those records are not a client disclosure.
- **Still required:** A client that discloses delegated Chronik trust, and that does not claim offline independent verification, remains required. The fixture labels do not meet that clause. The missing production digest check stays on `M183-INDEPENDENT-86`.

### `M183-SYNTHETIC-IS-VERIFIER-TEST`

- **Normative text:** A `VERIFIED_TM1` result from a synthetic normalized transaction MUST be identified as a test of the verifier, not as an on-chain confirmation (M1.8.3).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("checks the three recovered transactions without treating confirmation as authorship")` and `it("checks serialization, envelope, structure, trusted-chronik, and the independent signature")` keep the two results in separate fields.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`
- **CI / Codex:** `R-CANONICAL`
- **Trust model:** Verifier-under-test versus independent checker. D-07 confirmation is an archival fact and is stored separately from authorship.
- **Still required:** LAB_VALIDATED covers this identification rule in the cited tests. It does not confirm any social tip.

### `M183-INDEPENDENT-86`

- **Normative text:** An independent verifier MUST check the signature under Core v1.0 section 8.6 (M1.8.3).
- **Status:** `PARTIAL`
- **Evidence:** The independent checker in `tests/protocol/canonical-tm1-independent-verify.mjs` and the ALP prevout check `inputUnlockMatchesPrevout` cover the cited fixtures. Production `verifyTm1DesignatedInput` stops before the digest.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`
- **CI / Codex:** `R-CANONICAL`
- **Trust model:** Laboratory independent BIP143/ForkID. Production helper remains the shorter check.
- **Still required:** The production helper remains to be brought up to section 8.6 under a future authorized change. This row does not make that change.

### `M184-EACH-SEC`

- **Normative text:** M1.8 is satisfied only when each SEC id is mapped to a passing fixture, an integration or security test, or an accepted residual with owner and date (M1.8.4).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** The SEC rows in this matrix are the map. Several are `PARTIAL` or `NOT_DEMONSTRATED`. None has an accepted residual.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Traceability map. Not a satisfaction proof.
- **Still required:** The exit condition remains unmet. S0-06 stays open.

### `M184-NO-SILENT-WAIVER`

- **Normative text:** No severe risk may be silently waived (M1.8.4).
- **Status:** `PARTIAL`
- **Evidence:** M1.8.2 lists severity for SEC-01 through SEC-17 and states that severity is a triage proposal. This matrix leaves every severe row visible.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Documentation posture. Not a completed penetration test.
- **Still required:** A security review that accepts or assigns each severe item remains required.

### `M184-CLIENT-AND-WALLET`

- **Normative text:** A security review MUST examine the social client and the wallet transaction preview and signing flows independently (M1.8.4).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** No social client and no wallet preview are in the cited tests.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Requirement text. No review artifact of those two surfaces.
- **Still required:** Those two reviews remain required.

### `M184-PUBLISH-FLAGS`

- **Normative text:** M1.9 and M1.10 MUST publish the active protocol and profile boundaries and the feature flags, including the ability to disable v2 parsing and creation while Core v1.0 POST verification stays functional (M1.8.4).
- **Status:** `PARTIAL`
- **Evidence:** The RFC publishes example flag names and states that a documented flag is not a present production setting. Core v1.0 POST tests still pass on the ratified bytes.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed text. Example names are not settings in the repository.
- **Still required:** Implemented flags, defaulting off, remain required. Publishing the names does not implement them.

### `M191-DEFAULT-OFF`

- **Normative text:** Every code path that can produce, index, serve, or display social-v2 events MUST be gated and OFF by default, including when a flag is missing, malformed, unknown, or fails to load (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** The RFC table lists example names such as `ENABLE_SOCIAL_V2`. Those strings are not production settings. No flag implementation exists under `packages/`.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed names. Byte-identical production trees.
- **Still required:** Implementation waits on a new governance decision. S1 remains NOT AUTHORIZED. This audit does not add flags.

### `M191-FAIL-CLOSED-CONFIG`

- **Normative text:** An implementation MUST fail closed rather than enable a feature because a configuration value is absent (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** No social-v2 configuration loader exists in the protected trees.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Absence of the loader, established by byte identity with the ratification baseline.
- **Still required:** The loader and its fail-closed tests wait on a new governance decision.

### `M191-MASTER-AND-CAPABILITY`

- **Normative text:** Effective enablement MUST require the master gate and the relevant per-capability gate (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** The RFC states the conjunction. No runtime gate evaluates it.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed rule.
- **Still required:** A runtime conjunction remains unimplemented and blocked on governance.

### `M191-RMZ-EMPP-GATE`

- **Normative text:** The RMZ TIP path MUST additionally require the dedicated eMPP gate (M1.9.1, example name `ENABLE_V2_RMZ_EMPP`).
- **Status:** `BLOCKED`
- **Evidence:** No eMPP tip gate exists in production code.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed rule. Laboratory ancestry does not read a flag.
- **Still required:** The gate remains unimplemented and blocked on governance.

### `M191-READ-INGEST-WRITE`

- **Normative text:** Read, ingest, and write MUST be independently disableable (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** No three-way social-v2 switch exists.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed rule.
- **Still required:** Independent switches remain unimplemented and blocked on governance.

### `M191-NO-GENERIC-OVERRIDE`

- **Normative text:** No generic social-v2 override may bypass the separate security or economic gates (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** No override exists because the gates do not exist.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed rule.
- **Still required:** The prohibition has to be enforced by a future implementation. That implementation is blocked on governance.

### `M191-NOT-FRONTEND-ONLY`

- **Normative text:** A frontend-visible toggle MUST NOT be the sole enforcement point for an indexer or wallet operation (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** No frontend social-v2 toggle is part of this evidence corpus.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed rule.
- **Still required:** Server-side and wallet enforcement remain unimplemented and blocked on governance.

### `M191-SERVER-AND-WALLET`

- **Normative text:** Controls MUST be enforced server-side for indexers and APIs and inside each wallet's privileged signing flow (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** No indexer flag and no wallet signing flag are present.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed rule.
- **Still required:** Both enforcement points remain unimplemented and blocked on governance.

### `M191-LOGS-NO-SECRETS`

- **Normative text:** Feature-decision logs MUST NOT contain seed phrases, private keys, or secret payment material (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** No social-v2 feature log exists. Generators used for laboratory fixtures assert the absence of private keys in fixture JSON. That assertion is fixture hygiene, not this log control.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed log rule. Laboratory fixture hygiene is a different control.
- **Still required:** The log control remains unimplemented and blocked on governance.

### `M191-NO-RECLASSIFY`

- **Normative text:** A runtime configuration change MUST NOT retroactively reclassify v1 POSTs or turn unverified v2 messages into verified payments (M1.9.1).
- **Status:** `BLOCKED`
- **Evidence:** No runtime social-v2 configuration exists to change.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed rule. Current v1 tests still use the ratified bytes.
- **Still required:** The runtime guarantee remains unimplemented and blocked on governance.

### `M192-H1-POST-FRAMING`

- **Normative text:** Before social-v2 activation, a compatibility harness MUST compare baseline and candidate on v1.0 POST framing, minimal pushes, strict UTF-8, author-input bounds, and P2PKH signature constraints (M1.9.2 item 1).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` describe `TM1 output corpus` and the canonical TM1 suite.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`
- **CI / Codex:** `R-CANONICAL`
- **Trust model:** Ratified bytes versus the same bytes. There is no second production candidate.
- **Still required:** A candidate build that differs from baseline, compared on this item, remains required before activation.

### `M192-H2-HISTORICAL`

- **Normative text:** The harness MUST include historical observed confirmed transactions, with `trusted-chronik` differentiated from independent signature verification (M1.9.2 item 2).
- **Status:** `PARTIAL`
- **Evidence:** Same three-transaction sample as `HIST-D07-SAMPLE`.
- **Commit:** `7796b3364a762013baa313b15e94ce48bfeacd88`
- **CI / Codex:** `R-D07`
- **Trust model:** Archival sample with both trust results stored.
- **Still required:** The finite sample remains short of every historic confirmed transaction.

### `M192-H3-CARDINALITY`

- **Normative text:** The harness MUST include application-level TM0/TM1 candidate-cardinality differences and documented legacy-client behavior (M1.9.2 item 3).
- **Status:** `PARTIAL`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("separates normative TM1 cardinality from the TM0/TM1 application policy")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Current application policy on fixtures. Legacy-client behavior beyond this repository is documented in the RFC and is not re-executed here.
- **Still required:** A retained legacy-client capture, if it is required beyond the written policy, remains outstanding for activation.

### `M192-H4-NEGATIVES`

- **Normative text:** The harness MUST include duplicate TM1 candidates, unknown versions, P2SH designated inputs, invalid sighash, and missing prevouts (M1.9.2 item 4).
- **Status:** `PARTIAL`
- **Evidence:** TM1 corpus invalid scripts, plus canonical negatives `negative-designated-p2sh`, `negative-sighash-none-forkid`, `negative-prevout-missing`, and the multiple-candidate regtest test.
- **Commit:** `af445925031630918cfdff3399be629a3b95793e`
- **CI / Codex:** `R-CANONICAL`
- **Trust model:** Fixture negatives on ratified bytes.
- **Still required:** These cases are present as fixtures. They are not yet a single certified pre-activation harness with a candidate SHA different from baseline.

### `M192-H5-V2-NOT-ACCEPTED`

- **Normative text:** The harness MUST include normal v1-only parsing of proposed v2 pairs `(0x02, 0x02)` through `(0x02, 0x05)` without accidental acceptance (M1.9.2 item 5).
- **Status:** `PARTIAL`
- **Evidence:** Two-push version `0x02` is rejected. The other event types in that range do not each have a retained production-parser vector in the S0-07 suite.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Ratified parser on the stored version `0x02` script.
- **Still required:** One vector per proposed pair, retained in the harness, remains required before activation.

### `M192-H6-EMPP`

- **Normative text:** The harness MUST include independent eMPP/TMM handling, without interpreting ALP/eMPP as an ordinary two-push TM1 transaction and without a prefix scan that treats a TMM entry as TM0 (M1.9.2 item 6).
- **Status:** `PARTIAL`
- **Evidence:** Core `INVALID_MARKER` is the current result. The prefix scan still treats TMM as TM0 in production. The prototype shows the approved reading.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Production observation plus isolated prototype.
- **Still required:** The prefix-scan half of this item remains unmet in `packages/`.

### `M192-H7-THREE-CONTAINERS`

- **Normative text:** The harness MUST keep conventional TM0, conventional TM1 Core v1.0, and `OP_RETURN OP_RESERVED` eMPP entries distinct (M1.9.2 item 7).
- **Status:** `PARTIAL`
- **Evidence:** Production distinguishes TM1 from eMPP by `INVALID_MARKER`, and still folds a TMM push into the TM0 scan. The prototype separates the three containers on the corpus.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Production bytes plus isolated prototype.
- **Still required:** Production separation of a TMM push from TM0 remains unmet.

### `M192-RETAIN-ARTIFACTS`

- **Normative text:** The same corpus, baseline snapshot SHA, candidate SHA, expected verdicts, and execution command MUST be retained (M1.9.2).
- **Status:** `PARTIAL`
- **Evidence:** Baseline SHA `228d1f036643ca9be8ba85e91f8200536f3242da` is retained. For the comparisons so far, the candidate SHA equals that baseline because `packages/` is unchanged. Commands and verdicts are retained in the tests cited above.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Repository artifacts. A candidate that differs from baseline does not exist.
- **Still required:** Retention of a real candidate comparison remains required before activation.

### `M192-FINITE-DISCLOSURE`

- **Normative text:** A finite corpus does not prove compatibility with every historic transaction. Coverage limitations MUST be disclosed (M1.9.2).
- **Status:** `PARTIAL`
- **Evidence:** `tests/protocol/RFC0001-S0-07-HISTORICAL.md` discloses that the three recovered transactions are not the chain. The PR #40 RFC, reviewed as `R-RFC`, discloses that a finite corpus is not every historic transaction and that byte-identity is not exhaustive proof. This matrix repeats both bounds. It is not an earlier receipt for them.
- **Commit:** `7796b3364a762013baa313b15e94ce48bfeacd88`; `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-D07`, `R-RFC`
- **Trust model:** Disclosure text. The S0-09 receipt reviews the RFC head and is not an acceptance of full-chain coverage.
- **Still required:** The disclosure has to travel with any later activation record. `HISTORICAL-MAINNET` stays open.

### `M192-POLICY-1`

- **Normative text:** If one transaction contains a TM0 candidate and a TM1 candidate together, the application classifies it as `MULTIPLE_MEMOS` and does not select one of them (comment `6529195032`, point 1).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("separates normative TM1 cardinality from the TM0/TM1 application policy")` and `it("records the approved TM0/TM1 policy without treating it as Core or as S0-07 closure")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Current application bytes. The comment approves this behavior as application policy.
- **Still required:** LAB_VALIDATED covers the observed policy. The comment does not satisfy S0-07.

### `M192-POLICY-2`

- **Normative text:** TM1 Core v1.0 stays as ratified. Exactly one TM1 candidate is required. Two or more TM1 candidates are `MULTIPLE_MEMOS`. An unrelated `OP_RETURN` that is neither TM0 nor TM1 may coexist with one TM1 candidate (comment `6529195032`, point 2).
- **Status:** `LAB_VALIDATED`
- **Evidence:** The same cardinality test. The unrelated witness recorded by the RFC is `6a04deadbeef` beside one TM1 candidate.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Ratified Core cardinality plus the current application behavior on fixtures.
- **Still required:** LAB_VALIDATED covers these fixture results. It does not amend Core.

### `M192-POLICY-3`

- **Normative text:** The combined-profile choice is application policy. It does not modify the TM1 Core v1.0 contract and does not reinterpret it retroactively (comment `6529195032`, point 3).
- **Status:** `LAB_VALIDATED`
- **Evidence:** Byte identity of the protected trees with `228d1f036643ca9be8ba85e91f8200536f3242da`, including the Core ratification candidate document checked by the historical suite.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Git identity. The policy text lives in the RFC, outside those trees.
- **Still required:** LAB_VALIDATED records that this HEAD has not modified Core. The policy stays application-level.

### `M192-POLICY-4`

- **Normative text:** The decision resolves the combined-profile question inside S0-07. It does not satisfy S0-07 and does not finish that gate (comment `6529195032`, point 4).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `it("leaves S0-07 unsatisfied in the evidence record")` and `it("records the approved TM0/TM1 policy without treating it as Core or as S0-07 closure")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Evidence-record lock.
- **Still required:** LAB_VALIDATED locks the limit. S0-07 remains unsatisfied.

### `M192-POLICY-5`

- **Normative text:** The decision does not authorize a production parser change, acceptance of social version `0x02`, deployment, Wallet changes, signing, broadcast, transfers, mainnet use, closure of S0, or the start of S1 (comment `6529195032`, point 5).
- **Status:** `LAB_VALIDATED`
- **Evidence:** Protected trees are unchanged. Version `0x02` tests still expect `UNSUPPORTED_VERSION`. S1 remains NOT AUTHORIZED in the evidence record.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Repository compliance with the prohibition at this HEAD.
- **Still required:** The prohibition stays in force. LAB_VALIDATED does not close S0 and does not authorize S1.

### `M192-B1-TM0`

- **Normative text:** A conventional TM0 text memo on an ordinary `OP_RETURN` still decodes as TM0 (M1.9.2 preserved behavior 1).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_s0_07_historical.test.ts` `it("accepts every stored valid envelope")` under describe `TM0 corpus`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Ratified application bytes on the stored TM0 corpus.
- **Still required:** LAB_VALIDATED covers the stored corpus. It does not extend to every historic TM0 transaction.

### `M192-B2-TM1-POST`

- **Normative text:** A conventional two-push version `0x01` POST still parses as TM1 Core v1.0 (M1.9.2 preserved behavior 2).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `it("parses every stored valid version 0x01 POST")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Ratified Core bytes.
- **Still required:** LAB_VALIDATED covers the stored valid POSTs.

### `M192-B3-COMBINED`

- **Normative text:** One real TM0 candidate and one real TM1 candidate together remain `MULTIPLE_MEMOS` (M1.9.2 preserved behavior 3).
- **Status:** `LAB_VALIDATED`
- **Evidence:** Same application-policy test as `M192-POLICY-1`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Current application policy.
- **Still required:** LAB_VALIDATED covers the fixture. The application does not pick one candidate.

### `M192-B4-TWO-TM1`

- **Normative text:** Two or more TM1 candidates remain `MULTIPLE_MEMOS` (M1.9.2 preserved behavior 4).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_regtest_reference.test.mjs` `test("multiple TM1 candidates are rejected instead of selecting the first output")` and the historical cardinality test.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Core cardinality on fixtures.
- **Still required:** LAB_VALIDATED covers these fixtures.

### `M192-B5-UNRELATED`

- **Normative text:** One TM1 candidate plus an unrelated `OP_RETURN` that is neither TM0 nor TM1 may coexist (M1.9.2 preserved behavior 5). The executed witness is `6a04deadbeef`.
- **Status:** `LAB_VALIDATED`
- **Evidence:** The historical cardinality test records that the unrelated output does not take the combined-application rejection.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Current application behavior on that witness.
- **Still required:** LAB_VALIDATED covers this witness.

### `M192-B6-V2-REJECTION`

- **Normative text:** Social version `0x02` in ordinary two-push framing stays `expected-v2-rejection`: `isTm1CandidateScript` is true, `parseTm1Output` throws `UNSUPPORTED_VERSION`, and the application status is `INVALID_TM1` (M1.9.2 preserved behavior 6).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `it("rejects version 0x02 before an unknown event type")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Ratified bytes.
- **Still required:** LAB_VALIDATED covers this framing. It does not approve a future activation.

### `M192-B7-EMPP-NOT-POST`

- **Normative text:** An eMPP output is not a TM1 POST. `parseTm1Output` throws `INVALID_MARKER` until an approved social parser exists (M1.9.2 preserved behavior 7).
- **Status:** `LAB_VALIDATED`
- **Evidence:** `rfc0001_empp_tmm.test.ts` `it("keeps social version 0x02 inactive and does not read an eMPP script as a POST")`.
- **Commit:** `72bd470df8e24eacdaaca59e83d9bea98badf272`
- **CI / Codex:** `R-EMPP`
- **Trust model:** Ratified Core bytes on eMPP scripts.
- **Still required:** LAB_VALIDATED covers the Core rejection. The TM0 prefix scan is a separate production behavior.

### `M192-B8-PREFIX-EXCLUSION`

- **Normative text:** `findMemoCandidates` continues to exclude outputs already claimed as TM1. A raw prefix match on a real TM1 LOKAD does not become a second memo candidate (M1.9.2 preserved behavior 8).
- **Status:** `LAB_VALIDATED`
- **Evidence:** The historical cardinality test and the SEC-17 decisions test lock candidate sets for ordinary TM1 outputs.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Current candidate scan on TM1 outputs.
- **Still required:** LAB_VALIDATED covers ordinary TM1 outputs. A TMM push is the separate SEC-17 case.

### `M192-DEC-A`

- **Normative text:** Decision A: a structurally recognized TMM entry inside eMPP is not a TM0 candidate, and binary TMM data is not TM0 text (M1.9.2). Design approved. Production still returns `INVALID_MEMO` for `alp-send-plus-one-tmm`.
- **Status:** `PARTIAL`
- **Evidence:** Prototype result `NO_MEMO` with no TM0 candidate, at `R-DISPATCH`. Production before-state locked by `rfc0001_empp_sec17_decisions.test.ts`.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Design plus prototype. Legacy 113-row change count includes 25 decision A, 1 decision A with C.
- **Still required:** Production mitigation remains pending a new governance decision.

### `M192-DEC-B`

- **Normative text:** Decision B: `empp-beside-one-tm1` stays visible as one POST and the false `MULTIPLE_MEMOS` is not created. A real TM0 beside a real TM1, and two TM1 candidates, stay `MULTIPLE_MEMOS` (M1.9.2).
- **Status:** `PARTIAL`
- **Evidence:** Prototype keeps one TM1 candidate and returns `INVALID_TM1` on the input-less fixture. Coexistence at `R-COEX` adds laboratory signatures. The 113-row prototype had 1 decision B. The 14-row extension adds further decision B rows, including `B_TRUSTED_CHRONIK_UNPROVEN` and `AUTHORIZED_B_LAB_CRYPTO`.
- **Commit:** `6fbcbaa7996be8b001f4fd71257ad84f1b82ad63`
- **CI / Codex:** `R-COEX`
- **Trust model:** Prototype plus laboratory signatures. Production packages unchanged.
- **Still required:** Production mitigation and production authorship remain pending.

### `M192-DEC-C`

- **Normative text:** Decision C: a well-formed TM0 text entry inside eMPP stays recognizable and stays distinct from TMM. Recognition is not authorship (M1.9.2).
- **Status:** `PARTIAL`
- **Evidence:** `c-empp-tm0-text` returns `UNAUTHORIZED` with empty inputs in the prototype. `c-empp-tmm-and-tm0-text` keeps only the genuine text.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Provisional design. Three decision C rows and one A+C row in the legacy 113.
- **Still required:** A historical audit and a new governance decision are required before any later restriction. Production still counts the combined TMM entry.

### `M192-DEC-D`

- **Normative text:** Decision D: inside an eMPP push, pipe-shaped `TM1`, `TM2`, and `TM9` stay `UNSUPPORTED_VERSION` and are not binary TM1 POSTs (M1.9.2).
- **Status:** `PARTIAL`
- **Evidence:** Prototype preserves those codes for `d-empp-tm1-pipe`, `d-empp-tm2-pipe`, and `d-empp-tm9-pipe`. Seven decision D rows in the legacy 113.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Preservation design. Production decoder order is unchanged.
- **Still required:** Ignoring those pushes is not approved. The prototype preserves the codes and does not change production.

### `M192-DEC-E`

- **Normative text:** Decision E: internal diagnosis distinguishes budget, malformed container, unrecognized container, and absence of a memo, without a new public code (M1.9.2).
- **Status:** `PARTIAL`
- **Evidence:** Same witnesses as `SEC17-C6-DIAGNOSIS`. Thirteen decision E rows in the legacy 113.
- **Commit:** `a8130df67b46af2b0a589352d81c132ead3cb551`
- **CI / Codex:** `R-DISPATCH`
- **Trust model:** Internal diagnosis. Public codes unchanged.
- **Still required:** A public status needs a separate authorization.

### `M192-UNKNOWN-DISTINCT`

- **Normative text:** Unknown v2 formats MUST be distinguishable from invalid v1 POSTs (M1.9.2).
- **Status:** `LAB_VALIDATED`
- **Evidence:** Version `0x02` yields `UNSUPPORTED_VERSION`. Other invalid v1 scripts in the TM1 corpus yield their recorded codes, including `INVALID_MARKER`, `INVALID_UTF8`, and `INVALID_FORMAT`, in `it("rejects every stored invalid TM1 script with its recorded code")`.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** Ratified parser on the stored corpus.
- **Still required:** LAB_VALIDATED covers the stored corpus. It does not approve unknown v2 formats.

### `M192-V1-NOT-REQUIRED`

- **Normative text:** A v1-only node or indexer MUST NOT be required to accept social v2 in order to remain Core v1.0 conformant (M1.9.2).
- **Status:** `LAB_VALIDATED`
- **Evidence:** The ratified parser rejects two-push version `0x02` and still parses stored version `0x01` POSTs.
- **Commit:** `907ba8a2b5f68d346e863187508f7ea5fa3ec070`
- **CI / Codex:** `R-BASELINE`
- **Trust model:** This repository's ratified parser. The row is about this implementation's fixtures.
- **Still required:** A survey of indexers outside this repository is outside the row. LAB_VALIDATED does not activate v2.

### `M193-S1-START`

- **Normative text:** S1 implementation and tests MUST begin and remain in isolated eCash regtest or in an explicitly classified simulated harness (M1.9.3).
- **Status:** `BLOCKED`
- **Evidence:** S1 is NOT AUTHORIZED. Existing PR #41 fixtures are laboratory simulations and are not an S1 program. The PR #42 regtest pair is an earlier observation, not S1.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Governance boundary. M1.10.1 separates S0 acceptance from S1 authorization.
- **Still required:** Starting S1 requires a new governance decision. This audit does not start it.

### `M193-SIM-CLASSIFIED`

- **Normative text:** A harness used where regtest token or Chronik behavior is unavailable MUST be explicitly classified as simulated, and MUST NOT be reported as a passing regtest or mainnet end-to-end test (M1.9.3).
- **Status:** `BLOCKED`
- **Evidence:** PR #41 ancestry and replay documents call the chain synthetic. Regtest reference status is `OBSERVED_LAB_EVIDENCE_NOT_RATIFICATION`. Those labels classify work that already exists. They are not an S1 harness approval.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Classification of current laboratory artifacts.
- **Still required:** Using the laboratory as S1 evidence is blocked on a governance decision. S1 remains NOT AUTHORIZED.

### `M193-ALLOWLIST`

- **Normative text:** Before S1 can access transaction-creation functions, CI and runtime policy MUST allow only regtest or test endpoints and MUST fail closed on mainnet or an unidentified chain (M1.9.3).
- **Status:** `BLOCKED`
- **Evidence:** No S1 transaction-creation policy is in force. This audit does not connect a node.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed control.
- **Still required:** The allowlist remains unimplemented and blocked on a new S1 governance decision.

### `M193-NO-PROD-SEEDS`

- **Normative text:** S1 MUST use isolated test-only keys and MUST NOT import a production seed, private key, or wallet profile (M1.9.3).
- **Status:** `BLOCKED`
- **Evidence:** Laboratory generators assert that fixture JSON has no private key. That hygiene is not an S1 wallet policy.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Fixture hygiene versus an unimplemented S1 control.
- **Still required:** The S1 key policy remains blocked on a new S1 governance decision.

### `M193-NO-REAL-MONEY`

- **Normative text:** S1 fixtures MUST use deterministic fee, dust, and token rules and MUST have no real-money recipients (M1.9.3).
- **Status:** `BLOCKED`
- **Evidence:** No S1 suite exists. Laboratory tips move synthetic atoms.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed control.
- **Still required:** The S1 economic isolation rule remains blocked on a new S1 governance decision.

### `M193-BROADCAST-GUARD`

- **Normative text:** Network guardrails MUST prevent test code from signing or submitting to a production eCash node even if a user supplies a mainnet URL or a production wallet (M1.9.3).
- **Status:** `BLOCKED`
- **Evidence:** No such guardrail is implemented for an S1 suite. This audit does not broadcast.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed control.
- **Still required:** The guardrail remains unimplemented and blocked on a new S1 governance decision.

### `M193-PERMISSIONS`

- **Normative text:** Read-only analysis, test-transaction assembly, signature generation, broadcast, and deployment MUST have separate permissions. The documentation stage grants none of the last four on mainnet (M1.9.3).
- **Status:** `BLOCKED`
- **Evidence:** This audit publishes documentation and an evidence check. It grants none of those four permissions.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Stage boundary.
- **Still required:** The permission split for a future S1 suite remains blocked on a new S1 governance decision.

### `M193-CI-FLAGS`

- **Normative text:** CI MUST verify that all feature flags default off and that no production credentials or keys occur in fixtures, logs, build artifacts, or test snapshots (M1.9.3).
- **Status:** `BLOCKED`
- **Evidence:** Feature flags are not implemented, so CI cannot yet verify them. Fixture generators check for private-key material. That check is not the full CI control in this sentence.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed CI control.
- **Still required:** The flag half of the control is blocked until flags exist under a governance decision.

### `M194-D0`

- **Normative text:** Stage D0 allows PR0 draft, reviews, and synthetics, with no runtime change. Exit evidence is a record of the design and the blocking gaps (M1.9.4).
- **Status:** `PARTIAL`
- **Evidence:** PR #40 and PR #41 are Draft. Protected trees are unchanged. This matrix is a gap record.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Documentation stage. D0 does not accept S0.
- **Still required:** D0 exit does not complete M1.7 and does not authorize D3 or D4.

### `M194-D1`

- **Normative text:** Stage D1 is an offline parser harness: local fixtures, signed synthetic transactions, and independent decoding, with no broadcast. Exit evidence is reproduction of every relevant M1.7 check (M1.9.4).
- **Status:** `PARTIAL`
- **Evidence:** The suites in this matrix are an offline harness for a subset of M1.7.4. Broadcast is absent from those suites.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Offline laboratory. No broadcast in the cited PR #41 tests.
- **Still required:** Every relevant M1.7 check listed as unmet in this matrix remains required before D1 exit.

### `M194-D2`

- **Normative text:** Stage D2 is isolated regtest with test-only submission, ingest, rebuild, and reorg fault injection (M1.9.4).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** PR #42 records one funded POST/REPLY pair and a later Chronik query on an isolated regtest. It does not record ingest rebuild or reorg fault injection. PR #41 stores that pair as a reference and does not run a node.
- **Commit:** `081d75a762889207283ab7d4434030db30c79b41`
- **CI / Codex:** `R-PR42`
- **Trust model:** Isolated regtest observation for the pair. Not a D2 exit.
- **Still required:** D2 exit evidence remains required. This audit does not authorize that run, and S1 remains NOT AUTHORIZED.

### `M194-D3`

- **Normative text:** Stage D3, production read-only shadow evaluation, is not authorized by this RFC (M1.9.4).
- **Status:** `BLOCKED`
- **Evidence:** No shadow-evaluation deployment exists in the cited evidence.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Explicit non-authorization.
- **Still required:** D3 waits on a separate governance approval. This audit does not request it.

### `M194-D4`

- **Normative text:** Stage D4, mainnet social write, is not authorized by this RFC or by S1 (M1.9.4).
- **Status:** `BLOCKED`
- **Evidence:** No mainnet social write is in the cited evidence.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Explicit non-authorization.
- **Still required:** D4 waits on future governance. This audit does not request it.

### `M194-ROLLBACK-REHEARSAL`

- **Normative text:** A documented, rehearsed rollback MUST disable v2 write, ingest, and read independently, preserve Core v1.0 and accepted TM0 behavior, and leave the original chain transactions untouched (M1.9.4).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** No v2 flags exist to disable. Core and TM0 fixture tests show current preservation. No rehearsal script disables a v2 deployment.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Proposed rollback. Current preservation tests are the v1 corpus, not a v2 rehearsal.
- **Still required:** A rehearsal against implemented flags remains required. Implementing the flags is blocked on governance.

### `M194-INDEXER-PERSIST`

- **Normative text:** The indexer MUST persist chain identity, block hash and height, transaction ordering, event version, source trust, and reconciliation checkpoints so it can rebuild derived v2 state from the active chain without double-crediting tips or duplicating likes (M1.9.4).
- **Status:** `NOT_DEMONSTRATED`
- **Evidence:** The laboratory checkpoint is an in-memory `structuredClone`. It stores no block hash, no database, and no like ledger.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** Process-local synthetic state.
- **Still required:** A persisted indexer remains unimplemented. A productive indexer is not authorized by this audit.

### `M194-RECOVERY-IDEMPOTENT`

- **Normative text:** Recovery MUST be idempotent across restarts, deep reorgs, partial database migrations, shadow indexes, and obsolete client caches (M1.9.4).
- **Status:** `PARTIAL`
- **Evidence:** Synthetic txid idempotence and snapshot restore are `M174-IDEMPOTENCE`. Restarts, migrations, shadow indexes, and client caches are unexecuted.
- **Commit:** `c9ec63fbeac6f5980100a2ca2379e62de4b52d1e`
- **CI / Codex:** `R-REPLAY`
- **Trust model:** In-memory laboratory idempotence.
- **Still required:** The restart and migration clauses remain required. This PARTIAL status does not meet them.

### `M195-ACTIVATION-RECORD`

- **Normative text:** Only an explicitly recorded activation decision can move a social event from proposed to supported. The decision MUST name repository, source SHA, protocol version, event and container pairs, trust model, deployment target, wallet and indexer release identifiers, independent review, test corpus, asset scope, rollback owner, and approval timestamp (M1.9.5).
- **Status:** `BLOCKED`
- **Evidence:** No activation record exists. RFC-0001 remains PROPOSED — NOT RATIFIED.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Absence of the decision.
- **Still required:** The decision is a new governance act. This audit does not draft a substitute record.

### `M195-RATIFICATION-NOT-ENABLEMENT`

- **Normative text:** Ratification of RFC-0001 as a document MUST NOT silently enable version `0x02`, TIP `0x05`, ALP/eMPP TMM entries, P2SH, delegation, mainnet signing, or transfers (M1.9.5).
- **Status:** `PARTIAL`
- **Evidence:** No ratification has occurred. Current packages do not enable those features. The RFC states the prohibition.
- **Commit:** `45ad15aa157a25f7f8e616682ccbfffad974e15c`
- **CI / Codex:** `R-RFC`
- **Trust model:** Textual prohibition plus unchanged packages. The ratification event itself has not happened.
- **Still required:** When a ratification record is eventually written, it has to repeat this boundary. The current text does not ratify the RFC.

## 2. Consolidated evidence

### SEC-17 corpora

The structural corpus and the decisions corpus keep the SHA-256 values in
the frozen table. Production still classifies `alp-send-plus-one-tmm` as a
TM0 candidate. The isolated prototype at `R-DISPATCH` matches the approved
design on the legacy 113 rows and does not replace production functions.
Coexistence at `R-COEX` adds laboratory signatures beside a frozen eMPP
container. Four of those extension rows record `LAB_CRYPTOGRAPHIC`
authorship. The experimental verdict on the input-less `empp-beside-one-tm1`
fixture remains `INVALID_TM1`.

### TM1 signatures

Canonical positives include author index 0, 1, and 2, sighash `0x41` and
`0xc1`, and both Schnorr and ECDSA. The independent checker recomputes the
BIP143/ForkID digest. Production `trusted-chronik` is stored as a separate
field. D-07 repeats that split on three mainnet transactions, all author
index 0 and sighash `0x41`.

### ALP ancestry

The ancestry chain is synthetic GENESIS, MINT, and SEND. Laboratory token
id `79dee0245d45dc842e82aa37f639c325b8c62cc5d151fc7778a33f5e1c20e251`.
Public RMZ id `c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908`
is identity text. Positive tips `lab-tip-author0`, `lab-tip-author1`, and
`lab-author-owns-tokens-foreign-xec` are `PENDING` with attributable atoms
`125`. Multi-owner and sponsor rows are `AMBIGUOUS_TIP_FUNDING`.
`lab-self-tip` is `SELF_TIP_UNCREDITED`. Consensus-invalid transactions do
not consume outputs. A consensus-valid ALP rejection burns known colored
inputs and retains uncolored outputs.

### Historical prevouts

`R-PREVOUT` binds a spend to stored parent bytes. `txidOf(parentRaw)` must
equal the referenced prevout txid. The output index must exist. The
signature check uses the stored script and amount. `record.inputs` may be
compared and is not authoritative. Unknown parents are `UNAVAILABLE` /
`PREVOUT_NOT_IN_CHAIN` unless the input is marked external, in which case
the source is `EXTERNAL_NOT_DEMONSTRATED`. A parent txid already recorded
in `rejectedTxids` fails `CONSENSUS_INVALID_PARENT` before that external
hatch. Allowed source labels are `LOCAL_CHAIN`, `EXTERNAL_NOT_DEMONSTRATED`,
and `UNAVAILABLE`.

### Replay and rollback

The replay chain uses a separate token id
`d83bc0e899c233e34fec614d5843cb3f20911fd8b450bf2bff48a99df88eac5a`.
Snapshot restore matches a from-scratch replay. Branch B stacked on branch A
without a restore does not match scratch branch B. The only
`LABORATORY_ATTRIBUTED` tip on branch B is `replay-send-b`. Supply on both
branches stays at issuance. `replay-absent-parent-external` is the negative
added at `R-REPLAY`: consensus `INVALID`, reason `CONSENSUS_INVALID_PARENT`,
sources `UNAVAILABLE` and `EXTERNAL_NOT_DEMONSTRATED`, with no retained
outputs.

### PR #42 crosswalk

PR #42 remains Draft at `081d75a762889207283ab7d4434030db30c79b41`.
`R-PR42` is its CI run and Codex receipt. This audit did not modify that
branch.

The funded regtest pair is POST
`754527245d63d478d10df7f4705743bab9a604b4b8f2d74ddc52790387123585` at
height 103 and REPLY
`3f68c65d3b3a92c46b093b25459411ac549fc74b547bcbbff4e53d528e3d4649` at
height 104. REPLY input 0 spends POST output 1. Both use author index 0,
sighash `0x41`, and HASH160 `b4aca63fbf60884195ee538475b6840650273d3f`.
PR #41 stores the raw bytes in `tests/fixtures/rfc0001_regtest_reference.json`
and checks display order in `rfc0001_regtest_reference.test.mjs`. The
production parser is not invoked by that reference file. The pair is one
display-order parent observation. It leaves ALP, reactions, reorg, tip
settlement, and author index 1 unexecuted on that chain.

PR #42 also contains `packages/verification/test/rfc0001-v2-crypto.test.ts`,
an offline suite for synthetic REPLY, REACTION, REACTION_REMOVE, and
TIP_XEC, including author index 1. The outpoints are fabricated. The suite
does not prove node acceptance, reaction replay, or tip settlement.
The regtest evidence note on that PR records a separate signed REPLY whose
parent bytes are the offline fixture `00..1f`, plus the funded pair above,
on an isolated Bitcoin ABC 0.34.2 regtest. That note is historical context.
It is not re-executed here.

### Preservation

The three D-07 samples remain in `tests/fixtures/rfc0001-mainnet-tm1-d07.json`:

- `fadee1662482e302fcac768686085baa8f67ea9b67d846dfea100a0de1dcd9fd`, block `965957`, hash `00000000000000003b25b96ec23a48cfb9adc5c32f6a17854c4a1e48635e9d49`, unix `1788923344`, `TOKEN_STATUS_NON_TOKEN`.
- `8539b6f59912009f8f4fd322bf67266063233c101a4b54aa0a765ad0c9955ff8`, block `966182`, hash `000000000000000014df2a71da2969462991f7f10faf59bfd8b6ca19e54424b5`, unix `1789059586`, `TOKEN_STATUS_NON_TOKEN`.
- `0c96216decc99af759517cf2143e2bd22ea179d48a9280635c8cd1c1eb6b0150`, block `966215`, hash `000000000000000057ab28172e7fe03ec76f05629b1a47d6435ded377dfe2b6c`, unix `1789079141`, label Memo + NFT, `TOKEN_STATUS_NON_TOKEN`.

Both frozen corpora, the 127-row matrix, the ancestry fixture, and the
replay fixture keep the digests in the table above. Dispatch tests and
ancestry tests already lock the corpus digests, the legacy 113-row digest,
and the three TXIDs. This audit adds a check that this document cites
those same values.

## 3. Remaining gaps

Recommended order. Earlier items stay in force while later items proceed
only inside their own boundary.

### Governance decisions required before work can proceed

These tasks are `BLOCKED`. Laboratory fixtures do not substitute for the
decision.

1. Productive SEC-17 mitigation under `packages/`. Comment `6559174591`
   approves decisions A–E as design. A production edit needs a new
   governance decision. The prototype stays outside `packages/`.
2. Social version `0x02` activation, including the M1.9.1 flags, D3, and
   D4. Ratifying the RFC document does not enable the version. M1.9.5
   names the fields an activation record must carry. No such record exists.
3. S1 authorization. M1.9.3 and M1.10.1 keep S1 behind a separate decision.
   This audit does not start S1.
4. Wallet preview, wallet signing policy, and any production indexer.
   SEC-01, SEC-14, and the M1.9.4 persistence clauses wait on that
   decision as well as on an implementation.
5. S0 acceptance itself, which is S0-10. It names the final RFC SHA,
   residual risks, and the effective boundary. That record is absent.

### Work that can continue in the laboratory

These tasks can add fixtures and tests on a draft PR without a new
protocol decision. They do not close S0, M1.7.4, SEC-17, or `EMPP-ALP`.
They do not authorize a node connection, a broadcast, or a `packages/`
edit.

1. Reaction and reaction-removal fixtures now replay under `tests/`.
   The laboratory records a 43-byte script, an idempotent key, duplicate
   delivery, and unlike selection on synthetic branches. It does not close
   M1.7.4, S0-05, or SEC-04. Activation, a persisted indexer, and a
   network reorg remain outside this laboratory. PR #42's offline
   signatures stay a shape example with fabricated prevouts.
2. Attributable XEC tips now have a laboratory under `tests/`.
   Designated-tipper funding, a recipient-funded input, and a
   third-party input credit either a laboratory amount or zero.
   Settlement stays `NOT_DEMONSTRATED`. The laboratory does not close
   M1.7.4, S0-05, or SEC-05. The synthetic ALP ambiguous-funding rows
   remain a different asset.
3. Further synthetic indexer-shaped cases: persistence is still
   unexecuted. More in-memory checkpoints may be added only with
   laboratory labels. A durable indexer is in the governance list above.

### Evidence that the laboratory cannot close

1. Real historical genealogy of public RMZ
   `c923bd0f09c630c5e9980cf518c8d34b6353802a3cb7c3f34fa7cc85c9305908`.
   The synthetic token cannot stand in for it. A read-only historical
   retrieval would be a separate work order. A productive attribution
   claim also waits on governance. This audit does not connect a node.
2. Regtest integration beyond the existing POST/REPLY pair. The pair
   remains one observation. Expanding it into ingest, rebuild, and reorg
   fault injection is D2 exit evidence and is not authorized as S1 by
   this audit.
3. `HISTORICAL-MAINNET` beyond the three D-07 transactions.

## 4. Control

This change publishes this matrix and
`tests/protocol/rfc0001_s0_evidence_matrix.test.ts`. The test is included
from `tests/protocol/vitest.s0-07.config.ts`. The check command is
`corepack pnpm exec vitest run --config tests/protocol/vitest.s0-07.config.ts`.
No frozen fixture, generator, oracle, or file under `packages/` is edited.
PR #40 and PR #42 are not edited. The regtest reference was left unchanged.

## Status count

| Status | Count |
| --- | --- |
| `LAB_VALIDATED` | 26 |
| `PARTIAL` | 76 |
| `NOT_DEMONSTRATED` | 17 |
| `BLOCKED` | 21 |
| `TOTAL` | 140 |
