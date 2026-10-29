import { EMBEDDED_BACKEND_URL, EmbeddedBackend } from './embedded-backend';
import {
    type NativeHttp,
    type NativeHttpRequest,
    ProviderTransportError,
    toTransportError,
} from './native-http';
import { installEmbeddedFetch } from './mobile-runtime';
import { detectNativeShell } from './native-shell';

const M3U = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="sport1" group-title="Sport",Sport Live 1',
    'http://example.test/hls/sport1/index.m3u8',
].join('\n');

function recordingHttp(
    answer: (request: NativeHttpRequest) => unknown
): { http: NativeHttp; requests: NativeHttpRequest[] } {
    const requests: NativeHttpRequest[] = [];
    const http: NativeHttp = async (request) => {
        requests.push(request);
        const data = answer(request);
        if (data instanceof Error) {
            throw data;
        }
        return { status: 200, data };
    };
    return { http, requests };
}

async function register(
    backend: EmbeddedBackend,
    url: string
): Promise<string> {
    const response = await backend.handle({
        method: 'POST',
        url: `${EMBEDDED_BACKEND_URL}/provider-targets`,
        body: { url },
    });
    expect(response.status).toBe(200);
    return (response.body as { targetId: string }).targetId;
}

describe('EmbeddedBackend', () => {
    it('registers provider targets deterministically and rejects non-http URLs', async () => {
        const backend = new EmbeddedBackend(recordingHttp(() => '').http);
        const first = await register(backend, 'http://panel.test:8080');
        const second = await register(backend, 'http://panel.test:8080');
        expect(first).toBe(second);

        const rejected = await backend.handle({
            method: 'POST',
            url: `${EMBEDDED_BACKEND_URL}/provider-targets`,
            body: JSON.stringify({ url: 'file:///etc/passwd' }),
        });
        expect(rejected.status).toBe(400);
    });

    it('answers 404 for an unknown target and for server storage routes', async () => {
        const backend = new EmbeddedBackend(recordingHttp(() => '').http);
        const unknown = await backend.handle({
            method: 'GET',
            url: `${EMBEDDED_BACKEND_URL}/xtream?targetId=nope&action=get_live_categories`,
        });
        expect(unknown.status).toBe(404);

        const storage = await backend.handle({
            method: 'GET',
            url: `${EMBEDDED_BACKEND_URL}/v1/instance`,
        });
        expect(storage.status).toBe(404);
    });

    it('proxies Xtream calls to player_api.php without the control keys', async () => {
        const { http, requests } = recordingHttp(() => [{ category_id: '1' }]);
        const backend = new EmbeddedBackend(http);
        const targetId = await register(backend, 'http://panel.test:8080/');

        const response = await backend.handle({
            method: 'GET',
            url: `${EMBEDDED_BACKEND_URL}/xtream?targetId=${targetId}&action=get_live_categories&username=u&password=p`,
        });

        expect(response).toEqual({
            status: 200,
            body: {
                action: 'get_live_categories',
                payload: [{ category_id: '1' }],
            },
        });
        const requested = new URL(requests[0].url);
        expect(requested.pathname).toBe('/player_api.php');
        expect(requested.searchParams.get('action')).toBe('get_live_categories');
        expect(requested.searchParams.has('targetId')).toBe(false);
        expect(requests[0].responseType).toBe('json');
    });

    it('reports an Xtream connection-test failure with the shared classifier', async () => {
        const backend = new EmbeddedBackend(
            recordingHttp(
                () =>
                    new ProviderTransportError('refused', {
                        code: 'ECONNREFUSED',
                    })
            ).http
        );
        const targetId = await register(backend, 'https://panel.test');

        const response = await backend.handle({
            method: 'GET',
            url: `${EMBEDDED_BACKEND_URL}/xtream?targetId=${targetId}&connectionTest=true`,
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            connectionFailure: { kind: 'connection', canTryHttp: true },
        });
    });

    it('sends Stalker credentials as headers, never in the query string', async () => {
        const { http, requests } = recordingHttp(() => ({ js: { token: 't' } }));
        const backend = new EmbeddedBackend(http);
        const targetId = await register(
            backend,
            'http://stalker.test/stalker_portal/server/load.php'
        );

        await backend.handle({
            method: 'GET',
            url: `${EMBEDDED_BACKEND_URL}/stalker?targetId=${targetId}&action=get_profile&type=stb&macAddress=00:1A:79:00:00:01&token=secret`,
        });

        const [request] = requests;
        expect(request.url).not.toContain('secret');
        expect(request.url).not.toContain('00:1A:79');
        expect(request.headers?.['Cookie']).toContain('00:1A:79:00:00:01');
        expect(request.headers?.['Authorization']).toBe('Bearer secret');
        expect(request.headers?.['Connection']).toBeUndefined();
    });

    it('downloads and parses an M3U playlist like the web backend', async () => {
        const backend = new EmbeddedBackend(recordingHttp(() => M3U).http);
        const targetId = await register(
            backend,
            'http://example.test/playlist.m3u?token=abc'
        );

        const response = await backend.handle({
            method: 'GET',
            url: `${EMBEDDED_BACKEND_URL}/parse?targetId=${targetId}`,
        });

        expect(response.status).toBe(200);
        const playlist = response.body as Record<string, unknown> & {
            playlist: { items: Array<{ name: string }> };
        };
        expect(playlist['title']).toBe('playlist.m3u');
        expect(playlist['count']).toBe(1);
        expect(playlist['id']).toBe(playlist['_id']);
        expect(playlist.playlist.items[0].name).toBe('Sport Live 1');
    });

    it('returns the provider status when the playlist download fails', async () => {
        const backend = new EmbeddedBackend(
            recordingHttp(
                () =>
                    new ProviderTransportError('HTTP 403', {
                        response: { status: 403, statusText: 'Forbidden' },
                    })
            ).http
        );
        const targetId = await register(backend, 'http://example.test/a.m3u');

        const response = await backend.handle({
            method: 'GET',
            url: `${EMBEDDED_BACKEND_URL}/parse?targetId=${targetId}`,
        });

        expect(response).toEqual({
            status: 403,
            body: { status: 403, message: 'Forbidden' },
        });
    });
});

