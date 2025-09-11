// apps/fxultra_admin_strategies_mf/src/app/crear-estrategia/step-wizard/step1-datos-generales/step1-datos-generales.ts
// datos-generales.component.ts — COMPLETO (ajustado a step por subruta)
import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

const STORAGE_KEY = 'wizard_datos_generales';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Navegación/edición
const K_PROGRESS          = 'wizard_progress';
const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';
const K_JUMP_TO_STEP      = 'wizard_jump_to_step';
const STEP_DG_INDEX       = 0;

@Component({
  selector: 'app-datos-generales',
  templateUrl: './step1-datos-generales.html',
  styleUrls: ['./step1-datos-generales.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class Step1DatosGenerales implements OnInit {
  // ===== Campos =====
  nombreEstrategia: string = '';
  productoAsociado: string = '';
  descripcion: string = '';
  horariosEstablecidos: boolean = true;

  // ===== Flags UI / validación =====
  nombreEstrategiaValido = false;
  errorNombreExiste: boolean = false;
  errorProductoAsociado: boolean = false;
  errorNombreVacio: boolean = false;
  errorDescripcionVacia: boolean = false;
  errorMsg: string = '';
  loading: boolean = false;

  isNombreFocused: boolean = false;
  isProductoFocused: boolean = false;
  isDescripcionFocused: boolean = false;

  // ===== Modal OK =====
  mostrarModalOk = false;

  // ===== Contexto edición =====
  private isEditSession = false;

  // ===== Snapshot previo =====
  private prevNombre = '';
  private prevProducto = '';
  private prevDescripcion = '';
  private prevHorarios = true;

  @Output() avanzarStep = new EventEmitter<void>();

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  // ===== Init =====
  ngOnInit(): void {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) {
      try {
        const parsed = JSON.parse(guardado);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS) {
          const { nombreEstrategia, productoAsociado, descripcion, horariosEstablecidos } = parsed;
          this.nombreEstrategia = nombreEstrategia ?? '';
          this.productoAsociado = productoAsociado ?? '';
          this.descripcion = descripcion ?? '';
          this.horariosEstablecidos = horariosEstablecidos ?? false;
          this.nombreEstrategiaValido = !!this.nombreEstrategia;
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    }

    this.detectarModoEdicion();
    this.capturarSnapshotPrevio();
  }

  // ===== Detección de edición =====
  private detectarModoEdicion(): void {
    let fromIndex: number | null = null;

    try {
      const tokenRaw = localStorage.getItem(K_RETURN_AFTER_EDIT);
      if (tokenRaw) {
        const tok = JSON.parse(tokenRaw);
        if (typeof tok?.fromStepIndex === 'number') fromIndex = tok.fromStepIndex;
        else if (typeof tok?.fromStep === 'number') fromIndex = tok.fromStep;
      }
    } catch {}

    if (fromIndex == null) {
      try {
        const progRaw = localStorage.getItem(K_PROGRESS);
        if (progRaw) {
          const prog = JSON.parse(progRaw);
          if (typeof prog?.stepIndex === 'number' && prog.stepIndex > STEP_DG_INDEX) {
            fromIndex = prog.stepIndex;
          }
        }
      } catch {}
    }

    this.isEditSession = fromIndex != null && fromIndex > STEP_DG_INDEX;
  }

  private capturarSnapshotPrevio(): void {
    this.prevNombre = this.nombreEstrategia ?? '';
    this.prevProducto = this.productoAsociado ?? '';
    this.prevDescripcion = this.descripcion ?? '';
    this.prevHorarios = !!this.horariosEstablecidos;
  }

  private huboCambios(): boolean {
    return (
      (this.prevNombre ?? '') !== (this.nombreEstrategia ?? '') ||
      (this.prevProducto ?? '') !== (this.productoAsociado ?? '') ||
      (this.prevDescripcion ?? '') !== (this.descripcion ?? '') ||
      (!!this.prevHorarios) !== (!!this.horariosEstablecidos)
    );
  }

  private mostrarOkSiEditYHayCambios(): void {
    if (this.isEditSession && this.huboCambios()) {
      this.mostrarModalOk = true;
      this.capturarSnapshotPrevio();
    }
  }

  // ===== Handlers de campos =====
  onNombreEstrategiaInput() {
    this.nombreEstrategiaValido = this.nombreEstrategia.trim().length > 0;
    this.errorNombreExiste = false;
    this.errorNombreVacio = false;
    this.errorMsg = '';
    if (this.productoAsociado) this.errorProductoAsociado = false;
    this.guardarEnStorage();
  }
  onProductoAsociadoChange() {
    this.errorProductoAsociado = false;
    this.guardarEnStorage();
    this.mostrarOkSiEditYHayCambios();
  }
  onDescripcionInput() {
    this.errorDescripcionVacia = false;
    this.guardarEnStorage();
  }
  onHorariosCheckboxChange() {
    this.guardarEnStorage();
  }

  // ===== Acciones =====
  descartarCambios() { this.resetCampos(); }

  guardarEnStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nombreEstrategia: this.nombreEstrategia,
      productoAsociado: this.productoAsociado,
      descripcion: this.descripcion,
      horariosEstablecidos: this.horariosEstablecidos,
      timestamp: Date.now()
    }));
  }

  private markProgress() {
    try {
      localStorage.setItem(K_PROGRESS, JSON.stringify({ stepIndex: STEP_DG_INDEX, updatedAt: Date.now() }));
    } catch {}
  }

  aplicarConfiguracion() {
    this.errorMsg = '';
    this.errorNombreExiste = false;
    this.errorProductoAsociado = false;
    this.errorNombreVacio = false;
    this.errorDescripcionVacia = false;

    if (!this.nombreEstrategia.trim()) this.errorNombreVacio = true;
    if (!this.productoAsociado.trim()) this.errorProductoAsociado = true;
    if (!this.descripcion.trim()) this.errorDescripcionVacia = true;

    if (this.errorNombreVacio || this.errorProductoAsociado || this.errorDescripcionVacia) {
      this.guardarEnStorage();
      return;
    }

    if (this.nombreEstrategia.trim().toLowerCase() === 'estrategia por horarios') {
      this.errorNombreExiste = true;
      this.guardarEnStorage();
      return;
    }

    this.loading = true;

    setTimeout(() => {
      this.loading = false;
      this.guardarEnStorage();
      this.markProgress();

      if (this.isEditSession && this.huboCambios()) {
        this.mostrarModalOk = true;
        try { localStorage.removeItem(K_JUMP_TO_STEP); } catch {}
      } else {
        try { localStorage.removeItem(K_JUMP_TO_STEP); } catch {}
      }

      // Mantén el @Output (no estorba)
      this.avanzarStep.emit();

      // *** CLAVE: NO navegar directo. Disparar evento global como en otros steps ***
      try {
        window.dispatchEvent(new CustomEvent('wizard:next-step', {
          detail: { from: 'step1-datos-generales' }
        }));
      } catch {}

      this.capturarSnapshotPrevio();
    }, 500);

    // Backend futuro (se deja como referencia)
    /*
    this.http.post<{ ok: boolean; error?: string }>('http://localhost:8080/api/estrategias', {...})
      .subscribe({...});
    */
  }

  resetCampos() {
    this.nombreEstrategia = '';
    this.productoAsociado = '';
    this.descripcion = '';
    this.horariosEstablecidos = true;
    this.nombreEstrategiaValido = false;
    this.errorNombreExiste = false;
    this.errorProductoAsociado = false;
    this.errorNombreVacio = false;
    this.errorDescripcionVacia = false;
    this.errorMsg = '';
    this.guardarEnStorage();
  }

  // ===== Focus UI + modal en blur =====
  onNombreFocus()  { this.isNombreFocused = true; }
  onNombreBlur()   { this.isNombreFocused = false; this.mostrarOkSiEditYHayCambios(); }
  onProductoFocus(){ this.isProductoFocused = true; }
  onProductoBlur() { this.isProductoFocused = false; this.mostrarOkSiEditYHayCambios(); }
  onDescripcionFocus() { this.isDescripcionFocused = true; }
  onDescripcionBlur()  { this.isDescripcionFocused = false; this.mostrarOkSiEditYHayCambios(); }

  // ===== Modal OK =====
  cerrarModalOk() { this.mostrarModalOk = false; }
}
