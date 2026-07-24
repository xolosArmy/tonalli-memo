# Official Profile Registry

The Official Profile Registry is versioned Tonalli Memo project data that maps compact protocol profile codes to public eCash aliases and authorized posting addresses.

It is used by indexers and user interfaces to decide whether a Tonalli Memo transaction may be presented as verified for an official profile. It is not eCash consensus and does not change transaction validity on the network.

## Schema Version

The initial registry schema is `schemaVersion: 1` on `network: "ecash-mainnet"`.

The canonical registry lives at `data/registry.json`. Runtime consumers should parse it with `@tonalli-memo/registry` instead of trusting TypeScript JSON types as validation.

## Initial Profile Codes

Protocol v0 defines these profile codes and aliases:

| Code | Alias | Display name |
| --- | --- | --- |
| `xa` | `xolosarmy.xec` | xolosArmy Network |
| `ty` | `teyolia.xec` | Teyolia |
| `tw` | `tonalli.xec` | Tonalli Wallet |
| `em` | `ecashmx.xec` | eCash Magazine México |

The registry reuses the profile codes and aliases exported by `@tonalli-memo/protocol`. It does not redefine protocol profile meaning independently.

## Immutable Code Meaning

Within protocol v0, the meaning of a profile code is immutable. For example, `xa` means `xolosarmy.xec`. A future registry update must not change `xa` to represent another alias, project, or identity.

Authorized posting addresses can be added, rotated, or retired over time without changing the historical meaning of the profile code.

## Authorized Addresses

Each profile has an `authorizedAddresses` array. Empty arrays are valid and mean no address is currently authorized for that official profile.

Production eCash addresses must not be guessed. They should only be added when there is reviewed project evidence for the address and the registry update is versioned.

Address entries use the canonical lowercase `ecash:` representation. Registry parsing rejects uppercase and mixed-case addresses rather than normalizing them.

The v0 parser performs only canonical syntactic checks: addresses must be non-empty strings, must use the `ecash:` prefix, and must already be lowercase. Full eCash CashAddr checksum validation is a future production requirement before real authorized addresses are added.

Optional address validity bounds are inclusive:

- `validFromHeight` means the address is active at that height and later.
- `validUntilHeight` means the address is active through that height.
- If both bounds exist, `validFromHeight <= validUntilHeight` must hold.

## Confirmed Authorization

For a confirmed transaction, authorization is evaluated at the transaction block height:

```text
evaluationHeight = blockHeight
```

An address is authorized only when it is listed for the profile and the confirmed block height falls within the address validity interval.

## Mempool Authorization

For an unconfirmed transaction, authorization requires current tip-height context. The registry evaluates the earliest height at which the transaction could be included:

```text
evaluationHeight = tipHeight + 1
```

For example, at `tipHeight = 999`, the mempool evaluation height is `1000`. An address with `validFromHeight = 1000` is active, while an address with `validFromHeight = 1001` is not yet valid. An address with `validUntilHeight = 1000` is still active, while `validUntilHeight = 999` is expired.

## Protocol Parsing vs Profile Authorization

Tonalli Memo protocol parsing and validation determine whether a memo envelope is structurally valid and uses known v0 codes. Profile authorization is a separate indexer/UI policy that checks whether the transaction was posted by an address authorized for that profile at the relevant height.

The registry does not dynamically resolve eCash aliases and does not prove identity independently of authorized transaction inputs. It establishes the project-reviewed relationship between a protocol profile code, a public alias, and authorized posting addresses.

Chronik transaction-input verification is not implemented yet. Until transaction inputs are inspected through Chronik, registry authorization must not be described as complete cryptographic verification of a transaction author.

## Cross-Profile Address Reuse

Duplicate addresses inside the same profile are invalid. The same address may appear under multiple different profiles, but the declared `TM0` profile code is checked independently. Authorization for one profile does not imply authorization for another profile.

## Future Updates

Registry changes should be small, reviewed, and versioned. Updates may add, rotate, or retire authorized addresses, but must preserve the immutable protocol v0 profile-code meanings.
