import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Horario { inicio: string; fin: string; editando: boolean; }

const STORAGE_KEY = 'wizard_horarios';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// tokens de navegación globales (se usan según tu lógica existente)
const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';
const K_JUMP_TO_STEP      = 'wizard_jump_to_step';
const K_PROGRESS          = 'wizard_progress';
const STEP_HORARIOS_INDEX = 4;

const DEFAULT_HORARIOS: Horario[] = [
  { inicio: '00:00', fin: '16:00', editando: false },
  { inicio: '16:00', fin: '24:00', editando: false }
];

@Component({
  selector: 'app-horarios',
  standalone: true,
  templateUrl: './step5-horarios.html',
  styleUrls: ['./step5-horarios.scss'],
  imports: [CommonModule, FormsModule]
})
export class HorariosComponent implements OnInit {
  @Output() avanzarStep = new EventEmitter<void>();

  horarios: Horario[] = cloneDefault();
  errorMsg = '';

  mostrarModal = false;
  accionPendiente: 'individual' | 'todos' | null = null;
  indiceAEliminar: number | null = null;

  // OK pequeño
  mostrarModalOk = false;

  // detección de edición (para decidir cuándo mostrar el OK)
  private isEditSession = false;
  private prevSnapshot = '';

  ngOnInit(): void {
    // detectar si venimos editando un paso posterior
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

    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) {
      try {
        const parsed = JSON.parse(guardado);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < MAX_AGE_MS && Array.isArray(parsed.horarios) && parsed.horarios.length) {
          this.horarios = parsed.horarios;
        } else {
          localStorage.removeItem(STORAGE_KEY);
          this.horarios = cloneDefault();
        }
      } catch {
        this.horarios = cloneDefault();
      }
    } else {
      this.horarios = cloneDefault();
    }
    this.guardarEnLocalStorage();
    this.capturarSnapshot();
  }

  private guardarEnLocalStorage(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      horarios: this.horarios,
      timestamp: Date.now()
    }));
  }

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

  aplicarConfiguracion(): void {
    this.errorMsg = '';
    const validacion = this.validarHorarios24h();
    if (!validacion.ok) {
      this.errorMsg = validacion.mensaje;
      return;
    }

    this.guardarEnLocalStorage();

    // Mostrar OK si hubo cambios respecto del snapshot
    const cambios = this.huboCambios();
    if (this.isEditSession && cambios) this.mostrarOkPequenio();

    // === Navegación controlada según cambios y sesión de edición ===
    try {
      if (this.isEditSession) {
        if (cambios) {
          // Si SÍ hubo cambios → ir a Spreads (5) y limpiar el "regresar a donde venía"
          localStorage.setItem(K_JUMP_TO_STEP, JSON.stringify({ stepIndex: 5, ts: Date.now() }));
          localStorage.removeItem(K_RETURN_AFTER_EDIT);
        } else {
          // Si NO hubo cambios → NO seteamos JUMP y dejamos RETURN_AFTER_EDIT
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
        // Flujo normal (no edición)
        localStorage.removeItem(K_JUMP_TO_STEP);
        localStorage.removeItem(K_RETURN_AFTER_EDIT);
      }
    } catch {}

    this.avanzarStep.emit();

    /* ===== Fallback global para avanzar (igual que Step 3/4) ===== */
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

  // ---- utilidades de tiempo / validación (tuyas intactas) ----
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

  // ---- snapshot para detectar cambios y mostrar OK ----
  private capturarSnapshot(): void { this.prevSnapshot = JSON.stringify(this.horarios); }
  private huboCambios(): boolean { return JSON.stringify(this.horarios) !== this.prevSnapshot; }

  private mostrarOkPequenio(): void { this.mostrarModalOk = true; }
  cerrarModalOk(): void { this.mostrarModalOk = false; }
}

function cloneDefault(): Horario[] {
  return DEFAULT_HORARIOS.map(h => ({ ...h }));
}

/* Re-exports alineados a los steps previos */
export { HorariosComponent as Step5HorariOS } from './step5-horarios';
export { HorariosComponent as Step5Horarios };
