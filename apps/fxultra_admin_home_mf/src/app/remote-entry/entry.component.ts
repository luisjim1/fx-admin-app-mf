import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

@Component({
  standalone: true,
  selector: 'fx-home-entry',
  imports: [CommonModule],
  template: `
    <div style="padding:24px; max-width:720px; margin:auto">
      <h2>FXUltra Admin – Home</h2>
      <p>Bienvenido.</p>

      <div style="margin-top:24px">
        <button (click)="logout()"
                style="border:none; background:#e53935; color:#fff; border-radius:100px;
                       width:160px; height:38px; font-weight:700; cursor:pointer">
          Cerrar sesión
        </button>
      </div>
    </div>
  `,
})
export default class RemoteEntryComponent implements OnInit {
  private msal = inject(MsalService);
  private router = inject(Router);

  ngOnInit(): void {
    const active = this.msal.instance.getActiveAccount()
      ?? this.msal.instance.getAllAccounts()[0];

    if (!active) {
      // Si no hay sesión, manda al login del host
      this.router.navigateByUrl('/login');
      return;
    }

    // Asegura que el account quede activo (por si vino de getAllAccounts)
    this.msal.instance.setActiveAccount(active);
  }

  logout(): void {
    this.msal.logoutRedirect({
      postLogoutRedirectUri: `${window.location.origin}/login`,
    });
  }
}
