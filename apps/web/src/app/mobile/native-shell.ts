/**
 * Detects the KSTV native shells that host the web renderer:
 * - `capacitor`: the Android phone / Android TV app (`mobile/`)
 * - `webos`: the LG webOS TV package (`mobile/webos/`)
 *
 * Both run the browser (PWA) runtime, but with no self-hosted backend: the
 * embedded backend answers the backend routes inside the app instead.
 */
export type NativeShell = 'capacitor' | 'webos';

export interface CapacitorPluginsLike {
    readonly CapacitorHttp?: {
        request(options: Record<string, unknown>): Promise<{
            status: number;
            headers?: Record<string, string>;
            data: unknown;
        }>;
    };
    readonly App?: {
        addListener(
            event: 'backButton',
            listener: (event: { canGoBack: boolean }) => void
        ): unknown;
        exitApp(): Promise<void>;
    };
}

export interface CapacitorLike {
    isNativePlatform?(): boolean;
    getPlatform?(): string;
    readonly Plugins?: CapacitorPluginsLike;
}

export interface NativeShellWindow {
    readonly Capacitor?: CapacitorLike;
    readonly PalmSystem?: unknown;
    readonly webOS?: unknown;
    readonly navigator?: { readonly userAgent?: string };
    matchMedia?(query: string): { matches: boolean };
}

function shellWindow(): NativeShellWindow | undefined {
    return globalThis.window as unknown as NativeShellWindow | undefined;
}

export function detectNativeShell(
    win: NativeShellWindow | undefined = shellWindow()
): NativeShell | null {
    if (!win) {
        return null;
    }
    if (win.Capacitor?.isNativePlatform?.()) {
        return 'capacitor';
    }
    const userAgent = win.navigator?.userAgent ?? '';
    if (
        win.PalmSystem !== undefined ||
        win.webOS !== undefined ||
        /\bWeb0S\b|\bwebOS\b/.test(userAgent)
    ) {
        return 'webos';
    }
    return null;
}

/**
 * A TV has no touch screen and no mouse: the only pointer is a D-pad remote.
 * webOS Magic Remote does expose a pointer, but the device is still a TV.
 */
export function isTvDevice(
    win: NativeShellWindow | undefined = shellWindow()
): boolean {
    const shell = detectNativeShell(win);
    if (shell === 'webos') {
        return true;
    }
    if (shell !== 'capacitor') {
        return false;
    }
    return !!win?.matchMedia?.('(pointer: none)').matches;
}

export function capacitorPlugins(
    win: NativeShellWindow | undefined = shellWindow()
): CapacitorPluginsLike | undefined {
    return win?.Capacitor?.Plugins;
}
