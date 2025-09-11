// spreads.component.ts
import { Component, EventEmitter, OnInit, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Horario { inicio: string; fin: string; }
interface SpreadFila { inicio: string; fin: string; vende: string; compra: string; edit: boolean; }
interface ParGrupo { nombre: string; seleccionado: boolean; filas: SpreadFila[]; }

type Sentido = 'ambos' | 'compra' | 'venta';
type TipoAlerta = 'none' | 'decimales' | 'decimales_min' | 'caracteres' | 'entero';

const K_PARES = 'wizard_pares_divisas';
const K_HORARIOS = 'wizard_horarios';
const K_SPREADS = 'wizard_spreads';
const K_PROGRESS = 'wizard_progress';
const K_SENTIDO = 'wizard_sentido_operacion';

// para detectar edición y decidir si mostrar OK
const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';
const STEP_SPREADS_INDEX = 5;
const EXCLUIDO_POR_REGLA = 'JPY/MXN';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-spreads',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './step6-spreads.html',
  styleUrls: ['./step6-spreads.scss']
})
export class SpreadsComponent implements OnInit, OnDestroy {
  /* ===== Eventos ===== */
  @Output() avanzarStep = new EventEmitter<void>();

  /* ===== Estado UI ===== */
  usarPorcentaje = false;
  mismosSpreadsTodos = false;
  grupos: ParGrupo[] = [];
  excluido = EXCLUIDO_POR_REGLA;

  mostrarModalMismosSpreads = false;
  incluirJPY = false;
  tieneJPY = false;
  modalTodos = { vende: '0.0000', compra: '0.0000' };
  modalJPY   = { vende: '0.000000', compra: '0.000000' };

  mostrarModalReset = false;

  /* ===== OK pequeño / sesión edición ===== */
  mostrarModalOk = false;
  private isEditSession = false;
  private prevSnapshot = '';

  /* ===== Alertas / validaciones ===== */
  alerta: { tipo: TipoAlerta; max: number } = { tipo: 'none', max: 4 };
  showAlertaCeros = false;
  private validarCerosAlAplicar = false;

  /* ===== Internos ===== */
  private fieldErrors: Record<string, boolean> = {};
  private persistTimer: any = null;
  private beforeUnloadHandler = () => { try { this.persistir(); this.markLastStep(true); } catch {} };
  private sentidosPorPar: Record<string, Sentido> = {};
  private activeKey: string | null = null;

  /* ===== Helpers ===== */
  private decimalsForPair(pair: string): number { return pair === EXCLUIDO_POR_REGLA ? 6 : 4; }
  private defaultPrec(pair: string): string { return (0).toFixed(this.decimalsForPair(pair)); }
  private isJPY(pair: string): boolean { return (pair || '').toUpperCase() === EXCLUIDO_POR_REGLA; }

  private sanitizeSingleDot(val: string): string {
    let v = (val || '').replace(/[^\d.]/g, '');
    const firstDot = v.indexOf('.');
    if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
    return v;
  }
  private trimMaxDecimals(str: string, max: number): string {
    const s = (str ?? '').toString().replace(/[^\d.]/g, '');
    if (!s.includes('.')) return s.replace(/\./g, '');
    const [ent, dec = ''] = s.split('.');
    return `${ent}.${dec.slice(0, max)}`.replace(/\.$/, '.');
  }
  private countDecimals(str: string): number {
    const s = (str ?? '').toString();
    const i = s.indexOf('.');
    return i === -1 ? 0 : (s.length - i - 1);
  }
  private hasMinDecimals(str: string, min: number): boolean { return this.countDecimals(str) >= min; }

  private limitEnterosJPY(value: string): string {
    let val = this.sanitizeSingleDot(value);
    const [entRaw = '', decRaw = ''] = val.split('.');
    const ent = entRaw.slice(0, 2);
    const dec = decRaw;
    return typeof dec === 'string' ? `${ent}.${dec}`.replace(/\.$/, '.') : ent;
  }

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

  private isCampoEnabledForSentido(sentido: Sentido, campo: 'vende'|'compra'): boolean {
    if (sentido === 'ambos') return true;
    if (sentido === 'compra') return campo === 'vende';
    if (sentido === 'venta')  return campo === 'compra';
    return true;
  }

