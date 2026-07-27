import { Link } from "react-router-dom";
import { copy } from "../copy";

export function NotFoundRoute(): React.JSX.Element {
  return (
    <section className="page-section">
      <h1>{copy.notFoundTitle}</h1>
      <p className="state-message">{copy.notFoundBody}</p>
      <Link className="tx-link" to="/">
        Volver al inicio
      </Link>
    </section>
  );
}
