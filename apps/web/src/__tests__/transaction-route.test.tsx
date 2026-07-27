import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { jsonResponse, nullVerificationResponse, txid, verifiedTxResponse } from "../test/fixtures";

function renderTx(path = `/tx/${txid}`): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe("TransactionRoute", () => {
  it("shows loading", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    renderTx();

    expect(screen.getByText("Cargando transaccion...")).toBeTruthy();
  });

  it("renders successful detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(verifiedTxResponse)));

    renderTx();

    expect(await screen.findByText(txid)).toBeTruthy();
    expect(screen.getByText("VERIFIED")).toBeTruthy();
    expect(screen.getByText("xolosarmy.xec")).toBeTruthy();
  });

  it("renders complete metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(verifiedTxResponse)));

    renderTx();

    expect(await screen.findByText("Codigo de perfil")).toBeTruthy();
    expect(screen.getByText("Tipo de evento")).toBeTruthy();
    expect(screen.getByText("Longitud en bytes")).toBeTruthy();
    expect(screen.getByText("Version de protocolo")).toBeTruthy();
    expect(screen.getByText("Estado de cadena")).toBeTruthy();
    expect(screen.getByText("Finalidad")).toBeTruthy();
    expect(screen.getByText("Altura de bloque")).toBeTruthy();
    expect(screen.getByText("Hash de bloque")).toBeTruthy();
    expect(screen.getByText("Tiempo de bloque")).toBeTruthy();
    expect(screen.getByText("Primera vista")).toBeTruthy();
    expect(screen.getByText("Direccion autorizante")).toBeTruthy();
    expect(screen.getByText("Indice de input autorizante")).toBeTruthy();
    expect(screen.getByText("Altura de evaluacion")).toBeTruthy();
    expect(screen.getByText("Indice de output candidato")).toBeTruthy();
    expect(screen.getByText("Indice de push candidato")).toBeTruthy();
    expect(screen.getByText("Primer indexado")).toBeTruthy();
    expect(screen.getByText("Ultima verificacion")).toBeTruthy();
  });

  it("handles null verification", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(nullVerificationResponse)));

    renderTx(`/tx/${nullVerificationResponse.transaction.txid}`);

    expect(await screen.findByText("Esta transaccion existe en el indice, pero no tiene un registro de verificacion guardado.")).toBeTruthy();
  });

  it("handles invalid TXID without fetching", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderTx("/tx/ABC");

    expect(screen.getByRole("heading", { name: "TXID invalido" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "NOT_FOUND", message: "ignored" } }, { status: 404 })));

    renderTx();

    expect(await screen.findByText("No encontramos esa transaccion en el indice publico.")).toBeTruthy();
  });

  it("handles offline error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));

    renderTx();

    expect(await screen.findByText("No se pudo conectar con la API publica.")).toBeTruthy();
  });

  it("handles malformed response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{", { status: 200 })));

    renderTx();

    expect(await screen.findByText("La API devolvio JSON mal formado.")).toBeTruthy();
  });

  it("supports retry behavior", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse(verifiedTxResponse));
    vi.stubGlobal("fetch", fetchMock);

    renderTx();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("VERIFIED")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes the trust notice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(verifiedTxResponse)));

    renderTx();

    expect(await screen.findByText(/politica de registro/u)).toBeTruthy();
    expect(screen.getByText(/No es verificacion independiente de consenso ni de firmas/u)).toBeTruthy();
  });
});
