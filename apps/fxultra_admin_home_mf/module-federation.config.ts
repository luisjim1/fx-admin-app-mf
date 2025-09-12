// apps/fxultra_admin_home_mf/module-federation.config.ts
import type { ModuleFederationConfig } from '@nx/webpack';

const config: ModuleFederationConfig = {
  name: 'fxultra_admin_home_mf',
  exposes: {

    './Routes': 'apps/fxultra_admin_home_mf/src/app/remote-entry/entry.routes.ts',

    './HomeLayout': 'apps/fxultra_admin_home_mf/src/app/home/home.component.ts'
  },
  additionalShared: [
    { libraryName: '@azure/msal-browser', sharedConfig: { singleton: true, strictVersion: false } },
    { libraryName: '@azure/msal-angular', sharedConfig: { singleton: true, strictVersion: false } },
  ],
};

export default config;
