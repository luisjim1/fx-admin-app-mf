// apps/shell/webpack.prod.config.ts
import { withModuleFederation } from '@nx/angular/module-federation';
import mfConfig from './module-federation.config';

type MFConfig = Parameters<typeof withModuleFederation>[0];

export default withModuleFederation(mfConfig as MFConfig);
