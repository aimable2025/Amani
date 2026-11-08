export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
  };
}

const config: CapacitorConfig = {
  appId: 'com.aimable.etsamani',
  appName: 'Ets AMANI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
