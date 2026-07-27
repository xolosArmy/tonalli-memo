interface ErrorStateProps {
  readonly message: string;
  readonly onRetry: () => void;
}

export function LoadingState({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="state-message" role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: ErrorStateProps): React.JSX.Element {
  return (
    <div className="state-message state-message--error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
