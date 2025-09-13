// apps/fxultra_admin_strategies_mf/src/app/crear-estrategia/step-wizard/step5-horarios/step5-horarios.ts

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Imports
   ───────────────────────────────────────────────────────────────────────────── */
import { Component, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { EstrategiasApiService } from '../../../core/api/estrategias-api.service';

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Tipos locales
   ───────────────────────────────────────────────────────────────────────────── */
interface Horario { inicio: string; fin: string; editando: boolean; }
type HorarioResp = { idHorarioEstrategia: number; horaInicio: string; horaFin: string };

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Constantes y navegación
   ───────────────────────────────────────────────────────────────────────────── */
const STORAGE_KEY         = 'wizard_horarios';
const MAX_AGE_MS          = 24 * 60 * 60 * 1000;

const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';
const K_JUMP_TO_STEP      = 'wizard_jump_to_step';
const K_PROGRESS          = 'wizard_progress';
const K_ID_ESTRATEGIA     = 'wizard_idEstrategia';
const K_STEP2_IDS         = 'wizard_step2_divisas_ids'; // <- NUEVO: lista de { claveParDivisa, idDivisaEstrategia }

const STEP_HORARIOS_INDEX = 4;

const DEFAULT_HORARIOS: Horario[] = [
  { inicio: '00:00', fin: '16:00', editando: false },
  { inicio: '16:00', fin: '24:00', editando: false }
];

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Componente
   ───────────────────────────────────────────────────────────────────────────── */
@Component({
  selector: 'app-horarios',
  standalone: true,
  templateUrl: './step5-horarios.html',
  styleUrls: ['./step5-horarios.scss'],
  imports: [CommonModule, FormsModule]
})
export class HorariosComponent implements OnInit {
  @Output() avanzarStep = new EventEmitter<void>();

  /* ── Estado de pantalla ──────────────────────────────────────────────────── */
  horarios: Horario[] = cloneDefault();
  errorMsg = '';

  mostrarModal = false;
  accionPendiente: 'individual' | 'todos' | null = null;
  indiceAEliminar: number | null = null;

  /* ── Modal OK ────────────────────────────────────────────────────────────── */
  mostrarModalOk = false;

  /* ── Contexto de edición ─────────────────────────────────────────────────── */
  private isEditSession = false;
  private prevSnapshot = '';

  /* ── Backend ─────────────────────────────────────────────────────────────── */
  private api = inject(EstrategiasApiService);

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Ciclo de vida
     ─────────────────────────────────────────────────────────────────────────── */
  ngOnInit(): void {
    this.detectarEdicionDesdeStorage();
    this.cargarDesdeStorage();
    this.guardarEnLocalStorage();
    this.capturarSnapshot();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Persistencia local
     ─────────────────────────────────────────────────────────────────────────── */
  private guardarEnLocalStorage(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      horarios: this.horarios,
      timestamp: Date.now()
    }));
  }

  private cargarDesdeStorage(): void {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) {
      try {
        const parsed = JSON.parse(guardado);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS && Array.isArray(parsed.horarios) && parsed.horarios.length) {
          this.horarios = parsed.horarios;
          return;
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    }
    this.horarios = cloneDefault();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Edición
     ─────────────────────────────────────────────────────────────────────────── */
  private detectarEdicionDesdeStorage(): void {
    try {
      const raw = localStorage.getItem(K_RETURN_AFTER_EDIT) || localStorage.getItem(K_PROGRESS);
      if (raw) {
        const obj = JSON.parse(raw);
        const idx = typeof obj?.fromStepIndex === 'number' ? obj.fromStepIndex
                  : typeof obj?.fromStep === 'number' ? obj.fromStep
                  : typeof obj?.stepIndex === 'number' ? obj.stepIndex : null;
        this.isEditSession = idx != null && idx > STEP_HORARIOS_INDEX;
      }
    } catch {}
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Acciones de tabla
     ─────────────────────────────────────────────────────────────────────────── */
  insertarHorario(): void {
    this.desactivarTodasLasEdiciones();
    const totalMin = this.totalMinutosActuales();
    if (totalMin < 1440) {
      const ultimoFin = this.horarios[this.horarios.length - 1].fin;
      this.horarios.push({ inicio: ultimoFin, fin: '24:00', editando: true });
    } else {
      this.horarios.push({ inicio: '00:00', fin: '00:00', editando: true });
    }
    this.guardarEnLocalStorage();
    if (this.isEditSession) this.mostrarOkPequenio();
  }

  abrirModal(accion: 'individual' | 'todos', indice?: number): void {
    this.accionPendiente = accion;
    this.indiceAEliminar = indice !== undefined ? indice : null;
    this.mostrarModal = true;
  }
  cerrarModal(): void {
    this.mostrarModal = false;
    this.accionPendiente = null;
    this.indiceAEliminar = null;
  }

  confirmarEliminacion(): void {
    if (this.accionPendiente === 'individual' && this.indiceAEliminar !== null) {
      const deletedIndex = this.indiceAEliminar;
      this.horarios.splice(deletedIndex, 1);

      if (this.horarios.length === 1) {
        this.horarios[0].fin = this.horarios[0].inicio;
      } else if (this.horarios.length >= 2) {
        const n = this.horarios.length;
        const prev = (deletedIndex - 1 + n) % n;
        const next = deletedIndex % n;
        this.horarios[prev].fin = this.horarios[next].inicio;
      }
    } else if (this.accionPendiente === 'todos') {
      this.horarios = cloneDefault();
    }
    this.guardarEnLocalStorage();
    this.cerrarModal();
    if (this.isEditSession) this.mostrarOkPequenio();
  }

  editarHorario(index: number): void {
    this.desactivarTodasLasEdiciones();
    this.horarios[index].editando = true;
    this.guardarEnLocalStorage();
  }

  guardarHorario(index: number): void {
    const h = this.horarios[index];
    if (!h.inicio || h.inicio.trim() === '') h.inicio = '00:00';
    if (!h.fin || h.fin.trim() === '') h.fin = '00:00';
    h.editando = false;
    this.guardarEnLocalStorage();
    if (this.isEditSession) this.mostrarOkPequenio();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Envío (POST) y navegación
     ─────────────────────────────────────────────────────────────────────────── */
  async aplicarConfiguracion(): Promise<void> {
    this.errorMsg = '';

    const validacion = this.validarHorarios24h();
    if (!validacion.ok) {
      this.errorMsg = validacion.mensaje;
      return;
    }

    this.guardarEnLocalStorage();

    const idEstrategia = this.leerIdEstrategia();
    if (!idEstrategia) {
      this.errorMsg = 'No se encontró el contexto de la estrategia.';
      return;
    }

    // Normalización para el backend: 24:00 → 00:00
    const payload = {
      idEstrategia,
      horarios: this.horarios.map(h => ({
        horaInicio: this.normalizarHoraParaBack(h.inicio),
        horaFin:    this.normalizarHoraParaBack(h.fin)
      }))
    };

    let resp: any;
    try {
      resp = await this.api.postHorariosEstrategia(payload as any).toPromise();
    } catch (err: any) {
      this.errorMsg = String(err?.message || err || 'Error al registrar horarios de estrategia');
      return;
    }

    // ⬇️ NUEVO: Persistimos en localStorage los IDs por cada idDivisaEstrategia (Step 2)
    try {
      const horariosResp: HorarioResp[] = Array.isArray(resp?.horariosEstrategia)
        ? (resp.horariosEstrategia as any[]).map(x => ({
            idHorarioEstrategia: Number(x?.idHorarioEstrategia),
            horaInicio: normHora(String(x?.horaInicio || '')),
            horaFin:    normHora(String(x?.horaFin    || '')),
          })).filter(x => Number.isFinite(x.idHorarioEstrategia))
        : [];

      if (horariosResp.length) {
        this.persistirHorariosParaTodasLasDivisas(horariosResp);
      } else {
        console.warn('[Paso 5] El POST no devolvió horariosEstrategia con IDs; no se pudo persistir wizard_horarios.');
      }
    } catch (e) {
      console.error('[Paso 5] Error al persistir wizard_horarios:', e);
    }

    const cambios = this.huboCambios();
    if (this.isEditSession && cambios) this.mostrarOkPequenio();

    try {
      if (this.isEditSession) {
        if (cambios) {
          localStorage.setItem(K_JUMP_TO_STEP, JSON.stringify({ stepIndex: 5, ts: Date.now() }));
          localStorage.removeItem(K_RETURN_AFTER_EDIT);
        } else {
          localStorage.removeItem(K_JUMP_TO_STEP);
          const raw = localStorage.getItem(K_RETURN_AFTER_EDIT);
          if (raw) {
            try {
              const tok = JSON.parse(raw);
              tok.ts = Date.now();
              localStorage.setItem(K_RETURN_AFTER_EDIT, JSON.stringify(tok));
            } catch {}
          }
        }
      } else {
        localStorage.removeItem(K_JUMP_TO_STEP);
        localStorage.removeItem(K_RETURN_AFTER_EDIT);
      }
    } catch {}

    this.avanzarStep.emit();
    try {
      window.dispatchEvent(new CustomEvent('wizard:next-step', { detail: { from: 'step5-horarios' } }));
    } catch {}

    this.capturarSnapshot();
  }

  reestablecer(): void {
    this.horarios = cloneDefault();
    this.errorMsg = '';
    this.guardarEnLocalStorage();
    if (this.isEditSession) this.mostrarOkPequenio();
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Formato de entradas
     ─────────────────────────────────────────────────────────────────────────── */
  private desactivarTodasLasEdiciones(): void {
    this.horarios.forEach(h => h.editando = false);
  }

  onFocusInput(index: number, campo: 'inicio' | 'fin'): void {
    const valor = this.horarios[index][campo];
    if (valor === '00:00') this.horarios[index][campo] = '';
  }

  formatearHora(index: number, campo: 'inicio' | 'fin', event: Event): void {
    const input = event.target as HTMLInputElement;
    let cursorPos = (input.selectionStart ?? 0);
    let valor = input.value.replace(/[^0-9]/g, '');
    if (valor.length > 4) valor = valor.slice(0, 4);
    if (valor.length >= 3) {
      valor = valor.slice(0, 2) + ':' + valor.slice(2);
      if (cursorPos === 2) cursorPos++;
    }
    this.horarios[index][campo] = valor;
    this.guardarEnLocalStorage();
    setTimeout(() => { input.selectionStart = input.selectionEnd = cursorPos; });
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Validación 24h y snapshot
     ─────────────────────────────────────────────────────────────────────────── */
  private toMinutes(hora: string): number {
    if (hora === '24:00') return 1440;
    const [hh, mm] = hora.split(':').map(Number);
    return hh * 60 + mm;
  }

  private esHoraValida(hora: string): boolean {
    return /^([01]\d|2[0-3]|24):([0-5]\d)$/.test(hora);
  }

  private totalMinutosActuales(): number {
    return this.horarios.reduce((total, h) => {
      const inicioMin = this.toMinutes(h.inicio);
      const finMin = this.toMinutes(h.fin);
      const dur = finMin >= inicioMin ? (finMin - inicioMin) : (1440 - inicioMin + finMin);
      return total + dur;
    }, 0);
  }

  private validarHorarios24h(): { ok: boolean; mensaje: string } {
    if (!this.horarios.length) return { ok: false, mensaje: 'No se permite el registro menor a 24h' };

    for (const h of this.horarios) {
      if (!this.esHoraValida(h.inicio) || !this.esHoraValida(h.fin)) {
        return { ok: false, mensaje: 'No se permite el registro menor a 24h' };
      }
    }

    if (this.horarios.length === 1) {
      const h = this.horarios[0];
      const ini = this.toMinutes(h.inicio);
      const fin = this.toMinutes(h.fin);
      const dur = (ini === fin) ? 1440 : (fin >= ini ? fin - ini : 1440 - ini + fin);
      return dur === 1440 ? { ok: true, mensaje: '' }
                          : { ok: false, mensaje: dur < 1440 ? 'No se permite el registro menor a 24h' : 'No se permite el registro mayor a 24h' };
    }

    let segs = this.horarios.map(h => {
      const s = this.toMinutes(h.inicio);
      let e = this.toMinutes(h.fin);
      if (e < s) e += 1440;
      return { s, e };
    });
    segs.sort((a, b) => a.s - b.s);

    for (let i = 1; i < segs.length; i++) {
      if (segs[i].s < segs[i - 1].e) return { ok: false, mensaje: 'No se permite el registro mayor a 24h' };
      if (segs[i].s > segs[i - 1].e) return { ok: false, mensaje: 'No se permite el registro menor a 24h' };
    }

    const cobertura = (segs[segs.length - 1].e - segs[0].s);
    if (cobertura !== 1440) {
      return { ok: false, mensaje: cobertura < 1440 ? 'No se permite el registro menor a 24h' : 'No se permite el registro mayor a 24h' };
    }
    return { ok: true, mensaje: '' };
  }

  private capturarSnapshot(): void { this.prevSnapshot = JSON.stringify(this.horarios); }
  private huboCambios(): boolean { return JSON.stringify(this.horarios) !== this.prevSnapshot; }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Normalización para backend
     ─────────────────────────────────────────────────────────────────────────── */
  private normalizarHoraParaBack(hora: string): string {
    const v = (hora || '').trim();
    // El backend no acepta 24:00 (LocalTime), y además exige que el último rango termine en 00:00.
    return v === '24:00' ? '00:00' : v;
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Lectura de contexto
     ─────────────────────────────────────────────────────────────────────────── */
  private leerIdEstrategia(): number | null {
    const raw = localStorage.getItem(K_ID_ESTRATEGIA);
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }

  /* ───────────────────────────────────────────────────────────────────────────
     NUEVO: Persistencia de IDs por divisa para Step 6
     ─────────────────────────────────────────────────────────────────────────── */
  private leerStep2DivisasIds(): number[] {
    try {
      const raw = localStorage.getItem(K_STEP2_IDS);
      const arr = raw ? JSON.parse(raw) : null;
      if (!Array.isArray(arr)) return [];
      // Puede venir [{claveParDivisa, idDivisaEstrategia}, ...]
      return arr
        .map((x: any) => Number(x?.idDivisaEstrategia))
        .filter((n: any) => Number.isFinite(n));
    } catch {
      return [];
    }
  }

  private persistirHorariosParaTodasLasDivisas(horarios: HorarioResp[]): void {
    // Normalizamos horas para hacer match exacto con Step 6
    const normalizados = horarios.map(h => ({
      idHorarioEstrategia: Number(h.idHorarioEstrategia),
      horaInicio: normHora(h.horaInicio),
      horaFin:    normHora(h.horaFin),
    }));

    // Construimos byDivisa con el mismo arreglo para cada idDivisaEstrategia
    const idsDivisa = this.leerStep2DivisasIds();
    const byDivisa: Record<number, HorarioResp[]> = {};
    for (const id of idsDivisa) {
      byDivisa[id] = normalizados;
    }

    const payloadLS = { byDivisa, timestamp: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payloadLS));
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Sección: Modal OK
     ─────────────────────────────────────────────────────────────────────────── */
  private mostrarOkPequenio(): void { this.mostrarModalOk = true; }
  cerrarModalOk(): void { this.mostrarModalOk = false; }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Utilidades
   ───────────────────────────────────────────────────────────────────────────── */
function cloneDefault(): Horario[] {
  return DEFAULT_HORARIOS.map(h => ({ ...h }));
}

function normHora(h: string): string {
  return (h || '').trim() === '24:00' ? '00:00' : (h || '').trim();
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sección: Re-exports nominales
   ───────────────────────────────────────────────────────────────────────────── */
export { HorariosComponent as Step5HorariOS } from './step5-horarios';
export { HorariosComponent as Step5Horarios };
