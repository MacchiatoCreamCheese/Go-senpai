interface Props {
  /** Override the body copy. */
  message?: string;
}

export function AuthLoading({ message = "checking session…" }: Props) {
  return (
    <div className="auth-loading">
      <span className="auth-loading-mark" aria-hidden="true">先</span>
      <span className="auth-loading-text">{message}</span>
    </div>
  );
}
