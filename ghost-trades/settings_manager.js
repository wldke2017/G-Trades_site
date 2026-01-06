// ===================================
// BOT SETTINGS PERSISTENCE MANAGER
// Saves and restores bot settings across page refreshes
// ===================================

class BotSettingsManager {
    constructor() {
        this.storageKey = 'ghost_trades_bot_settings';
        this.version = '1.0';
        console.log('✅ Bot Settings Manager initialized');
    }
    
    /**
     * Save all bot settings to localStorage
     * @param {string} botName - Name of the bot (e.g., 'ghost_ai', 'ghost_eodd', 'ai_strategy')
     * @param {object} settings - Settings object to save
     */
    saveSettings(botName, settings) {
        try {
            const allSettings = this.loadAllSettings();
            allSettings[botName] = {
                ...settings,
                lastUpdated: new Date().toISOString(),
                version: this.version
            };
            localStorage.setItem(this.storageKey, JSON.stringify(allSettings));
            console.log(`💾 Saved settings for ${botName}:`, settings);
            return true;
        } catch (error) {
            console.error(`❌ Failed to save settings for ${botName}:`, error);
            return false;
        }
    }
    
    /**
     * Load specific bot settings from localStorage
     * @param {string} botName - Name of the bot
     * @returns {object|null} - Settings object or null if not found
     */
    loadSettings(botName) {
        try {
            const allSettings = this.loadAllSettings();
            const settings = allSettings[botName] || null;
            
            if (settings) {
                console.log(`📂 Loaded settings for ${botName}:`, settings);
            } else {
                console.log(`ℹ️ No saved settings found for ${botName}`);
            }
            
            return settings;
        } catch (error) {
            console.error(`❌ Failed to load settings for ${botName}:`, error);
            return null;
        }
    }
    
    /**
     * Load all settings from localStorage
     * @returns {object} - All settings object
     */
    loadAllSettings() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('❌ Failed to load all settings:', error);
            return {};
        }
    }
    
    /**
     * Auto-restore settings to UI elements
     * @param {string} botName - Name of the bot
     * @param {object} inputMappings - Mapping of setting keys to element IDs
     * @returns {boolean} - True if settings were restored
     */
    restoreToUI(botName, inputMappings) {
        const settings = this.loadSettings(botName);
        if (!settings) {
            console.log(`ℹ️ No settings to restore for ${botName}`);
            return false;
        }
        
        let restoredCount = 0;
        
        // Apply each setting to its input element
        Object.entries(inputMappings).forEach(([key, elementId]) => {
            const element = document.getElementById(elementId);
            if (element && settings[key] !== undefined) {
                try {
                    if (element.type === 'checkbox') {
                        element.checked = settings[key];
                    } else if (element.type === 'radio') {
                        if (element.value === settings[key]) {
                            element.checked = true;
                        }
                    } else {
                        element.value = settings[key];
                    }
                    restoredCount++;
                } catch (error) {
                    console.warn(`⚠️ Failed to restore ${key} to ${elementId}:`, error);
                }
            }
        });
        
        console.log(`✅ Restored ${restoredCount} settings for ${botName}`);
        
        // Show notification to user
        if (restoredCount > 0 && typeof showToast === 'function') {
            showToast(`Settings restored for ${botName.replace('_', ' ').toUpperCase()}`, 'success', 3000);
        }
        
        return true;
    }
    
    /**
     * Delete settings for a specific bot
     * @param {string} botName - Name of the bot
     */
    deleteSettings(botName) {
        try {
            const allSettings = this.loadAllSettings();
            delete allSettings[botName];
            localStorage.setItem(this.storageKey, JSON.stringify(allSettings));
            console.log(`🗑️ Deleted settings for ${botName}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to delete settings for ${botName}:`, error);
            return false;
        }
    }
    
    /**
     * Clear all bot settings
     */
    clearAllSettings() {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('🗑️ Cleared all bot settings');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear all settings:', error);
            return false;
        }
    }
    
    /**
     * Export settings as JSON string
     * @returns {string} - JSON string of all settings
     */
    exportSettings() {
        const allSettings = this.loadAllSettings();
        return JSON.stringify(allSettings, null, 2);
    }
    
    /**
     * Import settings from JSON string
     * @param {string} jsonString - JSON string to import
     * @returns {boolean} - Success status
     */
    importSettings(jsonString) {
        try {
            const settings = JSON.parse(jsonString);
            localStorage.setItem(this.storageKey, JSON.stringify(settings));
            console.log('✅ Settings imported successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to import settings:', error);
            return false;
        }
    }
}

// Global instance
if (typeof window !== 'undefined') {
    window.botSettingsManager = new BotSettingsManager();
    console.log('✅ Global Bot Settings Manager created');
}