describe('native shell helpers', () => {
    it('maps Android network failures to Node-style codes', () => {
        expect(toTransportError(new Error('Unable to resolve host "x"')).code).toBe('ENOTFOUND');
        expect(toTransportError(new Error('failed to connect to /1.2.3.4')).code).toBe('ECONNREFUSED');
        expect(toTransportError(new Error('timeout')).code).toBe('ETIMEDOUT');
        expect(toTransportError('weird').code).toBeUndefined();
    });

    it('detects Capacitor and webOS, and nothing in a plain browser', () => {
        expect(
            detectNativeShell({ Capacitor: { isNativePlatform: () => true } })
        ).toBe('capacitor');
        expect(
            detectNativeShell({
                navigator: {
                    userAgent:
                        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36',
                },
            })
        ).toBe('webos');
        expect(
            detectNativeShell({ navigator: { userAgent: 'Mozilla/5.0' } })
        ).toBeNull();
    });

    it('routes fetch calls for the embedded backend and passes others through', async () => {
        // jsdom has no fetch Response; the WebView does.
        const fakeResponse = (status: number, body: unknown) =>
            ({ status, json: async () => body }) as unknown as Response;
        const passthrough = jest.fn(async () => fakeResponse(200, 'remote'));
        const target = { fetch: passthrough as unknown as typeof fetch };
        const backend = new EmbeddedBackend(recordingHttp(() => '').http);
        installEmbeddedFetch(target, backend, fakeResponse);

        const health = await target.fetch(`${EMBEDDED_BACKEND_URL}/health`);
        expect(await health.json()).toEqual({
            status: 'ok',
            service: 'kstv-embedded-backend',
        });
        expect(passthrough).not.toHaveBeenCalled();

        await target.fetch('https://elsewhere.test/');
        expect(passthrough).toHaveBeenCalledTimes(1);
    });
});
