// apps/fxultra_admin_login_mf/module-federation.config.ts
import type { ModuleFederationConfig } from '@nx/webpack';

const config: ModuleFederationConfig = {
  name: 'fxultra_admin_login_mf',

  exposes: {
    './Routes': 'apps/fxultra_admin_login_mf/src/app/remote-entry/entry.routes.ts',
  },

  additionalShared: [
    {
      libraryName: '@azure/msal-browser',
      sharedConfig: { singleton: true, strictVersion: false, requiredVersion: false /*, eager: false*/ },
    },
    {
      libraryName: '@azure/msal-angular',
      sharedConfig: { singleton: true, strictVersion: false, requiredVersion: false /*, eager: false*/ },
    },
  ],

  shared: (libraryName: string, defaultConfig: any) => {
    const singles = ['@azure/msal-browser', '@azure/msal-angular'];
    if (singles.includes(libraryName)) {
      return { ...defaultConfig, singleton: true, strictVersion: false, requiredVersion: false /*, eager: false*/ };
    }
    return defaultConfig;
  },
};

export default config;
