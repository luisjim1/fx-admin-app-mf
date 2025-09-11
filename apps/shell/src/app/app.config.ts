// apps/shell/src/app/app.config.ts
import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withComponentInputBinding, withPreloading, NoPreloading } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';

import { provideMsal } from '@fxultra-admin-app-mf/msal';
import { MsalService, MsalBroadcastService } from '@azure/msal-angular';
import { EventType } from '@azure/msal-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withPreloading(NoPreloading)),
    provideClientHydration(),

    // MSAL SOLO en el Shell (tu wrapper)
    provideMsal({
      clientId: '3e2ddbb3-c5e7-4c3d-a17d-b7765c2b278a',
      authority: 'https://login.microsoftonline.com/9bffabe1-4682-4566-ba5e-72e9f0f12789',
      redirectUri: 'http://localhost:4300/auth-redirect',
      postLogoutRedirectUri: 'http://localhost:4300/login',
      protectedResourceMap: [
        ['http://localhost:8080/api', ['api://814b8b59-c139-4c3b-b10d-328b6c4f90d3/read']],
      ],
      loginRequest: { scopes: ['User.Read'] },
    }),

    // Inicializar MSAL y luego procesar redirect; NO llamar getAllAccounts() antes.
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [MsalService, MsalBroadcastService],
      useFactory: (msal: MsalService, broadcast: MsalBroadcastService) => {
        return async () => {
          (window as any).__shellMsal = msal.instance;

          // 1) Inicializa (idempotente). NO consultar cuentas antes de esto.
          await msal.instance.initialize();

          // 2) Suscribe eventos (opcional, para depurar)
          broadcast.msalSubject$.subscribe(e => {
            if (e?.eventType === EventType.HANDLE_REDIRECT_END || e?.eventType === EventType.LOGIN_SUCCESS) {
              // Ya es seguro leer cuentas aquí
              console.log('[Shell] MSAL Event:', e.eventType, 'Accounts:', msal.instance.getAllAccounts());
            }
          });

          // 3) Procesa el callback (caiga en /login o /auth-redirect)
          try {
            const result = await msal.instance.handleRedirectPromise();
            if (result) {
              console.log('[Shell] handleRedirectPromise result:', result);
              console.log('[Shell] Accounts after handleRedirectPromise:', msal.instance.getAllAccounts());
            } else {
              // No hubo redirect en este arranque; si quieres, puedes loguear:
              // console.log('[Shell] No redirect result. Accounts:', msal.instance.getAllAccounts());
            }
          } catch (err) {
            console.error('[Shell] handleRedirectPromise error:', err);
          }
        };
      },
    },
  ],
};
