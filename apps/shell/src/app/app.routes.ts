// apps/shell/src/app/app.routes.ts
import { Routes } from '@angular/router';
import { AuthRedirectComponent } from './auth-redirect.component';
import { sessionCanMatchGuard } from '@fxultra-admin-app-mf/msal'; // <-- nuevo guard

export const routes: Routes = [
  // Procesa MSAL redirect
  { path: 'auth-redirect', component: AuthRedirectComponent },

  // Login remoto (sin protección)
  {
    path: 'login',
    loadChildren: () =>
      import('fxultra_admin_login_mf/Routes').then(m => m.remoteRoutes),
  },

  // Home remoto (protegido por "sesión o te mando a /login")
  {
    path: 'home',
    canMatch: [sessionCanMatchGuard],
    loadChildren: () =>
      import('fxultra_admin_home_mf/Routes').then(m => m.remoteRoutes),
  },

  // Estrategias remoto (protegido igual que Home)
  {
    path: 'estrategias',
    canMatch: [sessionCanMatchGuard],
    loadChildren: () =>
      import('fxultra_admin_strategies_mf/Routes').then(m => m.remoteRoutes),
  },

  // Raíz y comodín → pasan por el guard de /home
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: '**', redirectTo: 'home' },
];
