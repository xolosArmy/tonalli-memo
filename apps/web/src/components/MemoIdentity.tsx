import type { StoredVerification } from "../api/types";
import { abbreviateHash160, profileAlias } from "../format";
import { ProtocolBadge } from "./ProtocolBadge";

export function MemoIdentity({ verification }: { readonly verification: StoredVerification }): React.JSX.Element {
  if (verification.protocol === "TM1") {
    const authorship = verification.tm1Authorship;
    return (
      <div className="memo-identity memo-identity--tm1">
        <div className="memo-identity__heading">
          <ProtocolBadge protocol="TM1" />
          <span className="memo-identity__label">Autoría estructural TM1</span>
        </div>
        {authorship === null ? (
          <span className="memo-identity__fallback">Datos de autoría no disponibles</span>
        ) : (
          <code className="memo-identity__hash" title={authorship.publicKeyHashHex}>
            {abbreviateHash160(authorship.publicKeyHashHex)}
          </code>
        )}
        <p className="memo-card__codes">
          <code>{verification.eventType ?? "sin-evento"}</code>
        </p>
        <span className="trust-pill">Fuente Chronik confiable</span>
      </div>
    );
  }

  return (
    <div className="memo-identity memo-identity--tm0">
      <div className="memo-identity__heading">
        <ProtocolBadge protocol="TM0" />
        <span className="memo-card__profile">{profileAlias(verification.profileCode)}</span>
      </div>
      <p className="memo-card__codes">
        <code>{verification.profileCode ?? "sin-perfil"}</code>
        <code>{verification.eventType ?? "sin-evento"}</code>
      </p>
    </div>
  );
}
