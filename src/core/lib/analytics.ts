class SimpleGA4 {
  private measurementId = 'G-QC65PEFPDJ';
  private initialized = false;

  constructor() {
    this.initializeGA4();
  }

  private initializeGA4() {
    if (this.initialized) return;
    
    try {      
      // Load gtag script
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
      
      script.onload = () => {
        this.setupGtag();
      };
      
      script.onerror = (e) => {
        console.error('❌ Failed to load GA4 script:', e);
      };
      
      document.head.appendChild(script);
      
    } catch (error) {
      console.error('❌ Error initializing GA4:', error);
    }
  }

  private setupGtag() {
    try {
      // Initialize gtag
      window.dataLayer = window.dataLayer || [];
      
      function gtag(...args: any[]) {
        window.dataLayer.push(args);
        if (process.env.NODE_ENV === 'development') {
          console.log('📊 gtag called:', args);
        }
      }
      
      window.gtag = gtag;

      gtag('js', new Date());
      gtag('config', this.measurementId, {
        // Enable basic tracking
        page_title: document.title,
        page_location: window.location.href,
        app_name: 'Maneuver Scouting App',
        app_version: '2025.1.0',
        debug_mode: process.env.NODE_ENV === 'development',
      });

      this.initialized = true;
      
      // Track initial page view
      this.trackPageView();
      
    } catch (error) {
      console.error('❌ Error setting up gtag:', error);
    }
  }

  // Track page view
  trackPageView(pagePath?: string, pageTitle?: string) {
    if (!this.isReady()) return;

    const path = pagePath || window.location.pathname;
    const title = pageTitle || document.title;
    
    try {
      window.gtag('config', this.measurementId, {
        page_path: path,
        page_title: title,
      });
      
    } catch (error) {
      console.error('❌ Error tracking page view:', error);
    }
  }

  // Track custom events
  trackEvent(eventName: string, parameters: Record<string, any> = {}) {
    if (!this.isReady()) {
      console.log('⏳ GA4 not ready, skipping event:', eventName);
      return;
    }

    try {
      window.gtag('event', eventName, {
        app_name: 'Maneuver Scouting App',
        app_version: '2025.1.0',
        ...parameters,
      });
      
    } catch (error) {
      console.error('❌ Error tracking event:', error);
    }
  }

  private isReady(): boolean {
    return this.initialized && !!window.gtag && navigator.onLine;
  }

  // Specific tracking methods for your app
  trackDemoDataLoad() {
    this.trackEvent('demo_data_load', {
      event_category: 'engagement',
      event_label: 'demo_data',
    });
  }

  trackDemoDataClear() {
    this.trackEvent('demo_data_clear', {
      event_category: 'engagement', 
      event_label: 'demo_data',
    });
  }

  trackPWAInstall() {
    this.trackEvent('pwa_install', {
      event_category: 'app',
      event_label: 'install',
    });
  }

  trackPWAUpdate() {
    this.trackEvent('pwa_update', {
      event_category: 'app',
      event_label: 'update',
    });
  }

  trackPWALaunched() {
    this.trackEvent('pwa_launched', {
      event_category: 'app',
      event_label: 'launch',
    });
  }

  trackPageNavigation(pageName: string) {
    this.trackEvent('page_navigation', {
      event_category: 'navigation',
      event_label: pageName,
    });
  }

  trackDataExport(dataType: string) {
    this.trackEvent('data_export', {
      event_category: 'data',
      event_label: dataType,
    });
  }

  trackDataImport(dataType: string) {
    this.trackEvent('data_import', {
      event_category: 'data',
      event_label: dataType,
    });
  }

  trackScoutingComplete(matchType: string) {
    this.trackEvent('scouting_complete', {
      event_category: 'scouting',
      event_label: matchType,
    });
  }

  debug() {
    if (process.env.NODE_ENV === 'development') {
      console.log('=== Analytics Debug Info ===');
      console.log('Measurement ID:', this.measurementId);
      console.log('Initialized:', this.initialized);
      console.log('Online:', navigator.onLine);
      console.log('gtag available:', !!window.gtag);
      console.log('dataLayer length:', window.dataLayer?.length || 0);
      console.log('Ready to track:', this.isReady());
      console.log('Current URL:', window.location.href);
    }
  }

  // Test function for manual verification
  testTracking() {
    console.log('🧪 Testing analytics tracking...');
    this.debug();
    
    // Test events
    this.trackEvent('test_event', {
      test_parameter: 'test_value',
      timestamp: new Date().toISOString(),
    });
    
    this.trackPageView('/test-page', 'Test Page');
    
    console.log('✅ Test events sent');
  }
}

export const analytics = new SimpleGA4();

// Type declarations for gtag
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}