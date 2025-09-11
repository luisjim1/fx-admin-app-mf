// apps/fxultra_admin_strategies_mf/src/app/remote-entry/entry.routes.ts
import { Routes } from '@angular/router';
import { RemoteEntryComponent } from './entry.component';

export const remoteRoutes: Routes = [
  {
    path: '',
    component: RemoteEntryComponent,
    title: 'Estrategias',
  },
  {
    path: 'crear',
    loadComponent: () =>
      import('../crear-estrategia/crear-estrategia').then(
        (m) => m.CrearEstrategiaComponent
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'step-1', title: 'Crear estrategia' },

      {
        path: 'step-1',
        title: 'Datos generales',
        loadComponent: () =>
          import('../crear-estrategia/step-wizard/step1-datos-generales/step1-datos-generales').then(
            (m) => m.Step1DatosGenerales
          ),
      },
      {
        path: 'step-2',
        title: 'Pares de divisas',
        loadComponent: () =>
          import('../crear-estrategia/step-wizard/step2-pares-divisas/step2-pares-divisas').then(
            (m) => m.Step2ParesDivisas
          ),
      },
      {
        path: 'step-3',
        title: 'Sentido de operación',
        loadComponent: () =>
          import('../crear-estrategia/step-wizard/step3-sentido-operacion/step3-sentido-operacion').then(
            (m) => m.Step3SentidoOperacion
          ),
      },
      {
        path: 'step-4',
        title: 'Fecha de liquidación',
        loadComponent: () =>
          import('../crear-estrategia/step-wizard/step4-fecha-liquidacion/step4-fecha-liquidacion').then(
            (m) => m.Step4FechaLiquidacion
          ),
      },
      {
        path: 'step-5',
        title: 'Horarios',
        loadComponent: () =>
          import('../crear-estrategia/step-wizard/step5-horarios/step5-horarios').then(
            (m) => m.Step5Horarios
          ),
      },
      {
        path: 'step-6',
        title: 'Spreads',
        loadComponent: () =>
          import('../crear-estrategia/step-wizard/step6-spreads/step6-spreads').then(
            (m) => m.Step6Spreads
          ),
      },
      {
        path: 'step-7',
        title: 'Previsualización',
        loadComponent: () =>
          import('../crear-estrategia/step-wizard/step7-previsualizacion/step7-previsualizacion').then(
            (m) => m.Step7Previsualizacion
          ),
      },

      { path: '**', redirectTo: 'step-1' },
    ],
  },

  { path: '**', redirectTo: '' },
];
