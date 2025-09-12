// apps/fxultra_admin_strategies_mf/src/app/crear-estrategia/step-wizard/step2-pares-divisas/step2-pares-divisas.ts
import { Component, OnInit, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Servicio y tipos (conexión backend)
   ───────────────────────────────────────────────────────────────────────────── */
import { EstrategiasApiService } from '../../../core/api/estrategias-api.service';
import {
  ParDivisaCatalogo,
  ConfiguracionDivisasRequest,
  ConfiguracionDivisasResponse,
} from '../../../models/estrategias.datos-generales.types';

interface ParDivisaStored {
  nombre: string;
  seleccionado: boolean;
  montoMax?: number | null;
  _edicion?: string | null;
  _selected?: boolean | null;
  _isEditing?: boolean | null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Constantes de almacenamiento y respaldo
   ───────────────────────────────────────────────────────────────────────────── */
const STORAGE_KEY         = 'wizard_pares_divisas';
const STORAGE_KEY_LAST    = 'wizard_pares_divisas_last_selection';
const K_PROGRESS          = 'wizard_progress';
const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';
const K_JUMP_TO_STEP      = 'wizard_jump_to_step';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STEP_PARES_INDEX = 1;

@Component({
  selector: 'app-pares-divisas',
  standalone: true,
  templateUrl: './step2-pares-divisas.html',
  styleUrls: ['./step2-pares-divisas.scss'],
  imports: [CommonModule, FormsModule],
})
export class ParesDivisasComponent implements OnInit {
  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Buscador / Dropdown
     ─────────────────────────────────────────────────────────────────────────── */
  busqueda = '';
  dropdownAbierto = false;
  focoIndice = -1;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Catálogo y selección
     ─────────────────────────────────────────────────────────────────────────── */
  catalogo: string[] = [];
  seleccionados: ParDivisaStored[] = [];

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Flags de UI
     ─────────────────────────────────────────────────────────────────────────── */
  showAlertaSinSeleccion = false;
  mostrarAlertaJPY = false;
  masivoActivo = false;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Mensajes globales
     ─────────────────────────────────────────────────────────────────────────── */
  mensajesValidacion: string[] = [];

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal Monto masivo
     ─────────────────────────────────────────────────────────────────────────── */
  mostrarModalMasivo = false;
  montoMasivo: number | null = null;
  modalEdicion: string | null = null;
  modalErrorMsg: string | null = null;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal OK pequeño
     ─────────────────────────────────────────────────────────────────────────── */
  mostrarModalOk = false;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal Restablecer
     ─────────────────────────────────────────────────────────────────────────── */
  mostrarModalRestablecer = false;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal Confirmar eliminación
     ─────────────────────────────────────────────────────────────────────────── */
  mostrarModalConfirmDelete = false;
  aplicaSoloSeleccionadas = false;
  private pendientesEliminar: string[] = [];

  /* ───────────────────────────────────────────────────────────────────────────
     Marca temporal para selección visual al eliminar una sola divisa
     ─────────────────────────────────────────────────────────────────────────── */
  private tempSelectedForDelete: string | null = null;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Contexto edición / retorno
     ─────────────────────────────────────────────────────────────────────────── */
  private isEditSession = false;
  private returnToStepIndex: number | null = null;

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Snapshot previo
     ─────────────────────────────────────────────────────────────────────────── */
  private prevNombres = new Set<string>();
  private prevMontos = new Map<string, number>();

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Tracking cambios de sesión
     ─────────────────────────────────────────────────────────────────────────── */
  private sessionAdded = new Set<string>();
  private sessionRemoved = new Set<string>();

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Estado de red
     ─────────────────────────────────────────────────────────────────────────── */
  cargandoCatalogo = false;
  enviandoConfiguracion = false;

  @Output() avanzarStep = new EventEmitter<void>();

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Validación
     ─────────────────────────────────────────────────────────────────────────── */
  private LIMITE_MAX = 99000000.00;
  private MINIMO = 1.00;

  /* ───────────────────────────────────────────────────────────────────────────
     Exposición de estado al template (modal eliminar)
     ─────────────────────────────────────────────────────────────────────────── */
  get esEliminacionIndividual(): boolean { return this.pendientesEliminar.length === 1; }
  get nombreAEliminar(): string { return this.esEliminacionIndividual ? this.pendientesEliminar[0] : ''; }

  /* ───────────────────────────────────────────────────────────────────────────
     Ciclo de vida
     ─────────────────────────────────────────────────────────────────────────── */
  constructor(private api: EstrategiasApiService) {}

  ngOnInit(): void {
    this.cargarCatalogoDesdeBack();
    this.detectarModoEdicion();
    this.cargarDesdeStorage();
    this.actualizarAlertaJPY();
    this.capturarSnapshotPrevio();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Carga de catálogo desde backend (mapeo visual ↔ payload)
     ─────────────────────────────────────────────────────────────────────────── */
  private cargarCatalogoDesdeBack(): void {
    this.cargandoCatalogo = true;
    this.api.getParesDivisa().subscribe({
      next: (lista: ParDivisaCatalogo[]) => {
        // Soporta claveParDivisa (contrato inicial) o valor (contrato actual)
        const nombres = (lista || [])
          .map((p: any) => String(p?.claveParDivisa ?? p?.valor ?? '').trim())
          .filter(Boolean)
          .map(v => v.replace('/', '-').replace('-', '/')); // normaliza separador
        const setUnicos = Array.from(new Set(nombres));
        this.catalogo = this.ordenarPreferente(setUnicos);
      },
      error: (err: any) => {
        this.addMensaje(typeof err?.message === 'string' && err.message ? err.message : 'No fue posible cargar los pares de divisa.');
        this.catalogo = [];
      },
      complete: () => { this.cargandoCatalogo = false; }
    });
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Modo edición y salto final
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
          if (typeof prog?.stepIndex === 'number' && prog.stepIndex > STEP_PARES_INDEX) {
            fromIndex = prog.stepIndex;
          }
        }
      } catch {}
    }
    this.returnToStepIndex = typeof fromIndex === 'number' ? fromIndex : null;
    this.isEditSession = this.returnToStepIndex != null && this.returnToStepIndex > STEP_PARES_INDEX;
  }

  private setJumpBackIfEditing(): void {
    if (!this.isEditSession) return;
    try {
      if (this.returnToStepIndex != null) {
        localStorage.setItem(K_JUMP_TO_STEP, JSON.stringify({ stepIndex: this.returnToStepIndex, ts: Date.now() }));
      }
      localStorage.removeItem(K_RETURN_AFTER_EDIT);
    } catch {}
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Snapshot para diffs
     ─────────────────────────────────────────────────────────────────────────── */
  private capturarSnapshotPrevio(): void {
    this.prevNombres.clear();
    this.prevMontos.clear();
    for (const s of this.seleccionados) {
      this.prevNombres.add(s.nombre);
      if (typeof s.montoMax === 'number') this.prevMontos.set(s.nombre, s.montoMax);
    }
    this.sessionAdded.clear();
    this.sessionRemoved.clear();
  }

  private computarDiffActual() {
    const actuales = new Set(this.seleccionados.map(s => s.nombre));
    const added: string[] = [];
    const removed: string[] = [];
    const montoChanged: string[] = [];
    for (const n of actuales) if (!this.prevNombres.has(n)) added.push(n);
    for (const n of this.prevNombres) if (!actuales.has(n)) removed.push(n);
    for (const n of actuales) {
      if (this.prevNombres.has(n)) {
        const prev = this.prevMontos.get(n) ?? 0;
        const curr = this.seleccionados.find(x => x.nombre === n)?.montoMax ?? 0;
        if (prev !== curr) montoChanged.push(n);
      }
    }
    return { added, removed, montoChanged };
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Listeners globales
     ─────────────────────────────────────────────────────────────────────────── */
  @HostListener('document:click')
  onDocClick() { this.dropdownAbierto = false; this.focoIndice = -1; }

  @HostListener('window:keydown', ['$event'])
  onGlobalKey(ev: KeyboardEvent) {
    if (this.mostrarModalMasivo) {
      if (ev.key === 'Escape') { ev.preventDefault(); this.cerrarModalMasivo(false); }
      else if (ev.key === 'Enter') { ev.preventDefault(); this.aplicarModalMasivo(); }
    }
  }

  @HostListener('paste', ['$event'])
  onPasteBlock(ev: ClipboardEvent) {
    const el = ev.target as HTMLElement | null;
    if (!el) return;
    const isMonto = el.classList.contains('monto-input') || el.classList.contains('modal-input');
    if (isMonto) ev.preventDefault();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Orden y derivados
     ─────────────────────────────────────────────────────────────────────────── */
  private compararPares(a: string, b: string): number {
    const first = ['USD', 'EUR'];
    const aBase = this.baseDe(a);
    const bBase = this.baseDe(b);
    const aIdx = first.indexOf(aBase);
    const bIdx = first.indexOf(bBase);
    if (aIdx !== -1 || bIdx !== -1) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    return aBase.localeCompare(bBase);
  }
  private ordenarPreferente(arr: string[]): string[] { return [...arr].sort((a,b) => this.compararPares(a,b)); }

  get paresDisponibles(): number { return this.catalogo.length; }
  get opcionesFiltradas(): string[] {
    const q = this.busqueda.trim().toLowerCase();
    const base = this.catalogo.filter(n => !this.estaSeleccionado(n));
    const lista = !q ? base : base.filter(n => n.toLowerCase().includes(q));
    return this.ordenarPreferente(lista);
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Buscador / Dropdown
     ─────────────────────────────────────────────────────────────────────────── */
  abrirDropdown(): void { this.dropdownAbierto = true; this.focoIndice = -1; }
  cerrarDropdownConRetardo(): void { setTimeout(() => { this.dropdownAbierto = false; this.focoIndice = -1; }, 120); }
  onBuscarChange(): void { this.dropdownAbierto = true; this.focoIndice = -1; }
  moverFocus(delta: number): void {
    if (!this.dropdownAbierto || !this.opcionesFiltradas.length) return;
    const len = this.opcionesFiltradas.length;
    if (this.focoIndice === -1) { this.focoIndice = delta > 0 ? 0 : len - 1; return; }
    this.focoIndice = (this.focoIndice + delta + len) % len;
  }
  onEnterSeleccion(): void {
    if (!this.dropdownAbierto) return;
    if (this.focoIndice >= 0 && this.focoIndice < this.opcionesFiltradas.length) {
      this.seleccionarPar(this.opcionesFiltradas[this.focoIndice]);
    }
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Selección de pares
     ─────────────────────────────────────────────────────────────────────────── */
  seleccionarPar(nombre: string): void {
    if (this.estaSeleccionado(nombre)) return;
    this.seleccionados.push({ nombre, seleccionado: true, montoMax: 0, _edicion: '0.00', _selected: false, _isEditing: false });
    this.ordenarSeleccionados();
    this.busqueda = '';
    this.dropdownAbierto = false;
    this.focoIndice = -1;
    this.actualizarAlertaJPY();
    this.guardarEnStorage();

    this.sessionAdded.add(nombre);
    this.sessionRemoved.delete(nombre);

    if (this.isEditSession) this.mostrarOkPequenio();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Eliminar (confirmación / selección visual temporal)
     ─────────────────────────────────────────────────────────────────────────── */
  confirmarEliminar(row?: ParDivisaStored): void {
    const marcados = this.seleccionados.filter(p => p._selected).map(p => p.nombre);
    const hayMarcados = marcados.length;

    if (hayMarcados >= 2) {
      this.aplicaSoloSeleccionadas = true;
      this.pendientesEliminar = [...marcados];
      this.tempSelectedForDelete = null;
    } else if (row) {
      this.aplicaSoloSeleccionadas = false;
      this.pendientesEliminar = [row.nombre];
      if (!row._selected) row._selected = true;
      this.tempSelectedForDelete = row.nombre;
    } else {
      this.aplicaSoloSeleccionadas = false;
      this.pendientesEliminar = hayMarcados === 1 ? [marcados[0]] : [];
      this.tempSelectedForDelete = null;
    }

    this.mostrarModalConfirmDelete = this.pendientesEliminar.length > 0;
  }

  cerrarModalConfirmDelete(_: boolean): void {
    if (this.tempSelectedForDelete) {
      const idx = this.seleccionados.findIndex(p => p.nombre === this.tempSelectedForDelete);
      if (idx >= 0) this.seleccionados[idx] = { ...this.seleccionados[idx], _selected: false };
    }
    this.tempSelectedForDelete = null;
    this.mostrarModalConfirmDelete = false;
    this.pendientesEliminar = [];
  }

  confirmarEliminarAceptado(): void {
    if (this.pendientesEliminar.length === 0) { this.mostrarModalConfirmDelete = false; return; }

    const borrar = new Set(this.pendientesEliminar);
    this.seleccionados = this.seleccionados
      .filter(p => !borrar.has(p.nombre))
      .map(p => ({ ...p, _selected: false }));

    this.actualizarAlertaJPY();
    this.guardarEnStorage();

    for (const n of borrar) {
      this.sessionRemoved.add(n);
      this.sessionAdded.delete(n);
    }

    this.tempSelectedForDelete = null;

    this.setJumpBackIfEditing();
    if (this.isEditSession) this.mostrarOkPequenio();

    this.pendientesEliminar = [];
    this.mostrarModalConfirmDelete = false;
  }

  quitarPar(nombre: string): void { this.confirmarEliminar({ nombre, seleccionado: true }); }
  estaSeleccionado(nombre: string): boolean {
    return this.seleccionados.some(p => p.nombre === nombre && p.seleccionado !== false);
  }
  onSelectRowChange(): void {
    if (this.showAlertaSinSeleccion && this.puedeAplicar()) this.showAlertaSinSeleccion = false;
    this.desactivarMasivoPorInteraccion();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Validación y formato
     ─────────────────────────────────────────────────────────────────────────── */
  private clearMensajes() { this.mensajesValidacion = []; }
  private addMensaje(m: string) { if (!this.mensajesValidacion.includes(m)) this.mensajesValidacion = [...this.mensajesValidacion, m]; }

  private formatearMoneda(n: number): string {
    const fixed = n.toFixed(2);
    const [int, dec] = fixed.split('.');
    const conComas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${conComas}.${dec}`;
  }

  formatearVisual(v: number | null | undefined): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '';
    return this.formatearMoneda(v);
  }

  private normalizarEntradaCruda(s: string): string {
    if (!s) return '';
    let limpio = s.replace(/[^\d.,]/g, '');
    const lastDot = limpio.lastIndexOf('.');
    const lastComma = limpio.lastIndexOf(',');
    const lastSep = Math.max(lastDot, lastComma);
    if (lastSep >= 0) {
      const parteEntera = limpio.slice(0, lastSep).replace(/[.,]/g, '');
      const parteDecimal = limpio.slice(lastSep + 1).replace(/[.,]/g, '');
      const ent = (parteEntera || '').replace(/^0+(?=\d)/, '');
      const dec = (parteDecimal || '').slice(0, 2);
      return (ent || '0') + (dec.length ? '.' + dec : '');
    } else {
      const entSolo = limpio.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
      return entSolo || '0';
    }
  }

  private toFormattedCurrency(s: string): { str: string; num: number | null } {
    const cruda = this.normalizarEntradaCruda(s);
    if (!cruda) return { str: '', num: null };
    const [entRaw, decRaw = ''] = cruda.split('.');
    if ((entRaw || '').replace(/\D/g,'').length > 8) {
      return { str: cruda, num: Number.NaN };
    }
    const ent = entRaw.slice(0, 8);
    const dec = decRaw.slice(0, 2);
    const num = Number(`${ent || '0'}.${dec}`);
    if (Number.isNaN(num)) return { str: '', num: null };
    return { str: this.formatearMoneda(num), num };
  }

  private parseFormattedToNumber(s: string): number | null {
    if (!s) return null;
    const limpio = s.replace(/,/g, '');
    const num = Number(limpio);
    if (Number.isNaN(num)) return null;
    return Math.floor(num * 100) / 100;
  }

  montoValido(num: number | null | undefined): boolean {
    if (num === null || num === undefined || Number.isNaN(num)) return false;
    if (num < this.MINIMO) return false;
    if (num > this.LIMITE_MAX) return false;
    return Math.round(num * 100) === num * 100;
  }

  private errorMensajePorMonto(num: number | null): string {
    if (num === null || Number.isNaN(num)) return 'Asigna un monto máximo de operación válido';
    if (num < this.MINIMO) return 'Monto mínimo a partir de 1.00 unidad de moneda';
    if (num > this.LIMITE_MAX) return 'El valor máximo permitido es $99,000,000.00';
    return 'Asigna un monto máximo de operación válido';
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Caret estable
     ─────────────────────────────────────────────────────────────────────────── */
  private countDigits(text: string): number { let c = 0; for (const ch of text) if (ch >= '0' && ch <= '9') c++; return c; }
  private caretMetricsBeforeFormat(formattedText: string, caretIdx: number) {
    const decIdx = formattedText.indexOf('.');
    if (decIdx === -1 || caretIdx <= decIdx) {
      const intDigitsBefore = this.countDigits(formattedText.slice(0, caretIdx));
      return { inDecimals: false as const, intDigitsBefore: Math.min(intDigitsBefore, 8), decDigitsBefore: 0 };
    } else {
      const decDigitsBefore = this.countDigits(formattedText.slice(decIdx + 1, caretIdx));
      return { inDecimals: true as const, intDigitsBefore: 0, decDigitsBefore: Math.min(decDigitsBefore, 2) };
    }
  }
  private caretIndexAfterFormat(formattedText: string, metrics: { inDecimals: boolean; intDigitsBefore: number; decDigitsBefore: number }): number {
    const decIdx = formattedText.indexOf('.');
    if (metrics.inDecimals) {
      if (decIdx === -1) return formattedText.length;
      const pos = decIdx + 1 + Math.min(metrics.decDigitsBefore, 2);
      return Math.min(pos, formattedText.length);
    } else {
      const stopAtDigits = Math.min(metrics.intDigitsBefore, 8);
      let cnt = 0;
      const end = decIdx === -1 ? formattedText.length : decIdx;
      for (let i = 0; i < end; i++) {
        const ch = formattedText[i];
        if (ch >= '0' && ch <= '9') {
          cnt++;
          if (cnt === stopAtDigits) return i + 1;
        }
      }
      return end;
    }
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sobrescritura de decimales en caret
     ─────────────────────────────────────────────────────────────────────────── */
  private overwriteDecimalAtCaret(prev: string, curr: string, caretAfter: number): { adjusted: string | null, newCaret: number | null } {
    const dot = prev.indexOf('.');
    if (dot === -1) return { adjusted: null, newCaret: null };
    if (prev.length < dot + 3) return { adjusted: null, newCaret: null };
    if (caretAfter === dot + 2) {
      const ch = curr[dot + 1];
      if (!/[0-9]/.test(ch)) return { adjusted: null, newCaret: null };
      const adjusted = prev.slice(0, dot + 1) + ch + prev[dot + 2];
      return { adjusted, newCaret: dot + 2 };
    }
    if (caretAfter === dot + 3) {
      const ch = curr[dot + 2];
      if (!/[0-9]/.test(ch)) return { adjusted: null, newCaret: null };
      const adjusted = prev.slice(0, dot + 1) + prev[dot + 1] + ch;
      return { adjusted, newCaret: dot + 3 };
    }
    return { adjusted: null, newCaret: null };
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Edición por fila / bloque
     ─────────────────────────────────────────────────────────────────────────── */
  iniciarEdicion(row: ParDivisaStored): void {
    const seleccionadosMarcados = this.seleccionados.filter(p => p._selected).length;
    if (seleccionadosMarcados > 1) {
      this.masivoActivo = true;
      this.modalErrorMsg = null;
      this.modalEdicion = '0.00';
      this.clearMensajes();
      this.mostrarModalMasivo = true;
      return;
    }
    row._isEditing = true;
    this.clearMensajes();
    const actual = row.montoMax ?? 0;
    row._edicion = this.formatearMoneda(actual);
    this.desactivarMasivoPorInteraccion();
    setTimeout(() => {
      const el = this.encontrarInputDeFila(row);
      if (el) { el.focus(); el.setSelectionRange(0, el.value.length); }
    });
  }

  guardarEdicion(row: ParDivisaStored): void {
    const nuevo = this.parseFormattedToNumber(row._edicion || '');
    if (!this.montoValido(nuevo)) {
      this.addMensaje(this.errorMensajePorMonto(nuevo));
      row._isEditing = false;
      row._edicion = null;
      return;
    }

    const hayMarcados = this.seleccionados.some(p => p._selected);
    let huboCambio = false;

    if (hayMarcados) {
      this.seleccionados.forEach(p => {
        if (p._selected) {
          if (p.montoMax !== nuevo) huboCambio = true;
          p.montoMax = nuevo!;
          p._edicion = null;
          p._isEditing = false;
        }
      });
      this.seleccionados = this.seleccionados.map(p => ({ ...p, _selected: false }));
    } else {
      if (row.montoMax !== nuevo) huboCambio = true;
      row.montoMax = nuevo!;
      row._edicion = null;
      row._isEditing = false;
    }

    this.clearMensajes();
    this.guardarEnStorage();
    this.desactivarMasivoPorInteraccion();

    if (huboCambio) this.setJumpBackIfEditing();
    if (huboCambio && this.isEditSession) this.mostrarOkPequenio();
  }

  cancelarEdicion(row: ParDivisaStored, ev?: Event): void {
    ev?.preventDefault();
    row._edicion = null;
    row._isEditing = false;
  }

  onFocusMonto(row: ParDivisaStored, ev?: Event): void {
    if (!row._isEditing) return;
    this.clearMensajes();
    const input = ev?.target as HTMLInputElement | undefined;
    if (input) { input.setSelectionRange(0, input.value.length); }
  }

  onInputMonto(ev: Event, row: ParDivisaStored): void {
    if (!row._isEditing) return;
    const target = ev.target as HTMLInputElement;
    let original = target.value;

    const prevStr = row._edicion ?? this.formatearVisual(row.montoMax);
    const caretAfter = target.selectionStart ?? original.length;

    const ow = this.overwriteDecimalAtCaret(prevStr, original, caretAfter);
    if (ow.adjusted) {
      original = ow.adjusted;
    }

    const check = this.procesaEntradaGenerica(original);
    if (check.reason) this.addMensaje(check.reason);
    if (!check.allow) {
      target.value = row._edicion ?? target.value;
      try { const pos = target.value.length; target.setSelectionRange(pos, pos); } catch {}
      return;
    }

    const metrics = this.caretMetricsBeforeFormat(original, ow.newCaret ?? caretAfter);
    const { str } = this.toFormattedCurrency(original);
    row._edicion = str;
    target.value = str;
    const newCaret = this.caretIndexAfterFormat(str, metrics);
    try { target.setSelectionRange(newCaret, newCaret); } catch {}

    this.desactivarMasivoPorInteraccion();
  }

  onBlurMonto(row: ParDivisaStored): void {
    if (!row._isEditing) { row._edicion = null; return; }

    const num = this.parseFormattedToNumber(row._edicion || '');
    if (!this.montoValido(num)) {
      this.addMensaje(this.errorMensajePorMonto(num));
      row._edicion = null;
      row._isEditing = false;
      return;
    }

    const previo = row.montoMax ?? null;
    const cambio = (previo ?? null) !== (num ?? null);

    const hayMarcados = this.seleccionados.some(p => p._selected);
    let huboCambio = false;

    if (hayMarcados) {
      this.seleccionados.forEach(p => {
        if (p._selected) {
          if (p.montoMax !== num) huboCambio = true;
          p.montoMax = num!;
          p._edicion = null;
          p._isEditing = false;
        }
      });
      this.seleccionados = this.seleccionados.map(p => ({ ...p, _selected: false }));
    } else {
      row.montoMax = num!;
      row._edicion = null;
      row._isEditing = false;
      if (cambio) huboCambio = true;
    }

    this.guardarEnStorage();
    this.desactivarMasivoPorInteraccion();

    if (huboCambio) this.setJumpBackIfEditing();
    if (huboCambio && this.isEditSession) this.mostrarOkPequenio();
  }

  private encontrarInputDeFila(row: ParDivisaStored): HTMLInputElement | null {
    const idx = this.seleccionados.findIndex((r: ParDivisaStored) => r === row);
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input.monto-input'));
    return inputs[idx] || null;
  }

  activarEdicionSiError(row: ParDivisaStored, _ev?: Event): void {
    if (!this.montoValido(row.montoMax ?? null) && !row._isEditing) this.iniciarEdicion(row);
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Modal Monto masivo
     ─────────────────────────────────────────────────────────────────────────── */
  get modalMontoValido(): boolean {
    const num = this.parseFormattedToNumber(this.modalEdicion || '');
    return this.montoValido(num);
  }

  abrirModalMasivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.seleccionados.length) {
      input.checked = false;
      this.masivoActivo = false;
      return;
    }
    if (input.checked) {
      this.masivoActivo = true;
      this.seleccionados = this.seleccionados.map(p => ({ ...p, _selected: true }));
      this.modalEdicion = '0.00';
      this.modalErrorMsg = null;
      this.clearMensajes();
      this.mostrarModalMasivo = true;
    } else {
      this.masivoActivo = false;
      this.seleccionados = this.seleccionados.map(p => ({ ...p, _selected: false }));
    }
  }

  cerrarModalMasivo(aceptado: boolean): void {
    this.mostrarModalMasivo = false;
    this.masivoActivo = !!aceptado;
    this.seleccionados = this.seleccionados.map(p => ({ ...p, _selected: false }));
    this.modalErrorMsg = null;
  }

  onFocusModal(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const texto = '0.00';
    this.modalEdicion = texto;
    input.setSelectionRange(0, texto.length);
  }

  onInputModal(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    let original = target.value;

    const prevStr = this.modalEdicion ?? '0.00';
    const caretAfter = target.selectionStart ?? original.length;

    const ow = this.overwriteDecimalAtCaret(prevStr, original, caretAfter);
    if (ow.adjusted) {
      original = ow.adjusted;
    }

    this.modalErrorMsg = null;

    const check = this.procesaEntradaGenerica(original);
    if (!check.allow) {
      this.modalErrorMsg = 'Valor de monto máximo no permitido';
      target.value = this.modalEdicion ?? target.value;
      try { const pos = target.value.length; target.setSelectionRange(pos, pos); } catch {}
      return;
    } else if (check.reason) {
      this.modalErrorMsg = check.reason;
    }

    const metrics = this.caretMetricsBeforeFormat(original, ow.newCaret ?? caretAfter);
    const { str } = this.toFormattedCurrency(original);
    if (str === '' || Number.isNaN(this.parseFormattedToNumber(str) ?? undefined)) {
      this.modalErrorMsg = 'Valor de monto máximo no permitido';
      target.value = this.modalEdicion ?? target.value;
      return;
    }

    this.modalEdicion = str;
    target.value = str;
    const newCaret = this.caretIndexAfterFormat(str, metrics);
    try { target.setSelectionRange(newCaret, newCaret); } catch {}
  }

  onBlurModal(): void {
    this.montoMasivo = this.parseFormattedToNumber(this.modalEdicion || '');
    this.modalEdicion = this.montoMasivo != null ? this.formatearMoneda(this.montoMasivo) : null;
  }

  aplicarModalMasivo(): void {
    const num = this.parseFormattedToNumber(this.modalEdicion || '');
    if (!this.montoValido(num)) {
      this.modalErrorMsg = this.errorMensajePorMonto(num);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('.modal-input');
        input?.focus();
        input?.setSelectionRange(0, input.value.length);
      });
      return;
    }

    this.modalErrorMsg = null;
    this.montoMasivo = num;

    const subset = this.seleccionados.some(x => x._selected)
      ? this.seleccionados.filter(x => x._selected)
      : this.seleccionados;

    let huboCambio = false;
    subset.forEach(p => {
      if (p.montoMax !== this.montoMasivo) huboCambio = true;
      p.montoMax = this.montoMasivo ?? 0;
      p._edicion = null;
      p._isEditing = false;
    });

    this.seleccionados = this.seleccionados.map(p => ({ ...p, _selected: false }));
    this.guardarEnStorage();

    if (huboCambio) this.setJumpBackIfEditing();
    this.cerrarModalMasivo(true);
    if (huboCambio && this.isEditSession) this.mostrarOkPequenio();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Acciones globales
     ─────────────────────────────────────────────────────────────────────────── */
  puedeAplicar(): boolean {
    if (!this.seleccionados.length) return false;
    return this.seleccionados.every(r => this.montoValido(r.montoMax ?? null));
  }

  aplicarConfiguracion(): void {
    this.clearMensajes();

    if (!this.seleccionados.length) {
      this.addMensaje('Selecciona al menos una divisa para continuar.');
      this.showAlertaSinSeleccion = true;
      return;
    }

    const invalidos = this.seleccionados.filter(r => !this.montoValido(r.montoMax ?? null));
    if (invalidos.length) {
      if (invalidos.some(v => (v.montoMax ?? 0) > this.LIMITE_MAX)) {
        this.addMensaje('El valor máximo permitido es $99,000,000.00');
      } else {
        this.addMensaje('Asigna un monto máximo de operación válido');
      }
      this.showAlertaSinSeleccion = true;
      return;
    }

    const idRaw = localStorage.getItem('wizard_idEstrategia');
    const idEstrategia = idRaw ? Number(idRaw) : NaN;
    if (!idRaw || Number.isNaN(idEstrategia)) {
      this.addMensaje('No se encontró el identificador de la estrategia. Regresa al Paso 1 y guarda los datos generales.');
      return;
    }

    const payload: ConfiguracionDivisasRequest = {
      idEstrategia,
      divisas: this.seleccionados.map(s => ({
        claveParDivisa: (s.nombre || '').replace('/', '-'),
        montoMaximo: s.montoMax ?? 0
      }))
    };

    this.enviandoConfiguracion = true;
    this.api.postConfiguracionDivisas(payload).subscribe({
      next: (_resp: ConfiguracionDivisasResponse) => {
        const { added } = this.computarDiffActual();
        if (this.isEditSession) {
          try {
            if (this.sessionAdded.size > 0 || added.length > 0) {
              localStorage.removeItem(K_JUMP_TO_STEP);
              localStorage.removeItem(K_RETURN_AFTER_EDIT);
            } else {
              if (this.returnToStepIndex != null) {
                localStorage.setItem(K_JUMP_TO_STEP, JSON.stringify({ stepIndex: this.returnToStepIndex, ts: Date.now() }));
              }
              localStorage.removeItem(K_RETURN_AFTER_EDIT);
            }
          } catch {}
        }

        this.sessionAdded.clear();
        this.sessionRemoved.clear();
        this.capturarSnapshotPrevio();

        this.avanzarStep.emit();
        try {
          window.dispatchEvent(new CustomEvent('wizard:next-step', { detail: { from: 'step2-pares-divisas' } }));
        } catch {}
      },
      error: (err: any) => {
        const msg = typeof err?.message === 'string' && err.message
          ? err.message
          : 'Ocurrió un error al guardar la configuración de divisas.';
        this.addMensaje(msg);
      },
      complete: () => { this.enviandoConfiguracion = false; }
    });
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Restablecer
     ─────────────────────────────────────────────────────────────────────────── */
  abrirModalRestablecer(): void { this.mostrarModalRestablecer = true; }
  cerrarModalRestablecer(): void { this.mostrarModalRestablecer = false; }

  restablecerMontos(): void {
    this.seleccionados = this.seleccionados.map(p => ({
      ...p,
      montoMax: 0,
      _edicion: null,
      _isEditing: false,
      _selected: false
    }));
    this.clearMensajes();
    this.guardarEnStorage();
    this.actualizarAlertaJPY();

    this.setJumpBackIfEditing();
    this.cerrarModalRestablecer();
    if (this.isEditSession) this.mostrarOkPequenio();
  }

  restablecerTodo(): void {
    this.busqueda = '';
    this.dropdownAbierto = false;
    this.focoIndice = -1;
    this.seleccionados = [];
    this.mostrarAlertaJPY = false;
    this.masivoActivo = false;
    this.montoMasivo = null;
    this.modalEdicion = null;
    this.modalErrorMsg = null;
    this.clearMensajes();
    localStorage.removeItem(STORAGE_KEY);

    this.setJumpBackIfEditing();
    this.cerrarModalRestablecer();
    if (this.isEditSession) this.mostrarOkPequenio();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Persistencia
     ─────────────────────────────────────────────────────────────────────────── */
  private cargarDesdeStorage(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    let loaded = false;

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS) {
          const arreglo: any[] = Array.isArray(parsed) ? parsed : (parsed.pares ?? []);
          const mapeo: ParDivisaStored[] = arreglo.map(x => ({
            nombre: String(x?.nombre ?? x),
            seleccionado: x?.seleccionado !== false,
            montoMax: typeof x?.montoMax === 'number' ? x.montoMax : 0,
            _edicion: null,
            _selected: false,
            _isEditing: false
          })).filter(p => p.seleccionado);
          this.seleccionados = this.ordenarPreferente(mapeo.map(m => m.nombre))
            .map(n => mapeo.find(m => m.nombre === n)!)
            .filter(Boolean);
          loaded = this.seleccionados.length > 0;
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    }

    if (!loaded) {
      const lastRaw = localStorage.getItem(STORAGE_KEY_LAST);
      if (lastRaw) {
        try {
          const lastNames: string[] = JSON.parse(lastRaw) || [];
          const valid = lastNames.filter(n => this.catalogo.includes(n));
          this.seleccionados = this.ordenarPreferente(valid).map(n => ({
            nombre: n, seleccionado: true, montoMax: 0, _edicion: null, _selected: false, _isEditing: false
          }));
        } catch {}
      }
    }
  }

  private guardarEnStorage(): void {
    const payload = this.catalogo.map(nombre => {
      const sel = this.seleccionados.find(s => s.nombre === nombre);
      return { nombre, seleccionado: !!sel, montoMax: sel?.montoMax ?? 0 };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pares: payload, timestamp: Date.now() }));
    this.guardarUltimaSeleccion();
  }

  private guardarUltimaSeleccion(): void {
    const nombres = this.seleccionados.map(s => s.nombre);
    localStorage.setItem(STORAGE_KEY_LAST, JSON.stringify(nombres));
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Utilidades
     ─────────────────────────────────────────────────────────────────────────── */
  private ordenarSeleccionados(): void {
    this.seleccionados = this.ordenarPreferente(this.seleccionados.map(s => s.nombre))
      .map(n => this.seleccionados.find(s => s.nombre === n)!)
      .filter(Boolean);
  }

  private actualizarAlertaJPY(): void {
    this.mostrarAlertaJPY = this.seleccionados.some(p => p.nombre === 'JPY/MXN'); // solo cuando JPY es base
  }

  baseDe(par: string): string { return (par || '').split('/')[0] || ''; }
  trackPar = (_: number, r: ParDivisaStored) => r.nombre;

  /* ───────────────────────────────────────────────────────────────────────────
     Mensajería y entradas
     ─────────────────────────────────────────────────────────────────────────── */
  private mostrarOkPequenio(): void { this.mostrarModalOk = true; }
  cerrarModalOk(): void { this.mostrarModalOk = false; }

  private procesaEntradaGenerica(original: string): { allow: boolean; reason?: string } {
    if (/[a-zA-Z]/.test(original) || /[-]/.test(original) || /[^\d.,-]/.test(original)) {
      return { allow: true, reason: 'Solo se permiten números positivos con punto decimal. Letras, símbolos especiales o signos negativos no son válidos.' };
    }
    const lastSep = Math.max(original.lastIndexOf('.'), original.lastIndexOf(','));
    const enterosCrudos = (lastSep >= 0 ? original.slice(0, lastSep) : original).replace(/[^\d]/g, '');
    if (enterosCrudos.length > 8) {
      return { allow: false, reason: 'Valor de monto máximo no permitido' };
    }
    if (lastSep >= 0) {
      const decs = original.slice(lastSep + 1).replace(/[^\d]/g, '');
      if (decs.length > 2) {
        return { allow: false, reason: 'Solo se permiten 2 decimales' };
      }
    }
    return { allow: true };
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Regla: desactivar masivo por interacción individual
     ─────────────────────────────────────────────────────────────────────────── */
  private desactivarMasivoPorInteraccion(): void {
    this.masivoActivo = false;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Export alias para entry.routes.ts
   ───────────────────────────────────────────────────────────────────────────── */
export { ParesDivisasComponent as Step2ParesDivisas };
