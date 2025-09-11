import { withModuleFederation } from '@nx/angular/module-federation';
import mfConfig from './module-federation.config';

// exporta el transformer que envuelve el OBJETO PLANO
export default withModuleFederation(mfConfig);
