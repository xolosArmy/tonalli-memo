# SEC-17 experimental container dispatch

Status of this file: isolated prototype evidence. It is not a production
change and it does not satisfy SEC-17.

Comment `6559174591` approves decisions A-E as design only. The function
under test is `tests/protocol/sec17-experimental-dispatch.ts`. Production
packages stay on baseline `228d1f036643ca9be8ba85e91f8200536f3242da`.
`productionDispatch` in the matrix is false. `sec17Mitigation` is
`DESIGN_APPROVED_VALIDATION_PENDING`.

RFC-0001 remains PROPOSED — NOT RATIFIED. S0: OPEN. S1: NOT AUTHORIZED.
Social version `0x02` stays inactive. S0-07 remains unsatisfied. This run
does not ratify RFC-0001 and does not close SEC-17.

## What the prototype reads

The dispatcher classifies each OP_RETURN before it counts memos:

- a conventional OP_RETURN whose pushes start with `TM`, recorded as
  `CONVENTIONAL_TM0`;
- a conventional OP_RETURN whose first data push is the TM1 Core v1.0
  LOKAD, recorded as `CONVENTIONAL_TM1`;
- `OP_RETURN OP_RESERVED` with eMPP, ALP, and TMM entries, recorded as
  `EMPP` when the normalizer parsed it.

It then calls the unmodified production functions in parallel with
`tests/protocol/empp-tmm-independent.mjs`. The frozen corpora stay byte
identical:

- `tests/fixtures/rfc0001-empp-tmm.json`, SHA-256
  `3a6519697f6f88de7801520e80f8442ab63522fcf1e4b0e6dbef0b6d8ae882d8`
- `tests/fixtures/rfc0001-empp-sec17-decisions.json`, SHA-256
  `76776bd3403b59ca69aac9328d9d3ff5d14a0fc396c5e302d35c603eabaec1ca`

The before/after matrix is `tests/fixtures/rfc0001-sec17-dispatch-matrix.json`.
A difference that is not one of A-E fails the suite as `BLOCKED`.

## Decisions A-E, as executed here

Decision A. Inside a parsed eMPP container, a push whose first four bytes
are the TMM LOKAD `544d4d00` is dropped from the TM0 candidate set. A
39-byte entry with version `0x02` and event `0x05` is
`TMM_STRUCTURALLY_VALID`. Any other recognized LOKAD entry is
`TMM_MALFORMED`. Other eMPP pushes are not dropped. Neither tag credits a
social event. Settlement stays `PENDING`. `alp-send-plus-one-tmm` keeps no
TM0 candidate.

Decision B. When that drop leaves one real TM1 Core POST and no real TM0
memo, the POST stays visible and the false `MULTIPLE_MEMOS` is not kept.
`empp-beside-one-tm1` is that case. A real TM0 beside a real TM1, and two
TM1 candidates, stay `MULTIPLE_MEMOS`, as comment `6529195032` requires.
The experimental verdict on an empty-input POST is not `VERIFIED_TM1`.

Decision C. A push inside eMPP whose layout is `TM0_TEXT_LAYOUT` and which
`decodeMemo` plus `validateMemo` accept stays a TM0 candidate
(`GENUINE_TM0_INSIDE_EMPP`). `c-empp-tm0-text` keeps that candidate and
returns `UNAUTHORIZED` with authorship `NOT_DEMONSTRATED`.
`c-empp-tmm-and-tm0-text` keeps only that text push. Recognition is not
authorization and does not claim a mainnet occurrence.

Decision D. Textual markers that start with `TM` and are not the TMM LOKAD
stay candidates. The public code is still the production decoder:
`INVALID_UTF8`, then `INVALID_FORMAT`, then `UNSUPPORTED_VERSION` or
`INVALID_MARKER`, then `validateMemo`. `d-empp-tm1-pipe`,
`d-empp-tm2-pipe`, and `d-empp-tm9-pipe` stay `UNSUPPORTED_VERSION`.
`parseTm1Output` still throws `INVALID_MARKER` on those eMPP scripts. A
pipe-shaped `TM1|…` is not a binary TM1 POST.

Decision E. The internal flags `BYTE_BUDGET_EXCEEDED`, `MALFORMED_EMPP`,
`TRUNCATED_EMPP`, `UNRECOGNIZED_CONTAINER`, and `ABSENT_MEMO` do not add a
public status. Scripts of 224 and 225 bytes stay public `NO_MEMO` because
`getStackArray` throws. The 223-byte TM0 text stays a candidate and
returns `UNAUTHORIZED` with empty inputs. An over-budget script that is
still a TM1 candidate keeps that candidate, so Core can still return
`PAYLOAD_TOO_LARGE`. `two-push-social-v2-inactive` stays
`UNSUPPORTED_VERSION`.

An A or B label also requires the public verdict to match the memos that
remain. Zero retained memos must be `NO_MEMO`. One retained TM1 must be
`INVALID_TM1` with a protocol code, and only when production had counted
that POST inside `MULTIPLE_MEMOS`. One retained TM0 must be `UNAUTHORIZED`
or `INVALID_MEMO`. More than one retained memo must stay `MULTIPLE_MEMOS`.
A `NO_MEMO` result that still has a candidate is `BLOCKED`.

When the filtered candidate set matches production, the experimental
status is a copy of `verifyNormalizedTransaction`. The three archived D-07
transactions stay `VERIFIED_TM1` with `trustModel: trusted-chronik`. That
copy is not an independent signature, and this prototype does not replace
the independent reader. Their TXIDs, raw bytes, and digests stay in
`tests/fixtures/rfc0001-mainnet-tm1-d07.json`.

## Limits that remain open

Container classification is an interpretation step. It is not evidence of
a signature, of authorship, of a valid token, or of a settled transfer.
An eMPP script with a structurally valid ALP SEND and a structurally valid
TMM entry is not a valid RMZ tip. The prototype never sets
`socialEventCredited`, and its settlement field stays `PENDING`. It does
not emit `VERIFIED`, `VERIFIED_TM1`, or `SETTLED` for a fixture with no
inputs. A `VERIFIED_TM1` row appears only when production already returned
that status for the same candidates and the transaction has inputs. The
authorship label on that row is `PRODUCTION_TRUSTED_CHRONIK`.
`verifyTm1DesignatedInput` still does not check the sighash digest.

The prototype does not search mainnet, does not connect to a node, and
does not spend or broadcast. It does not activate social version `0x02`.
Approving A-E does not modify production and does not close SEC-17.
EMPP-ALP, M1.7.4, S0-05, S0-06, and S0-07 stay open. Documentary approval
does not authorize S1.

Regenerate the locked matrix only when the dispatcher changes, then rerun
without the write switch:

```sh
SEC17_MATRIX_WRITE=1 pnpm exec vitest run --config tests/protocol/vitest.s0-07.config.ts tests/protocol/rfc0001_sec17_dispatch.test.ts
pnpm exec vitest run --config tests/protocol/vitest.s0-07.config.ts
node --test scripts/d07-conf-04-historical-audit.test.mjs
```
