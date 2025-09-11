// shared/src/lib/msal/auth.guard.ts
import { inject } from '@angular/core';
import { CanMatchFn, UrlSegment } from '@angular/router';
import { MsalService, MsalBroadcastService } from '@azure/msal-angular';
import { InteractionStatus, RedirectRequest } from '@azure/msal-browser';
import { filter, take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { MSAL_APP_CONFIG, MsalAppConfig } from './msal.tokens';

/**
 * Guard para rutas protegidas con MSAL en arquitectura de Micro Frontends.
 *
 * - Garantiza llamar a msal.instance.initialize() ANTES de usar MSAL (v3+).
 * - Si hay cuentas, fija activeAccount (si falta) y permite el acceso.
 * - Si NO hay cuentas, espera a que no haya interacción y lanza loginRedirect UNA sola vez.
 * - Devuelve Promise<boolean> (canMatch admite async).
 */
export const msalCanMatchGuard: CanMatchFn = async (_route, _segments: UrlSegment[]) => {
  const msal = inject(MsalService);
  const msalBroadcast = inject(MsalBroadcastService);
  const cfg = inject<MsalAppConfig>(MSAL_APP_CONFIG);

  try {
    // 1) Inicializa la PCA (requerido desde msal-browser v3). Idempotente.
    if (!(msal as any).__fxu_initialized) {
      await msal.instance.initialize();
      (msal as any).__fxu_initialized = true;
    }

    // 2) ¿Ya hay sesión?
    const accounts = msal.instance.getAllAccounts();
    const active = msal.instance.getActiveAccount();

    if (accounts && accounts.length > 0) {
      if (!active) {
        msal.instance.setActiveAccount(accounts[0]);
      }
      return true;
    }

    // 3) Sin sesión: evita múltiples redirecciones concurrentes
    const w = window as any;
    if (!w.__fxu_login_in_progress) {
      w.__fxu_login_in_progress = true;

      // Espera a que MSAL no esté en interacción antes de disparar login
      await firstValueFrom(
        msalBroadcast.inProgress$.pipe(
          filter((s) => s === InteractionStatus.None),
          take(1)
        )
      );

      const loginRequest: RedirectRequest | undefined = cfg?.loginRequest;
      await msal.instance.loginRedirect(loginRequest).catch((err) => {
        console.error('[Guard] loginRedirect error:', err);
        w.__fxu_login_in_progress = false;
      });
    }

    // 4) No permitir la coincidencia por ahora; el redirect ocurrirá
    return false;
  } catch (err) {
    console.error('[Guard] Error en msalCanMatchGuard:', err);
    return false;
  }
};
