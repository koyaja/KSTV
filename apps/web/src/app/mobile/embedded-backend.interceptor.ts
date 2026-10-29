import {
    HTTP_INTERCEPTORS,
    HttpErrorResponse,
    type HttpEvent,
    type HttpHandler,
    type HttpInterceptor,
    type HttpRequest,
    HttpResponse,
} from '@angular/common/http';
import { Injectable, type Provider } from '@angular/core';
import { from, type Observable, throwError } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import {
    type EmbeddedBackend,
    getEmbeddedBackend,
    isEmbeddedBackendUrl,
} from './embedded-backend';
import { detectNativeShell } from './native-shell';

/** Answers `HttpClient` calls to the embedded backend in process. */
@Injectable()
export class EmbeddedBackendInterceptor implements HttpInterceptor {
    private readonly backend: EmbeddedBackend = getEmbeddedBackend();

    intercept(
        request: HttpRequest<unknown>,
        next: HttpHandler
    ): Observable<HttpEvent<unknown>> {
        const url = request.urlWithParams;
        if (!isEmbeddedBackendUrl(url)) {
            return next.handle(request);
        }
        return from(
            this.backend.handle({
                method: request.method,
                url,
                body: request.body,
            })
        ).pipe(
            mergeMap((response) =>
                response.status >= 400
                    ? throwError(
                          () =>
                              new HttpErrorResponse({
                                  error: response.body,
                                  status: response.status,
                                  url,
                              })
                      )
                    : [
                          new HttpResponse({
                              body: response.body,
                              status: response.status,
                              url,
                          }),
                      ]
            )
        );
    }
}

/** Registered only inside a KSTV native shell; the PWA is unchanged. */
export function provideEmbeddedBackend(
    shell = detectNativeShell()
): Provider[] {
    return shell
        ? [
              {
                  provide: HTTP_INTERCEPTORS,
                  useFactory: () => new EmbeddedBackendInterceptor(),
                  multi: true,
              },
          ]
        : [];
}
