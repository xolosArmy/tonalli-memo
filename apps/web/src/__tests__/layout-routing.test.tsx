import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { feedResponse, jsonResponse, txid, verifiedTxResponse } from "../test/fixtures";

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe("layout", () => {
  it("renders the title", () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));
    renderAt("/");

    expect(screen.getByText("Tonalli Memo")).toBeTruthy();
  });

  it("renders Home navigation", () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));
    renderAt("/");

    expect(screen.getByRole("link", { name: "Inicio" }).getAttribute("href")).toBe("/");
  });

  it("renders routed content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));
    renderAt("/");

    expect(await screen.findByRole("heading", { name: "Publicaciones verificadas" })).toBeTruthy();
  });
});

describe("routing", () => {
  it("/ renders Feed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));
    renderAt("/");

    expect(await screen.findByText("xolosarmy.xec")).toBeTruthy();
  });

  it("/tx/:txid renders detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(verifiedTxResponse)));
    renderAt(`/tx/${txid}`);

    expect(await screen.findByRole("heading", { name: "Detalle de transaccion" })).toBeTruthy();
  });

  it("unknown route renders a local not-found page", () => {
    renderAt("/sin-ruta");

    expect(screen.getByRole("heading", { name: "Pagina no encontrada" })).toBeTruthy();
  });
});
