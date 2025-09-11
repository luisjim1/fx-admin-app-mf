import { ModuleFederationConfig } from '@nx/module-federation';

const config: ModuleFederationConfig = {
  name: 'fxultra_admin_strategies_mf',
  exposes: {
    './Routes': 'apps/fxultra_admin_strategies_mf/src/app/remote-entry/entry.routes.ts',
  },
};

export default config;
