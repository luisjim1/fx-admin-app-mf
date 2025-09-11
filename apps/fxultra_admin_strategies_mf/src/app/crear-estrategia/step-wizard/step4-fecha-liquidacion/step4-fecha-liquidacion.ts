// fecha-liquidacion.component.ts — COMPLETO
import { Component, EventEmitter, OnInit, Output, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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

const PARES_KEY           = 'wizard_pares_divisas';
const STORAGE_KEY         = 'wizard_fecha_liquidacion';
const K_PROGRESS          = 'wizard_progress';
const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';
const K_JUMP_TO_STEP      = 'wizard_jump_to_step';

const MAX_AGE_MS    = 24 * 60 * 60 * 1000;
const STEP_FL_INDEX = 3;

@Component({
  selector: 'app-fecha-liquidacion',
  standalone: true,
  templateUrl: './step4-fecha-liquidacion.html',
  styleUrls: ['./step4-fecha-liquidacion.scss'],
  imports: [CommonModule, FormsModule],
})
export class FechaLiquidacionComponent implements OnInit {
  /* ===== Sección: Datos de tabla y selección masiva ===== */
  filas: FilaFecha[] = [];
  showAlertaSinSeleccion = false;

  masivo = { activo: false };
  mostrarModalMasivo = false;

  modalGeneralSel = new Set<OpcionKey>();
  modalJpySel = new Set<OpcionKey>();
  modalJPYEnabled = false;

  /* ===== Sección: Modal OK pequeño ===== */
  mostrarModalOk = false;

  /* ===== Sección: Contexto de edición ===== */
  private isEditSession = false;
  private returnToStepIndex: number | null = null;

  /* ===== Sección: Snapshot previo ===== */
  private prevHash = new Map<string, string>();

  @Output() avanzarStep = new EventEmitter<void>();

  // ==========================
  // Ciclo de vida
  // ==========================
  ngOnInit(): void {
    this.detectarModoEdicion();
    this.cargarDesdeStorage();
    this.capturarSnapshotPrevio();
    this.touchStorage();
  }

  // ==========================
  // Listeners globales
  // ==========================
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

  // ==========================
  // Detección de edición
  // ==========================
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

  // ==========================
  // Opciones por tipo de par
  // ==========================
  private opcionesGenerales(): OpcionKey[] { return ['today', 'tom', 'spot48', '1d72']; }
  private opcionesJPY(): OpcionKey[] { return ['spot48', '1d72']; }

  // ==========================
  // Dropdown por fila
  // ==========================
  toggleMenu(row: FilaFecha) {
    this.filas.forEach(f => { if (f !== row) f._open = false; });
    row._open = !row._open;
    this.touchStorage();
  }

  isSeleccionado(row: FilaFecha, key: OpcionKey | 'all'): boolean {
    if (key === 'all') {
      const permitidas = row.esJPY ? this.opcionesJPY() : this.opcionesGenerales();
      return permitidas.every(k => row.seleccion.includes(k));
    }
    return row.seleccion.includes(key as OpcionKey);
  }

  // ==========================
  // Cambios por fila
  // ==========================
  toggleOpcion(row: FilaFecha, key: OpcionKey | 'all') {
    const antes = this.hashFila(row);

    if (key === 'all') {
      const permitidas = row.esJPY ? this.opcionesJPY() : this.opcionesGenerales();
      const isAll = permitidas.every(k => row.seleccion.includes(k));
      row.seleccion = isAll ? [] : [...permitidas];
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
    this.guardarEnStorage();

    // ===== Desactivar masivo por interacción individual
    this.desactivarMasivoPorInteraccion();

    const despues = this.hashFila(row);
    if (this.isEditSession && antes !== despues) this.mostrarOkPequenio();
  }

  onSelectRowChange(_: FilaFecha): void {
    this.guardarEnStorage();
    // ===== Desactivar masivo al marcar/desmarcar filas
    this.desactivarMasivoPorInteraccion();
  }

  resumenSeleccion(row: FilaFecha): string {
    if (!row?.seleccion?.length) return '';
    const orden = row.esJPY ? this.opcionesJPY() : this.opcionesGenerales();
    const esTodo = orden.every(k => row.seleccion.includes(k));
    if (esTodo) return 'Todas las fechas';

    const label = (k: OpcionKey): string => {
      switch (k) {
        case 'today':  return 'Today';
        case 'tom':    return 'TOM';
        case 'spot48': return 'SPOT (48h)';
        case '1d72':   return '1D (72h)';
        default:       return '';
      }
    };
    const set = new Set(row.seleccion);
    const ordenadas = orden.filter(k => set.has(k));
    return ordenadas.map(label).filter(Boolean).join(', ');
  }

  get tieneJPY(): boolean { return this.filas.some(f => f.esJPY); }

  // ==========================
  // Modal masivo
  // ==========================
  abrirModalMasivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      // Al abrir, marcar filas seleccionadas (igual que en Pares de divisas)
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
    // Mantener masivo activo solo si se aceptó; limpiar selección visual
    this.masivo.activo = !!aceptado;
    this.filas = this.filas.map(f => ({ ...f, _selected: false }));
    this.guardarEnStorage();
  }

  // ==========================
  // Selección en modal
  // ==========================
  isGenSel(key: OpcionKey | 'all'): boolean {
    if (key === 'all') {
      const permitidas = this.opcionesGenerales();
      return permitidas.every(k => this.modalGeneralSel.has(k));
    }
    return this.modalGeneralSel.has(key as OpcionKey);
  }
  toggleGen(key: OpcionKey | 'all'): void {
    if (key === 'all') {
      const permitidas = this.opcionesGenerales();
      const isAll = permitidas.every(k => this.modalGeneralSel.has(k));
      this.modalGeneralSel = new Set(isAll ? [] : permitidas);
    } else {
      const s = new Set(this.modalGeneralSel);
      s.has(key) ? s.delete(key) : s.add(key);
      this.modalGeneralSel = s;
    }
  }

  isJpySel(key: OpcionKey | 'all'): boolean {
    if (key === 'all') {
      const permitidas = this.opcionesJPY();
      return permitidas.every(k => this.modalJpySel.has(k));
    }
    return this.modalJpySel.has(key as OpcionKey);
  }
  toggleJpy(key: OpcionKey | 'all'): void {
    if (key === 'all') {
      const permitidas = this.opcionesJPY();
      const isAll = permitidas.every(k => this.modalJpySel.has(k));
      this.modalJpySel = new Set(isAll ? [] : permitidas);
    } else {
      const s = new Set(this.modalJpySel);
      s.has(key) ? s.delete(key) : s.add(key);
      this.modalJpySel = s;
    }
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

    // Cierre manteniendo masivo activo
    this.cerrarModalMasivo(true);

    const after = this.hashGlobal();
    if (this.isEditSession && before !== after) this.mostrarOkPequenio();
  }

  // ==========================
  // Acciones globales
  // ==========================
  aplicarConfiguracion() {
    if (this.filas.some(f => !f.seleccion || f.seleccion.length === 0)) {
      this.showAlertaSinSeleccion = true;
      return;
    }
    this.showAlertaSinSeleccion = false;

    this.guardarEnStorage();

    try { localStorage.removeItem(K_JUMP_TO_STEP); } catch {}

    if (this.isEditSession && this.returnToStepIndex != null) {
      try {
        localStorage.setItem(
          K_JUMP_TO_STEP,
          JSON.stringify({ stepIndex: this.returnToStepIndex, ts: Date.now() })
        );
      } catch {}
    }

    this.avanzarStep.emit();

    /* ===== Fallback global para avanzar (igual que Step 3) ===== */
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
  }

  // ==========================
  // Persistencia
  // ==========================
  private cargarDesdeStorage(): void {
    const pares = this.leerParesSeleccionados();

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS && Array.isArray(parsed.filas)) {
          const byKey = new Map<string, OpcionKey[]>();
          const byId  = new Map<number, OpcionKey[]>();
          const byNom = new Map<string, OpcionKey[]>();
          for (const f of parsed.filas) {
            if (f?.parKey) byKey.set(String(f.parKey), (f.seleccion ?? []) as OpcionKey[]);
            if (Number.isFinite(f?.parId)) byId.set(Number(f.parId), (f.seleccion ?? []) as OpcionKey[]);
            if (typeof f?.parNombre === 'string') byNom.set(f.parNombre, (f.seleccion ?? []) as OpcionKey[]);
          }

          this.filas = pares.map(p => {
            const id  = (p.id ?? p.parId ?? null) as number | null;
            const key = this.keyFor(p);
            const nombre = this.nombrePar(p);
            const esJPY = this.esJPY(p);

            const sel = byKey.get(key)
              ?? (id !== null ? byId.get(id) : undefined)
              ?? byNom.get(nombre)
              ?? [];

            return {
              parId: id,
              parKey: key,
              parNombre: nombre,
              esJPY,
              seleccion: sel,
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

  // ==========================
  // Utilidades
  // ==========================
  private leerParesSeleccionados(): ParDivisaStored[] {
    const raw = localStorage.getItem(PARES_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as any;
      const lista: ParDivisaStored[] = Array.isArray(arr) ? arr : (arr?.pares ?? []);
      return lista.filter(x => x.seleccionado !== false);
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

  private huboCambios(): boolean {
    for (const f of this.filas) {
      const prev = this.prevHash.get(f.parKey) ?? '';
      if (this.hashFila(f) !== prev) return true;
    }
    return false;
  }

  // ==========================
  // Modal OK
  // ==========================
  private mostrarOkPequenio(): void { this.mostrarModalOk = true; }
  cerrarModalOk(): void { this.mostrarModalOk = false; }

  // ==========================
  // Regla: desactivar masivo por interacción individual
  // ==========================
  private desactivarMasivoPorInteraccion(): void {
    this.masivo.activo = false;
  }
}

export { FechaLiquidacionComponent as Step4FechaLiquidaciON } from './step4-fecha-liquidacion';
export { FechaLiquidacionComponent as Step4FechaLiquidacion };
