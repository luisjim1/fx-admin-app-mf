// apps/fxultra_admin_home_mf/src/app/home/home.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute, Event as RouterEvent } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule],
})
export class HomeComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  menu: any[] = [];
  showEstrategiasOperativas = false;

  mainTitleText = 'Menú Principal Admin FX U';
  mainTitleDescription: string | null = null;

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private msalService: MsalService
  ) {}

  ngOnInit(): void {
    // ==== Asegurar MSAL inicializado y cuenta activa ====
    this.ensureMsalReady().catch(err => {
      console.error('[Home] MSAL ensureMsalReady error:', err);
    });

    // ===== Menú (mock) =====
    this.menu = [
      {
        title: 'Administración',
        items: [
          {
            label: 'Estrategias',
            expanded: false,
            children: [
              // ✅ ahora apunta al MF de Estrategias dentro del Home
              { label: 'Crear estrategia', url: '/home/estrategias/crear' },
              { label: 'Catálogo de estrategias', url: '/home/estrategias/catalogo' },
              { label: 'Configuración base', url: '/home/estrategias/configuracion-base' }
            ]
          },
          {
            label: 'Perfiles y usuarios',
            expanded: false,
            children: [
              { label: 'Crear Perfil', url: '/home/perfiles/1' },
              { label: 'Asignar permisos', url: '/home/perfiles/2' }
            ]
          }
        ]
      }
    ];

    // ===== Router listeners =====
    this.router.events
      .pipe(
        filter((event: RouterEvent): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        this.expandActiveMenuItem();
        this.updateTitles(event.urlAfterRedirects);
      });

    // Estado inicial
    this.expandActiveMenuItem();
    this.updateTitles(this.router.url);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async logout(): Promise<void> {
    await this.ensureMsalReady();
    await this.msalService.instance.logoutRedirect({
      postLogoutRedirectUri: 'http://localhost:4300/login',
    });
  }

  toggleSubmenu(item: any): void {
    if (!this.hasActiveChild(item)) {
      item.expanded = !item.expanded;
    } else {
      item.expanded = true;
    }
  }

  hasActiveChild(menuItem: any): boolean {
    if (!menuItem.children || menuItem.children.length === 0) return false;
    return menuItem.children.some((child: any) =>
      this.router.isActive(child.url, {
        paths: 'exact',
        queryParams: 'subset',
        fragment: 'ignored',
        matrixParams: 'ignored',
      })
    );
  }

  private expandActiveMenuItem(): void {
    this.menu.forEach(section => {
      section.items.forEach((item: any) => {
        if (this.hasActiveChild(item)) {
          item.expanded = true;
        }
      });
    });
  }

  private updateTitles(url: string): void {
    // ✅ detecta si estamos dentro del flujo de estrategias (crear)
    this.showEstrategiasOperativas = url.includes('/home/estrategias/crear');

    if (this.showEstrategiasOperativas) {
      this.mainTitleText = 'Estrategias Operativas de Banca Digital';
      this.mainTitleDescription = 'Configura y administra las estrategias para el área de promoción y clientes';
    } else {
      this.mainTitleText = 'Menú Principal Admin FX U';
      this.mainTitleDescription = null;
    }
  }

  // ===== Utilidades MSAL =====
  private async ensureMsalReady(): Promise<void> {
    const w = window as any;
    if (!w.__fxu_msal_initialized) {
      await this.msalService.instance.initialize();
      w.__fxu_msal_initialized = true;
    }
    const accounts = this.msalService.instance.getAllAccounts();
    if (accounts.length && !this.msalService.instance.getActiveAccount()) {
      this.msalService.instance.setActiveAccount(accounts[0]);
    }
  }
}
