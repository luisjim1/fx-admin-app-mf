import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Step {
  label: string;
  sublabel: string; // 'Pendiente', 'En proceso', 'Completado'
  completed?: boolean;
}

const K_RETURN_AFTER_EDIT = 'wizard_return_after_edit';

@Component({
  selector: 'app-step-wizard',
  templateUrl: './step-wizard.html',
  styleUrls: ['./step-wizard.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class StepWizardComponent implements OnChanges {
  @Input() steps: Step[] = [];
  @Input() currentStepIndex: number = 0;
  @Output() stepSelected = new EventEmitter<number>();

  ngOnChanges(_changes: SimpleChanges) {
    this.updateStepStatuses();
  }

  // ===== Acciones de edición (icono lápiz) =====
  editarPaso(event: Event, index: number): void {
    event.stopPropagation();
    if (!this.steps[index].completed) return;

    // Mantiene el contrato con CrearEstrategia: usa "ts" (no "timestamp")
    try {
      localStorage.setItem(
        K_RETURN_AFTER_EDIT,
        JSON.stringify({ fromStepIndex: this.currentStepIndex, ts: Date.now() })
      );
    } catch { /* noop */ }

    this.stepSelected.emit(index);
  }

  // ===== Estado visual de pasos =====
  updateStepStatuses() {
    this.steps.forEach((step, i) => {
      if (i < this.currentStepIndex) {
        step.completed = true;
        step.sublabel = 'Completado';
      } else if (i === this.currentStepIndex) {
        step.completed = false;
        step.sublabel = 'En proceso';
      } else {
        step.completed = false;
        step.sublabel = 'Pendiente';
      }
    });
  }
}
