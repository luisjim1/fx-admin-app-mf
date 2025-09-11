// apps/shell/module-federation.config.ts
import type { ModuleFederationConfig } from '@nx/webpack';

const SINGLETON_LIBS = ['@azure/msal-browser', '@azure/msal-angular'];

const mfConfig: ModuleFederationConfig = {
  name: 'shell',

  remotes: [
    ['fxultra_admin_login_mf',      '/remotes/fxultra_admin_login_mf/remoteEntry.mjs'],
    ['fxultra_admin_home_mf',       '/remotes/fxultra_admin_home_mf/remoteEntry.mjs'],
    ['fxultra_admin_strategies_mf', '/remotes/fxultra_admin_strategies_mf/remoteEntry.mjs'],
  ],

  // Forzamos MSAL como singleton desde el host
  additionalShared: SINGLETON_LIBS.map((libraryName) => ({
    libraryName,
    sharedConfig: {
      singleton: true,
      strictVersion: false,
      requiredVersion: false,
      eager: false,
    },
  })),

  // Cierre defensivo para cualquier otra resolución de shared
  shared: (libraryName: string, defaultConfig: any) => {
    if (SINGLETON_LIBS.includes(libraryName)) {
      return { ...defaultConfig, singleton: true, strictVersion: false, requiredVersion: false, eager: false };
    }
    return defaultConfig;
  },
};

export default mfConfig;
