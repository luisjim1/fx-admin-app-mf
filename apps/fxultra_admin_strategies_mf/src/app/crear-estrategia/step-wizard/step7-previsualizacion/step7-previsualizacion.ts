// =========================
// previsualizacion.component.ts — COMPLETO
// =========================
import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface Horario { inicio: string; fin: string; }
interface SpreadFila { inicio: string; fin: string; vende: string; compra: string; edit: boolean; }
interface ParGrupo { nombre: string; seleccionado: boolean; filas: SpreadFila[]; }

type Sentido = 'ambos' | 'compra' | 'venta';
type TipoAlerta = 'none' | 'decimales' | 'decimales_min' | 'caracteres' | 'entero';

const K_PARES    = 'wizard_pares_divisas';
const K_HORARIOS = 'wizard_horarios';
const K_SPREADS  = 'wizard_spreads';
const K_PROGRESS = 'wizard_progress';
const K_SENTIDO  = 'wizard_sentido_operacion';
const K_FECHA    = 'wizard_fecha_liquidacion';
const K_DG       = 'wizard_datos_generales';

// opcional para stepper: marca explícitamente que el paso de spreads quedó correcto
const K_SPREADS_STATUS = 'wizard_spreads_status';

const EXCLUIDO_POR_REGLA = 'JPY/MXN';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STEP_PREVIEW_INDEX = 6; // 0-based => Paso 7

@Component({
  selector: 'app-previsualizacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './step7-previsualizacion.html',
  styleUrls: ['./step7-previsualizacion.scss']
})
export class PrevisualizacionComponent implements OnInit, OnDestroy {
  @Output() volver = new EventEmitter<void>();
  @Output() finalizar = new EventEmitter<void>();

  constructor(private router: Router) {}

  // ===== Encabezado =====
  public tituloEstrategia: string = '';
  public descripcionEstrategia: string = '';

  // ===== Estado principal =====
  mismosSpreadsTodos = false;
  grupos: ParGrupo[] = [];
  excluido = EXCLUIDO_POR_REGLA;

  // ===== Montos por par =====
  private montosPorPar: Record<string, { monto: number; base: string }> = {};

  // ===== Modal Mismos Spreads =====
  mostrarModalMismosSpreads = false;
  exitoMismosSpreads = false;
  incluirJPY = false;
  tieneJPY = false;
  modalTodos = { vende: '0.0000', compra: '0.0000' };
  modalJPY   = { vende: '0.000000', compra: '0.000000' };

  // ===== Modales de confirmación =====
  mostrarModalExito = false;
  mostrarModalOkEdicion = false;

  // >>> NUEVO: Modal de confirmación previa <<<
  mostrarModalConfirmar = false;

  // ===== Alertas =====
  alerta: { tipo: TipoAlerta; max: number } = { tipo: 'none', max: 4 };
  showAlertaCeros = false;
  private validarCerosAlAplicar = false;

  // ===== Extras =====
  sentidosPorPar: Record<string, Sentido> = {};
  liquidacionPorPar: Record<string, string> = {};
  private fieldErrors: Record<string, boolean> = {};
  private persistTimer: any = null;
  private beforeUnloadHandler = () => { try { this.persistir(); this.markLastStep(true); } catch {} };

  // ===== Snapshot y campo activo =====
  private editSnapshot: Record<string, { vende: string; compra: string }> = {};
  private activeKey: string | null = null;

  // ===== Estado de error por fila (decimales mínimos) =====
  private rowDecMinError: Record<string, boolean> = {};

  // ===== Helpers de decimales =====
  private decimalsForPair(pair: string): number { return pair === EXCLUIDO_POR_REGLA ? 6 : 4; }
  private defaultPrec(pair: string): string { return (0).toFixed(this.decimalsForPair(pair)); }
  private countDecimals(str: string): number { const s = (str ?? '').toString(); const i = s.indexOf('.'); return i === -1 ? 0 : (s.length - i - 1); }
  private hasMinDecimals(str: string, min: number): boolean { return this.countDecimals(str) >= min; }
  private trimMaxDecimals(str: string, max: number): string {
    const s = (str ?? '').toString().replace(/[^\d.]/g, '');
    if (!s.includes('.')) return s.replace(/\./g, '');
    const [ent, dec = ''] = s.split('.');
    return `${ent}.${dec.slice(0, max)}`.replace(/\.$/, '.');
  }
  private sanitizeSingleDot(val: string): string {
    let v = (val || '').replace(/[^\d.]/g, '');
    const firstDot = v.indexOf('.');
    if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
    return v;
  }
  private isJPY(pair: string): boolean { return (pair || '').toUpperCase() === EXCLUIDO_POR_REGLA; }
  private limitEnterosJPY(value: string): string {
    let val = this.sanitizeSingleDot(value);
    const [entRaw = '', decRaw = ''] = val.split('.');
    const ent = entRaw.slice(0, 2);
    const dec = decRaw;
    return typeof dec === 'string' ? `${ent}.${dec}`.replace(/\.$/, '.') : ent;
  }

