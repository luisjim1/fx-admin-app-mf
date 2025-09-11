// apps/fxultra_admin_home_mf/webpack.prod.config.ts
import { withModuleFederation } from '@nx/angular/module-federation';
import mfConfig from './module-federation.config';

export default withModuleFederation(mfConfig);
