import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient, AppApiError } from "../api/client";
import type { TxResponse } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { MetadataList } from "../components/MetadataList";
import { copy } from "../copy";
import { chainStatusLabel, displayValue, formatUnixSeconds, payloadText, profileAlias, statusLabel } from "../format";

const TXID_PATTERN = /^[0-9a-f]{64}$/u;

type TxState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly tx: TxResponse }
  | { readonly kind: "error"; readonly message: string };

export function TransactionRoute(): React.JSX.Element {
  const { txid } = useParams();
  const [state, setState] = useState<TxState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const routeTxid = txid ?? "";
  const isValidTxid = TXID_PATTERN.test(routeTxid);

  useEffect(() => {
    if (!isValidTxid) {
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    apiClient.getTransaction(routeTxid, { signal: controller.signal })
      .then((response) => {
        setState({ kind: "loaded", tx: response });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({ kind: "error", message: messageForError(error) });
      });
    return () => {
      controller.abort();
    };
  }, [isValidTxid, reloadKey, routeTxid]);

  const retry = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  if (!isValidTxid) {
    return (
      <section className="page-section">
        <h1>{copy.invalidTxidTitle}</h1>
        <p className="state-message state-message--error">{copy.invalidTxidBody}</p>
      </section>
    );
  }

  return (
    <section className="page-section" aria-labelledby="tx-title">
      <h1 id="tx-title">Detalle de transaccion</h1>
      {state.kind === "loading" ? <LoadingState>{copy.loadingTx}</LoadingState> : null}
      {state.kind === "error" ? <ErrorState message={state.message} onRetry={retry} /> : null}
      {state.kind === "loaded" ? <TransactionDetail tx={state.tx} /> : null}
    </section>
  );
}

function TransactionDetail({ tx }: { readonly tx: TxResponse }): React.JSX.Element {
  const { transaction, verification } = tx;
  return (
    <article className="tx-detail">
      <p className="trust-notice">{copy.trustNotice}</p>
      {verification === null ? <p className="state-message">{copy.nullVerification}</p> : null}
      <p className="txid-full">
        <span>TXID completo</span>
        <code>{transaction.txid}</code>
      </p>
      <MetadataList
        items={[
          { label: "Estado de verificacion", value: statusLabel(verification?.status ?? "No disponible") },
          { label: "Alias de perfil", value: profileAlias(verification?.profileCode ?? null) },
          { label: "Codigo de perfil", value: <code>{displayValue(verification?.profileCode)}</code> },
          { label: "Tipo de evento", value: <code>{displayValue(verification?.eventType)}</code> },
          { label: "Memo", value: <span className="memo-payload memo-payload--inline">{payloadText(verification)}</span> },
          { label: "Longitud en bytes", value: displayValue(verification?.byteLength) },
          { label: "Version de protocolo", value: displayValue(verification?.protocolVersion) },
          { label: "Estado de cadena", value: chainStatusLabel(transaction.chainStatus) },
          { label: "Finalidad", value: displayValue(transaction.isFinal) },
          { label: "Altura de bloque", value: displayValue(transaction.blockHeight) },
          { label: "Hash de bloque", value: <code>{displayValue(transaction.blockHash)}</code> },
          { label: "Tiempo de bloque", value: formatUnixSeconds(transaction.blockTimestamp) },
          { label: "Primera vista", value: formatUnixSeconds(transaction.firstSeenAt) },
          { label: "Direccion autorizante", value: <code>{displayValue(verification?.authorizingAddress)}</code> },
          { label: "Indice de input autorizante", value: displayValue(verification?.authorizingInputIndex) },
          { label: "Altura de evaluacion", value: displayValue(verification?.evaluationHeight) },
          { label: "Indice de output candidato", value: displayValue(verification?.candidate?.outputIndex) },
          { label: "Indice de push candidato", value: displayValue(verification?.candidate?.pushIndex) },
          { label: "Primer indexado", value: formatUnixSeconds(verification?.firstIndexedAt ?? transaction.firstIndexedAt) },
          { label: "Ultima verificacion", value: formatUnixSeconds(verification?.lastVerifiedAt ?? null) }
        ]}
      />
    </article>
  );
}

function messageForError(error: unknown): string {
  if (error instanceof AppApiError) {
    return error.message;
  }
  return "No se pudo cargar la transaccion.";
}
