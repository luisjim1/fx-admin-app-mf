// ===== Crear Estrategia (contenerdor del wizard por rutas) =====
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd, RouterOutlet } from '@angular/router';

import { StepWizardComponent } from './step-wizard/step-wizard';

interface Step {
  label: string;
  sublabel: string;
  completed: boolean;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const K_PROGRESS = 'wizard_progress';
const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';
const K_JUMP_TO_STEP      = 'wizard_jump_to_step';

const STEP_DG       = 0;
const STEP_PARES    = 1;
const STEP_SENTIDO  = 2;
const STEP_FLIQ     = 3;
const STEP_HORARIOS = 4;
const STEP_SPREADS  = 5;
const STEP_PREVIEW  = 6;

@Component({
  selector: 'app-crear-estrategia',
  templateUrl: './crear-estrategia.html',
  styleUrls: ['./crear-estrategia.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, StepWizardComponent],
})
export class CrearEstrategiaComponent implements OnInit, OnDestroy {
  // ===== Cabecera / estado general =====
  steps: Step[] = [
    { label: 'Datos Generales',   sublabel: '', completed: false },
    { label: 'Pares de divisas',  sublabel: '', completed: false },
    { label: 'Sentido',           sublabel: '', completed: false },
    { label: 'F. liquidación',    sublabel: '', completed: false },
    { label: 'Horarios',          sublabel: '', completed: false },
    { label: 'Spreads',           sublabel: '', completed: false },
    { label: 'Previsualización',  sublabel: '', completed: false }
  ];
  currentStep = 0;

  renderSteps = true;
  mostrarModalEstrategia = false;

  private globalListener?: (ev: Event) => void;

  constructor(private router: Router, private route: ActivatedRoute) {}

  // ===== Ciclo de vida =====
  ngOnInit() {
    this.verificarEstrategiaEnProceso();

    // Sincronizar el índice actual con la URL /step-N
    this.syncFromUrl(this.router.url);
    this.router.events.subscribe(ev => {
      if (ev instanceof NavigationEnd) this.syncFromUrl(ev.urlAfterRedirects);
    });

    this.updateStepStatuses(this.currentStep);

    // ===== Listener global para eventos de steps cargados por router-outlet =====
    this.globalListener = (ev: Event) => {
      const custom = ev as CustomEvent;
      if (custom.type === 'wizard:next-step') {
        this.onAvanzarStep();
      }
    };
    window.addEventListener('wizard:next-step', this.globalListener as EventListener);
  }

  ngOnDestroy() {
    if (this.globalListener) {
      window.removeEventListener('wizard:next-step', this.globalListener as EventListener);
    }
  }

  // ===== Navegación de steps =====
  goToStep(index: number): void {
    if (index < this.currentStep) {
      try {
        localStorage.setItem(
          K_RETURN_AFTER_EDIT,
          JSON.stringify({ fromStep: this.currentStep, fromStepIndex: this.currentStep, ts: Date.now() })
        );
        localStorage.removeItem(K_JUMP_TO_STEP);
      } catch {}
    }

    const idx = this.clampStep(index);
    this.currentStep = idx;
    this.router.navigate([`step-${idx + 1}`], { relativeTo: this.route });
    this.updateStepStatuses(idx);
    this.setProgress(idx);
  }

  onStepSelected(index: number) {
    this.goToStep(index);
  }

  onAvanzarStep(): void {
    const destinoPorToken = this.leerJumpToken();
    if (destinoPorToken != null) {
      const destino = this.aplicarReglaDependencia(this.currentStep, destinoPorToken);
      this.goToStep(destino);
      this.limpiarTokens();
      return;
    }

    const regresoEdicion = this.leerReturnAfterEdit();
    if (regresoEdicion != null) {
      this.goToStep(regresoEdicion);
      this.limpiarTokens();
      return;
    }

    if (this.currentStep < STEP_PREVIEW) {
      this.goToStep(this.currentStep + 1);
    }
  }

  updateStepStatuses(current: number) {
    this.steps.forEach((step, i) => {
      if (i < current) {
        step.completed = true;
        step.sublabel = 'Completado';
      } else if (i === current) {
        step.completed = false;
        step.sublabel = 'En proceso';
      } else {
        step.completed = false;
        step.sublabel = 'Pendiente';
      }
    });
  }

  // ===== Detección de estrategia en progreso =====
  verificarEstrategiaEnProceso() {
    const claves = [
      'wizard_datos_generales',
      'wizard_pares_divisas',
      'wizard_sentido_operacion',
      'wizard_fecha_liquidacion',
      'wizard_horarios',
      'wizard_spreads'
    ];

    const hayEstrategia = claves.some(clave => {
      const data = localStorage.getItem(clave);
      if (!data) return false;
      try {
        const parsed = JSON.parse(data);
        const timestampValido = parsed.timestamp && Date.now() - parsed.timestamp < TTL_MS;
        const tieneDatosUtiles = this.validarDatosUtiles(clave, parsed);
        return timestampValido && tieneDatosUtiles;
      } catch {
        return false;
      }
    });

    if (hayEstrategia) this.mostrarModalEstrategia = true;
  }

  validarDatosUtiles(clave: string, datos: any): boolean {
    const isNumLike = (v: any) =>
      (typeof v === 'number' && !Number.isNaN(v)) ||
      (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));

    switch (clave) {
      case 'wizard_datos_generales':
        return !!(datos?.nombreEstrategia || datos?.producto || datos?.descripcion);
      case 'wizard_pares_divisas':
        if (Array.isArray(datos?.pares)) return datos.pares.some((p: any) => p?.seleccionado && p?.nombre);
        if (Array.isArray(datos?.divisas) && datos.divisas.length > 0) return true;
        return false;
      case 'wizard_sentido_operacion':
        if (Array.isArray(datos?.filas)) return datos.filas.some((f: any) => ['compra', 'venta', 'ambos'].includes(f?.sentido));
        if (['compra', 'venta', 'ambos'].includes(datos?.sentido)) return true;
        if (datos?.masivoActivo && ['compra', 'venta', 'ambos'].includes(datos?.masivoValor)) return true;
        return false;
      case 'wizard_fecha_liquidacion':
        return !!(datos?.fechaInicio || datos?.fechaFin);
      case 'wizard_horarios':
        return Array.isArray(datos?.horarios) && datos.horarios.length > 0;
      case 'wizard_spreads':
        if (Array.isArray(datos?.spreads)) {
          const okNuevo = datos.spreads.some((s: any) =>
            s?.pairCode && Array.isArray(s?.windows) &&
            s.windows.some((w: any) => w && (isNumLike(w.sell) || isNumLike(w.buy)))
          );
          if (okNuevo) return true;
          const okViejo = datos.spreads.some((s: any) =>
            s?.par && (isNumLike(s.valor) || (typeof s.valor === 'string' && s.valor.trim() !== ''))
          );
          if (okViejo) return true;
        }
        return false;
      default:
        return false;
    }
  }

  private getLastStepIndexFromProgress(): number | null {
    try {
      const raw = localStorage.getItem(K_PROGRESS);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const fresh = parsed?.updatedAt && (Date.now() - parsed.updatedAt < TTL_MS);
      if (!fresh) return null;
      const idx = Number(parsed?.stepIndex);
      return Number.isFinite(idx) ? idx : null;
    } catch {
      return null;
    }
  }

  private setProgress(stepIndex: number): void {
    localStorage.setItem(K_PROGRESS, JSON.stringify({ stepIndex, updatedAt: Date.now() }));
  }

  // ===== Acciones del modal =====
  continuarEstrategiaGuardada() {
    this.mostrarModalEstrategia = false;

    const last = this.getLastStepIndexFromProgress();
    if (last !== null) {
      this.goToStep(this.clampStep(last));
      return;
    }

    const clavesOrdenadas = [
      'wizard_spreads',
      'wizard_horarios',
      'wizard_fecha_liquidacion',
      'wizard_sentido_operacion',
      'wizard_pares_divisas',
      'wizard_datos_generales'
    ];

    for (const clave of clavesOrdenadas) {
      const item = localStorage.getItem(clave);
      if (!item) continue;
      try {
        const parsed = JSON.parse(item);
        if (parsed.timestamp && Date.now() - parsed.timestamp < TTL_MS && this.validarDatosUtiles(clave, parsed)) {
          const mapping: Record<string, number> = {
            'wizard_datos_generales': 0,
            'wizard_pares_divisas': 1,
            'wizard_sentido_operacion': 2,
            'wizard_fecha_liquidacion': 3,
            'wizard_horarios': 4,
            'wizard_spreads': 5
          };
          this.goToStep(this.clampStep(mapping[clave] ?? 0));
          break;
        }
      } catch {}
    }
  }

  comenzarNuevaEstrategia() {
    this.mostrarModalEstrategia = false;

    const claves = [
      'wizard_datos_generales',
      'wizard_pares_divisas',
      'wizard_sentido_operacion',
      'wizard_fecha_liquidacion',
      'wizard_horarios',
      'wizard_spreads',
      K_PROGRESS,
      K_RETURN_AFTER_EDIT,
      K_JUMP_TO_STEP
    ];
    claves.forEach(k => localStorage.removeItem(k));

    this.renderSteps = false;
    setTimeout(() => {
      this.currentStep = 0;
      this.updateStepStatuses(0);
      this.setProgress(0);
      this.renderSteps = true;
      this.router.navigate(['step-1'], { relativeTo: this.route });
    });
  }

  finalizarEstrategia() {
    localStorage.removeItem(K_PROGRESS);
    alert('Estrategia confirmada.');
  }

  // ===== Dependencias por ORIGEN =====
  private aplicarReglaDependencia(origen: number, solicitado: number): number {
    if (origen === STEP_SENTIDO) return solicitado;
    if (origen === STEP_HORARIOS) return Math.min(solicitado, STEP_SPREADS);
    return solicitado;
  }

  private leerJumpToken(): number | null {
    try {
      const rawJump = localStorage.getItem(K_JUMP_TO_STEP);
      if (!rawJump) return null;
      const { stepIndex, ts } = JSON.parse(rawJump) || {};
      const fresh = typeof ts === 'number' && (Date.now() - ts) < TTL_MS;
      if (typeof stepIndex === 'number' && fresh) return stepIndex;
      localStorage.removeItem(K_JUMP_TO_STEP);
      return null;
    } catch {
      return null;
    }
  }

  private leerReturnAfterEdit(): number | null {
    try {
      const rawEdit = localStorage.getItem(K_RETURN_AFTER_EDIT);
      if (!rawEdit) return null;
      const { fromStep, fromStepIndex, ts } = JSON.parse(rawEdit) || {};
      const fresh = typeof ts === 'number' && (Date.now() - ts) < TTL_MS;
      const idx = typeof fromStepIndex === 'number' ? fromStepIndex : fromStep;
      if (typeof idx === 'number' && fresh) return idx;
      localStorage.removeItem(K_RETURN_AFTER_EDIT);
      return null;
    } catch {
      return null;
    }
  }

  private limpiarTokens() {
    try {
      localStorage.removeItem(K_JUMP_TO_STEP);
      localStorage.removeItem(K_RETURN_AFTER_EDIT);
    } catch {}
  }

  private clampStep(i: number): number {
    return Math.max(0, Math.min(i, this.steps.length - 1));
  }

  private syncFromUrl(url: string) {
    const m = url.match(/\/step-(\d+)/);
    const idx = m ? Number(m[1]) - 1 : 0;
    this.currentStep = this.clampStep(idx);
    this.updateStepStatuses(this.currentStep);
    this.setProgress(this.currentStep);
  }
}
