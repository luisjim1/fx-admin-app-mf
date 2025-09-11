import { inject } from '@angular/core';
import { CanMatchFn, UrlSegment, Router, UrlTree } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

/**
 * sessionCanMatchGuard
 * - Inicializa MSAL (idempotente).
 * - Si hay sesión, permite el acceso (true).
 * - Si NO hay sesión, devuelve UrlTree a /login (NO hace loginRedirect).
 *   Úsalo para que / (raíz) te lleve al MF de Login cuando no hay sesión.
 */
export const sessionCanMatchGuard: CanMatchFn = async (_route, _segments: UrlSegment[]): Promise<boolean | UrlTree> => {
  const msal = inject(MsalService);
  const router = inject(Router);

  // Inicializa PCA solo una vez (seguro llamarlo repetidamente en MF)
  const w = window as any;
  if (!w.__fxu_msal_initialized) {
    await msal.instance.initialize();
    w.__fxu_msal_initialized = true;
  }

  const accounts = msal.instance.getAllAccounts();
  if (accounts && accounts.length > 0) {
    // (opcional) fija activeAccount si falta
    if (!msal.instance.getActiveAccount()) {
      msal.instance.setActiveAccount(accounts[0]);
    }
    return true;
  }

  // Sin sesión → navega al MF de Login
  return router.createUrlTree(['/login']);
};
