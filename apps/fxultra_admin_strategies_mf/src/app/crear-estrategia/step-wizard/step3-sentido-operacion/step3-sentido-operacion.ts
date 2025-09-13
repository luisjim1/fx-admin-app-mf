// apps/fxultra_admin_strategies_mf/src/app/crear-estrategia/step-wizard/step3-sentido-operacion/step3-sentido-operacion.ts

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Imports
   ───────────────────────────────────────────────────────────────────────────── */
import { Component, EventEmitter, Output, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { EstrategiasApiService } from '../../../core/api/estrategias-api.service';
import {
  ListadoSentidoOperacionDivisaRequest,
  SentidoOperacion,
  SentidoOperacionCatalogo
} from '../../../models/estrategias.datos-generales.types';

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Tipos locales
   ───────────────────────────────────────────────────────────────────────────── */
type Sentido = '' | 'ambos' | 'compra' | 'venta';

interface ParDivisaStored {
  id?: number; parId?: number;
  nombre?: string; descripcion?: string; label?: string;
  base?: string; cotiza?: string;
  seleccionado?: boolean;
}

interface FilaSentido {
  parId: number | null;
  parKey: string;
  parNombre: string;
  sentido: Sentido;
  _selected?: boolean;
  _open?: boolean;
}

interface DivisaPaso2 {
  claveParDivisa: string;
  idDivisaEstrategia: number;
  montoMaximo?: number;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Constantes y storage keys
   ───────────────────────────────────────────────────────────────────────────── */
const PARES_KEY            = 'wizard_pares_divisas';
const STORAGE_KEY          = 'wizard_sentido_operacion';
const K_PROGRESS           = 'wizard_progress';
const K_RETURN_AFTER_EDIT  = 'wizard_return_after_edit';
const K_JUMP_TO_STEP       = 'wizard_jump_to_step';
const K_ID_ESTRATEGIA      = 'wizard_idEstrategia';
const K_STEP2_IDS          = 'wizard_step2_divisas_ids';

const MAX_AGE_MS           = 24 * 60 * 60 * 1000;
const STEP_SENTIDO_INDEX   = 2;
const STEP_SPREADS_INDEX   = 5;

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Componente
   ───────────────────────────────────────────────────────────────────────────── */
@Component({
  selector: 'app-sentido-operacion',
  standalone: true,
  templateUrl: './step3-sentido-operacion.html',
  styleUrls: ['./step3-sentido-operacion.scss'],
  imports: [CommonModule, FormsModule]
})
export class SentidoOperacionComponent implements OnInit {

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Estado de pantalla
     ─────────────────────────────────────────────────────────────────────────── */
  filas: FilaSentido[] = [];
  masivo: { activo: boolean; valor: Sentido | null } = { activo: false, valor: null };
  mostrarModalMasivo = false;
  modalSentido: Sentido = '';
  showAlertaSinSeleccion = false;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal de confirmación
     ─────────────────────────────────────────────────────────────────────────── */
  mostrarModalOk = false;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Contexto de edición
     ─────────────────────────────────────────────────────────────────────────── */
  private isEditSession = false;
  private returnToStepIndex: number | null = null;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Snapshot y baseline
     ─────────────────────────────────────────────────────────────────────────── */
  private prevSentidos = new Map<string, Sentido>();
  private baselineHash = '';

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Backend
     ─────────────────────────────────────────────────────────────────────────── */
  private api = inject(EstrategiasApiService);
  private enviando = false;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Catálogo de sentidos (backend)
     ─────────────────────────────────────────────────────────────────────────── */
  catalogoSentidos: SentidoOperacionCatalogo[] = [];
  private catalogoMapUi: Set<Sentido> = new Set(['ambos', 'compra', 'venta']);

  @Output() avanzarStep = new EventEmitter<void>();

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Ciclo de vida
     ─────────────────────────────────────────────────────────────────────────── */
  async ngOnInit(): Promise<void> {
    this.detectarModoEdicion();
    this.cargarDesdeStorage();

    // Catálogo de sentidos desde backend (siempre que esté disponible)
    // Se mapea a los valores locales de UI y se normaliza el estado actual.
    try {
      const cat = await this.api.getSentidosOperacion().toPromise();
      if (Array.isArray(cat) && cat.length) {
        this.catalogoSentidos = cat;
        this.catalogoMapUi = new Set(
          cat
            .map(c => this.backASentidoUi(c.codigo))
            .filter((v): v is Sentido => v === 'ambos' || v === 'compra' || v === 'venta')
        );
        this.normalizarSegunCatalogo();
      }
    } catch {
      // Si el catálogo no está listo en back, se continúa con los valores locales
    }

    this.capturarSnapshotPrevio();
    this.baselineHash = this.calcularHashActual();
    this.touchStorage();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Detección de edición
     ─────────────────────────────────────────────────────────────────────────── */
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
          if (typeof prog?.stepIndex === 'number' && prog.stepIndex > STEP_SENTIDO_INDEX) {
            fromIndex = prog.stepIndex;
          }
        }
      } catch {}
    }

    this.returnToStepIndex = typeof fromIndex === 'number' ? fromIndex : null;
    this.isEditSession = this.returnToStepIndex != null && this.returnToStepIndex > STEP_SENTIDO_INDEX;
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Snapshot y cambios
     ─────────────────────────────────────────────────────────────────────────── */
  private capturarSnapshotPrevio(): void {
    this.prevSentidos.clear();
    for (const f of this.filas) this.prevSentidos.set(f.parKey, f.sentido || '');
  }

  private huboCambios(): boolean {
    for (const f of this.filas) {
      const prev = this.prevSentidos.get(f.parKey) ?? '';
      if ((f.sentido || '') !== prev) return true;
    }
    return false;
  }

  private calcularHashActual(): string {
    const parts = this.filas
      .map(f => [String(f.parKey), String(f.sentido || '')] as [string, string])
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}:${v}`);
    return parts.join('|');
  }

  private huboCambiosEstrictos(): boolean {
    return this.calcularHashActual() !== this.baselineHash;
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Cierre global de menús
     ─────────────────────────────────────────────────────────────────────────── */
  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    const el = ev.target as HTMLElement;
    if (!el.closest('.select-sim')) this.filas.forEach(f => f._open = false);
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Interacción por fila
     ─────────────────────────────────────────────────────────────────────────── */
  toggleMenu(row: FilaSentido) {
    this.filas.forEach(f => { if (f !== row) f._open = false; });
    row._open = !row._open;
    this.touchStorage();
  }

  seleccionar(row: FilaSentido, valor: Sentido) {
    const antes = row.sentido;
    row.sentido = valor;
    row._open = false;

    this.onSentidoChange(row);
    this.guardarEnStorage();

    this.desactivarMasivoPorInteraccion();

    if (this.isEditSession && antes !== valor) this.mostrarOkPequenio();
  }

  labelDe(v: Sentido | null | undefined): string {
    switch (v) {
      case 'ambos':  return 'Compra y venta';
      case 'compra': return 'Compra';
      case 'venta':  return 'Venta';
      default:       return '';
    }
  }

  onSentidoChange(row: FilaSentido): void {
    if (this.masivo.activo) {
      const valor = row.sentido;
      this.masivo.valor = valor;
      this.filas = this.filas.map(f => ({ ...f, sentido: valor, _selected: false }));
      this.guardarEnStorage();
      this.desactivarMasivoPorInteraccion();
      return;
    }

    const seleccionados = this.filas.filter(f => f._selected);
    if (row._selected && seleccionados.length > 1) {
      const valor = row.sentido;
      this.filas = this.filas
        .map(f => f._selected ? ({ ...f, sentido: valor }) : f)
        .map(f => ({ ...f, _selected: false }));
    }

    this.guardarEnStorage();
  }

  onSelectRowChange(_: FilaSentido): void {
    this.guardarEnStorage();
    this.desactivarMasivoPorInteraccion();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Acciones globales
     ─────────────────────────────────────────────────────────────────────────── */
  async aplicarConfiguracion(): Promise<void> {
    if (this.filas.some(f => !f.sentido)) {
      this.showAlertaSinSeleccion = true;
      return;
    }
    this.showAlertaSinSeleccion = false;
    this.guardarEnStorage();

    const idEstrategia = this.leerIdEstrategia();
    const divisasPaso2 = this.leerDivisasPaso2();

    if (idEstrategia && divisasPaso2.length) {
      const req = this.armarPayloadPatch(idEstrategia, divisasPaso2);
      if (req.divisas.length) {
        this.enviando = true;
        try {
          await this.api.patchSentidoOperacion(req).toPromise();
          this.mostrarOkPequenio();
        } catch (e) {
          console.error('Error al actualizar sentido de operación', e);
          this.enviando = false;
          return;
        }
        this.enviando = false;
      }
    }

    if (this.isEditSession) {
      try {
        const cambios = this.huboCambiosEstrictos();
        if (cambios) {
          const destino = STEP_SPREADS_INDEX;
          localStorage.setItem(K_JUMP_TO_STEP, JSON.stringify({ stepIndex: destino, ts: Date.now() }));
        } else {
          if (typeof this.returnToStepIndex === 'number' && this.returnToStepIndex > STEP_SENTIDO_INDEX) {
            localStorage.setItem(K_JUMP_TO_STEP, JSON.stringify({ stepIndex: this.returnToStepIndex, ts: Date.now() }));
          } else {
            localStorage.removeItem(K_JUMP_TO_STEP);
          }
        }
        localStorage.removeItem(K_RETURN_AFTER_EDIT);
      } catch {}
    }

    this.avanzarStep.emit();
    try {
      window.dispatchEvent(new CustomEvent('wizard:next-step', { detail: { from: 'step3-sentido-operacion' } }));
    } catch {}

    this.capturarSnapshotPrevio();
    this.baselineHash = this.calcularHashActual();
  }

  restablecer(): void {
    this.showAlertaSinSeleccion = false;
    this.filas = this.filas.map(f => ({ ...f, sentido: '', _selected: false, _open: false }));
    this.masivo = { activo: false, valor: null };
    localStorage.removeItem(STORAGE_KEY);
    this.guardarEnStorage();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal masivo
     ─────────────────────────────────────────────────────────────────────────── */
  abrirModalMasivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      this.filas = this.filas.map(f => ({ ...f, _selected: true }));
      this.masivo.activo = true;
      this.modalSentido = '' as Sentido;
      this.mostrarModalMasivo = true;
    } else {
      this.masivo.activo = false;
      this.masivo.valor = null;
      this.filas = this.filas.map(f => ({ ...f, _selected: false }));
      this.guardarEnStorage();
    }
  }

  cerrarModalMasivo(aceptado: boolean): void {
    this.mostrarModalMasivo = false;
    this.masivo.activo = !!aceptado;
    this.filas = this.filas.map(f => ({ ...f, _selected: false }));
    this.guardarEnStorage();
  }

  aplicarModalMasivo(): void {
    if (!this.modalSentido) {
      this.cerrarModalMasivo(false);
      return;
    }
    const valor = this.modalSentido;
    const huboAntes = this.huboCambios();

    this.filas = this.filas.map(f => ({ ...f, sentido: valor, _selected: false, _open: false }));
    this.masivo.activo = true;
    this.masivo.valor = valor;
    this.showAlertaSinSeleccion = false;

    this.guardarEnStorage();
    this.cerrarModalMasivo(true);

    if (this.isEditSession) {
      const huboDespues = this.huboCambios();
      if (huboAntes || huboDespues) this.mostrarOkPequenio();
    }
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Storage
     ─────────────────────────────────────────────────────────────────────────── */
  private cargarDesdeStorage(): void {
    const pares = this.leerParesSeleccionados();

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS && Array.isArray(parsed.filas)) {
          const byKey = new Map<string, Sentido>();
          const byId  = new Map<number, Sentido>();
          const byNom = new Map<string, Sentido>();
          for (const f of parsed.filas) {
            const sentido = (f?.sentido ?? '') as Sentido;
            if (f?.parKey) byKey.set(String(f.parKey), sentido);
            if (Number.isFinite(f?.parId)) byId.set(Number(f.parId), sentido);
            if (typeof f?.parNombre === 'string') byNom.set(f.parNombre, sentido);
          }

          this.filas = pares.map(p => {
            const id      = (p.id ?? p.parId ?? null) as number | null;
            const parKey  = this.keyFor(p);
            const nombre  = this.nombrePar(p);
            const sentido = byKey.get(parKey)
              ?? (id !== null ? byId.get(id) : undefined)
              ?? byNom.get(nombre)
              ?? '' as Sentido;

            return {
              parId: id,
              parKey,
              parNombre: nombre,
              sentido,
              _selected: false,
              _open: false
            };
          });
          return;
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    this.filas = pares.map(p => ({
      parId: (p.id ?? p.parId ?? null) as number | null,
      parKey: this.keyFor(p),
      parNombre: this.nombrePar(p),
      sentido: '' as Sentido,
      _selected: false,
      _open: false
    }));
    this.masivo = { activo: false, valor: null };
  }

  private guardarEnStorage(): void {
    const limpio = this.filas.map(({ parId, parKey, parNombre, sentido }) => ({ parId, parKey, parNombre, sentido }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      filas: limpio,
      masivoActivo: this.masivo.activo,
      masivoValor: this.masivo.valor,
      timestamp: Date.now()
    }));

    if (this.showAlertaSinSeleccion && !this.filas.some(f => !f.sentido)) {
      this.showAlertaSinSeleccion = false;
    }
  }

  private touchStorage(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        parsed.timestamp = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        return;
      } catch {}
    }
    this.guardarEnStorage();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Utilidades de lectura
     ─────────────────────────────────────────────────────────────────────────── */
  private leerParesSeleccionados(): ParDivisaStored[] {
    const raw = localStorage.getItem(PARES_KEY);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw) as any;
      const lista: ParDivisaStored[] = Array.isArray(data) ? data : (data?.pares ?? []);
      return lista.filter(x => x.seleccionado !== false);
    } catch { return []; }
  }

  private leerIdEstrategia(): number | null {
    const raw = localStorage.getItem(K_ID_ESTRATEGIA);
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }

  private leerDivisasPaso2(): DivisaPaso2[] {
    const raw = localStorage.getItem(K_STEP2_IDS);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(x => Number.isFinite(x?.idDivisaEstrategia)) : [];
    } catch { return []; }
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Utilidades de mapeo
     ─────────────────────────────────────────────────────────────────────────── */
  private keyFor(p: ParDivisaStored): string {
    const base = (p.base || '').toUpperCase().trim();
    const cot  = (p.cotiza || '').toUpperCase().trim();
    if (base && cot) return `${base}/${cot}`;
    const nom = (p.nombre || p.descripcion || p.label || '—').toString().toUpperCase().trim();
    return nom;
  }

  private nombrePar(p: ParDivisaStored): string {
    if (p.nombre) return p.nombre;
    if (p.descripcion) return p.descripcion;
    if (p.label) return p.label;
    if (p.base && p.cotiza) return `${p.base}/${p.cotiza}`;
    return '—';
  }

  private uiASentidoBack(v: Sentido): SentidoOperacion {
    switch (v) {
      case 'compra': return 'COMPRA';
      case 'venta':  return 'VENTA';
      default:       return 'COMPRA_VENTA';
    }
  }

  private backASentidoUi(codigo: SentidoOperacion): Sentido {
    switch (codigo) {
      case 'COMPRA':        return 'compra';
      case 'VENTA':         return 'venta';
      case 'COMPRA_VENTA':  return 'ambos';
      default:              return '';
    }
  }

  private normalizarClave(clave: string): string {
    return String(clave || '').toUpperCase().replace(/\//g, '-').trim();
  }

  private armarPayloadPatch(idEstrategia: number, divisasPaso2: DivisaPaso2[]): ListadoSentidoOperacionDivisaRequest {
    const mapaIdPorClave = new Map<string, number>();
    for (const d of divisasPaso2) {
      const k = this.normalizarClave(d.claveParDivisa);
      mapaIdPorClave.set(k, d.idDivisaEstrategia);
    }

    const items = this.filas
      .map(f => {
        const clave = this.normalizarClave(f.parKey);
        const idDivisa = f.parId ?? mapaIdPorClave.get(clave) ?? null;
        const sentido = f.sentido ? this.uiASentidoBack(f.sentido) : null;
        if (idDivisa == null || sentido == null) return null;
        return { idDivisaEstrategia: idDivisa, sentidoOperacion: sentido };
      })
      .filter(Boolean) as ListadoSentidoOperacionDivisaRequest['divisas'];

    return { idEstrategia, divisas: items };
  }

  private normalizarSegunCatalogo(): void {
    // Si el back limita opciones, cualquier valor fuera del catálogo se limpia.
    if (!this.catalogoMapUi || !this.catalogoMapUi.size) return;
    this.filas = this.filas.map(f => {
      if (!f.sentido || this.catalogoMapUi.has(f.sentido)) return f;
      return { ...f, sentido: '' as Sentido };
    });
    this.guardarEnStorage();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal OK
     ─────────────────────────────────────────────────────────────────────────── */
  private mostrarOkPequenio(): void { this.mostrarModalOk = true; }
  cerrarModalOk(): void { this.mostrarModalOk = false; }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Reglas de interfaz
     ─────────────────────────────────────────────────────────────────────────── */
  private desactivarMasivoPorInteraccion(): void { this.masivo.activo = false; }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Exportación alias (para rutas/consumo)
   ───────────────────────────────────────────────────────────────────────────── */
export { SentidoOperacionComponent as Step3SentidoOperacion };
