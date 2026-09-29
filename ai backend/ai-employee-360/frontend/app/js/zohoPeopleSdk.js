'use strict';

/**
 * Zoho People Embedded SDK Bridge
 * Initializes inside Zoho People Web Tab and extracts user context
 */
const ZohoPeopleBridge = {
  isEmbedded: false,
  currentUser: null,
  currentEntityId: null,

  async init(onReadyCallback) {
    if (typeof window.ZOHO !== 'undefined' && window.ZOHO.embeddedApp) {
      this.isEmbedded = true;
      console.log('[ZohoPeopleBridge] Initializing inside Zoho People environment...');

      window.ZOHO.embeddedApp.on('PageLoad', (data) => {
        console.log('[ZohoPeopleBridge] PageLoad event received:', data);
        if (data && (data.EntityId || data.userId || data.recordId)) {
          this.currentEntityId = data.EntityId || data.userId || data.recordId;
        }
        if (typeof onReadyCallback === 'function') {
          onReadyCallback({
            isEmbedded: true,
            entityId: this.currentEntityId,
            rawPageData: data
          });
        }
      });

      try {
        await window.ZOHO.embeddedApp.init();
        console.log('[ZohoPeopleBridge] ZOHO.embeddedApp.init() resolved');
      } catch (err) {
        console.warn('[ZohoPeopleBridge] Init error or non-embedded container:', err);
        if (typeof onReadyCallback === 'function') {
          onReadyCallback({ isEmbedded: false, entityId: null });
        }
      }
    } else {
      console.log('[ZohoPeopleBridge] Running standalone outside Zoho People iframe');
      if (typeof onReadyCallback === 'function') {
        onReadyCallback({ isEmbedded: false, entityId: null });
      }
    }
  }
};

window.ZohoPeopleBridge = ZohoPeopleBridge;
