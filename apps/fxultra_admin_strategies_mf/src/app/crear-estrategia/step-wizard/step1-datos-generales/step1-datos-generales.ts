// apps/fxultra_admin_strategies_mf/src/app/crear-estrategia/step-wizard/step1-datos-generales/step1-datos-generales.ts

import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { EstrategiasApiService } from '../../../core/api/estrategias-api.service';
import {
  DatosGeneralesRequest,
  ModoOperacion,
  ProductoAsociado,
  ProductoAsociadoCatalogo
} from '../../../models/estrategias.datos-generales.types';
import { lastValueFrom } from 'rxjs';

/* Persistencia */
const STORAGE_KEY = 'wizard_datos_generales';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/* Navegación/edición */
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

  // ===== Datos del formulario
  nombreEstrategia = '';
  productoAsociado = '';
  descripcion = '';
  horariosEstablecidos = true;

  // ===== Estado / errores
  nombreEstrategiaValido = false;
  errorNombreExiste = false;
  errorProductoAsociado = false;
  errorNombreVacio = false;
  errorDescripcionVacia = false;
  errorMsg = '';
  loading = false;

  isNombreFocused = false;
  isProductoFocused = false;
  isDescripcionFocused = false;

  // ===== Modal
  mostrarModalOk = false;

  // ===== Edición
  private isEditSession = false;

  // ===== Snapshot
  private prevNombre = '';
  private prevProducto = '';
  private prevDescripcion = '';
  private prevHorarios = true;

  // ===== Identificador de la estrategia creada
  private idEstrategia: number | null = null;

  // ===== Catálogo
  productosAsociados: ProductoAsociadoCatalogo[] = [];

  @Output() avanzarStep = new EventEmitter<void>();

  constructor(
    private estrategiasApi: EstrategiasApiService
  ) {}

  // ===== Inicio
  async ngOnInit(): Promise<void> {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) {
      try {
        const parsed = JSON.parse(guardado);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS) {
          const { nombreEstrategia, productoAsociado, descripcion, horariosEstablecidos, idEstrategia } = parsed;
          this.nombreEstrategia = nombreEstrategia ?? '';
          this.productoAsociado = productoAsociado ?? '';
          this.descripcion = descripcion ?? '';
          this.horariosEstablecidos = horariosEstablecidos ?? false;
          this.idEstrategia = typeof idEstrategia === 'number' ? idEstrategia : null;
          this.nombreEstrategiaValido = !!this.nombreEstrategia;
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    }

    await this.cargarCatalogoProductos();
    this.detectarModoEdicion();
    this.capturarSnapshotPrevio();
  }

  // ===== Catálogo (normaliza a códigos del backend)
  private async cargarCatalogoProductos(): Promise<void> {
    try {
      const raw: any[] = await lastValueFrom(this.estrategiasApi.getProductosAsociados() as any);

      this.productosAsociados = (Array.isArray(raw) ? raw : []).map((it: any) => {
        const codigoBruto =
          it?.codigo ?? it?.valor ?? it?.clave ?? it?.id ?? it?.code ?? '';
        const descripcion =
          it?.descripcion ?? it?.nombre ?? it?.label ?? String(it?.valor ?? '') ?? '';

        let code = String(codigoBruto).trim().toUpperCase().replace(/[\s-]+/g, '_');
        if (code === 'COMPRAVENTA') code = 'COMPRA_VENTA';

        return { codigo: code, descripcion } as ProductoAsociadoCatalogo;
      }).filter(x => !!x.codigo);

      this.normalizarProductoSeleccionado(this.productosAsociados);
    } catch (e) {
      console.error('Error al cargar productos asociados', e);
    }
  }

  private normalizarProductoSeleccionado(lista: ProductoAsociadoCatalogo[]): void {
    const actual = (this.productoAsociado || '').trim();
    if (!actual || !lista?.length) return;

    const porCodigo = lista.find(p => (p.codigo || '').toUpperCase() === actual.toUpperCase());
    if (porCodigo) { this.productoAsociado = porCodigo.codigo; return; }

    const porDescripcion = lista.find(p => (p.descripcion || '').toUpperCase() === actual.toUpperCase());
    if (porDescripcion) { this.productoAsociado = porDescripcion.codigo; }
  }

  // ===== Detección de edición
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

  // ===== Handlers
  onNombreEstrategiaInput() {
    this.nombreEstrategiaValido = this.nombreEstrategia.trim().length > 0;
    this.errorNombreExiste = false;
    this.errorNombreVacio = false;
    this.errorMsg = '';
    if (this.productoAsociado) this.errorProductoAsociado = false;
    this.guardarEnStorage();
  }

  onProductoAsociadoChange(e?: Event) {
    const v = (e?.target as HTMLSelectElement | null)?.value;
    if (v != null) this.productoAsociado = v;
    this.errorProductoAsociado = false;
    this.guardarEnStorage();
    this.mostrarOkSiEditYHayCambios();
  }

  onProductoAsociadoModelChange(codigo: string) {
    if (codigo != null) this.productoAsociado = codigo;
    this.errorProductoAsociado = false;
    this.guardarEnStorage();
  }

  onDescripcionInput() {
    this.errorDescripcionVacia = false;
    this.guardarEnStorage();
  }

  onHorariosCheckboxChange() {
    this.guardarEnStorage();
  }

  // ===== Persistencia local
  descartarCambios() { this.resetCampos(); }

  guardarEnStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nombreEstrategia: this.nombreEstrategia,
      productoAsociado: this.productoAsociado,
      descripcion: this.descripcion,
      horariosEstablecidos: this.horariosEstablecidos,
      idEstrategia: this.idEstrategia,
      timestamp: Date.now()
    }));
  }

  private markProgress() {
    try {
      localStorage.setItem(K_PROGRESS, JSON.stringify({ stepIndex: STEP_DG_INDEX, updatedAt: Date.now() }));
    } catch {}
  }

  // ===== Utilidad: normaliza selección a código backend
  private resolverCodigoProductoDesdeDom(): ProductoAsociado | null {
    const sel = document.getElementById('producto-asociado') as HTMLSelectElement | null;
    const domValue = (sel?.value ?? '').trim();
    const domText  = (sel?.selectedOptions?.[0]?.text ?? '').trim();

    const candidato = (this.productoAsociado || '').trim() || domValue || domText;

    const porCodigo = this.productosAsociados.find(p => (p.codigo || '').toUpperCase() === candidato.toUpperCase());
    if (porCodigo) return porCodigo.codigo as ProductoAsociado;

    const porDescripcion = this.productosAsociados.find(p => (p.descripcion || '').toUpperCase() === candidato.toUpperCase());
    if (porDescripcion) return porDescripcion.codigo as ProductoAsociado;

    let u = candidato.toUpperCase().replace(/[\s-]+/g, '_');
    if (u === 'COMPRAVENTA') u = 'COMPRA_VENTA';
    if (u === 'COMPRA_VENTA') return 'COMPRA_VENTA' as ProductoAsociado;
    if (u === 'POSTURAS')     return 'POSTURAS' as ProductoAsociado;
    return null;
  }

  // ===== Utilidad: leer texto de error del back (string / Blob / objeto)
  private async extraerMensajeErrorAsync(err: unknown): Promise<string> {
    const h = err as HttpErrorResponse;

    // Cuerpo como string
    if (typeof h?.error === 'string' && h.error.trim()) {
      return h.error.trim();
    }

    // Cuerpo como Blob (típico cuando el back manda text/plain)
    if (h?.error instanceof Blob) {
      try {
        const text = await h.error.text();
        if (text && text.trim()) return text.trim();
      } catch {}
    }

    // Cuerpo como objeto con message/error
    if (h?.error && typeof h.error === 'object') {
      const maybe = (h.error as any).message ?? (h.error as any).error;
      if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
    }

    // Fallback legible
    if (typeof h?.message === 'string' && h.message) return h.message;
    return 'No fue posible completar la operación.';
  }

  // ===== Envío
  async aplicarConfiguracion() {
    const codigoDetectado = this.resolverCodigoProductoDesdeDom();
    if (codigoDetectado) this.productoAsociado = codigoDetectado;

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

    // Edición: no volver a crear
    if (this.idEstrategia != null) {
      this.guardarEnStorage();
      this.markProgress();

      if (this.isEditSession && this.huboCambios()) {
        this.mostrarModalOk = true;
        try { localStorage.removeItem(K_JUMP_TO_STEP); } catch {}
      } else {
        try { localStorage.removeItem(K_JUMP_TO_STEP); } catch {}
      }

      this.avanzarStep.emit();
      try { window.dispatchEvent(new CustomEvent('wizard:next-step', { detail: { from: 'step1-datos-generales' } })); } catch {}
      this.capturarSnapshotPrevio();

      /* ===== FUTURO PATCH (cuando el back lo publique) =====
      const payloadActualizacion: DatosGeneralesRequest & { idEstrategia: number } = {
        idEstrategia: this.idEstrategia,
        nombre: this.nombreEstrategia.trim(),
        descripcion: this.descripcion.trim(),
        productoAsociado: this.productoAsociado as ProductoAsociado,
        modoOperacion: 'HORARIOS'
      };
      // this.estrategiasApi.patchDatosGenerales(payloadActualizacion).subscribe(...);
      ======================================================= */
      return;
    }

    // Alta inicial
    const payload: DatosGeneralesRequest = {
      nombre: this.nombreEstrategia.trim(),
      descripcion: this.descripcion.trim(),
      productoAsociado: this.productoAsociado as ProductoAsociado,
      modoOperacion: 'HORARIOS' as ModoOperacion
    };

    this.loading = true;

    try {
      const resp: any = await lastValueFrom(this.estrategiasApi.postDatosGenerales(payload));
      const nuevoId = Number(resp?.idEstrategia);
      if (!Number.isFinite(nuevoId)) {
        throw new Error('Respuesta inválida del servidor (sin idEstrategia)');
      }
      this.idEstrategia = nuevoId;

      this.guardarEnStorage();
      this.markProgress();
      try { localStorage.removeItem(K_JUMP_TO_STEP); } catch {}

      this.avanzarStep.emit();
      try { window.dispatchEvent(new CustomEvent('wizard:next-step', { detail: { from: 'step1-datos-generales' } })); } catch {}
      this.capturarSnapshotPrevio();
    } catch (e) {
      // <<< Mostrar texto del backend en pantalla >>>
      const mensaje = await this.extraerMensajeErrorAsync(e);
      this.errorMsg = mensaje;

      // Marca específica si el texto sugiere duplicado de nombre
      if (/nombre.*(ya ).*exist/i.test(mensaje) || /registrad/i.test(mensaje)) {
        this.errorNombreExiste = true;
      }
    } finally {
      this.loading = false;
    }
  }

  // ===== Limpieza
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

  onNombreFocus()  { this.isNombreFocused = true; }
  onNombreBlur()   { this.isNombreFocused = false; this.mostrarOkSiEditYHayCambios(); }
  onProductoFocus(){ this.isProductoFocused = true; }
  onProductoBlur() { this.isProductoFocused = false; this.mostrarOkSiEditYHayCambios(); }
  onDescripcionFocus() { this.isDescripcionFocused = true; }
  onDescripcionBlur()  { this.isDescripcionFocused = false; this.mostrarOkSiEditYHayCambios(); }

  cerrarModalOk() { this.mostrarModalOk = false; }
}
