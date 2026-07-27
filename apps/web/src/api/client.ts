import { isApiErrorDto, isFeedResponse, isTxResponse } from "./guards";
import type { FeedResponse, TxResponse } from "./types";

const DEFAULT_API_BASE_URL = "/api/v1";

export type AppErrorCode = "HTTP_ERROR" | "NETWORK_ERROR" | "MALFORMED_JSON" | "INVALID_RESPONSE";

export class AppApiError extends Error {
  readonly code: AppErrorCode;
  readonly status: number | null;
  readonly apiCode: string | null;

  constructor(message: string, options: { readonly code: AppErrorCode; readonly status?: number; readonly apiCode?: string } ) {
    super(message);
    this.name = "AppApiError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.apiCode = options.apiCode ?? null;
  }
}

export interface ApiClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class TonalliApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL);
    this.fetchImpl = options.fetchImpl;
  }

  async getFeed(options: { readonly limit?: number; readonly signal?: AbortSignal } = {}): Promise<FeedResponse> {
    const url = new URL(`${this.baseUrl}/feed`, window.location.origin);
    url.searchParams.set("limit", String(options.limit ?? 25));
    const value = await this.requestUnknown(pathFromUrl(url), options.signal);
    if (!isFeedResponse(value)) {
      throw new AppApiError("La respuesta del feed no tiene el formato esperado.", { code: "INVALID_RESPONSE" });
    }
    return value;
  }

  async getTransaction(txid: string, options: { readonly signal?: AbortSignal } = {}): Promise<TxResponse> {
    const value = await this.requestUnknown(`${this.baseUrl}/tx/${encodeURIComponent(txid)}`, options.signal);
    if (!isTxResponse(value)) {
      throw new AppApiError("La respuesta de la transaccion no tiene el formato esperado.", { code: "INVALID_RESPONSE" });
    }
    return value;
  }

  private async requestUnknown(url: string, signal: AbortSignal | undefined): Promise<unknown> {
    let response: Response;
    try {
      const init: RequestInit = {
        method: "GET",
        credentials: "omit",
        headers: {
          accept: "application/json"
        },
        ...(signal === undefined ? {} : { signal })
      };
      response = await (this.fetchImpl ?? fetch)(url, init);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new AppApiError("No se pudo conectar con la API publica.", { code: "NETWORK_ERROR" });
    }

    const body = await parseJson(response);
    if (!response.ok) {
      if (isApiErrorDto(body)) {
        throw new AppApiError(messageForStatus(response.status), {
          code: "HTTP_ERROR",
          status: response.status,
          apiCode: body.error.code
        });
      }
      throw new AppApiError(messageForStatus(response.status), { code: "HTTP_ERROR", status: response.status });
    }
    return body;
  }
}

export const apiClient = new TonalliApiClient();

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new AppApiError("La API devolvio JSON mal formado.", { code: "MALFORMED_JSON", status: response.status });
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, "");
}

function pathFromUrl(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function messageForStatus(status: number): string {
  if (status === 404) {
    return "No encontramos esa transaccion en el indice publico.";
  }
  return "La API publica respondio con un error.";
}
