import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MsalService, MsalBroadcastService } from '@azure/msal-angular';
import {
  AccountInfo,
  EventMessage,
  EventType,
  InteractionStatus,
  RedirectRequest,
} from '@azure/msal-browser';
import { Subject, timer } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'login-entry',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './entry.component.html',
  styleUrls: ['./entry.component.scss'],
})
export class EntryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  isLoggedIn = false;
  currentYear = new Date().getFullYear();

  private intentoLogin = false;
  private esperandoRedirect = false;

  // polling post-redirect (para el caso en que el remoto no vea el evento)
  private postRedirectPollId: any = null;

  constructor(
    private msal: MsalService,
    private msalBroadcast: MsalBroadcastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // DEBUG: expón la instancia para inspección desde consola
    (window as any).__msal = this.msal.instance;
    try {
      // útil para ver cuentas al volver del redirect
      // (quita este log cuando termines de depurar)
      console.log('[LoginMF] accounts on init:', this.msal.instance.getAllAccounts());
    } catch {}

    // Estado inicial
    this.refrescarEstadoSesion();
    if (this.isLoggedIn) {
      this.navigateToHome();
      return;
    }

    // 1) Si llega LOGIN_SUCCESS / ACQUIRE_TOKEN_SUCCESS -> fija account y navega
    this.msalBroadcast.msalSubject$
      .pipe(
        filter(
          (e: EventMessage) =>
            e.eventType === EventType.LOGIN_SUCCESS ||
            e.eventType === EventType.SSO_SILENT_SUCCESS ||
            e.eventType === EventType.ACQUIRE_TOKEN_SUCCESS
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((e) => {
        const account = (e.payload as any)?.account as AccountInfo | undefined;
        if (account) this.msal.instance.setActiveAccount(account);
        this.refrescarEstadoSesion();
        if (this.isLoggedIn) this.navigateToHome();
      });

    // 2) Loading solo cuando esperamos redirect o estamos en /auth-redirect
    this.msalBroadcast.inProgress$
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        const enAuthRedirect = this.router.url.includes('/auth-redirect');
        this.loading =
          (this.esperandoRedirect || enAuthRedirect) &&
          status !== InteractionStatus.None;
      });

    // 3) Al terminar cualquier interacción -> rehidrata y navega si hay cuenta
    this.msalBroadcast.inProgress$
      .pipe(filter((s) => s === InteractionStatus.None), takeUntil(this.destroy$))
      .subscribe(() => {
        this.esperandoRedirect = false;
        this.refrescarEstadoSesion();
        if (this.isLoggedIn) {
          this.navigateToHome();
        } else {
          this.loading = false;
          this.intentoLogin = false; // permitir reintento
        }
      });

    // 4) Poll post-redirect: durante 5s revisa cada 200ms si ya apareció la cuenta
    this.startPostRedirectPoll();

    // 5) Timeout de seguridad (evita spinner colgado)
    timer(20000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.isLoggedIn && this.router.url.includes('/login')) {
          this.esperandoRedirect = false;
          this.loading = false;
          this.intentoLogin = false;
        }
      });
  }

  // Botón "Iniciar sesión" -> API directa de MSAL (Promise) para garantizar el redirect
  login(): void {
    if (this.intentoLogin) return;
    this.intentoLogin = true;
    this.esperandoRedirect = true;
    this.loading = true;

    const loginRequest: RedirectRequest = {
      scopes: ['User.Read'], // ajusta si lo necesitas
    };

    this.msal.instance.loginRedirect(loginRequest).catch(() => {
      // Si algo falla (p.ej. interaction_in_progress), reset para permitir reintento
      this.intentoLogin = false;
      this.esperandoRedirect = false;
      this.loading = false;
    });
  }

  /** Marca activeAccount si hay cuentas en caché y expone isLoggedIn */
  private refrescarEstadoSesion(): void {
    const active = this.ensureActiveAccount();
    this.isLoggedIn = !!active;
  }

  /** Asegura activeAccount si existen cuentas en caché */
  private ensureActiveAccount(): AccountInfo | null {
    let account = this.msal.instance.getActiveAccount();
    if (!account) {
      const all = this.msal.instance.getAllAccounts();
      if (all.length > 0) {
        account = all[0];
        this.msal.instance.setActiveAccount(account);
      }
    }
    return account ?? null;
  }

  /** Reintento corto post-redirect: detecta cuentas y navega a /home */
  private startPostRedirectPoll(): void {
    if (this.postRedirectPollId) return;
    const start = Date.now();

    this.postRedirectPollId = setInterval(() => {
      // corta a los 5s
      if (Date.now() - start > 5000) {
        clearInterval(this.postRedirectPollId);
        this.postRedirectPollId = null;
        return;
      }

      // solo interesa en /login
      if (!this.router.url.includes('/login')) return;

      this.refrescarEstadoSesion();
      if (this.isLoggedIn) {
        clearInterval(this.postRedirectPollId);
        this.postRedirectPollId = null;
        this.navigateToHome();
      }
    }, 200);
  }

  /** Navegación robusta: Router y, si no aplica, fallback duro */
  private navigateToHome(): void {
    try {
      this.router.navigateByUrl('/home', { replaceUrl: true }).then((ok) => {
        if (!ok) window.location.assign('/home');
      });
    } catch {
      window.location.assign('/home');
    }
  }

  ngOnDestroy(): void {
    if (this.postRedirectPollId) {
      clearInterval(this.postRedirectPollId);
      this.postRedirectPollId = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
}
