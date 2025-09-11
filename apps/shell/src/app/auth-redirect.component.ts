import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

@Component({
  selector: 'app-auth-redirect',
  standalone: true,
  template: `<div style="padding:24px;font-family:system-ui">Procesando autenticación...</div>`,
})
export class AuthRedirectComponent implements OnInit {
  private msal = inject(MsalService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    console.log('[AuthRedirect] Antes de handleRedirectPromise. Accounts:', this.msal.instance.getAllAccounts());
    try {
      const result = await this.msal.instance.handleRedirectPromise();
      console.log('[AuthRedirect] handleRedirectPromise result:', result);
      console.log('[AuthRedirect] Después. Accounts:', this.msal.instance.getAllAccounts());
    } catch (e) {
      console.error('[AuthRedirect] Error en handleRedirectPromise:', e);
    } finally {
      this.router.navigateByUrl('/home');
    }
  }
}
