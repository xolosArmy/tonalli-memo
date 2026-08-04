import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { jsonResponse, tm1FeedResponse } from "../test/fixtures";

describe("TM1 FeedRoute", () => {
  it("renders a valid TM1 feed response instead of rejecting it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(tm1FeedResponse)));

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("Publicacion TM1 verificada estructuralmente")).toBeTruthy();
    expect(screen.getByText("sin-perfil")).toBeTruthy();
    expect(screen.queryByText("La respuesta del feed no tiene el formato esperado.")).toBeNull();
  });
});
