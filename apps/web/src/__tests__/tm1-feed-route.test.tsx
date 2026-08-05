import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { jsonResponse, tm1FeedResponse } from "../test/fixtures";

describe("TM1 FeedRoute", () => {
  it("renders a protocol-aware TM1 identity without pretending it is a TM0 profile", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(tm1FeedResponse)));

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("Publicacion TM1 verificada estructuralmente")).toBeTruthy();
    expect(screen.getByLabelText("Protocolo TM1")).toBeTruthy();
    expect(screen.getByText("Autoría estructural TM1")).toBeTruthy();
    expect(screen.getByText("22222222…22222222")).toBeTruthy();
    expect(screen.getByText("POST")).toBeTruthy();
    expect(screen.getByText("Fuente Chronik confiable")).toBeTruthy();
    expect(screen.queryByText("Perfil desconocido")).toBeNull();
    expect(screen.queryByText("sin-perfil")).toBeNull();
    expect(screen.queryByText("La respuesta del feed no tiene el formato esperado.")).toBeNull();
  });
});
