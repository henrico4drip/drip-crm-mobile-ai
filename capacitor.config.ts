
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.f2c658a8f3f8458baf9e66c294d03004',
  appName: 'drip-crm-mobile-ai',
  webDir: 'dist',
  server: {
    url: 'https://f2c658a8-f3f8-458b-af9e-66c294d03004.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    }
  }
};

export default config;
