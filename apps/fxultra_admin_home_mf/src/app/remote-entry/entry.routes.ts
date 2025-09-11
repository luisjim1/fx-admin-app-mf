import { Routes } from '@angular/router';
import { HomeComponent } from '../home/home.component';

export const remoteRoutes: Routes = [
  {
    path: '',
    component: HomeComponent,
    children: [
      // aquí se renderiza el MF de Estrategias dentro del <router-outlet> del Home
      {
        path: 'estrategias',
        loadChildren: () =>
          import('fxultra_admin_strategies_mf/Routes').then(m => m.remoteRoutes),
      },
      // Agregar mas aqui en un futuro
    ],
  },
];
