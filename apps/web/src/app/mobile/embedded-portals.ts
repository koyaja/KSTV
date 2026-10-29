import {
    buildStalkerIdentityRequestContext,
    buildStalkerRequestUrl,
    describeXtreamConnectionFailure,
    normalizeXtreamServerUrl,
} from '@iptvnator/shared/interfaces';
import { type NativeHttp, ProviderTransportError } from './native-http';

/**
 * In-app counterparts of the web-backend `/xtream` and `/stalker` routes
 * (`apps/web-backend/src/app/web-backend-app.ts`). The answer shapes match
 * that backend so `PwaService` works unchanged: provider failures are HTTP
 * 200 with an error body, success is `{ action, payload }`.
 */
export const PORTAL_TIMEOUT_MS = {
    playlist: 30_000,
    stalker: 15_000,
    stalkerCreateLink: 30_000,
    xtream: 30_000,
} as const;

export type QueryParams = Readonly<Record<string, string>>;

export interface ProviderErrorBody {
    readonly message: string;
    readonly status: number;
    readonly code?: string;
}

/** Same contract as `normalizeProviderError` in the web backend. */
export function normalizeProviderError(error: unknown): ProviderErrorBody {
    const transport =
        error instanceof ProviderTransportError ? error : undefined;
    if (transport?.response) {
        return {
            message: transport.response.statusText || 'Bad Gateway',
            status: transport.response.status,
        };
    }
    const code = transport?.code;
    return {
        message: code ? `Bad Gateway (${code})` : 'Bad Gateway',
        status: 502,
        ...(code ? { code } : {}),
    };
}

/** Query parameters minus the backend's own control keys. */
export function proxyParams(
    query: QueryParams,
    excludedKeys: readonly string[]
): Record<string, string> {
    const excluded = new Set(excludedKeys);
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
        const normalized = value.trim();
        if (!excluded.has(key) && normalized) {
            params[key] = normalized;
        }
    }
    return params;
}

function appendPathSegment(url: URL, segment: string): URL {
    const next = new URL(url.href);
    next.pathname = `${next.pathname.replace(/\/+$/, '')}/${segment}`;
    next.search = '';
    next.hash = '';
    return next;
}

export async function handleXtream(
    http: NativeHttp,
    providerUrl: URL,
    query: QueryParams
): Promise<unknown> {
    const isConnectionTest = query['connectionTest'] === 'true';
    try {
        const requestUrl = appendPathSegment(
            new URL(normalizeXtreamServerUrl(providerUrl.href)),
            'player_api.php'
        );
        const params = proxyParams(query, ['targetId', 'connectionTest']);
        for (const [key, value] of Object.entries(params)) {
            requestUrl.searchParams.set(key, value);
        }
        const response = await http({
            url: requestUrl.href,
            responseType: 'json',
            timeoutMs: PORTAL_TIMEOUT_MS.xtream,
        });
        return { action: query['action'], payload: response.data };
    } catch (error) {
        if (isConnectionTest) {
            // A transport error with an HTTP status means the server answered.
            const responded =
                error instanceof ProviderTransportError && !!error.response;
            return {
                connectionFailure: describeXtreamConnectionFailure(
                    error,
                    responded
                ),
            };
        }
        return normalizeProviderError(error);
    }
}

export async function handleStalker(
    http: NativeHttp,
    providerUrl: URL,
    query: QueryParams
): Promise<unknown> {
    const macAddress = query['macAddress']?.trim();
    const token = query['token']?.trim();
    const serialNumber = query['serialNumber']?.trim();
    try {
        // Credentials travel as Cookie / Authorization / SN headers, never in
        // the portal query string — except the handshake's candidate token.
        const params: Record<string, string | number> = proxyParams(query, [
            'targetId',
            'macAddress',
            'token',
            'serialNumber',
            'skipConnectionGuard',
        ]);
        if (params['action'] === 'handshake' && token) {
            params['token'] = token;
        }
        const identity = buildStalkerIdentityRequestContext({
            macAddress: macAddress ?? '',
            params,
            ...(token ? { token } : {}),
            ...(serialNumber ? { serialNumber } : {}),
        });
        const headers = { ...identity.headers };
        if (!macAddress) {
            delete headers['Cookie'];
        }
        // The native stack manages connection reuse itself.
        delete headers['Connection'];
        const response = await http({
            url: buildStalkerRequestUrl(
                providerUrl.href,
                identity.requestParams
            ),
            headers,
            responseType: 'json',
            timeoutMs:
                params['action'] === 'create_link'
                    ? PORTAL_TIMEOUT_MS.stalkerCreateLink
                    : PORTAL_TIMEOUT_MS.stalker,
        });
        return { action: query['action'], payload: response.data };
    } catch (error) {
        return normalizeProviderError(error);
    }
}
