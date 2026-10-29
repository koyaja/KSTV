import {
    EMBEDDED_BACKEND_URL,
    type EmbeddedBackend,
    getEmbeddedBackend,
    isEmbeddedBackendUrl,
} from './embedded-backend';
import {
    capacitorPlugins,
    detectNativeShell,
    isTvDevice,
    type NativeShell,
} from './native-shell';

/** webOS remote "Back" key. */
const WEBOS_BACK_KEY_CODE = 461;

interface RuntimeConfigWindow extends Window {
    __IPTVNATOR_CONFIG__?: Record<string, unknown>;
}

/**
 * Prepares the browser runtime for a KSTV native shell. Must run before
 * Angular bootstraps: the backend URL is read during startup.
 * Returns the detected shell, or null in a plain browser (no change).
 */
export function installMobileRuntime(
    win: RuntimeConfigWindow = window
): NativeShell | null {
    const shell = detectNativeShell();
    if (!shell) {
        return null;
    }
    win.__IPTVNATOR_CONFIG__ = {
        ...(win.__IPTVNATOR_CONFIG__ ?? {}),
        BACKEND_URL: EMBEDDED_BACKEND_URL,
    };
    installEmbeddedFetch(win);
    markDocument(win.document, shell);
    installBackNavigation(win, shell);
    return shell;
}

/** Answers raw `fetch` calls to the embedded backend (PwaService uses both). */
export function installEmbeddedFetch(
    win: Pick<Window, 'fetch'>,
    backend: EmbeddedBackend = getEmbeddedBackend(),
    toResponse: (status: number, body: unknown) => Response = jsonResponse
): void {
    const nativeFetch = win.fetch.bind(win);
    win.fetch = async (input, init) => {
        const url =
            typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url;
        if (!isEmbeddedBackendUrl(url)) {
            return nativeFetch(input, init);
        }
        const method =
            init?.method ??
            (typeof input === 'object' && 'method' in input
                ? input.method
                : 'GET');
        const response = await backend.handle({
            method,
            url,
            body: init?.body,
        });
        return toResponse(response.status, response.body);
    };
}

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function markDocument(doc: Document, shell: NativeShell): void {
    const root = doc.documentElement;
    root.classList.add('kstv-native', `kstv-${shell}`);
    if (isTvDevice()) {
        root.classList.add('kstv-tv');
    }
}

/**
 * Hardware Back (Android) and the remote's Back key (webOS) walk back
 * through the app's history, and leave the app at its first screen.
 */
function installBackNavigation(win: Window, shell: NativeShell): void {
    if (shell === 'capacitor') {
        const app = capacitorPlugins()?.App;
        app?.addListener('backButton', ({ canGoBack }) => {
            if (dismissOverlay(win.document)) {
                return;
            }
            if (canGoBack) {
                win.history.back();
            } else {
                void app.exitApp();
            }
        });
        return;
    }
    win.document.addEventListener('keydown', (event) => {
        if (event.keyCode !== WEBOS_BACK_KEY_CODE) {
            return;
        }
        event.preventDefault();
        if (!dismissOverlay(win.document)) {
            win.history.back();
        }
    });
}

/** Closes an open Material dialog / menu first, like Escape would. */
function dismissOverlay(doc: Document): boolean {
    const overlay = doc.querySelector(
        '.cdk-overlay-container .cdk-overlay-pane'
    );
    if (!overlay) {
        return false;
    }
    doc.dispatchEvent(
        new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            bubbles: true,
        })
    );
    return true;
}
