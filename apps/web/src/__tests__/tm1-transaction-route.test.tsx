import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { jsonResponse, tm1TxResponse } from "../test/fixtures";

describe("TM1 TransactionRoute", () => {
  it("renders technical TM1 authorship and its explicit trust boundary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(tm1TxResponse)));

    render(
      <MemoryRouter initialEntries={[`/tx/${tm1TxResponse.transaction.txid}`]}>
        <App />
      </MemoryRouter>
    );

    const fullHash = tm1TxResponse.verification!.tm1Authorship!.publicKeyHashHex;
    expect(await screen.findByText(tm1TxResponse.transaction.txid)).toBeTruthy();
    expect(screen.getByLabelText("Protocolo TM1")).toBeTruthy();
    expect(screen.getByText("Publicacion TM1 verificada estructuralmente")).toBeTruthy();
    expect(screen.getByText("Identificador de autoría TM1")).toBeTruthy();
    expect(screen.getByText(fullHash)).toBeTruthy();
    expect(screen.getByText("0x41 (65)")).toBeTruthy();
    expect(screen.getByText("trusted-chronik")).toBeTruthy();
    expect(screen.getByText("Estructural; no matemática independiente")).toBeTruthy();
    expect(screen.getByText(/Esta interfaz no verifica matemáticamente la firma de forma independiente/u)).toBeTruthy();
    expect(screen.queryByText("Alias de perfil")).toBeNull();
    expect(screen.queryByText("Codigo de perfil")).toBeNull();
    expect(screen.queryByText("Indice de push candidato")).toBeNull();
    expect(screen.queryByText("La respuesta de la transaccion no tiene el formato esperado.")).toBeNull();
  });
});
