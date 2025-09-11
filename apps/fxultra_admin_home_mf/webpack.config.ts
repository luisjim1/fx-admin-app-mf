// apps/fxultra_admin_home_mf/webpack.config.ts
import { withModuleFederation } from '@nx/angular/module-federation';
import mfConfig from './module-federation.config';

// Igual que en el login: exporta el transformer con el OBJETO PLANO
export default withModuleFederation(mfConfig);
