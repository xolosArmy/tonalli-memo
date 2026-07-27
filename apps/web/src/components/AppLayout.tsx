import { NavLink, Outlet } from "react-router-dom";
import { copy } from "../copy";

export function AppLayout(): React.JSX.Element {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <a className="brand" href="/">
            {copy.appTitle}
          </a>
          <nav aria-label="Navegacion principal">
            <NavLink to="/">{copy.home}</NavLink>
          </nav>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">{copy.readOnlyFooter}</footer>
    </div>
  );
}
