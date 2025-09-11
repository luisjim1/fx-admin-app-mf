import { InjectionToken } from '@angular/core';
import type { PopupRequest, RedirectRequest } from '@azure/msal-browser';

export interface MsalAppConfig {
  clientId: string;
  authority: string;
  redirectUri: string;
  postLogoutRedirectUri?: string;
  protectedResourceMap?: [resource: string, scopes: string[]][];
  loginRequest?: PopupRequest | RedirectRequest;
}

export const MSAL_APP_CONFIG = new InjectionToken<MsalAppConfig>('MSAL_APP_CONFIG');
