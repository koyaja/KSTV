import { createNativeHttp, type NativeHttp } from './native-http';
import { handlePlaylistParse } from './embedded-playlist';
import { handleStalker, handleXtream, type QueryParams } from './embedded-portals';

/**
 * The backend the browser runtime expects (`apps/web-backend`), answered in
 * process. `BACKEND_URL` points at this sentinel origin in the native shells;
 * the HTTP interceptor and the fetch shim route its requests here.
 *
 * Server storage (`/v1/*`) is not offered: a 404 keeps the app on local
 * (IndexedDB) storage, exactly like a stateless self-hosted backend.
 */
export const EMBEDDED_BACKEND_URL = 'https://kstv.embedded';

export interface EmbeddedRequest {
    readonly method: string;
    readonly url: string;
    readonly body?: unknown;
}

export interface EmbeddedResponse {
    readonly status: number;
    readonly body: unknown;
}

export function isEmbeddedBackendUrl(url: string): boolean {
    return (
        url === EMBEDDED_BACKEND_URL ||
        url.startsWith(`${EMBEDDED_BACKEND_URL}/`) ||
        url.startsWith(`${EMBEDDED_BACKEND_URL}?`)
    );
}

const ok = (body: unknown): EmbeddedResponse => ({ status: 200, body });
const fail = (status: number, message: string): EmbeddedResponse => ({
    status,
    body: { message, status },
});

/** Deterministic id per provider URL, like the backend's SHA-256 digest. */
function targetIdFor(href: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < href.length; index += 1) {
        hash ^= href.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `t${(hash >>> 0).toString(16)}${href.length.toString(16)}`;
}

function bodyUrl(body: unknown): string | undefined {
    let value = body;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            return undefined;
        }
    }
    const url =
        value && typeof value === 'object' && 'url' in value
            ? (value as { url: unknown }).url
            : undefined;
    return typeof url === 'string' ? url : undefined;
}

export class EmbeddedBackend {
    private readonly targets = new Map<string, URL>();

    constructor(private readonly http: NativeHttp = createNativeHttp()) {}

    async handle(request: EmbeddedRequest): Promise<EmbeddedResponse> {
        const url = new URL(request.url);
        const query: Record<string, string> = {};
        url.searchParams.forEach((value, key) => {
            // First value wins, like the backend's query normalization.
            if (!(key in query)) {
                query[key] = value;
            }
        });
        const route = `${request.method.toUpperCase()} ${url.pathname.replace(/\/+$/, '') || '/'}`;

        switch (route) {
            case 'GET /':
                return ok('KSTV embedded backend');
            case 'GET /health':
                return ok({ status: 'ok', service: 'kstv-embedded-backend' });
            case 'POST /provider-targets':
                return this.registerTarget(bodyUrl(request.body));
            case 'POST /connectivity-guard/reset':
                // No circuit breaker runs in process: nothing to reset.
                return bodyUrl(request.body)
                    ? ok({ reset: false })
                    : fail(400, 'Missing url');
            case 'GET /parse':
                return this.withTarget(query, async (target) => {
                    const result = await handlePlaylistParse(
                        this.http,
                        target,
                        query['userAgent']?.trim() || undefined
                    );
                    return isErrorBody(result)
                        ? { status: result.status, body: result }
                        : ok(result);
                });
            case 'GET /xtream':
                return this.withTarget(query, async (target) =>
                    ok(await handleXtream(this.http, target, query))
                );
            case 'GET /stalker':
                return this.withTarget(query, async (target) =>
                    ok(await handleStalker(this.http, target, query))
                );
            default:
                return fail(404, 'Not found');
        }
    }

    private registerTarget(rawUrl: string | undefined): EmbeddedResponse {
        if (!rawUrl) {
            return fail(400, 'Missing url');
        }
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            return fail(400, 'Provider URL is not a valid URL');
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return fail(400, 'Only http and https provider URLs are supported');
        }
        // Private-network providers are allowed on device: a home server or
        // the user's own panel on the LAN is a normal setup for a TV app.
        const targetId = targetIdFor(url.href);
        this.targets.set(targetId, url);
        return ok({ targetId });
    }

    private async withTarget(
        query: QueryParams,
        run: (target: URL) => Promise<EmbeddedResponse>
    ): Promise<EmbeddedResponse> {
        const targetId = query['targetId'];
        const target = targetId ? this.targets.get(targetId) : undefined;
        if (!target) {
            return fail(404, 'Unknown provider target');
        }
        return run(new URL(target.href));
    }
}

function isErrorBody(
    value: unknown
): value is { status: number; message: string } {
    return (
        !!value &&
        typeof value === 'object' &&
        typeof (value as { status?: unknown }).status === 'number' &&
        typeof (value as { message?: unknown }).message === 'string'
    );
}

let sharedBackend: EmbeddedBackend | null = null;

export function getEmbeddedBackend(): EmbeddedBackend {
    sharedBackend ??= new EmbeddedBackend();
    return sharedBackend;
}