  // ===== Reglas de enteros =====
  private forceZeroForNonJPY(val: string): string {
    const s = this.sanitizeSingleDot(val);
    if (!s) return s;
    if (!s.includes('.')) return '0';
    const [, dec = ''] = s.split('.');
    return dec.length ? `0.${dec}` : '0.';
  }
  private violatesEnteroRule(pair: string, val: string): boolean {
    if (this.isJPY(pair)) return false;
    const s = this.sanitizeSingleDot(val);
    if (!s) return false;
    const n = Number(s);
    return Number.isFinite(n) && n >= 1;
  }

  private sanitizeStoredForLoad(pair: string, raw: any): string {
    const prec = this.decimalsForPair(pair);
    let v = (raw ?? '').toString();
    if (!v) return this.defaultPrec(pair);
    v = this.sanitizeSingleDot(v);
    if (this.isJPY(pair)) v = this.limitEnterosJPY(v);
    else v = this.forceZeroForNonJPY(v);
    v = this.trimMaxDecimals(v, prec);
    if (!this.hasMinDecimals(v, prec)) return this.defaultPrec(pair);
    return v;
  }

  // ===== Ciclo de vida =====
  ngOnInit(): void {
    const meta = this.cargarTituloDescripcionStrict();
    if (!meta) { this.redirigirAlPasoIncompleto(0); return; }
    this.tituloEstrategia = meta.titulo;
    this.descripcionEstrategia = meta.descripcion;

    const pares = this.cargarParesSeleccionados();
    const horarios = this.cargarHorarios();
    this.sentidosPorPar = this.cargarSentidos();
    this.liquidacionPorPar = this.cargarLiquidacion(pares);

    const okMontos = this.cargarMontos(pares);
    if (!okMontos) { this.redirigirAlPasoIncompleto(5); return; }

    this.grupos = pares.map(nombre => ({
      nombre,
      seleccionado: false,
      filas: horarios.map(h => ({
        inicio: h.inicio,
        fin: h.fin,
        vende: this.defaultPrec(nombre),
        compra: this.defaultPrec(nombre),
        edit: false
      }))
    }));

    this.aplicarBloqueoEnValores();
    this.tieneJPY = this.grupos.some(g => g.nombre === EXCLUIDO_POR_REGLA);

    this.cargarSpreadsPrevios();
    this.marcarSpreadsCompletos();

    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    this.markLastStep(true);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    if (this.persistTimer) clearTimeout(this.persistTimer);
  }

  // ===== Cargas iniciales =====
  private cargarTituloDescripcionStrict(): { titulo: string; descripcion: string } | null {
    try {
      const raw = localStorage.getItem(K_DG);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const age = Date.now() - (parsed.timestamp ?? 0);
      if (age >= MAX_AGE_MS) return null;
      const titulo = (parsed?.nombreEstrategia ?? '').toString().trim();
      const descripcion = (parsed?.descripcion ?? '').toString().trim();
      if (!titulo || !descripcion) return null;
      return { titulo, descripcion };
    } catch { return null; }
  }

