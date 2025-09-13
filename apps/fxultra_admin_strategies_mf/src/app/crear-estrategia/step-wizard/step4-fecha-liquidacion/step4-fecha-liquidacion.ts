// apps/fxultra_admin_strategies_mf/src/app/crear-estrategia/step-wizard/step4-fecha-liquidacion/step4-fecha-liquidacion.ts

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Imports
   ───────────────────────────────────────────────────────────────────────────── */
import { Component, EventEmitter, OnInit, Output, HostListener, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { EstrategiasApiService } from '../../../core/api/estrategias-api.service';
import {
  FechaLiquidacionCatalogo,
  FechaLiquidacion,
  FechasLiquidacionRequest
} from '../../../models/estrategias.datos-generales.types';

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Tipos locales
   ───────────────────────────────────────────────────────────────────────────── */
type OpcionKey = 'all' | 'today' | 'tom' | 'spot48' | '1d72';

interface ParDivisaStored {
  id?: number; parId?: number;
  nombre?: string; descripcion?: string; label?: string;
  base?: string; cotiza?: string;
  seleccionado?: boolean;
}

interface FilaFecha {
  parId: number | null;
  parKey: string;
  parNombre: string;
  esJPY: boolean;
  seleccion: OpcionKey[];
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
const PARES_KEY           = 'wizard_pares_divisas';
const STORAGE_KEY         = 'wizard_fecha_liquidacion';
const K_PROGRESS          = 'wizard_progress';
const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';
const K_JUMP_TO_STEP      = 'wizard_jump_to_step';
const K_ID_ESTRATEGIA     = 'wizard_idEstrategia';
const K_STEP2_IDS         = 'wizard_step2_divisas_ids';

const MAX_AGE_MS    = 24 * 60 * 60 * 1000;
const STEP_FL_INDEX = 3;

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Componente
   ───────────────────────────────────────────────────────────────────────────── */
@Component({
  selector: 'app-fecha-liquidacion',
  standalone: true,
  templateUrl: './step4-fecha-liquidacion.html',
  styleUrls: ['./step4-fecha-liquidacion.scss'],
  imports: [CommonModule, FormsModule],
})
export class FechaLiquidacionComponent implements OnInit {
  /* ── Estado de pantalla ───────────────────────────────────────────────────── */
  filas: FilaFecha[] = [];
  showAlertaSinSeleccion = false;

  masivo = { activo: false };
  mostrarModalMasivo = false;

  modalGeneralSel = new Set<OpcionKey>();
  modalJpySel = new Set<OpcionKey>();
  modalJPYEnabled = false;

  /* ── Modal OK ─────────────────────────────────────────────────────────────── */
  mostrarModalOk = false;

  /* ── Contexto de edición ─────────────────────────────────────────────────── */
  private isEditSession = false;
  private returnToStepIndex: number | null = null;

  /* ── Snapshot ─────────────────────────────────────────────────────────────── */
  private prevHash = new Map<string, string>();

  /* ── Backend ──────────────────────────────────────────────────────────────── */
  private api = inject(EstrategiasApiService);
  private cdr = inject(ChangeDetectorRef);

  catalogoFechas: FechaLiquidacionCatalogo[] = [];
  private permitidasGenerales: OpcionKey[] = ['today', 'tom', 'spot48', '1d72'];
  private permitidasJPY: OpcionKey[] = ['spot48', '1d72'];

  @Output() avanzarStep = new EventEmitter<void>();

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Ciclo de vida
     ─────────────────────────────────────────────────────────────────────────── */
  async ngOnInit(): Promise<void> {
    this.detectarModoEdicion();
    this.cargarDesdeStorage();

    try {
      const cat = await this.api.getFechasLiquidacion().toPromise();
      if (Array.isArray(cat) && cat.length) {
        this.catalogoFechas = cat;
        this.calibrarOpcionesDesdeCatalogo();
        this.normalizarSegunCatalogo();
        this.cdr.detectChanges();
      }
    } catch {}

    this.capturarSnapshotPrevio();
    this.touchStorage();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Listeners globales
     ─────────────────────────────────────────────────────────────────────────── */
  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    const el = ev.target as HTMLElement;
    if (!el.closest('.select-sim')) this.filas.forEach(f => f._open = false);
  }

  @HostListener('window:keydown', ['$event'])
  onKeydownWindow(ev: KeyboardEvent) {
    if (this.mostrarModalMasivo && ev.key === 'Escape') {
      ev.preventDefault();
      this.cerrarModalMasivo(false);
    }
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
          if (typeof prog?.stepIndex === 'number' && prog.stepIndex > STEP_FL_INDEX) {
            fromIndex = prog.stepIndex;
          }
        }
      } catch {}
    }

    this.returnToStepIndex = typeof fromIndex === 'number' ? fromIndex : null;
    this.isEditSession = this.returnToStepIndex != null && this.returnToStepIndex > STEP_FL_INDEX;
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Opciones por tipo de par
     ─────────────────────────────────────────────────────────────────────────── */
  private opcionesGenerales(): OpcionKey[] { return this.permitidasGenerales.length ? [...this.permitidasGenerales] : ['today','tom','spot48','1d72']; }
  private opcionesJPY(): OpcionKey[] { return this.permitidasJPY.length ? [...this.permitidasJPY] : ['spot48','1d72']; }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Cómputos de selección
     ─────────────────────────────────────────────────────────────────────────── */
  tieneTodas(row: FilaFecha): boolean {
    const permitidas = row.esJPY ? this.opcionesJPY() : this.opcionesGenerales();
    const set = new Set(row.seleccion);
    return permitidas.length > 0 && permitidas.every(k => set.has(k));
  }

  private etiqueta(k: OpcionKey): string {
    switch (k) {
      case 'today':  return 'Today';
      case 'tom':    return 'TOM';
      case 'spot48': return 'SPOT (48h)';
      case '1d72':   return '1D (72h)';
      default:       return '';
    }
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Dropdown por fila
     ─────────────────────────────────────────────────────────────────────────── */
  toggleMenu(row: FilaFecha) {
    this.filas.forEach(f => { if (f !== row) f._open = false; });
    row._open = !row._open;
    this.touchStorage();
  }

  isSeleccionado(row: FilaFecha, key: OpcionKey | 'all'): boolean {
    if (key === 'all') return this.tieneTodas(row);
    return row.seleccion.includes(key as OpcionKey);
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Cambios por fila
     ─────────────────────────────────────────────────────────────────────────── */
  toggleOpcion(row: FilaFecha, key: OpcionKey | 'all') {
    const antes = this.hashFila(row);

    if (key === 'all') {
      const permitidas = row.esJPY ? this.opcionesJPY() : this.opcionesGenerales();
      const completo = this.tieneTodas(row);
      row.seleccion = completo ? [] : [...permitidas];
    } else {
      const sel = new Set(row.seleccion);
      sel.has(key) ? sel.delete(key) : sel.add(key);
      row.seleccion = Array.from(sel);
    }

    const seleccionados = this.filas.filter(f => f._selected);
    if (row._selected && seleccionados.length > 1) {
      const copia = [...row.seleccion];
      this.filas = this.filas.map(f => f._selected ? ({ ...f, seleccion: [...copia] }) : f);
      this.filas.forEach(f => (f._selected = false));
    }

    row._open = false;
    this.filas = this.filas.map(f => (f === row ? { ...row } : f));

    this.guardarEnStorage();
    this.desactivarMasivoPorInteraccion();
    this.cdr.detectChanges();

    const despues = this.hashFila(row);
    if (this.isEditSession && antes !== despues) this.mostrarOkPequenio();
  }

  onSelectRowChange(_: FilaFecha): void {
    this.guardarEnStorage();
    this.desactivarMasivoPorInteraccion();
  }

  resumenSeleccion(row: FilaFecha): string {
    if (!row?.seleccion?.length) return '';
    if (this.tieneTodas(row)) return 'Todas las fechas';

    const orden = row.esJPY ? this.opcionesJPY() : this.opcionesGenerales();
    const setSel = new Set(row.seleccion);
    const enOrden = orden.filter(k => setSel.has(k));
    const extras  = row.seleccion.filter(k => !orden.includes(k));
    const final   = [...enOrden, ...extras];

    return final.map(k => this.etiqueta(k)).filter(Boolean).join(', ');
  }

  get tieneJPY(): boolean { return this.filas.some(f => f.esJPY); }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal masivo
     ─────────────────────────────────────────────────────────────────────────── */
  abrirModalMasivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      this.filas = this.filas.map(f => ({ ...f, _selected: true }));
      this.masivo.activo = true;
      this.modalGeneralSel = new Set<OpcionKey>();
      this.modalJpySel = new Set<OpcionKey>();
      this.modalJPYEnabled = false;
      this.mostrarModalMasivo = true;
    } else {
      this.masivo.activo = false;
      this.filas = this.filas.map(f => ({ ...f, _selected: false }));
      this.guardarEnStorage();
    }
  }

  onCloseClick(ev: MouseEvent): void {
    ev.stopPropagation();
    this.cerrarModalMasivo(false);
  }

  cerrarModalMasivo(aceptado: boolean): void {
    this.mostrarModalMasivo = false;
    this.masivo.activo = !!aceptado;
    this.filas = this.filas.map(f => ({ ...f, _selected: false }));
    this.guardarEnStorage();
  }

  isGenSel(key: OpcionKey): boolean { return this.modalGeneralSel.has(key); }
  isJpySel(key: OpcionKey): boolean { return this.modalJpySel.has(key); }
  isGenAll(): boolean {
    const permitidas = this.opcionesGenerales();
    return permitidas.length > 0 && permitidas.every(k => this.modalGeneralSel.has(k));
  }
  isJpyAll(): boolean {
    const permitidas = this.opcionesJPY();
    return permitidas.length > 0 && permitidas.every(k => this.modalJpySel.has(k));
  }

  toggleGen(key: OpcionKey | 'all'): void {
    if (key === 'all') {
      const permitidas = this.opcionesGenerales();
      this.modalGeneralSel = this.isGenAll() ? new Set<OpcionKey>() : new Set<OpcionKey>(permitidas);
    } else {
      const s = new Set(this.modalGeneralSel);
      s.has(key) ? s.delete(key) : s.add(key);
      this.modalGeneralSel = s;
    }
    this.cdr.detectChanges();
  }

  toggleJpy(key: OpcionKey | 'all'): void {
    if (key === 'all') {
      const permitidas = this.opcionesJPY();
      this.modalJpySel = this.isJpyAll() ? new Set<OpcionKey>() : new Set<OpcionKey>(permitidas);
    } else {
      const s = new Set(this.modalJpySel);
      s.has(key) ? s.delete(key) : s.add(key);
      this.modalJpySel = s;
    }
    this.cdr.detectChanges();
  }

  aplicarModalMasivo(): void {
    const before = this.hashGlobal();

    const genArr = Array.from(this.modalGeneralSel);
    if (genArr.length) {
      this.filas = this.filas.map(f =>
        f.esJPY ? f : ({ ...f, seleccion: [...genArr], _selected: false, _open: false })
      );
    }

    const jpyArr = Array.from(this.modalJpySel);
    if (this.tieneJPY && this.modalJPYEnabled && jpyArr.length) {
      this.filas = this.filas.map(f =>
        f.esJPY ? ({ ...f, seleccion: [...jpyArr], _selected: false, _open: false }) : f
      );
    }

    this.showAlertaSinSeleccion = false;
    this.guardarEnStorage();
    this.cerrarModalMasivo(true);
    this.cdr.detectChanges();

    const after = this.hashGlobal();
    if (this.isEditSession && before !== after) this.mostrarOkPequenio();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Acciones globales (POST)
     ─────────────────────────────────────────────────────────────────────────── */
  async aplicarConfiguracion() {
    this.filas = this.filas.map(f => ({ ...f, seleccion: Array.isArray(f.seleccion) ? f.seleccion : [] }));

    if (this.filas.some(f => !f.seleccion || f.seleccion.length === 0)) {
      this.showAlertaSinSeleccion = true;
      this.cdr.detectChanges();
      return;
    }
    this.showAlertaSinSeleccion = false;
    this.guardarEnStorage();

    const idEstrategia = this.leerIdEstrategia();
    const divisasPaso2 = this.leerDivisasPaso2();

    if (idEstrategia && divisasPaso2.length) {
      const req = this.armarPayloadPost(idEstrategia, divisasPaso2);
      if (req.fechasLiquidacionDivisas.length) {
        try {
          await this.api.postFechasLiquidacion(req).toPromise();
          this.mostrarOkPequenio();
        } catch (e) {
          console.error('Error al registrar fechas de liquidación', e);
          return;
        }
      }
    }

    try { localStorage.removeItem(K_JUMP_TO_STEP); } catch {}

    if (this.isEditSession && this.returnToStepIndex != null) {
      try {
        localStorage.setItem(K_JUMP_TO_STEP, JSON.stringify({ stepIndex: this.returnToStepIndex, ts: Date.now() }));
      } catch {}
    }

    this.avanzarStep.emit();

    try {
      window.dispatchEvent(new CustomEvent('wizard:next-step', { detail: { from: 'step4-fecha-liquidacion' } }));
    } catch {}

    this.capturarSnapshotPrevio();
  }

  restablecer() {
    this.showAlertaSinSeleccion = false;
    this.filas = this.filas.map(f => ({ ...f, seleccion: [], _selected: false, _open: false }));
    localStorage.removeItem(STORAGE_KEY);
    this.guardarEnStorage();
    this.cdr.detectChanges();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Persistencia
     ─────────────────────────────────────────────────────────────────────────── */
  private cargarDesdeStorage(): void {
    const pares = this.leerParesSeleccionados();

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;

    const tieneFilasGuardadas = parsed && Array.isArray(parsed.filas);
    const norm = (s: string) => String(s ?? '').toUpperCase().trim();

    if (tieneFilasGuardadas) {
      const byKey = new Map<string, OpcionKey[]>();
      const byId  = new Map<number, OpcionKey[]>();
      const byNom = new Map<string, OpcionKey[]>();

      for (const f of parsed.filas) {
        const sel = (Array.isArray(f?.seleccion) ? f.seleccion : []) as OpcionKey[];
        if (f?.parKey) byKey.set(norm(f.parKey), sel);
        if (Number.isFinite(f?.parId)) byId.set(Number(f.parId), sel);
        if (typeof f?.parNombre === 'string') byNom.set(norm(f.parNombre), sel);
      }

      if (pares.length) {
        this.filas = pares.map(p => {
          const id      = (p.id ?? p.parId ?? null) as number | null;
          const parKey  = this.keyFor(p);
          const parNom  = this.nombrePar(p);
          const esJPY   = this.esJPY(p);

          const sel = byKey.get(norm(parKey))
            ?? (id !== null ? byId.get(id) : undefined)
            ?? byNom.get(norm(parNom))
            ?? [];

          return {
            parId: id,
            parKey,
            parNombre: parNom,
            esJPY,
            seleccion: sel,
            _selected: false,
            _open: false
          };
        });
        return;
      } else {
        // Fallback: sin pares disponibles, rehidratar tal cual lo guardado
        this.filas = parsed.filas.map((f: any) => ({
          parId: Number.isFinite(f?.parId) ? Number(f.parId) : null,
          parKey: String(f?.parKey ?? '—'),
          parNombre: String(f?.parNombre ?? '—'),
          esJPY: !!f?.esJPY || String(f?.parKey ?? '').includes('JPY'),
          seleccion: Array.isArray(f?.seleccion) ? (f.seleccion as OpcionKey[]) : [],
          _selected: false,
          _open: false
        })) as FilaFecha[];
        return;
      }
    }

    // Inicial vacío tomando pares del paso 2
    this.filas = pares.map(p => ({
      parId: (p.id ?? p.parId ?? null) as number | null,
      parKey: this.keyFor(p),
      parNombre: this.nombrePar(p),
      esJPY: this.esJPY(p),
      seleccion: [],
      _selected: false,
      _open: false
    }));
  }

  guardarEnStorage(): void {
    const limpio = this.filas.map(({ parId, parKey, parNombre, esJPY, seleccion }) => ({
      parId, parKey, parNombre, esJPY, seleccion
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ filas: limpio, timestamp: Date.now() }));
    if (this.showAlertaSinSeleccion && !this.filas.some(f => !f.seleccion || f.seleccion.length === 0)) {
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
     Sección: Utilidades
     ─────────────────────────────────────────────────────────────────────────── */
  private leerParesSeleccionados(): ParDivisaStored[] {
    const raw = localStorage.getItem(PARES_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as any;
      const lista: ParDivisaStored[] = Array.isArray(arr) ? arr : (arr?.pares ?? []);
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

  private keyFor(p: ParDivisaStored): string {
    const base = (p.base || '').toUpperCase().trim();
    const cot  = (p.cotiza || '').toUpperCase().trim();
    if (base && cot) return `${base}/${cot}`;
    const nom = (p.nombre || p.descripcion || p.label || '—').toString().toUpperCase().trim();
    return nom;
  }

  private esJPY(p: ParDivisaStored): boolean { return this.keyFor(p).includes('JPY'); }

  private nombrePar(p: ParDivisaStored): string {
    if (p.nombre) return p.nombre;
    if (p.descripcion) return p.descripcion;
    if (p.label) return p.label;
    if (p.base && p.cotiza) return `${p.base}/${p.cotiza}`;
    return '—';
  }

  private ordenarSeleccion(keys: OpcionKey[], esJPY: boolean): OpcionKey[] {
    const orden = esJPY ? this.opcionesJPY() : this.opcionesGenerales();
    const set = new Set(keys);
    return orden.filter(k => set.has(k));
  }

  private hashFila(f: FilaFecha): string {
    const ord = this.ordenarSeleccion(f.seleccion, f.esJPY);
    return ord.join('|');
  }

  private hashGlobal(): string {
    return this.filas.map(f => `${f.parKey}:${this.hashFila(f)}`).join('||');
  }

  private capturarSnapshotPrevio(): void {
    this.prevHash.clear();
    for (const f of this.filas) this.prevHash.set(f.parKey, this.hashFila(f));
  }

  private normalizarClave(clave: string): string {
    return String(clave || '').toUpperCase().replace(/\//g, '-').trim();
  }

  private uiAFechaBack(k: OpcionKey): FechaLiquidacion | null {
    switch (k) {
      case 'today':  return 'TODAY';
      case 'tom':    return 'TOM';
      case 'spot48': return 'SPOT';
      case '1d72':   return 'ONE_D';
      default:       return null;
    }
  }

  private calibrarOpcionesDesdeCatalogo(): void {
    const set = new Set(this.catalogoFechas.map(c => c.codigo));
    const m = (c: FechaLiquidacion): OpcionKey | null => {
      switch (c) {
        case 'TODAY': return 'today';
        case 'TOM':   return 'tom';
        case 'SPOT':  return 'spot48';
        case 'ONE_D': return '1d72';
      }
    };
    const all = (['TODAY','TOM','SPOT','ONE_D'] as FechaLiquidacion[])
      .filter(c => set.has(c))
      .map(m)
      .filter(Boolean) as OpcionKey[];

    this.permitidasGenerales = [...all];

    const jpyPref = ['spot48','1d72'] as OpcionKey[];
    this.permitidasJPY = jpyPref.filter(k => all.includes(k));
    if (!this.permitidasJPY.length) this.permitidasJPY = [...all];
  }

  private normalizarSegunCatalogo(): void {
    const genSet = new Set(this.permitidasGenerales);
    const jpySet = new Set(this.permitidasJPY);

    this.filas = this.filas.map(f => {
      const permitidas = f.esJPY ? jpySet : genSet;
      const nueva = f.seleccion.filter(k => permitidas.has(k));
      return { ...f, seleccion: nueva };
    });

    this.guardarEnStorage();
  }

  private armarPayloadPost(idEstrategia: number, divisasPaso2: DivisaPaso2[]): FechasLiquidacionRequest {
    const mapaIdPorClave = new Map<string, number>();
    for (const d of divisasPaso2) {
      const k = this.normalizarClave(d.claveParDivisa);
      mapaIdPorClave.set(k, d.idDivisaEstrategia);
    }

    const fechasLiquidacionDivisas = this.filas.map(f => {
      const clave = this.normalizarClave(f.parKey);
      const idDivisa = f.parId ?? mapaIdPorClave.get(clave) ?? null;
      const fechasLiquidacion = f.seleccion
        .map(k => this.uiAFechaBack(k))
        .filter(Boolean) as FechaLiquidacion[];

      if (idDivisa == null || !fechasLiquidacion.length) return null;
      return { idDivisaEstrategia: idDivisa, fechasLiquidacion };
    }).filter(Boolean) as FechasLiquidacionRequest['fechasLiquidacionDivisas'];

    return { idEstrategia, fechasLiquidacionDivisas };
  }

  private mostrarOkPequenio(): void { this.mostrarModalOk = true; }
  cerrarModalOk(): void { this.mostrarModalOk = false; }

  private desactivarMasivoPorInteraccion(): void { this.masivo.activo = false; }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Export nominal para lazy-load
   ───────────────────────────────────────────────────────────────────────────── */
export const Step4FechaLiquidacion  = FechaLiquidacionComponent;
export const Step4FechaLiquidaciON  = FechaLiquidacionComponent;
