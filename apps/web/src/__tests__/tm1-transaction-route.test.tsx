import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { jsonResponse, tm1TxResponse } from "../test/fixtures";

describe("TM1 TransactionRoute", () => {
  it("renders a TM1 detail without reading a missing pushIndex", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(tm1TxResponse)));

    render(
      <MemoryRouter initialEntries={[`/tx/${tm1TxResponse.transaction.txid}`]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText(tm1TxResponse.transaction.txid)).toBeTruthy();
    expect(screen.getByText("TM1")).toBeTruthy();
    expect(screen.getByText("Publicacion TM1 verificada estructuralmente")).toBeTruthy();
    expect(screen.getByText("Indice de push candidato")).toBeTruthy();
    expect(screen.getAllByText("No disponible").length).toBeGreaterThan(0);
    expect(screen.queryByText("La respuesta de la transaccion no tiene el formato esperado.")).toBeNull();
  });
});
