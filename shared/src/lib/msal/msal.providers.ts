import { EnvironmentProviders, Provider, makeEnvironmentProviders, inject, APP_INITIALIZER } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { PublicClientApplication, InteractionType } from '@azure/msal-browser';
import {
  MsalService,
  MsalBroadcastService,
  MSAL_INSTANCE,
  MSAL_GUARD_CONFIG,
  MSAL_INTERCEPTOR_CONFIG,
  MsalGuardConfiguration,
  MsalInterceptorConfiguration,
} from '@azure/msal-angular';
import { MSAL_APP_CONFIG, MsalAppConfig } from './msal.tokens';

function msalInstanceFactory(cfg: MsalAppConfig) {
  return new PublicClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: cfg.authority,
      redirectUri: cfg.redirectUri,
      postLogoutRedirectUri: cfg.postLogoutRedirectUri ?? cfg.redirectUri,
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
  });
}

function guardConfigFactory(cfg: MsalAppConfig): MsalGuardConfiguration {
  return { interactionType: InteractionType.Redirect, authRequest: cfg.loginRequest };
}

function interceptorConfigFactory(cfg: MsalAppConfig): MsalInterceptorConfiguration {
  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap: new Map(cfg.protectedResourceMap ?? []),
  };
}

// ⬇️ Inicializa MSAL al arrancar la app
function msalAppInitializer(msal: MsalService) {
  return () => msal.instance.initialize();
}

export function provideMsal(config: MsalAppConfig): EnvironmentProviders {
  const base: Provider[] = [
    { provide: MSAL_APP_CONFIG, useValue: config },
    { provide: MSAL_INSTANCE,   useFactory: () => msalInstanceFactory(inject(MSAL_APP_CONFIG)) },
    { provide: MSAL_GUARD_CONFIG,      useFactory: () => guardConfigFactory(inject(MSAL_APP_CONFIG)) },
    { provide: MSAL_INTERCEPTOR_CONFIG, useFactory: () => interceptorConfigFactory(inject(MSAL_APP_CONFIG)) },
    MsalService,
    MsalBroadcastService,
    // 👇 Este initializer resuelve el error "uninitialized_public_client_application"
    { provide: APP_INITIALIZER, useFactory: msalAppInitializer, deps: [MsalService], multi: true },
  ];

  return makeEnvironmentProviders([
    ...base,
    provideHttpClient(withInterceptors([])),
  ]);
}
