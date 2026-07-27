import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { FeedResponse } from "../api/types";
import { apiClient, AppApiError } from "../api/client";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { copy } from "../copy";
import { abbreviateTxid, chainStatusLabel, formatUnixSeconds, profileAlias, timestampForFeedItem } from "../format";

type FeedState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly feed: FeedResponse }
  | { readonly kind: "error"; readonly message: string };

export function FeedRoute(): React.JSX.Element {
  const [state, setState] = useState<FeedState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    apiClient.getFeed({ limit: 25, signal: controller.signal })
      .then((feed) => {
        setState({ kind: "loaded", feed });
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
  }, [reloadKey]);

  const retry = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  return (
    <section className="page-section" aria-labelledby="feed-title">
      <div className="section-heading">
        <h1 id="feed-title">{copy.feedTitle}</h1>
        <p>{copy.feedDescription}</p>
      </div>
      {state.kind === "loading" ? <LoadingState>{copy.loading}</LoadingState> : null}
      {state.kind === "error" ? <ErrorState message={state.message} onRetry={retry} /> : null}
      {state.kind === "loaded" && state.feed.items.length === 0 ? (
        <div className="state-message">{copy.emptyFeed}</div>
      ) : null}
      {state.kind === "loaded" && state.feed.items.length > 0 ? (
        <div className="memo-list" aria-label="Memos verificados">
          {state.feed.items.map((item) => (
            <article className="memo-card" key={item.transaction.txid}>
              <div className="memo-card__header">
                <div>
                  <p className="memo-card__profile">{profileAlias(item.verification.profileCode)}</p>
                  <p className="memo-card__codes">
                    <code>{item.verification.profileCode ?? "sin-perfil"}</code>
                    <code>{item.verification.eventType ?? "sin-evento"}</code>
                  </p>
                </div>
                <span className={`chain-pill chain-pill--${item.transaction.chainStatus}`}>
                  {chainStatusLabel(item.transaction.chainStatus)}
                </span>
              </div>
              <p className="memo-payload">{item.verification.payload ?? "No disponible"}</p>
              <div className="memo-card__meta">
                {item.transaction.blockHeight === null ? null : <span>Bloque {item.transaction.blockHeight}</span>}
                <time dateTime={dateTimeForSeconds(timestampForFeedItem(item))}>{formatUnixSeconds(timestampForFeedItem(item))}</time>
              </div>
              <Link className="tx-link" to={`/tx/${item.transaction.txid}`} aria-label={`Ver detalle de transaccion ${item.transaction.txid}`}>
                {abbreviateTxid(item.transaction.txid)}
              </Link>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function messageForError(error: unknown): string {
  if (error instanceof AppApiError) {
    return error.message;
  }
  return "No se pudo cargar el feed verificado.";
}

function dateTimeForSeconds(seconds: number | null): string | undefined {
  return seconds === null ? undefined : new Date(seconds * 1000).toISOString();
}