  /* ===== Ciclo de vida ===== */
  ngOnInit(): void {
    try {
      const raw = localStorage.getItem(K_RETURN_AFTER_EDIT) || localStorage.getItem(K_PROGRESS);
      if (raw) {
        const obj = JSON.parse(raw);
        const idx = typeof obj?.fromStepIndex === 'number' ? obj.fromStepIndex
                  : typeof obj?.fromStep === 'number' ? obj.fromStep
                  : typeof obj?.stepIndex === 'number' ? obj.stepIndex : null;
        this.isEditSession = idx != null && idx > STEP_SPREADS_INDEX;
      }
    } catch {}

    this.markLastStep(true);
    const pares = this.cargarParesSeleccionados();
    const horarios = this.cargarHorarios();
    this.sentidosPorPar = this.cargarSentidos();

    this.grupos = pares.map(nombre => ({
      nombre,
      seleccionado: false,
      filas: horarios.map(h => ({
        inicio: h.inicio, fin: h.fin,
        vende: this.defaultPrec(nombre),
        compra: this.defaultPrec(nombre),
        edit: false
      }))
    }));

    this.aplicarBloqueoEnValores();
    this.tieneJPY = this.grupos.some(g => g.nombre === EXCLUIDO_POR_REGLA);
    this.cargarSpreadsPrevios();
    this.capturarSnapshot();
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    if (this.persistTimer) clearTimeout(this.persistTimer);
  }

  /* ===== Carga de datos ===== */
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
    if (!horarios.length) horarios = [{ inicio: '00:00', fin: '16:30' }, { inicio: '16:30', fin: '24:00' }];
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

