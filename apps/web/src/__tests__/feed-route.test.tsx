import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { feedResponse, jsonResponse } from "../test/fixtures";

function renderFeed(): void {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>
  );
}

describe("FeedRoute", () => {
  it("shows loading state", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    renderFeed();

    expect(screen.getByText("Cargando publicaciones...")).toBeTruthy();
  });

  it("renders a successful verified memo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));

    renderFeed();

    expect(await screen.findByText(/Hola <strong>Tonalli<\/strong>/u)).toBeTruthy();
    expect(screen.getByText(/Linea dos/u)).toBeTruthy();
    expect(screen.getByText("Confirmada")).toBeTruthy();
    expect(screen.getByText("Bloque 900001")).toBeTruthy();
  });

  it("shows profile alias and code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));

    renderFeed();

    expect(await screen.findByText("xolosarmy.xec")).toBeTruthy();
    expect(screen.getByText("xa")).toBeTruthy();
  });

  it("shows event type code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));

    renderFeed();

    expect(await screen.findByText("p")).toBeTruthy();
  });

  it("shows empty feed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ items: [], limit: 25 })));

    renderFeed();

    expect(await screen.findByText("Todavia no hay memos verificados en el indice publico.")).toBeTruthy();
  });

  it("shows offline error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));

    renderFeed();

    expect(await screen.findByText("No se pudo conectar con la API publica.")).toBeTruthy();
  });

  it("supports retry behavior", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse(feedResponse));
    vi.stubGlobal("fetch", fetchMock);

    renderFeed();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("xolosarmy.xec")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders payload as safe text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));

    renderFeed();

    await screen.findByText(/Hola <strong>Tonalli<\/strong>/u);
    expect(document.querySelector("strong")).toBeNull();
  });

  it("renders a detail link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(feedResponse)));

    renderFeed();

    const link = await screen.findByRole("link", { name: /Ver detalle de transaccion/u });
    expect(link.getAttribute("href")).toBe(`/tx/${feedResponse.items[0]!.transaction.txid}`);
  });

  it("requests the bounded feed limit", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(feedResponse));
    vi.stubGlobal("fetch", fetchMock);

    renderFeed();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/feed?limit=25", expect.any(Object)));
  });
});