  private cargarParesSeleccionados(): string[] {
    const paresRaw = localStorage.getItem(K_PARES);
    let paresSeleccionados: string[] = [];
    if (paresRaw) {
      try {
        const parsed = JSON.parse(paresRaw);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS) {
          if (Array.isArray(parsed.pares)) {
            paresSeleccionados = parsed.pares
              .filter((p: any) => p?.seleccionado)
              .map((p: any) => (p?.nombre || '').toUpperCase())
              .filter(Boolean);
          } else if (Array.isArray(parsed.divisas)) {
            if (typeof parsed.divisas[0] === 'string') {
              paresSeleccionados = (parsed.divisas as string[]).map(s => s.toUpperCase());
            } else if (parsed.divisas[0]?.nombre) {
              paresSeleccionados = parsed.divisas.map((d: any) => (d.nombre || '').toUpperCase());
            }
          }
        } else {
          localStorage.removeItem(K_PARES);
        }
      } catch {}
    }
    if (!paresSeleccionados.length) {
      paresSeleccionados = ['USD/MXN', 'EUR/MXN', 'CAD/MXN', 'CHF/MXN', 'GBP/MXN', EXCLUIDO_POR_REGLA];
    }
    return paresSeleccionados;
  }

  private cargarHorarios(): Horario[] {
    const horariosRaw = localStorage.getItem(K_HORARIOS);
    let horarios: Horario[] = [];
    if (horariosRaw) {
      try {
        const parsed = JSON.parse(horariosRaw);
        if (Array.isArray(parsed.horarios) && parsed.horarios.length) {
          horarios = parsed.horarios.map((h: any) => ({ inicio: h.inicio, fin: h.fin }));
        }
      } catch {}
    }
    if (!horarios.length) {
      horarios = [{ inicio: '00:00', fin: '16:30' }, { inicio: '16:30', fin: '24:00' }];
    }
    return horarios;
  }

  private cargarSentidos(): Record<string, Sentido> {
    const mapa: Record<string, Sentido> = {};
    const raw = localStorage.getItem(K_SENTIDO);
    if (!raw) return mapa;
    try {
      const parsed = JSON.parse(raw);
      const age = Date.now() - (parsed.timestamp ?? 0);
      if (age >= MAX_AGE_MS) return mapa;
      const filas = Array.isArray(parsed.filas) ? parsed.filas : [];
      for (const f of filas) {
        const key = (f?.parKey || f?.parNombre || '').toString().toUpperCase();
        const sentido = (f?.sentido || '') as Sentido | '';
        if (key && (sentido === 'ambos' || sentido === 'compra' || sentido === 'venta')) {
          mapa[key] = sentido;
        }
      }
    } catch {}
    return mapa;
  }

  private cargarLiquidacion(pares: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    const label = (k: string): string => {
      switch (k) {
        case 'today':  return 'Today';
        case 'tom':    return 'TOM';
        case 'spot48': return 'SPOT (48h)';
        case 'spot28': return 'SPOT (28h)';
        case '1d72':   return '1D (72h)';
        default:       return '';
      }
    };
    const opcionesGenerales = ['today', 'tom', 'spot48', '1d72'];
    const opcionesJPY       = ['spot28', '1d72'];

    try {
      const raw = localStorage.getItem(K_FECHA);
      if (raw) {
        const parsed = JSON.parse(raw);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS && Array.isArray(parsed.filas)) {
          const idx = new Map<string, string[]>();
          for (const f of parsed.filas) {
            const k = (f?.parKey || f?.parNombre || '').toString().toUpperCase();
            if (!k) continue;
            const arr = Array.isArray(f?.seleccion) ? (f.seleccion as string[]) : [];
            idx.set(k, arr);
          }
          for (const p of pares) {
            const key = (p || '').toUpperCase();
            const esJPY = key.includes('JPY');
            const permitidas = esJPY ? opcionesJPY : opcionesGenerales;

            const seleccion = idx.get(key) ?? [];
            const selSet = new Set(seleccion);

            const todas = permitidas.every(k => selSet.has(k));
            if (todas) {
              map[key] = 'Todas las fechas';
            } else if (seleccion.length) {
              const visibles = seleccion.map(label).filter(Boolean);
              map[key] = visibles.length ? visibles.join(', ') : 'Todas las fechas';
            } else {
              map[key] = 'Todas las fechas';
            }
          }
          return map;
        }
      }
    } catch {}

    for (const p of pares) map[(p || '').toUpperCase()] = 'Todas las fechas';
    return map;
  }

  // ===== Montos por par =====
  private cargarMontos(pares: string[]): boolean {
    const out: Record<string, { monto: number; base: string }> = {};

    try {
      const rawM = localStorage.getItem('wizard_montos_por_par');
      if (rawM) {
        const parsed = JSON.parse(rawM);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS) {
          if (Array.isArray(parsed.montos)) {
            for (const m of parsed.montos) {
              const key = (m?.parKey || m?.parNombre || m?.par || '').toString().toUpperCase();
              const montoNum = Number(m?.monto ?? m?.valor ?? m?.amount);
              const base = (m?.base || m?.monedaBase || (key.split('/')[0] || '')).toString().toUpperCase();
              if (key && Number.isFinite(montoNum)) out[key] = { monto: montoNum, base: base || (key.split('/')[0] || '') };
            }
          } else if (parsed.byPair && typeof parsed.byPair === 'object') {
            for (const k of Object.keys(parsed.byPair)) {
              const key = k.toUpperCase();
              const nodo = parsed.byPair[k] || {};
              const montoNum = Number(nodo.monto ?? nodo.valor ?? nodo.amount);
              const base = (nodo.base || nodo.monedaBase || (key.split('/')[0] || '')).toString().toUpperCase();
              if (key && Number.isFinite(montoNum)) out[key] = { monto: montoNum, base: base || (key.split('/')[0] || '') };
            }
          }
        }
      }
    } catch {}

    if (!Object.keys(out).length) {
      try {
        const rawP = localStorage.getItem(K_PARES);
        if (!rawP) return false;
        const parsed = JSON.parse(rawP);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age >= MAX_AGE_MS) return false;

        const fuente: any[] =
          Array.isArray(parsed.pares) ? parsed.pares :
          Array.isArray(parsed.divisas) ? parsed.divisas : [];

        for (const it of fuente) {
          if (!it?.seleccionado) continue;
          const key = (it?.nombre || it?.par || '').toString().toUpperCase();
          if (!key) continue;

          const montoNum = Number(
            it?.monto ?? it?.montoMax ?? it?.montoMaximo ?? it?.montoMaxOperacion ?? it?.amount ?? it?.valor
          );
          const base = (it?.base || it?.monedaBase || (key.split('/')[0] || '')).toString().toUpperCase();

          if (Number.isFinite(montoNum)) out[key] = { monto: montoNum, base: base || (key.split('/')[0] || '') };
        }
      } catch {
        return false;
      }
    }

    for (const p of pares) {
      if (!out[p.toUpperCase()]) return false;
    }

    this.montosPorPar = out;
    return true;
  }

  // Helpers para la columna de montos en el template
  formatoMonto(par: string): string {
    const k = (par || '').toUpperCase();
    const info = this.montosPorPar[k];
    if (!info) return '';
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(info.monto);
  }
  baseDe(par: string): string {
    const k = (par || '').toUpperCase();
    return this.montosPorPar[k]?.base || (k.split('/')[0] || '');
  }

  // ===== Habilitación por sentido =====
  puedeEditar(par: string, campo: 'vende' | 'compra'): boolean {
    const sentido = this.sentidosPorPar[(par || '').toUpperCase()] || 'ambos';
    if (sentido === 'ambos') return true;
    if (sentido === 'compra') return campo === 'vende';
    if (sentido === 'venta')  return campo === 'compra';
    return true;
  }
  private isCampoEnabledForSentido(sentido: Sentido, campo: 'vende'|'compra'): boolean {
    if (sentido === 'ambos') return true;
    if (sentido === 'compra') return campo === 'vende';
    if (sentido === 'venta')  return campo === 'compra';
    return true;
  }
  private aplicarBloqueoEnValores(): void {
    for (const g of this.grupos) for (const f of g.filas) {
      if (!this.puedeEditar(g.nombre, 'vende'))  f.vende  = '';
      if (!this.puedeEditar(g.nombre, 'compra')) f.compra = '';
    }
  }

  // ===== Errores / alertas =====
  private keyFor(gi: number, fi: number, campo: 'vende'|'compra'): string { return `${gi}-${fi}-${campo}`; }
  private keyForRow(gi: number, fi: number): string { return `${gi}::${fi}`; }
  private setFieldError(gi: number, fi: number, campo: 'vende'|'compra', val: boolean) { this.fieldErrors[this.keyFor(gi, fi, campo)] = val; }
  hasFieldError(gi: number, fi: number, campo: 'vende'|'compra'): boolean { return !!this.fieldErrors[this.keyFor(gi, fi, campo)]; }
  private setAlerta(tipo: TipoAlerta, max?: number) { this.alerta = { tipo, max: max ?? this.alerta.max }; }
  private clearAlerta() { this.alerta = { tipo: 'none', max: 4 }; }
  private recomputeZeroAlert() { this.showAlertaCeros = this.validarCerosAlAplicar && this.existeCero(); }

  // ===== Helpers selección =====
  private setAllSelections(value: boolean): void {
    if (!this.grupos) return;
    for (const g of this.grupos) {
      if (!g) continue;
      if (g.nombre === this.excluido) continue;
      g.seleccionado = value;
    }
  }
  private clearAllSelections(): void {
    // (solo limpia selección visual; NO toca el checkbox global)
    this.setAllSelections(false);
  }

  // ===== Regla: desactivar masivo por interacción individual =====
  private desactivarMasivoPorInteraccion(): void {
    this.mismosSpreadsTodos = false;
  }
  onSelectRowChange(): void {
    this.desactivarMasivoPorInteraccion();
  }
  onSelectRowModelChange(_val: any): void {
    this.desactivarMasivoPorInteraccion();
  }

  // ===== Edición/inputs =====
  habilitarEdicion(gIndex: number, fIndex: number) {
    const g = this.grupos[gIndex];
    if (!this.puedeEditar(g.nombre, 'vende') && !this.puedeEditar(g.nombre, 'compra')) return;

    if (g.nombre === EXCLUIDO_POR_REGLA) for (const gg of this.grupos) if (gg.nombre !== EXCLUIDO_POR_REGLA) gg.seleccionado = false;

    for (let gi = 0; gi < this.grupos.length; gi++) {
      for (let fi = 0; fi < this.grupos[gi].filas.length; fi++) {
        const fila = this.grupos[gi].filas[fi];
        if (fila.edit && !(gi === gIndex && fi === fIndex)) this.deshabilitarEdicion(gi, fi, false);
      }
    }

    const f = this.grupos[gIndex].filas[fIndex];
    this.editSnapshot[this.keyForRow(gIndex, fIndex)] = { vende: f.vende ?? '', compra: f.compra ?? '' };

    this.grupos[gIndex].filas[fIndex].edit = true;
    // ← cualquier edición manual desactiva el masivo
    this.desactivarMasivoPorInteraccion();

    this.markLastStep();
  }

  startEditing(gi: number, fi: number, campo: 'vende'|'compra') {
    const newKey = this.keyFor(gi, fi, campo);
    if (this.alerta.tipo === 'decimales_min' && this.activeKey !== newKey) {
      this.clearAlerta();
    }
    this.activeKey = newKey;
    this.validarCerosAlAplicar = false;
    this.showAlertaCeros = false;

    // ← escribir/editar un campo desactiva el masivo
    this.desactivarMasivoPorInteraccion();
  }

  onEnterGuardar(gi: number, fi: number, ev: Event) {
    ev.preventDefault?.();
    this.guardarFila(gi, fi);
  }

  guardarFila(gIndex: number, fIndex: number) {
    const g = this.grupos[gIndex];
    const f = this.grupos[gIndex].filas[fIndex];
    const prec = this.decimalsForPair(g.nombre);
    let ok = true;

    const validarCampo = (campo: 'vende'|'compra') => {
      if (!this.puedeEditar(g.nombre, campo)) return;
      const val = (f as any)[campo] ?? '';
      const invalidoBasico = val === '' || val === '.';
      const tieneMin = this.hasMinDecimals(val, prec);

      if (this.violatesEnteroRule(g.nombre, val)) {
        this.setFieldError(gIndex, fIndex, campo, true);
        this.setAlerta('entero');
        ok = false;
        return;
      }

      if (invalidoBasico || !tieneMin) {
        this.setFieldError(gIndex, fIndex, campo, true);
        this.setAlerta('decimales_min', prec);
        (f as any)[campo] = this.defaultPrec(g.nombre);
        ok = false;
      } else {
        this.setFieldError(gIndex, fIndex, campo, false);
      }
    };

    validarCampo('vende');
    validarCampo('compra');
    this.recomputeZeroAlert();

    const rowKey = this.keyForRow(gIndex, fIndex);
    if (!ok || this.rowDecMinError[rowKey]) return;

    const snap = this.editSnapshot[rowKey] || { vende: '', compra: '' };
    const considerVende = this.puedeEditar(g.nombre, 'vende');
    const considerCompra = this.puedeEditar(g.nombre, 'compra');

    const changedVende = considerVende ? (f.vende ?? '') !== (snap.vende ?? '') : false;
    const changedCompra = considerCompra ? (f.compra ?? '') !== (snap.compra ?? '') : false;
    const huboCambio = changedVende || changedCompra;

    this.deshabilitarEdicion(gIndex, fIndex, huboCambio);

    if (huboCambio) this.clearAllSelections();
  }

  private deshabilitarEdicion(gIndex: number, fIndex: number, showSuccessModal: boolean) {
    const fila = this.grupos[gIndex].filas[fIndex];
    const par = this.grupos[gIndex].nombre;

    if (!this.puedeEditar(par, 'vende'))  fila.vende  = '';
    if (!this.puedeEditar(par, 'compra')) fila.compra = '';

    fila.edit = false;
    this.clearAlerta();
    this.persistir();
    this.markLastStep();

    delete this.editSnapshot[this.keyForRow(gIndex, fIndex)];
    if (showSuccessModal) this.mostrarModalOkEdicion = true;
  }

  permitirTeclasNumericas(event: KeyboardEvent) {
    const e = event as KeyboardEvent;
    const target = e.target as HTMLInputElement;

    const allowedControl =
      e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
      e.key === 'Home' || e.key === 'End' || e.key === 'Tab' || e.key === 'Enter' ||
      (e.ctrlKey && (e.key === 'a' || e.key === 'c' || e.key === 'v' || e.key === 'x'));

    const isDigit = /^[0-9]$/.test(e.key);
    const isDot = e.key === '.';

    if (allowedControl || isDigit) return;
    if (isDot) { if (target.value.includes('.')) { e.preventDefault(); return; } return; }
    this.setAlerta('caracteres');
    e.preventDefault();
  }

  onInputSpread(gIndex: number, fIndex: number, campo: 'vende' | 'compra', event: Event) {
    const input = event.target as HTMLInputElement;
    const par = this.grupos[gIndex].nombre;
    if (!this.puedeEditar(par, campo)) return;

    const prec = this.decimalsForPair(par);
    const esJPY = this.isJPY(par);
    let raw = input.value ?? '';

    if (/[^0-9.\s]/.test(raw) || raw.includes('-')) this.setAlerta('caracteres');
    else if (this.alerta.tipo === 'caracteres') this.clearAlerta();

    const attempt = this.sanitizeSingleDot(raw);
    const attemptDecs = this.countDecimals(attempt);

    let val = attempt;
    val = esJPY ? this.limitEnterosJPY(val) : val;
    val = this.trimMaxDecimals(val, prec);

    if (!esJPY) {
      const forced = this.forceZeroForNonJPY(val);
      if (forced !== val) {
        this.setAlerta('entero');
        this.setFieldError(gIndex, fIndex, campo, true);
        val = forced;
      } else if (this.alerta.tipo === 'entero' && !this.violatesEnteroRule(par, val)) {
        this.setFieldError(gIndex, fIndex, campo, false);
        if (!['decimales', 'caracteres'].includes(this.alerta.tipo)) this.clearAlerta();
      }
    }

    if (attemptDecs > prec && this.alerta.tipo !== 'caracteres') {
      this.setAlerta('decimales', prec);
    } else if (this.alerta.tipo === 'decimales' && attemptDecs <= prec) {
      this.clearAlerta();
    }

    this.grupos[gIndex].filas[fIndex][campo] = val;

    const rowKey = this.keyForRow(gIndex, fIndex);
    if (this.countDecimals(val) >= prec) this.rowDecMinError[rowKey] = false;

    for (const g of this.grupos) {
      if (!g.seleccionado) continue;
      if (this.isJPY(par) && !this.isJPY(g.nombre)) continue;
      if (!this.puedeEditar(g.nombre, campo)) continue;
      const p = this.decimalsForPair(g.nombre);
      let sane = this.trimMaxDecimals(val, p);
      if (!this.isJPY(g.nombre)) sane = this.forceZeroForNonJPY(sane);
      g.filas[fIndex][campo] = sane;
    }

    input.value = val;
    this.recomputeZeroAlert();

    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => { this.persistir(); this.markLastStep(); }, 300);
  }

  normalizarBlur(gIndex: number, fIndex: number, campo: 'vende' | 'compra', event: Event) {
    const input = event.target as HTMLInputElement;
    const par = this.grupos[gIndex].nombre;
    if (!this.puedeEditar(par, campo)) return;

    const prec = this.decimalsForPair(par);
    const esJPY = this.isJPY(par);
    let val = input.value || '';

    if (esJPY) {
      if (!val || val === '.') val = '0';
      val = this.limitEnterosJPY(val);
      val = this.trimMaxDecimals(val, prec);
    } else {
      val = this.sanitizeSingleDot(val);
      val = this.trimMaxDecimals(val, prec);
      val = this.forceZeroForNonJPY(val);
    }

    const rowKey = this.keyForRow(gIndex, fIndex);

    if (!this.hasMinDecimals(val, prec)) {
      this.setFieldError(gIndex, fIndex, campo, true);
      this.setAlerta('decimales_min', prec);
      this.rowDecMinError[rowKey] = true;
      val = this.defaultPrec(par);
    } else if (!esJPY && this.violatesEnteroRule(par, val)) {
      this.setFieldError(gIndex, fIndex, campo, true);
      this.setAlerta('entero');
    } else {
      this.setFieldError(gIndex, fIndex, campo, false);
      this.rowDecMinError[rowKey] = false;
      if (
        this.alerta.tipo === 'decimales' ||
        this.alerta.tipo === 'entero' ||
        (this.alerta.tipo === 'decimales_min' && this.keyFor(gIndex, fIndex, campo) === this.activeKey)
      ) {
        this.clearAlerta();
      }
    }

    this.grupos[gIndex].filas[fIndex][campo] = val;
    input.value = val;

    this.persistir();
    this.markLastStep();
    this.activeKey = null;
  }

  // ===== Modal Mismos Spreads =====
  abrirModalMismosSpreads(event: Event) {
    this.mismosSpreadsTodos = true;
    this.mostrarModalMismosSpreads = true;
    this.exitoMismosSpreads = false;
    this.incluirJPY = false;
    this.modalTodos = { vende: '0.0000', compra: '0.0000' };
    this.modalJPY   = { vende: '0.000000', compra: '0.000000' };
    this.setAllSelections(true);
    (event.target as HTMLInputElement).blur();
  }
  cerrarModal(aplico: boolean) {
    // mantiene el checkbox marcado si el usuario aplicó, lo desmarca si canceló
    this.mismosSpreadsTodos = !!aplico;
    this.mostrarModalMismosSpreads = false;
    this.exitoMismosSpreads = false;
    this.clearAllSelections();
  }
  onInputModal(scope: 'todos'|'jpy', campo: 'vende'|'compra', event: Event) {
    const input = event.target as HTMLInputElement;
    let val = input.value || '';
    const prec = scope === 'jpy' ? 6 : 4;

    if (/[^0-9.\s]/.test(val) || val.includes('-')) this.setAlerta('caracteres');
    else if (this.alerta.tipo === 'caracteres') this.clearAlerta();

    const attempt = this.sanitizeSingleDot(val);
    const attemptDecs = this.countDecimals(attempt);

    val = attempt;
    if (scope === 'jpy') val = this.limitEnterosJPY(val);
    val = this.trimMaxDecimals(val, prec);
    if (scope === 'todos') {
      const forced = this.forceZeroForNonJPY(val);
      if (forced !== val) this.setAlerta('entero');
      val = forced;
    }

    if (attemptDecs > prec && this.alerta.tipo !== 'caracteres') {
      this.setAlerta('decimales', prec);
    } else if (this.alerta.tipo === 'decimales' && attemptDecs <= prec) {
      this.clearAlerta();
    }
    if (this.alerta.tipo === 'decimales_min' && this.hasMinDecimals(val, prec)) this.clearAlerta();

    if (scope === 'todos') (this.modalTodos as any)[campo] = val;
    else (this.modalJPY as any)[campo] = val;

    input.value = val;
  }
  normalizarModal(scope: 'todos'|'jpy', campo: 'vende'|'compra', event: Event) {
    const input = event.target as HTMLInputElement;
    const prec = scope === 'jpy' ? 6 : 4;

    let val = input.value || '';
    val = this.sanitizeSingleDot(val);
    if (scope === 'jpy') val = this.limitEnterosJPY(val);
    val = this.trimMaxDecimals(val, prec);
    if (scope === 'todos') val = this.forceZeroForNonJPY(val);

    if (!this.hasMinDecimals(val, prec)) {
      this.setAlerta('decimales_min', prec);
      val = (0).toFixed(prec);
    } else if (this.alerta.tipo === 'decimales_min' || this.alerta.tipo === 'decimales') {
      this.clearAlerta();
    }

    const target = scope === 'todos' ? this.modalTodos : this.modalJPY;
    (target as any)[campo] = val;

    input.value = val;
  }
  aplicarModal() {
    const validarScope = (scope: 'todos'|'jpy'): boolean => {
      const prec = scope === 'jpy' ? 6 : 4;
      const obj = scope === 'todos' ? this.modalTodos : this.modalJPY;
      const ok = this.hasMinDecimals(obj.vende, prec) && this.hasMinDecimals(obj.compra, prec);
      if (!ok) {
        this.setAlerta('decimales_min', prec);
        if (scope === 'todos') this.modalTodos = { vende: '0.0000', compra: '0.0000' };
        else this.modalJPY = { vende: '0.000000', compra: '0.000000' };
      }
      return ok;
    };

    if (!(validarScope('todos') && (!this.incluirJPY || validarScope('jpy')))) return;

    for (const g of this.grupos) {
      const esJPY = g.nombre === EXCLUIDO_POR_REGLA;

      if (!esJPY) {
        let vSell = this.trimMaxDecimals(this.modalTodos.vende, 4);
        let vBuy  = this.trimMaxDecimals(this.modalTodos.compra, 4);
        vSell = this.forceZeroForNonJPY(vSell);
        vBuy  = this.forceZeroForNonJPY(vBuy);
        g.filas.forEach(f => {
          if (this.puedeEditar(g.nombre, 'vende'))  f.vende  = vSell;
          if (this.puedeEditar(g.nombre, 'compra')) f.compra = vBuy;
        });
      } else if (esJPY && this.incluirJPY) {
        const vSell = this.trimMaxDecimals(this.modalJPY.vende, 6);
        const vBuy  = this.trimMaxDecimals(this.modalJPY.compra, 6);
        g.filas.forEach(f => {
          if (this.puedeEditar(g.nombre, 'vende'))  f.vende  = vSell;
          if (this.puedeEditar(g.nombre, 'compra')) f.compra = vBuy;
        });
      }
    }

    this.exitoMismosSpreads = true;
    this.recomputeZeroAlert();
    this.persistir();
    this.markLastStep();
    this.clearAlerta();
    this.clearAllSelections(); // limpia selección visual pero deja el checkbox marcado
  }

  // ===== Validaciones y persistencia =====
  isZero(valor: string, pair: string): boolean {
    const n = Number((valor ?? '0').toString().replace(/[^\d.]/g, '') || '0');
    const prec = this.decimalsForPair(pair);
    return Number.isFinite(n) && n === Number((0).toFixed(prec));
  }
  private existeCero(): boolean {
    for (const g of this.grupos) for (const f of g.filas) {
      if (this.puedeEditar(g.nombre, 'vende'))  if (Number((f.vende || '0').toString()) === 0) return true;
      if (this.puedeEditar(g.nombre, 'compra')) if (Number((f.compra || '0').toString()) === 0) return true;
    }
    return false;
  }

  private cargarSpreadsPrevios() {
    const raw = localStorage.getItem(K_SPREADS);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const age = Date.now() - (parsed.timestamp ?? 0);
      if (!Array.isArray(parsed.spreads) || age >= MAX_AGE_MS) return;

      const prevSenseMap: Record<string, Sentido> = parsed.senseMap || {};
      parsed.spreads.forEach((s: any) => {
        const g = this.grupos.find(x => x.nombre === s.pairCode);
        if (!g || !Array.isArray(s.windows)) return;

        const currSent: Sentido = this.sentidosPorPar[(g.nombre || '').toUpperCase()] || 'ambos';
        const prevSent: Sentido | undefined = prevSenseMap[(g.nombre || '').toUpperCase()];

        s.windows.forEach((w: any, idx: number) => {
          if (!g.filas[idx]) return;
          const forceNewlyEnabled = prevSent === undefined;

          if (!this.puedeEditar(g.nombre, 'vende')) {
            g.filas[idx].vende = '';
          } else {
            const wasDisabled = forceNewlyEnabled || !this.isCampoEnabledForSentido(prevSent ?? 'ambos', 'vende');
            if (wasDisabled && this.isCampoEnabledForSentido(currSent, 'vende')) {
              g.filas[idx].vende = this.defaultPrec(g.nombre);
            } else {
              const v = (w?.sell ?? '').toString();
              g.filas[idx].vende = this.sanitizeStoredForLoad(g.nombre, v);
            }
          }

          if (!this.puedeEditar(g.nombre, 'compra')) {
            g.filas[idx].compra = '';
          } else {
            const wasDisabled = forceNewlyEnabled || !this.isCampoEnabledForSentido(prevSent ?? 'ambos', 'compra');
            if (wasDisabled && this.isCampoEnabledForSentido(currSent, 'compra')) {
              g.filas[idx].compra = this.defaultPrec(g.nombre);
            } else {
              const v = (w?.buy ?? '').toString();
              g.filas[idx].compra = this.sanitizeStoredForLoad(g.nombre, v);
            }
          }
        });
      });
    } catch {}
  }

  private persistir() {
    const senseMap: Record<string, Sentido> = {};
    for (const k in this.sentidosPorPar) senseMap[k.toUpperCase()] = this.sentidosPorPar[k];

    const payload = {
      spreads: this.grupos.map(g => ({
        pairCode: g.nombre,
        windows: g.filas.map(f => {
          const sell = this.puedeEditar(g.nombre, 'vende')  ? (f.vende ?? '') : null;
          const buy  = this.puedeEditar(g.nombre, 'compra') ? (f.compra ?? '') : null;
          return { start: f.inicio, end: f.fin, sell, buy };
        })
      })),
      senseMap,
      timestamp: Date.now()
    };
    localStorage.setItem(K_SPREADS, JSON.stringify(payload));
  }

  private markLastStep(_force = false) {
    try {
      const now = Date.now();
      const payload = { stepIndex: STEP_PREVIEW_INDEX, updatedAt: now };
      localStorage.setItem(K_PROGRESS, JSON.stringify(payload));
    } catch {}
  }

  private marcarSpreadsCompletos() {
    try {
      const ok = Object.keys(this.montosPorPar).length > 0;
      if (!ok) return;
      const now = Date.now();
      localStorage.setItem(K_SPREADS_STATUS, JSON.stringify({ completed: true, timestamp: now }));
    } catch {}
  }

  private redirigirAlPasoIncompleto(_step: number) {
    this.volver.emit();
  }

  // ===== Confirmación =====
  private validarMinimosGlobal(): boolean {
    let ok = true;
    for (let gi = 0; gi < this.grupos.length; gi++) {
      const g = this.grupos[gi];
      const prec = this.decimalsForPair(g.nombre);
      for (let fi = 0; fi < g.filas.length; fi++) {
        const f = g.filas[fi];
        const checkCampo = (campo: 'vende'|'compra') => {
          if (!this.puedeEditar(g.nombre, campo)) return;
          const v = (f as any)[campo] ?? '';

          if (this.violatesEnteroRule(g.nombre, v)) {
            this.setFieldError(gi, fi, campo, true);
            this.setAlerta('entero');
            ok = false;
            return;
          }

          if (!this.hasMinDecimals(v, prec)) {
            this.setFieldError(gi, fi, campo, true);
            (f as any)[campo] = this.defaultPrec(g.nombre);
            ok = false;
          } else {
            this.setFieldError(gi, fi, campo, false);
          }
        };
        checkCampo('vende'); checkCampo('compra');
      }
    }
    if (!ok && this.alerta.tipo === 'none') this.setAlerta('decimales_min', 4);
    return ok;
  }

  private clearWizardStorage() {
    const KEYS = [K_PARES, K_HORARIOS, K_SPREADS, K_PROGRESS, K_SENTIDO, K_FECHA, K_DG, K_SPREADS_STATUS];
    KEYS.forEach(k => localStorage.removeItem(k));
  }

  confirmar() {
    // Validaciones ya existentes
    this.validarCerosAlAplicar = true;
    const okMinimos = this.validarMinimosGlobal();
    this.recomputeZeroAlert();

    const hayErroresFormato = Object.values(this.fieldErrors).some(Boolean) || this.alerta.tipo !== 'none';
    if (!okMinimos || hayErroresFormato || this.showAlertaCeros) return;

    // >>> NUEVO: abre modal de confirmación previa (no aplica todavía) <<<
    this.mostrarModalConfirmar = true;
  }

  // >>> NUEVO: acciones del modal de confirmación previa <<<
  confirmarAplicacion() {
    this.mostrarModalConfirmar = false;
    this.clearWizardStorage();
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    this.abrirModalExito();
  }
  cancelarConfirmacion() {
    this.mostrarModalConfirmar = false;
  }

  abrirModalExito() { this.mostrarModalExito = true; }
  cerrarModalExito() { this.mostrarModalExito = false; this.router.navigate(['/home']); }
  cerrarModalOkEdicion() { this.mostrarModalOkEdicion = false; }
  textoSentido(par: string): string {
    const s = this.sentidosPorPar[(par || '').toUpperCase()] || 'ambos';
    if (s === 'compra') return 'Compra';
    if (s === 'venta')  return 'Venta';
    return 'Compra/Venta';
  }
}

export { PrevisualizacionComponent as Step7Previsualizacion } from './step7-previsualizacion';
export { PrevisualizacionComponent as Step7Preview };