  /* ===== Permisos por sentido ===== */
  puedeEditar(par: string, campo: 'vende' | 'compra'): boolean {
    const sentido = this.sentidosPorPar[(par || '').toUpperCase()] || 'ambos';
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

  /* ===== Estado de errores / alertas ===== */
  private keyFor(gi: number, fi: number, campo: 'vende'|'compra'): string { return `${gi}-${fi}-${campo}`; }
  private setFieldError(gi: number, fi: number, campo: 'vende'|'compra', val: boolean) { this.fieldErrors[this.keyFor(gi, fi, campo)] = val; }
  hasFieldError(gi: number, fi: number, campo: 'vende'|'compra'): boolean { return !!this.fieldErrors[this.keyFor(gi, fi, campo)]; }
  private setAlerta(tipo: TipoAlerta, max?: number) { this.alerta = { tipo, max: max ?? this.alerta.max }; }
  private clearAlerta() { this.alerta = { tipo: 'none', max: 4 }; }
  private hasAnyFieldError(): boolean { return Object.values(this.fieldErrors).some(Boolean); }
  private maybeClearAlert() {
    if (this.alerta.tipo === 'decimales_min') return;
    if (!this.hasAnyFieldError() && !this.showAlertaCeros) this.clearAlerta();
  }
  private recomputeZeroAlert() { this.showAlertaCeros = this.validarCerosAlAplicar && this.existeCero(); }

  /* ===== Edición en celdas ===== */
  habilitarEdicion(gIndex: number, fIndex: number) {
    const g = this.grupos[gIndex];
    if (!this.puedeEditar(g.nombre, 'vende') && !this.puedeEditar(g.nombre, 'compra')) return;
    if (g.nombre === EXCLUIDO_POR_REGLA) for (const gg of this.grupos) if (gg.nombre !== EXCLUIDO_POR_REGLA) gg.seleccionado = false;

    for (let gi = 0; gi < this.grupos.length; gi++) {
      for (let fi = 0; fi < this.grupos[gi].filas.length; fi++) {
        const fila = this.grupos[gi].filas[fi];
        if (fila.edit && !(gi === gIndex && fi === fIndex)) this.deshabilitarEdicion(gi, fi);
      }
    }
    this.grupos[gIndex].filas[fIndex].edit = true;

    /* ===== Sección: desactivar masivo por interacción individual ===== */
    this.desactivarMasivoPorInteraccion();

    this.markLastStep();
  }

  startEditing(gi: number, fi: number, campo: 'vende'|'compra') {
    this.activeKey = this.keyFor(gi, fi, campo);
    this.validarCerosAlAplicar = false;
    this.showAlertaCeros = false;
    if (this.alerta.tipo === 'decimales_min') this.clearAlerta();
  }

  onEnterGuardar(gi: number, fi: number, ev: KeyboardEvent) {
    ev.preventDefault();
    this.guardarFila(gi, fi);
  }

  guardarFila(gIndex: number, fIndex: number) {
    const g = this.grupos[gIndex];
    const f = g.filas[fIndex];
    const prec = this.decimalsForPair(g.nombre);
    let ok = true;

    const validarCampo = (campo: 'vende'|'compra') => {
      if (!this.puedeEditar(g.nombre, campo)) return;
      let val = (f as any)[campo] ?? '';
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
    if (!ok) return;
    this.deshabilitarEdicion(gIndex, fIndex);

    if (this.isEditSession) this.mostrarOkPequenio();
  }

  deshabilitarEdicion(gIndex: number, fIndex: number) {
    const fila = this.grupos[gIndex].filas[fIndex];
    const par = this.grupos[gIndex].nombre;
    if (!this.puedeEditar(par, 'vende'))  fila.vende  = '';
    if (!this.puedeEditar(par, 'compra')) fila.compra = '';
    fila.edit = false;
    this.maybeClearAlert();
    this.persistir();
    this.markLastStep();
  }

  /* ===== Inputs ===== */
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

    this.validarCerosAlAplicar = false;
    this.showAlertaCeros = false;

    if (/[^0-9.\s]/.test(raw) || raw.includes('-')) this.setAlerta('caracteres');
    else if (this.alerta.tipo === 'caracteres') this.maybeClearAlert();

    let valPre = this.sanitizeSingleDot(raw);
    valPre = esJPY ? this.limitEnterosJPY(valPre) : valPre;
    const excedeDecimales = this.countDecimals(valPre) > prec;
    if (excedeDecimales) {
      this.setAlerta('decimales', prec);
      this.setFieldError(gIndex, fIndex, campo, true);
    } else {
      this.setFieldError(gIndex, fIndex, campo, false);
      if (this.alerta.tipo === 'decimales') this.maybeClearAlert();
    }

    let val = this.trimMaxDecimals(valPre, prec);

    if (!esJPY) {
      const forced = this.forceZeroForNonJPY(val);
      if (forced !== val) {
        this.setAlerta('entero');
        this.setFieldError(gIndex, fIndex, campo, true);
        val = forced;
      } else if (this.alerta.tipo === 'entero' && !this.violatesEnteroRule(par, val) && !excedeDecimales) {
        this.setFieldError(gIndex, fIndex, campo, false);
        this.maybeClearAlert();
      }
    }

    if (this.hasMinDecimals(val, prec)) {
      if (!this.violatesEnteroRule(par, val)) {
        this.setFieldError(gIndex, fIndex, campo, false);
        if (this.alerta.tipo === 'decimales_min' && this.keyFor(gIndex,fIndex,campo) === this.activeKey) {
          this.clearAlerta();
        }
      }
    }

    this.grupos[gIndex].filas[fIndex][campo] = val;

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

    /* ===== Sección: desactivar masivo por interacción individual ===== */
    this.desactivarMasivoPorInteraccion();

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

    if (!this.hasMinDecimals(val, prec)) {
      this.setFieldError(gIndex, fIndex, campo, true);
      this.setAlerta('decimales_min', prec);
      val = this.defaultPrec(par);
    } else if (!esJPY && this.violatesEnteroRule(par, val)) {
      this.setFieldError(gIndex, fIndex, campo, true);
      this.setAlerta('entero');
    } else {
      this.setFieldError(gIndex, fIndex, campo, false);
      if (this.alerta.tipo === 'decimales' || this.alerta.tipo === 'entero' ||
          (this.alerta.tipo === 'decimales_min' && this.keyFor(gIndex,fIndex,campo) === this.activeKey)) {
        this.maybeClearAlert();
      }
    }

    this.grupos[gIndex].filas[fIndex][campo] = val;
    input.value = val;

    /* ===== Sección: desactivar masivo por interacción individual ===== */
    this.desactivarMasivoPorInteraccion();

    this.persistir();
    this.markLastStep();
    this.activeKey = null;
  }

  /* ===== Modal: mismos spreads ===== */
  abrirModalMismosSpreads(event: Event) {
    // ===== Sección: abrir modal marcando todos los pares (selección visual)
    this.grupos = this.grupos.map(g => ({ ...g, seleccionado: true }));
    this.mismosSpreadsTodos = true;
    this.mostrarModalMismosSpreads = true;
    this.incluirJPY = false;
    this.modalTodos = { vende: '0.0000', compra: '0.0000' };
    this.modalJPY   = { vende: '0.000000', compra: '0.000000' };
    (event.target as HTMLInputElement).blur();
  }
  cerrarModal(aplico: boolean) {
    // ===== Sección: al cerrar, mantener checkbox activo solo si se aplicó; limpiar selección visual
    this.mostrarModalMismosSpreads = false;
    this.mismosSpreadsTodos = !!aplico;
    this.grupos = this.grupos.map(g => ({ ...g, seleccionado: false }));
  }

  onInputModal(scope: 'todos'|'jpy', campo: 'vende'|'compra', event: Event) {
    const input = event.target as HTMLInputElement;
    let val = input.value || '';
    const prec = scope === 'jpy' ? 6 : 4;

    if (/[^0-9.\s]/.test(val) || val.includes('-')) this.setAlerta('caracteres');
    else if (this.alerta.tipo === 'caracteres') this.maybeClearAlert();

    let pre = this.sanitizeSingleDot(val);
    if (scope === 'jpy') pre = this.limitEnterosJPY(pre);
    let sane = this.trimMaxDecimals(pre, prec);
    if (scope === 'todos') {
      const forced = this.forceZeroForNonJPY(sane);
      if (forced !== sane) { this.setAlerta('entero'); }
      sane = forced;
    }

    const excedeDecimales = this.countDecimals(sane) > prec;
    if (excedeDecimales) this.setAlerta('decimales', prec);

    if (scope === 'todos') (this.modalTodos as any)[campo] = sane;
    else (this.modalJPY as any)[campo] = sane;

    input.value = sane;
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
    } else {
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

    this.showAlertaCeros = false;
    this.persistir();
    this.markLastStep();

    // ===== Sección: cerrar manteniendo masivo activo y limpiando selección visual
    this.mostrarModalMismosSpreads = false;
    this.mismosSpreadsTodos = true;
    this.grupos = this.grupos.map(g => ({ ...g, seleccionado: false }));

    this.clearAlerta();

    if (this.isEditSession) this.mostrarOkPequenio();
  }

  /* ===== Reset ===== */
  abrirModalReset() { this.showAlertaCeros = false; this.mostrarModalReset = true; }
  cerrarModalReset(_confirmado: boolean) { this.mostrarModalReset = false; }
  confirmarReset() {
    for (const g of this.grupos) {
      const prec = this.decimalsForPair(g.nombre);
      const zero = (0).toFixed(prec);
      g.filas.forEach(f => {
        if (this.puedeEditar(g.nombre, 'vende'))  f.vende  = zero; else f.vende  = '';
        if (this.puedeEditar(g.nombre, 'compra')) f.compra = zero; else f.compra = '';
      });
    }
    this.persistir();
    this.showAlertaCeros = false;
    this.mostrarModalReset = false;
    this.maybeClearAlert();
    this.fieldErrors = {};

    if (this.isEditSession) this.mostrarOkPequenio();
  }

  /* ===== Validaciones globales ===== */
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

  private validarMinimosGlobal(): boolean {
    let ok = true;
    for (let gi = 0; gi < this.grupos.length; gi++) {
      const g = this.grupos[gi];
      const prec = this.decimalsForPair(g.nombre);
      for (let fi = 0; fi < g.filas.length; fi++) {
        const f = g.filas[fi];
        const checkCampo = (campo: 'vende'|'compra') => {
          if (!this.puedeEditar(g.nombre, campo)) return;
          let v = (f as any)[campo] ?? '';

          if (this.violatesEnteroRule(g.nombre, v)) {
            this.setFieldError(gi, fi, campo, true);
            this.setAlerta('entero');
            ok = false;
            return;
          }

          if (!this.hasMinDecimals(v, prec)) {
            (f as any)[campo] = this.defaultPrec(g.nombre);
            this.setFieldError(gi, fi, campo, true);
            this.setAlerta('decimales_min', prec);
            ok = false;
          } else {
            this.setFieldError(gi, fi, campo, false);
          }
        };
        checkCampo('vende'); checkCampo('compra');
      }
    }
    return ok;
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
      const payload = { stepIndex: STEP_SPREADS_INDEX, updatedAt: now };
      localStorage.setItem(K_PROGRESS, JSON.stringify(payload));
    } catch {}
  }

