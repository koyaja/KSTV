import { capacitorPlugins, type CapacitorPluginsLike } from './native-shell';

/**
 * Provider HTTP for the native shells.
 *
 * On Android the request goes through Capacitor's native HTTP plugin: no
 * CORS, and the forbidden browser headers Stalker portals need (Cookie,
 * User-Agent) reach the portal. Elsewhere (webOS, desktop browser during
 * development) it falls back to `fetch`.
 *
 * Callers pass a fully built URL: Stalker `cmd` encoding is significant, so
 * this layer never re-encodes query parameters.
 */
export interface NativeHttpRequest {
    readonly url: string;
    readonly headers?: Record<string, string>;
    readonly responseType?: 'text' | 'json';
    readonly timeoutMs: number;
}

export interface NativeHttpResponse {
    readonly status: number;
    readonly data: unknown;
}

/** Shaped like the Node transport errors the shared classifiers read. */
export class ProviderTransportError extends Error {
    readonly code?: string;
    readonly response?: { status: number; statusText: string };

    constructor(
        message: string,
        options: {
            code?: string;
            response?: { status: number; statusText: string };
        } = {}
    ) {
        super(message);
        this.name = 'ProviderTransportError';
        this.code = options.code;
        this.response = options.response;
    }
}

export type NativeHttp = (
    request: NativeHttpRequest
) => Promise<NativeHttpResponse>;

export function createNativeHttp(
    plugins: CapacitorPluginsLike | undefined = capacitorPlugins(),
    fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args)
): NativeHttp {
    const capacitorHttp = plugins?.CapacitorHttp;
    if (capacitorHttp) {
        return (request) => capacitorRequest(capacitorHttp, request);
    }
    return (request) => fetchRequest(fetchImpl, request);
}

async function capacitorRequest(
    http: NonNullable<CapacitorPluginsLike['CapacitorHttp']>,
    request: NativeHttpRequest
): Promise<NativeHttpResponse> {
    let response: { status: number; data: unknown };
    try {
        response = await http.request({
            url: request.url,
            method: 'GET',
            headers: request.headers ?? {},
            responseType: request.responseType ?? 'text',
            connectTimeout: request.timeoutMs,
            readTimeout: request.timeoutMs,
        });
    } catch (error) {
        throw toTransportError(error);
    }
    assertOk(response.status);
    return {
        status: response.status,
        data: decodeBody(response.data, request.responseType),
    };
}

async function fetchRequest(
    fetchImpl: typeof fetch,
    request: NativeHttpRequest
): Promise<NativeHttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    let response: Response;
    try {
        response = await fetchImpl(request.url, {
            headers: request.headers,
            signal: controller.signal,
        });
    } catch (error) {
        throw controller.signal.aborted
            ? new ProviderTransportError('Request timed out', {
                  code: 'ETIMEDOUT',
              })
            : toTransportError(error);
    } finally {
        clearTimeout(timer);
    }
    assertOk(response.status, response.statusText);
    const text = await response.text();
    return {
        status: response.status,
        data: decodeBody(text, request.responseType),
    };
}

function assertOk(status: number, statusText = ''): void {
    if (status >= 400) {
        throw new ProviderTransportError(`HTTP ${status}`, {
            response: { status, statusText: statusText || `HTTP ${status}` },
        });
    }
}

/** Capacitor already parses JSON bodies; fetch hands back text. */
function decodeBody(
    data: unknown,
    responseType: NativeHttpRequest['responseType']
): unknown {
    if (responseType !== 'json' || typeof data !== 'string') {
        return data;
    }
    const trimmed = data.trim();
    if (!trimmed) {
        return null;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        // Panels sometimes answer HTML or plain text; keep it for the caller.
        return data;
    }
}

const ERROR_CODE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
    [/timed? ?out|timeout/i, 'ETIMEDOUT'],
    [/unable to resolve host|unknownhost|enotfound|name not resolved/i, 'ENOTFOUND'],
    [/refused|failed to connect|econnrefused/i, 'ECONNREFUSED'],
    [/wrong version number/i, 'ERR_SSL_WRONG_VERSION_NUMBER'],
    [/certificate|cert|trust anchor/i, 'ERR_TLS_CERT_ALTNAME_INVALID'],
    [/ssl|tls|handshake/i, 'EPROTO'],
    [/reset|ECONNRESET|unexpected end/i, 'ECONNRESET'],
];

/** Maps Android / browser network failures onto Node-style error codes. */
export function toTransportError(error: unknown): ProviderTransportError {
    if (error instanceof ProviderTransportError) {
        return error;
    }
    const message =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Network request failed';
    const code = ERROR_CODE_PATTERNS.find(([pattern]) =>
        pattern.test(message)
    )?.[1];
    return new ProviderTransportError(message, code ? { code } : {});
}
