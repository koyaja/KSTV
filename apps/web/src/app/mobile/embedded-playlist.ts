import { createPlaylistObject } from '@iptvnator/shared/m3u-utils';
import { type NativeHttp, ProviderTransportError } from './native-http';
import { PORTAL_TIMEOUT_MS, type ProviderErrorBody } from './embedded-portals';

/**
 * In-app counterpart of the web-backend `/parse` route: downloads an M3U
 * playlist over native HTTP and returns the same playlist object.
 */
type ParsePlaylist = (content: string) => {
    items: Array<Record<string, unknown>>;
};

type ParserModule = {
    parse?: ParsePlaylist;
    default?: { parse?: ParsePlaylist };
};

async function loadParser(): Promise<ParsePlaylist> {
    // Dynamic import keeps the parser out of the eager bundle.
    const parserModule = (await import(
        'iptv-playlist-parser'
    )) as unknown as ParserModule;
    const parse = parserModule.parse ?? parserModule.default?.parse;
    if (!parse) {
        throw new Error('iptv-playlist-parser parse export was not found');
    }
    return parse;
}

function lastUrlSegment(value: string): string {
    const withoutQuery = value.split(/[?#]/)[0] ?? value;
    const segment = withoutQuery
        .slice(withoutQuery.lastIndexOf('/') + 1)
        .trim();
    return segment.length > 0 ? segment : 'Playlist without title';
}

export async function handlePlaylistParse(
    http: NativeHttp,
    providerUrl: URL,
    userAgent: string | undefined
): Promise<Record<string, unknown> | ProviderErrorBody> {
    let content: unknown;
    try {
        const response = await http({
            url: providerUrl.href,
            responseType: 'text',
            timeoutMs: PORTAL_TIMEOUT_MS.playlist,
            ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
        });
        content = response.data;
    } catch (error) {
        return playlistDownloadError(error);
    }
    if (typeof content !== 'string') {
        return {
            status: 422,
            message: 'Error, the playlist is not a text document',
        };
    }
    try {
        const parse = await loadParser();
        const playlist = createPlaylistObject(
            lastUrlSegment(providerUrl.href),
            parse(content) as unknown as Parameters<
                typeof createPlaylistObject
            >[1],
            providerUrl.href,
            'URL'
        );
        return {
            ...playlist,
            id: playlist._id,
            ...(userAgent ? { userAgent } : {}),
        };
    } catch {
        return { status: 422, message: 'Error, the playlist is not valid' };
    }
}

function playlistDownloadError(error: unknown): ProviderErrorBody {
    if (error instanceof ProviderTransportError && error.response) {
        return {
            status: error.response.status,
            message: error.response.statusText,
        };
    }
    const code =
        error instanceof ProviderTransportError ? error.code : undefined;
    return {
        status: 500,
        message: code
            ? `Error, something went wrong (${code})`
            : 'Error, something went wrong',
        ...(code ? { code } : {}),
    };
}