  /* ===== Aplicar configuración ===== */
  aplicarConfiguracion() {
    this.validarCerosAlAplicar = true;
    const okMinimos = this.validarMinimosGlobal();
    this.recomputeZeroAlert();

    const hayErrores = !okMinimos || this.showAlertaCeros || Object.values(this.fieldErrors).some(Boolean);
    if (hayErrores) return;

    this.clearAlerta();
    this.persistir();
    this.markLastStep(true);

    if (this.isEditSession && this.huboCambios()) this.mostrarOkPequenio();

    this.avanzarStep.emit();

    /* ===== Fallback global para avanzar (como en pasos previos) ===== */
    try {
      window.dispatchEvent(new CustomEvent('wizard:next-step', { detail: { from: 'step6-spreads' } }));
    } catch {}

    this.capturarSnapshot();
  }

  /* ===== Snapshot / OK pequeño ===== */
  private capturarSnapshot(): void { this.prevSnapshot = JSON.stringify(this.soloValores()); }
  private huboCambios(): boolean { return JSON.stringify(this.soloValores()) !== this.prevSnapshot; }
  private soloValores() {
    return this.grupos.map(g => ({
      nombre: g.nombre,
      filas: g.filas.map(f => ({ vende: f.vende, compra: f.compra }))
    }));
  }
  private mostrarOkPequenio(): void { this.mostrarModalOk = true; }
  cerrarModalOk(): void { this.mostrarModalOk = false; }

  /* ===== Regla: desactivar masivo por interacción individual ===== */
  private desactivarMasivoPorInteraccion(): void {
    this.mismosSpreadsTodos = false;
  }
}

/* Re-exports alineados a los steps previos */
export { SpreadsComponent as Step6SpreadS } from './step6-spreads';
export { SpreadsComponent as Step6Spreads };
