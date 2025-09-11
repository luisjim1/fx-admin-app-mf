import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'strategies-entry',
  imports: [CommonModule],
  template: `
    <h1>Estrategias Remote</h1>
    <p>¡Hola desde fxultra_admin_strategies_mf!</p>
  `,
})
export class RemoteEntryComponent {}
