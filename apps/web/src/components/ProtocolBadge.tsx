import type { StoredMemoProtocol } from "../api/types";

export function ProtocolBadge({ protocol }: { readonly protocol: StoredMemoProtocol }): React.JSX.Element {
  return (
    <span className={`protocol-pill protocol-pill--${protocol.toLowerCase()}`} aria-label={`Protocolo ${protocol}`}>
      {protocol}
    </span>
  );
}
