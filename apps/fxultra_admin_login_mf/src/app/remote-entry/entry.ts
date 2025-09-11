import { Component } from '@angular/core';
import { NxWelcome } from './nx-welcome';

@Component({
  imports: [NxWelcome],
  selector: 'app-fxultra_admin_home_mf-entry',
  template: `<app-nx-welcome></app-nx-welcome>`,
})
export class RemoteEntry {}
