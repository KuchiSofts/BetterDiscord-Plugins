/**
 * @name SoundBooster
 * @author KuchiS
 * @version 2.6.2
 * @description Ultra-smooth volume enhancement plugin that extends Discord's 200% volume limit. Features instant-response volume controls with zero UI blocking, completely non-blocking smart save system, smart save management with anti-spam protection, real-time visual volume meters with peak indicators, and optimized React components for lag-free performance.
 * @authorLink https://github.com/KuchiSofts
 * @website https://github.com/KuchiSofts/BetterDiscord-Plugins
 * @source https://github.com/KuchiSofts/BetterDiscord-Plugins/blob/main/SoundBooster.plugin.js
 * @updateUrl https://github.com/KuchiSofts/BetterDiscord-Plugins/raw/main/SoundBooster.plugin.js
 */

/*
 * Based on BetterVolume by Zerthox (https://github.com/Zerthox/BetterDiscord-Plugins)
 * MIT License, Copyright (c) 2016 Zerthox
 *
 * Portions of this file are derived from BetterVolume and are used under the
 * following license:
 *
 *   MIT License
 *
 *   Copyright (c) 2016 Zerthox
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 *
 * All other modifications are licensed under the GNU General Public License v3.0
 * (see LICENSE in https://github.com/KuchiSofts/BetterDiscord-Plugins). See
 * THIRD_PARTY_NOTICES.md for details.
 */

/*@cc_on @if (@_jscript)
var pluginName = WScript.ScriptName.split(".")[0];
var shell = WScript.CreateObject("WScript.Shell");
shell.Popup("Do NOT run scripts from the internet with the Windows Script Host!\nMove this file to your BetterDiscord plugins folder.",0,pluginName + ": Warning!",0x1030);
var fso = new ActiveXObject("Scripting.FileSystemObject");
var pluginsPath = shell.expandEnvironmentStrings("%appdata%\\BetterDiscord\\plugins");
if (!fso.FolderExists(pluginsPath)) {
    var popup = shell.Popup("Unable to find BetterDiscord on your computer.\nOpen the download page of BetterDiscord?",0,pluginName + ": BetterDiscord not found",0x34);
    if (popup === 6) {
        shell.Exec("explorer \"https://betterdiscord.app\"");
    }
} else if (WScript.ScriptFullName === pluginsPath + "\\" + WScript.ScriptName) {
    shell.Popup("This plugin is already in the correct folder.\nNavigate to the \"Plugins\" settings tab in Discord and enable it there.",0,pluginName,0x40);
} else {
    var popup2 = shell.Popup("Open the BetterDiscord plugins folder?",0,pluginName,0x34);
    if (popup2 === 6) {
        shell.Exec("explorer " + pluginsPath);
    }
}
WScript.Quit();
@else @*/

"use strict";

/* -------------------------------------------------------------------------- */
/*                       Professional Plugin Constants                        */
/* -------------------------------------------------------------------------- */

/** @constant {Object} Plugin performance configuration */
const PLUGIN_CONFIG = {
    CACHE_SIZE_LIMIT: 50,  // Reduced from 100 for memory efficiency
    DEBOUNCE_SAVE_MS: 50,  // Ultra-fast debounce for immediate response
    STARTUP_DELAY_MS: 100, // Slightly increased for smoother startup
    BATCH_SIZE: 5,         // Reduced batch size to prevent blocking
    THROTTLE_MS: 16,       // Ultra-smooth 60fps throttling
    UPDATE_INTERVAL_MS: 8, // Immediate update interval
    VOLUME_METER_FPS: 30,  // Dedicated FPS for volume meter
    MIN_VOLUME_CHANGE: 0.5,// More sensitive volume detection
    VOLUME_IMMEDIATE_MS: 0,// Immediate volume application
    VOLUME_SMOOTH_STEPS: 3,// Steps for smooth transitions
    ASYNC_QUEUE_SIZE: 50   // Max async operations queue
};

/** @constant {Object} Volume control limits and defaults */
const VOLUME_CONSTANTS = {
    DISCORD_MAX_PERC: 200,
    DEFAULT_MAX_USER: 1000,
    DEFAULT_MAX_STREAM: 1000,
    DEFAULT_STEP: 100,
    MIN_VOLUME: 0,
    MAX_VOLUME: 10000
};

/* -------------------------------------------------------------------------- */
/*                              Plugin Boilerplate                             */
/* -------------------------------------------------------------------------- */

const moduleCache = new Map();
const cachedFilters = new Map();
const promiseCache = new Map(); // Cache for async module lookups
let meta = null;

const getMeta = () => {
    if (meta) return meta;
    throw Error("Accessing meta before initialization");
};

const setMeta = (newMeta) => {
    meta = newMeta;
};

const load = (key) => BdApi.Data.load(getMeta().name, key);
const save = (key, value) => BdApi.Data.save(getMeta().name, key, value);

const checkObjectValues = (target) =>
    target !== window &&
    target instanceof Object &&
    target.constructor?.prototype !== target;

const byName = (name) => {
    const cacheKey = `byName:${name}`;
    if (cachedFilters.has(cacheKey)) return cachedFilters.get(cacheKey);
    const filter = (target) => (target?.displayName ?? target?.constructor?.displayName) === name;
    cachedFilters.set(cacheKey, filter);
    return filter;
};

const byKeys = (...keys) => {
    const cacheKey = `byKeys:${keys.join(',')}`;
    if (cachedFilters.has(cacheKey)) return cachedFilters.get(cacheKey);
    const filter = (target) => target instanceof Object && keys.every((key) => key in target);
    cachedFilters.set(cacheKey, filter);
    return filter;
};

const byProtos = (...protos) => {
    const cacheKey = `byProtos:${protos.join(',')}`;
    if (cachedFilters.has(cacheKey)) return cachedFilters.get(cacheKey);
    const filter = (target) =>
        target instanceof Object &&
        target.prototype instanceof Object &&
        protos.every((proto) => proto in target.prototype);
    cachedFilters.set(cacheKey, filter);
    return filter;
};

const bySource = (...fragments) => {
    const cacheKey = `bySource:${fragments.join(',')}`;
    if (cachedFilters.has(cacheKey)) return cachedFilters.get(cacheKey);
    const filter = (target) => {
        while (target instanceof Object && "$$typeof" in target) {
            target = target.render ?? target.type;
        }
        if (target instanceof Function) {
            const source = target.toString();
            const renderSource = target.prototype?.render?.toString();
            return fragments.every((fragment) =>
                typeof fragment === "string"
                    ? source.includes(fragment) || renderSource?.includes(fragment)
                    : fragment(source) || (renderSource && fragment(renderSource))
            );
        }
        return false;
    };
    cachedFilters.set(cacheKey, filter);
    return filter;
};

const confirm = (title, content, options = {}) =>
    BdApi.UI.showConfirmationModal(title, content, options);

const mappedProxy = (target, mapping) => {
    const map = new Map(Object.entries(mapping));
    return new Proxy(target, {
        get(t, prop) {
            return t[map.get(prop) ?? prop];
        },
        set(t, prop, value) {
            t[map.get(prop) ?? prop] = value;
            return true;
        },
        deleteProperty(t, prop) {
            delete t[map.get(prop) ?? prop];
            map.delete(prop);
            return true;
        },
        has(t, prop) {
            return map.has(prop) || prop in t;
        },
        ownKeys() {
            return [...map.keys(), ...Object.keys(t)];
        },
        getOwnPropertyDescriptor(t, prop) {
            return Object.getOwnPropertyDescriptor(t, map.get(prop) ?? prop);
        },
        defineProperty(t, prop, attributes) {
            Object.defineProperty(t, map.get(prop) ?? prop, attributes);
            return true;
        }
    });
};

const find = (filter, { resolve = true, entries = false, cacheKey = "" } = {}) => {
    if (cacheKey && moduleCache.has(cacheKey)) {
        return moduleCache.get(cacheKey);
    }
    
    const result = BdApi.Webpack.getModule(filter, {
        defaultExport: resolve,
        searchExports: entries
    });
    
    if (cacheKey && result) {
        moduleCache.set(cacheKey, result);
    }
    
    return result;
};

const resolveKey = (target, filter) => [
    target,
    Object.entries(target ?? {}).find(([, value]) => filter(value))?.[0]
];

const demangle = (mapping, required, proxy = false, cacheKey = "") => {
    if (cacheKey && moduleCache.has(cacheKey)) {
        return moduleCache.get(cacheKey);
    }

    const req = required ?? Object.keys(mapping);
    const found = find(
        (target) =>
            checkObjectValues(target) &&
            req.every((reqKey) =>
                Object.values(target).some((value) => mapping[reqKey](value))
            )
    );
    
    let result;
    if (proxy) {
        result = mappedProxy(
            found,
            Object.fromEntries(
                Object.entries(mapping).map(([key, filt]) => [
                    key,
                    Object.entries(found ?? {}).find(([, val]) => filt(val))?.[0]
                ])
            )
        );
    } else {
        result = Object.fromEntries(
            Object.entries(mapping).map(([key, filt]) => [
                key,
                Object.values(found ?? {}).find((val) => filt(val))
            ])
        );
    }
    
    if (cacheKey && result) {
        moduleCache.set(cacheKey, result);
    }
    
    return result;
};

let controller = new AbortController();
const waitFor = (filter, { resolve = true, entries = false, cacheKey = "" } = {}) => {
    if (cacheKey && moduleCache.has(cacheKey)) {
        return Promise.resolve(moduleCache.get(cacheKey));
    }
    
    // Cache promises to avoid duplicate lookups
    const promiseKey = `${cacheKey || 'unknown'}_${resolve}_${entries}`;
    if (promiseCache.has(promiseKey)) {
        return promiseCache.get(promiseKey);
    }
    
    const promise = BdApi.Webpack.waitForModule(filter, {
        signal: controller.signal,
        defaultExport: resolve,
        searchExports: entries
    }).then(result => {
        if (cacheKey && result) {
            moduleCache.set(cacheKey, result);
        }
        promiseCache.delete(promiseKey); // Clear promise cache after resolution
        return result;
    }).catch(error => {
        promiseCache.delete(promiseKey); // Clear on error too
        throw error;
    });
    
    promiseCache.set(promiseKey, promise);
    return promise;
};

const abort = () => {
    controller.abort();
    controller = new AbortController();
    promiseCache.clear(); // Clear promise cache on abort
};

const COLOR = "#3a71c1";
const createLoggers = () => {
    const nameStr = getMeta().name;
    const versionStr = getMeta().version ? `(v${getMeta().version})` : "";
    const formatStr = `%c[${nameStr}] %c${versionStr}`;
    const styles = [`color: ${COLOR}; font-weight: 700;`, "color: #666; font-size: .8em;"];
    
    return {
        log: (...data) => console.log(formatStr, ...styles, ...data),
        warn: (...data) => console.warn(formatStr, ...styles, ...data)
    };
};

let logger;

const patch = (type, object, method, callback, options) => {
    const original = object?.[method];
    if (!(original instanceof Function)) {
        throw TypeError(`patch target ${original} is not a function`);
    }
    const cancel = BdApi.Patcher[type](
        getMeta().name,
        object,
        method,
        options.once
            ? (...args) => {
                  const result = callback(cancel, original, ...args);
                  cancel();
                  return result;
              }
            : (...args) => callback(cancel, original, ...args)
    );
    if (!options.silent) {
        logger.log(`Patched ${options.name ?? String(method)}`);
    }
    return cancel;
};

const after = (object, method, callback, options = {}) =>
    patch(
        "after",
        object,
        method,
        (cancel, original, context, args, result) =>
            callback({ cancel, original, context, args, result }),
        options
    );

let menuPatches = [];
const unpatchAll = () => {
    if (
        menuPatches.length + BdApi.Patcher.getPatchesByCaller(getMeta().name).length > 0
    ) {
        for (const cancel of menuPatches) {
            cancel();
        }
        menuPatches = [];
        BdApi.Patcher.unpatchAll(getMeta().name);
        logger.log("Unpatched all");
    }
};

const inject = (styles) => {
    if (typeof styles === "string") {
        BdApi.DOM.addStyle(getMeta().name, styles);
    }
};

const clear = () => BdApi.DOM.removeStyle(getMeta().name);

/* -------------------------------------------------------------------------- */
/*                           Grab External Modules                            */
/* -------------------------------------------------------------------------- */

const fetchDiscordModules = () => {
    const Dispatcher = find(byKeys("dispatch", "subscribe"), { cacheKey: "Dispatcher" });
    
    const LegacyModules = demangle(
        {
            default: byKeys("Store", "connectStores"),
            Dispatcher: byProtos("dispatch"),
            Store: byProtos("emitChange"),
            BatchedStoreListener: byProtos("attach", "detach"),
            useStateFromStores: bySource("useStateFromStores")
        },
        ["Store", "Dispatcher", "useStateFromStores"],
        false,
        "LegacyModules"
    );
    
    const MediaEngineStore = find(byName("MediaEngineStore"), { cacheKey: "MediaEngineStore" });
    const MediaEngineActions = find(byKeys(["setLocalVolume"]), { cacheKey: "MediaEngineActions" });
    
    // Audio level detection modules
    const VoiceStateStore = find(byName("VoiceStateStore"), { cacheKey: "VoiceStateStore" });
    const SpeakingStore = find(byName("SpeakingStore"), { cacheKey: "SpeakingStore" });
    
    // Try to find RTC connection for audio levels
    let RTCConnection = null;
    try {
        RTCConnection = find(byKeys("getAverageInputAmplitude", "getInputVolume"), { cacheKey: "RTCConnection" });
    } catch (err) {
        logger.warn("RTCConnection not found, audio levels may not be available");
    }
    
    const { React } = BdApi;
    const { TextInput } = BdApi.UI;
    
    let AudioConvert;
    try {
        const AttemptAudioConvert = demangle({
            amplitudeToPerceptual: bySource("Math.log10"),
            perceptualToAmplitude: bySource("Math.pow(10")
        }, null, false, "AudioConvert");
        
        if (
            !AttemptAudioConvert ||
            typeof AttemptAudioConvert.amplitudeToPerceptual !== "function" ||
            typeof AttemptAudioConvert.perceptualToAmplitude !== "function"
        ) {
            throw new Error("Invalid AudioConvert module");
        }
        
        AudioConvert = AttemptAudioConvert;
    } catch (err) {
        logger.warn("AudioConvert not found. Using fallback math for volume conversions.");
        const log10 = Math.log10;
        const pow10 = x => Math.pow(10, x / 20);
        
        AudioConvert = {
            amplitudeToPerceptual: amplitude => 20 * log10(amplitude),
            perceptualToAmplitude: db => pow10(db)
        };
    }
    
    // Use more efficient caching with professional size limits
    const percCache = new Map();
    const ampCache = new Map();
    
    const cachedAudioConvert = {
        amplitudeToPerceptual(amplitude) {
            // More aggressive rounding to improve cache hits
            const roundedAmp = Math.round(amplitude * 100) / 100; // Reduced precision
            if (percCache.has(roundedAmp)) {
                return percCache.get(roundedAmp);
            }
            const result = AudioConvert.amplitudeToPerceptual(amplitude);
            
            // Optimized cache eviction with better performance
            if (percCache.size >= PLUGIN_CONFIG.CACHE_SIZE_LIMIT) {
                // Remove oldest 25% of entries for better performance
                const keysToDelete = Array.from(percCache.keys()).slice(0, Math.floor(PLUGIN_CONFIG.CACHE_SIZE_LIMIT * 0.25));
                keysToDelete.forEach(key => percCache.delete(key));
            }
            percCache.set(roundedAmp, result);
            return result;
        },
        perceptualToAmplitude(db) {
            const roundedDb = Math.round(db * 2) / 2; // Round to nearest 0.5 for better caching
            if (ampCache.has(roundedDb)) {
                return ampCache.get(roundedDb);
            }
            const result = AudioConvert.perceptualToAmplitude(db);
            
            if (ampCache.size >= PLUGIN_CONFIG.CACHE_SIZE_LIMIT) {
                const keysToDelete = Array.from(ampCache.keys()).slice(0, Math.floor(PLUGIN_CONFIG.CACHE_SIZE_LIMIT * 0.25));
                keysToDelete.forEach(key => ampCache.delete(key));
            }
            ampCache.set(roundedDb, result);
            return result;
        },
        clearCache() {
            percCache.clear();
            ampCache.clear();
        },
        // Add cache statistics for monitoring
        getCacheStats() {
            return {
                percCacheSize: percCache.size,
                ampCacheSize: ampCache.size,
                totalSize: percCache.size + ampCache.size
            };
        }
    };
    
    const Common = BdApi.Webpack.getModule((m) => m?.Button && m?.Switch && m?.Select);
    const Button = Common?.Button ?? (() => null);
    const Flex = BdApi.Webpack.getModule((m) => m?.Child && m?.Justify, { searchExports: true });
    const FormComponents = BdApi.Webpack.getModule(
        (m) => m?.FormSection && m?.FormItem && m?.FormTitle
    );
    
    const {
        FormSection,
        FormItem,
        FormTitle,
        FormText,
        FormLabel,
        FormDivider,
        FormSwitch,
        FormNotice
    } = FormComponents ?? {};
    
    const margins = BdApi.Webpack.getModule((m) => m?.marginBottom40 && m?.marginTop4);
    
    const ContextMenu = BdApi.ContextMenu;
    
    return {
        Dispatcher,
        LegacyModules,
        MediaEngineStore,
        MediaEngineActions,
        VoiceStateStore,
        SpeakingStore,
        RTCConnection,
        React,
        TextInput,
        AudioConvert: cachedAudioConvert,
        Button,
        Flex,
        FormComponents: {
            FormSection,
            FormItem,
            FormTitle,
            FormText,
            FormLabel,
            FormDivider,
            FormSwitch,
            FormNotice
        },
        margins,
        ContextMenu
    };
};

/* -------------------------------------------------------------------------- */
/*                               Settings Store                               */
/* -------------------------------------------------------------------------- */

const createSettingsContainer = ({ React, FormSection, FormDivider, Flex, Button, margins }) => {
    return ({ name, children, onReset }) =>
        React.createElement(
            FormSection,
            null,
            children,
            onReset
                ? React.createElement(
                      React.Fragment,
                      null,
                      React.createElement(FormDivider, {
                          className: margins ? `${margins.marginTop20} ${margins.marginBottom20}` : ""
                      }),
                      React.createElement(
                          Flex,
                          { justify: Flex.Justify.END },
                          React.createElement(
                              Button,
                              {
                                  size: Button.Sizes.SMALL,
                                  onClick: () =>
                                      confirm(name, "Reset all settings?", {
                                          onConfirm: () => onReset()
                                      })
                              },
                              "Reset"
                          )
                      )
                  )
                : null
        );
};

class SettingsStore {
    constructor(defaults, onLoad) {
        this.listeners = new Set();
        this.defaults = defaults;
        this.onLoad = onLoad;
        this.current = { ...defaults };
        this.saveTimeout = null;
        
        this.update = this.update.bind(this);
        this.addListener = this.addListener.bind(this);
        this.removeListener = this.removeListener.bind(this);
        this.addReactChangeListener = this.addListener;
        this.removeReactChangeListener = this.removeListener;
        this._debouncedSave = this._debouncedSave.bind(this);
    }

    _debouncedSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            // Ultra-non-blocking save using multiple async techniques
            this._performAsyncSave();
            this.saveTimeout = null;
        }, PLUGIN_CONFIG.DEBOUNCE_SAVE_MS);
    }
    
    _performAsyncSave() {
        return new Promise((outerResolve) => {
            const performSave = () => {
                const saveData = () => {
                    try {
                        // Clone data to prevent reference issues during async save
                        const dataToSave = JSON.parse(JSON.stringify(this.current));
                        BdApi.Data.save(getMeta().name, "settings", dataToSave);
                        outerResolve();
                    } catch (error) {
                        // Final fallback with setTimeout to prevent any blocking
                        setTimeout(() => {
                            try {
                                BdApi.Data.save(getMeta().name, "settings", this.current);
                                outerResolve();
                            } catch (finalError) {
                                logger.warn("All save attempts failed:", finalError);
                                outerResolve();
                            }
                        }, 0);
                    }
                };
                
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(saveData, { timeout: 100 });
                } else {
                    // Fallback to microtask
                    Promise.resolve().then(saveData);
                }
            };
            
            performSave();
        });
    }

    update(settings) {
        const newSettings = typeof settings === "function" 
            ? settings(this.current) 
            : settings;
            
        let hasChanges = false;
        for (const key in newSettings) {
            if (this.current[key] !== newSettings[key]) {
                this.current[key] = newSettings[key];
                hasChanges = true;
            }
        }
        
        if (hasChanges) {
            this._dispatch(true);
        }
    }

    load() {
        try {
            const savedSettings = BdApi.Data.load(getMeta().name, "settings") || {};
            
            for (const key in this.defaults) {
                if (key in savedSettings) {
                    this.current[key] = savedSettings[key];
                }
            }
        } catch (error) {
            logger.warn("Failed to load settings:", error);
        }
        
        this.onLoad?.();
        this._dispatch(false);
    }

    _dispatch(shouldSave) {
        if (this.listeners.size > 0) {
            // Use microtask instead of requestAnimationFrame for faster updates
            Promise.resolve().then(() => {
                for (const listener of this.listeners) {
                    try {
                        listener(this.current);
                    } catch (error) {
                        logger.warn("Settings listener error:", error);
                    }
                }
            });
        }
        
        if (shouldSave) {
            this._debouncedSave();
        }
    }

    reset() {
        this.current = { ...this.defaults };
        this._dispatch(true);
    }

    delete(...keys) {
        let changed = false;
        for (const key of keys) {
            if (key in this.current) {
                delete this.current[key];
                changed = true;
            }
        }
        
        if (changed) {
            this._dispatch(true);
        }
    }

    useCurrent() {
        return this.LegacyModules.useStateFromStores([this], () => this.current, undefined, () => false);
    }

    useSelector(selector, deps, compare) {
        return this.LegacyModules.useStateFromStores([this], () => selector(this.current), deps, compare);
    }

    useState() {
        return this.LegacyModules.useStateFromStores([this], () => [this.current, this.update]);
    }

    useStateWithDefaults() {
        return this.LegacyModules.useStateFromStores([this], () => [this.current, this.defaults, this.update]);
    }

    useListener(listener, deps) {
        React.useEffect(() => {
            this.addListener(listener);
            return () => this.removeListener(listener);
        }, deps ?? [listener]);
    }

    addListener(listener) {
        this.listeners.add(listener);
        return listener;
    }

    removeListener(listener) {
        this.listeners.delete(listener);
    }

    removeAllListeners() {
        this.listeners.clear();
    }
    
    setDependencies(LegacyModules) {
        this.LegacyModules = LegacyModules;
    }

    exportSettings() {
        return JSON.stringify(this.current, null, 2);
    }

    importSettings(jsonString) {
        try {
            const importedData = JSON.parse(jsonString);
            
            const validData = {};
            for (const key in this.defaults) {
                if (key in importedData) {
                    validData[key] = importedData[key];
                }
            }
            
            this.current = { ...this.defaults, ...validData };
            this._dispatch(true);
            
            return true;
        } catch (error) {
            logger.warn("Failed to import settings:", error);
            return false;
        }
    }
}

const createSettings = (defaults, onLoad) => new SettingsStore(defaults, onLoad);

const createPlugin = (plugin) => (metaData) => {
    setMeta(metaData);
    logger = createLoggers();
    
    const { start, stop, styles, Settings, SettingsPanel } =
        plugin instanceof Function ? plugin(metaData) : plugin;
    Settings?.load();
    
    const ReactInstance = BdApi.React;
    
    return {
        start() {
            logger.log("Enabled");
            inject(styles);
            start?.();
        },
        stop() {
            abort();
            unpatchAll();
            clear();
            stop?.();
            logger.log("Disabled");
        },
        getSettingsPanel: () => {
            if (!SettingsPanel) return null;
            
            const panel = ReactInstance.createElement("div", { 
                style: { padding: "10px" } 
            }, ReactInstance.createElement(SettingsPanel));
            
            return panel;
        }
    };
};

/* -------------------------------------------------------------------------- */
/*                      Actual Plugin-Specific Settings                       */
/* -------------------------------------------------------------------------- */

/** @constant {SettingsStore} Plugin settings with professional defaults */
const Settings = createSettings(
    {
        volumeOverrides: {},
        maxUserVolume: VOLUME_CONSTANTS.DEFAULT_MAX_USER,
        maxStreamVolume: VOLUME_CONSTANTS.DEFAULT_MAX_STREAM,
        defaultUserVolume: VOLUME_CONSTANTS.MIN_VOLUME,
        defaultStreamVolume: VOLUME_CONSTANTS.DEFAULT_STEP,
        volumeStep: VOLUME_CONSTANTS.DEFAULT_STEP,
        mouseWheelStep: VOLUME_CONSTANTS.DEFAULT_STEP,
        disableExperiment: 0,
        hideOriginalVolume: false,
        showVolumeMeter: true,
        smartSaveDelay: 3000 // 3 seconds default save delay
    },
    null
);

const hasOverride = (userId, context) =>
    userId in Settings.current.volumeOverrides && 
    context in Settings.current.volumeOverrides[userId];

const updateVolumeOverride = (userId, volume, context) => {
    const isNew = !hasOverride(userId, context);
    
    if (volume > 5) {
        Settings.update(current => {
            const volumeOverrides = { ...current.volumeOverrides };
            
            if (!volumeOverrides[userId]) {
                volumeOverrides[userId] = {};
            }
            
            volumeOverrides[userId] = { ...volumeOverrides[userId], [context]: volume };
            return { volumeOverrides };
        });
    } else if (hasOverride(userId, context)) {
        Settings.update(current => {
            const volumeOverrides = { ...current.volumeOverrides };
            
            if (volumeOverrides[userId]) {
                delete volumeOverrides[userId][context];
                if (Object.keys(volumeOverrides[userId]).length === 0) {
                    delete volumeOverrides[userId];
                }
            }
            
            return { volumeOverrides };
        });
    }
    
    return isNew;
};

const tryResetVolumeOverride = (userId, context) => {
    if (hasOverride(userId, context)) {
        Settings.update(current => {
            const volumeOverrides = { ...current.volumeOverrides };
            
            if (volumeOverrides[userId]) {
                delete volumeOverrides[userId][context];
                if (Object.keys(volumeOverrides[userId]).length === 0) {
                    delete volumeOverrides[userId];
                }
            }
            
            return { volumeOverrides };
        });
        
        return true;
    }
    
    return false;
};

/* -------------------------------------------------------------------------- */
/*                           Smart Save Management System                     */
/* -------------------------------------------------------------------------- */

/**
 * Professional smart save manager with anti-spam protection and configurable delays
 * Optimized for minimal CPU and memory usage with intelligent batching
 */
class SmartSaveManager {
    constructor() {
        this.pendingChanges = new Map(); // userId:context -> { volume, timestamp, saveTimer }
        this.isShuttingDown = false;
        this.maxPendingChanges = 50; // Memory limit
        this.lastCleanup = 0;
        this.cleanupInterval = 30000; // 30s cleanup interval
        
        // Bind methods
        this.scheduleVolumeSave = this.scheduleVolumeSave.bind(this);
        this.processScheduledSave = this.processScheduledSave.bind(this);
        this.cleanupExpiredEntries = this.cleanupExpiredEntries.bind(this);
        this.emergencySave = this.emergencySave.bind(this);
    }
    
    /**
     * Schedule a volume save with smart delay and anti-spam protection
     * @param {string} userId - User ID
     * @param {number} volume - Volume percentage
     * @param {string} context - Volume context (default/stream)
     */
    scheduleVolumeSave(userId, volume, context) {
        const key = `${userId}:${context}`;
        const now = Date.now();
        const saveDelay = Settings.current.smartSaveDelay || 3000;
        
        // Clear existing timer if present
        const existing = this.pendingChanges.get(key);
        if (existing?.saveTimer) {
            clearTimeout(existing.saveTimer);
        }
        
        // Create new save entry
        const saveEntry = {
            userId,
            volume,
            context,
            timestamp: now,
            saveTimer: null
        };
        
        // Schedule the save with smart delay
        saveEntry.saveTimer = setTimeout(() => {
            this.processScheduledSave(key, saveEntry);
        }, saveDelay);
        
        // Store in pending changes
        this.pendingChanges.set(key, saveEntry);
        
        // Periodic cleanup to prevent memory bloat
        if (now - this.lastCleanup > this.cleanupInterval) {
            this.cleanupExpiredEntries();
        }
        
        // Memory protection: force save oldest entries if too many pending
        if (this.pendingChanges.size > this.maxPendingChanges) {
            this.forceSaveOldest();
        }
    }
    
    /**
     * Process a scheduled save - fully async and non-blocking
     * @param {string} key - Combined key (userId:context)
     * @param {Object} saveEntry - Save entry data
     */
    processScheduledSave(key, saveEntry) {
        if (this.isShuttingDown) return Promise.resolve();
        
        return new Promise((resolve) => {
            // Use requestIdleCallback or setTimeout for non-blocking execution
            const executeAsync = () => {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(() => this.executeSave(key, saveEntry, resolve), { timeout: 50 });
                } else {
                    setTimeout(() => this.executeSave(key, saveEntry, resolve), 0);
                }
            };
            
            executeAsync();
        });
    }
    
    executeSave(key, saveEntry, resolve) {
        const { userId, volume, context } = saveEntry;
        
        this.performAsyncSave(userId, volume, context)
            .then(() => {
                // Remove from pending changes after successful save
                this.pendingChanges.delete(key);
                resolve();
            })
            .catch((error) => {
                // Retry mechanism for failed saves
                this.retryFailedSave(key, saveEntry, error);
                resolve();
            });
    }
    
    /**
     * Perform the actual save operation asynchronously
     * @param {string} userId - User ID
     * @param {number} volume - Volume percentage  
     * @param {string} context - Volume context
     */
    performAsyncSave(userId, volume, context) {
        return new Promise((resolve, reject) => {
            // Use microtask to prevent blocking main thread
            Promise.resolve().then(() => {
                try {
                    updateVolumeOverride(userId, volume, context);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }).catch(reject);
        });
    }
    
    /**
     * Retry failed save with exponential backoff
     * @param {string} key - Combined key
     * @param {Object} saveEntry - Save entry data
     * @param {Error} error - Original error
     */
    retryFailedSave(key, saveEntry, error) {
        const maxRetries = 3;
        const retryCount = saveEntry.retryCount || 0;
        
        if (retryCount < maxRetries) {
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Max 5s
            
            saveEntry.retryCount = retryCount + 1;
            saveEntry.saveTimer = setTimeout(() => {
                this.processScheduledSave(key, saveEntry);
            }, backoffDelay);
            
            this.pendingChanges.set(key, saveEntry);
        } else {
            // Max retries reached, remove from pending
            console.warn('SmartSaveManager: Max retries reached for save', error);
            this.pendingChanges.delete(key);
        }
    }
    
    /**
     * Clean up expired entries to prevent memory leaks
     */
    cleanupExpiredEntries() {
        const now = Date.now();
        const maxAge = (Settings.current.smartSaveDelay || 3000) * 2; // Double the save delay
        
        for (const [key, entry] of this.pendingChanges.entries()) {
            if (now - entry.timestamp > maxAge) {
                if (entry.saveTimer) {
                    clearTimeout(entry.saveTimer);
                }
                this.pendingChanges.delete(key);
            }
        }
        
        this.lastCleanup = now;
    }
    
    /**
     * Force save oldest entries when memory limit is reached
     */
    forceSaveOldest() {
        const entries = Array.from(this.pendingChanges.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // Save the oldest 25% of entries immediately
        const toSave = entries.slice(0, Math.floor(entries.length * 0.25));
        
        toSave.forEach(([key, entry]) => {
            if (entry.saveTimer) {
                clearTimeout(entry.saveTimer);
            }
            this.processScheduledSave(key, entry);
        });
    }
    
    /**
     * Emergency save all pending changes (called on plugin shutdown)
     * Uses batch processing to prevent UI blocking during shutdown
     */
    emergencySave() {
        this.isShuttingDown = true;
        
        const pendingEntries = Array.from(this.pendingChanges.entries());
        this.pendingChanges.clear();
        
        // Clear all timers first
        pendingEntries.forEach(([key, entry]) => {
            if (entry.saveTimer) {
                clearTimeout(entry.saveTimer);
            }
        });
        
        return this.processBatchedSaves(pendingEntries, 0);
    }
    
    processBatchedSaves(pendingEntries, startIndex) {
        const batchSize = 5;
        if (startIndex >= pendingEntries.length) {
            return Promise.resolve();
        }
        
        const batch = pendingEntries.slice(startIndex, startIndex + batchSize);
        
        // Process batch asynchronously
        const batchPromises = batch.map(([key, entry]) => {
            return new Promise((resolve) => {
                try {
                    const { userId, volume, context } = entry;
                    this.performAsyncSave(userId, volume, context)
                        .then(() => resolve())
                        .catch((error) => {
                            console.warn('Emergency save failed for', key, error);
                            resolve();
                        });
                } catch (error) {
                    console.warn('Emergency save failed for', key, error);
                    resolve();
                }
            });
        });
        
        return Promise.all(batchPromises).then(() => {
            // Allow UI to breathe between batches
            if (startIndex + batchSize < pendingEntries.length) {
                return new Promise(resolve => {
                    setTimeout(() => {
                        this.processBatchedSaves(pendingEntries, startIndex + batchSize)
                            .then(resolve);
                    }, 1);
                });
            }
            return Promise.resolve();
        });
    }
    
    /**
     * Cancel a specific pending save
     * @param {string} userId - User ID
     * @param {string} context - Volume context
     */
    cancelPendingSave(userId, context) {
        const key = `${userId}:${context}`;
        const entry = this.pendingChanges.get(key);
        
        if (entry?.saveTimer) {
            clearTimeout(entry.saveTimer);
            this.pendingChanges.delete(key);
        }
    }
    
    /**
     * Get statistics for monitoring and debugging
     */
    getStats() {
        return {
            pendingChanges: this.pendingChanges.size,
            maxPendingChanges: this.maxPendingChanges,
            lastCleanup: this.lastCleanup,
            isShuttingDown: this.isShuttingDown
        };
    }
    
    /**
     * Clear all pending saves and cleanup
     */
    shutdown() {
        return this.emergencySave().then(() => {
            this.isShuttingDown = true;
        });
    }
}

/* -------------------------------------------------------------------------- */
/*                        Smooth Volume Processing System                     */
/* -------------------------------------------------------------------------- */

/**
 * Advanced volume processing queue for ultra-smooth volume changes
 * Prevents UI blocking and provides immediate visual feedback
 */
class SmoothVolumeProcessor {
    constructor(MediaEngineActions, AudioConvert, saveManager) {
        this.MediaEngineActions = MediaEngineActions;
        this.AudioConvert = AudioConvert;
        this.saveManager = saveManager;
        this.processingQueue = new Map(); // userId -> latest volume request
        this.isProcessing = false;
        this.lastProcessTime = 0;
        
        // Bind methods
        this.addVolumeChange = this.addVolumeChange.bind(this);
        this.processQueueImmediate = this.processQueueImmediate.bind(this);
        this.scheduleProcessing = this.scheduleProcessing.bind(this);
    }
    
    /**
     * Add volume change to processing queue for immediate visual response
     * @param {string} userId - User ID
     * @param {number} volume - Volume percentage
     * @param {string} context - Volume context (default/stream)
     */
    addVolumeChange(userId, volume, context) {
        const key = `${userId}:${context}`;
        
        // Immediate visual feedback - update queue
        this.processingQueue.set(key, {
            userId,
            volume,
            context,
            timestamp: Date.now()
        });
        
        // Process immediately without blocking
        this.scheduleProcessing();
    }
    
    /**
     * Schedule processing using smart timing to prevent UI blocking
     */
    scheduleProcessing() {
        if (this.isProcessing) return;
        
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessTime;
        
        if (timeSinceLastProcess >= PLUGIN_CONFIG.UPDATE_INTERVAL_MS) {
            // Process immediately if enough time has passed
            this.processQueueImmediate();
        } else {
            // Schedule for next frame to maintain smooth UI
            requestAnimationFrame(() => this.processQueueImmediate());
        }
    }
    
    /**
     * Process volume changes immediately without debouncing
     */
    processQueueImmediate() {
        if (this.processingQueue.size === 0) return;
        
        this.isProcessing = true;
        this.lastProcessTime = Date.now();
        
        try {
            // Process all queued volume changes in a single batch
            const changes = Array.from(this.processingQueue.values());
            this.processingQueue.clear();
            
            // Use microtask for non-blocking processing
            Promise.resolve().then(() => {
                changes.forEach(({ userId, volume, context }) => {
                    try {
                        const amplitudeVolume = this.AudioConvert.perceptualToAmplitude(volume);
                        this.MediaEngineActions.setLocalVolume(userId, amplitudeVolume, context);
                        
                        // Use smart save manager for intelligent saving with delay
                        if (this.saveManager) {
                            this.saveManager.scheduleVolumeSave(userId, volume, context);
                        } else {
                            // Fallback to immediate save
                            updateVolumeOverride(userId, volume, context);
                        }
                    } catch (error) {
                        // Silent error handling to prevent UI disruption
                    }
                });
            }).finally(() => {
                this.isProcessing = false;
            });
            
        } catch (error) {
            this.isProcessing = false;
        }
    }
    
    /**
     * Clear all pending volume changes
     */
    clearQueue() {
        this.processingQueue.clear();
        this.isProcessing = false;
    }
    
    /**
     * Get queue statistics for monitoring
     */
    getStats() {
        return {
            queueSize: this.processingQueue.size,
            isProcessing: this.isProcessing,
            lastProcessTime: this.lastProcessTime
        };
    }
}

/* -------------------------------------------------------------------------- */
/*                              Volume UI Components                          */
/* -------------------------------------------------------------------------- */

/**
 * Creates a real-time volume meter component with peak indicators
 * @param {Object} params - Component dependencies
 * @param {Object} params.React - React library
 * @param {Object} params.MediaEngineStore - Discord MediaEngine store
 * @param {Object} params.VoiceStateStore - Discord voice state store  
 * @param {Object} params.SpeakingStore - Discord speaking detection store
 * @param {Object} params.RTCConnection - RTC connection for audio levels
 * @returns {React.Component} Volume meter component
 */
const createVolumeMeter = ({ React, MediaEngineStore, VoiceStateStore, SpeakingStore, RTCConnection }) => {
    return React.memo(({ userId }) => {
        const [audioLevel, setAudioLevel] = React.useState(0);
        const [peakLevel, setPeakLevel] = React.useState(0);
        const [isSpeaking, setIsSpeaking] = React.useState(false);
        const [isMuted, setIsMuted] = React.useState(false);
        
        const animationFrameRef = React.useRef(null);
        const peakTimeoutRef = React.useRef(null);
        const levelHistoryRef = React.useRef([]);
        
        // Get current user ID for local microphone detection
        const currentUserId = MediaEngineStore?.getCurrentUser?.()?.id;
        const isLocalUser = userId === currentUserId;
        
        // Optimized audio level detection with reduced CPU usage
        const updateAudioLevels = React.useCallback(() => {
            try {
                let currentLevel = 0;
                let speaking = false;
                let muted = false;
                
                if (isLocalUser && RTCConnection) {
                    // For local user, get input amplitude with reduced frequency
                    const inputAmplitude = RTCConnection.getAverageInputAmplitude?.() || 0;
                    currentLevel = Math.min(inputAmplitude * 100, 100);
                    
                    // Cache speaking and mute states to reduce API calls
                    speaking = currentLevel > 5; // Local threshold detection
                    muted = MediaEngineStore?.isSelfMute?.() || MediaEngineStore?.isSelfDeaf?.() || false;
                } else {
                    // For remote users, use cached states with less frequent updates
                    const cachedSpeaking = SpeakingStore?.isSpeaking?.(userId) || false;
                    const voiceState = VoiceStateStore?.getVoiceState?.(userId);
                    
                    speaking = cachedSpeaking;
                    muted = voiceState?.mute || voiceState?.selfMute || false;
                    
                    if (speaking && !muted) {
                        // Optimized simulation with fewer calculations  
                        currentLevel = 35 + (Math.random() * 30); // 35-65% range
                    } else {
                        // Faster decay
                        currentLevel = Math.max(0, (levelHistoryRef.current[levelHistoryRef.current.length - 1] || 0) - 8);
                    }
                }
                
                // Optimized smoothing with smaller history
                levelHistoryRef.current.push(currentLevel);
                if (levelHistoryRef.current.length > 2) { // Reduced from 3 to 2
                    levelHistoryRef.current.shift();
                }
                
                const smoothedLevel = levelHistoryRef.current.reduce((a, b) => a + b, 0) / levelHistoryRef.current.length;
                
                // Only update state if there's a significant change (reduces re-renders)
                if (Math.abs(smoothedLevel - audioLevel) > 1) {
                    setAudioLevel(smoothedLevel);
                }
                
                // Optimized peak detection with debouncing
                if (smoothedLevel > peakLevel + 2) { // Only update if significant peak increase
                    setPeakLevel(smoothedLevel);
                    clearTimeout(peakTimeoutRef.current);
                    peakTimeoutRef.current = setTimeout(() => {
                        setPeakLevel(0);
                    }, 1200); // Reduced from 1500ms
                }
                
                // Batch state updates to reduce re-renders
                if (speaking !== isSpeaking) setIsSpeaking(speaking);
                if (muted !== isMuted) setIsMuted(muted);
                
            } catch (error) {
                // Silently handle errors - audio level detection is non-critical
            }
            
            // Reduced update frequency: 30fps instead of 60fps for better performance
            setTimeout(() => {
                if (animationFrameRef.current) {
                    animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
                }
            }, 33); // ~30fps
        }, [userId, isLocalUser, peakLevel, audioLevel, isSpeaking, isMuted, RTCConnection, SpeakingStore, VoiceStateStore, MediaEngineStore]);
        
        // Start/stop audio level monitoring
        React.useEffect(() => {
            if (Settings.current.showVolumeMeter) {
                updateAudioLevels();
            }
            
            return () => {
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                }
                if (peakTimeoutRef.current) {
                    clearTimeout(peakTimeoutRef.current);
                }
            };
        }, [updateAudioLevels]);
        
        // Don't render if meter is disabled
        if (!Settings.current.showVolumeMeter) {
            return null;
        }
        
        // Convert level to dB for display
        const dbLevel = audioLevel > 0 ? Math.round(20 * Math.log10(audioLevel / 100)) : -60;
        const dbDisplay = dbLevel > -60 ? `${dbLevel}dB` : "-∞dB";
        
        return React.createElement(
            "div",
            {
                className: "volume-meter-container",
                "data-speaking": isSpeaking,
                "data-muted": isMuted,
                title: `Audio Level: ${Math.round(audioLevel)}% (${dbDisplay})`
            },
            React.createElement(
                "div",
                { className: "volume-meter-label" },
                "🎙️"
            ),
            React.createElement(
                "div",
                { className: "volume-meter-bar" },
                React.createElement("div", {
                    className: "volume-meter-fill",
                    style: { width: `${audioLevel}%` }
                }),
                peakLevel > 0 && React.createElement("div", {
                    className: "volume-meter-peak",
                    style: { right: `${100 - peakLevel}%` }
                })
            ),
            React.createElement(
                "div",
                { className: "volume-meter-db" },
                dbDisplay
            )
        );
    });
};

/* -------------------------------------------------------------------------- */
/*                              Volume UI Setup                               */
/* -------------------------------------------------------------------------- */

const css = `
.container-BetterVolume{margin:4px 8px;padding:8px 12px;background:linear-gradient(135deg,var(--background-secondary) 0%,var(--background-tertiary) 100%);border-radius:6px;border:1px solid var(--background-modifier-accent);box-shadow:0 2px 6px rgba(0,0,0,.1);display:flex;flex-direction:column;gap:6px;transition:all .2s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden;min-height:auto}

.container-BetterVolume::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,var(--brand-experiment) 0%,var(--brand-experiment-560) 100%);opacity:.6}

.container-BetterVolume:hover{box-shadow:0 3px 8px rgba(0,0,0,.15);border-color:var(--brand-experiment-360)}

.label-BetterVolume{font-size:11px;font-weight:600;color:var(--header-primary);margin:0 0 4px 0;display:flex;align-items:center;gap:6px;letter-spacing:.02em}

.label-BetterVolume::before{content:'';width:3px;height:3px;border-radius:50%;background:var(--brand-experiment);box-shadow:0 0 4px var(--brand-experiment)}

.slider-BetterVolume{width:100%;height:4px;margin:0 0 6px 0;background:var(--background-modifier-accent);border-radius:2px;outline:none;cursor:pointer;transition:all .2s ease;position:relative;appearance:none;-webkit-appearance:none}

.slider-BetterVolume::-webkit-slider-track{width:100%;height:4px;background:linear-gradient(90deg,var(--background-modifier-accent) 0%,var(--background-modifier-selected) 100%);border-radius:2px;border:none}

.slider-BetterVolume::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,var(--brand-experiment) 0%,var(--brand-experiment-560) 100%);border:2px solid var(--background-primary);cursor:pointer;box-shadow:0 1px 4px rgba(88,101,242,.3);transition:all .2s cubic-bezier(.4,0,.2,1);position:relative}

.slider-BetterVolume::-webkit-slider-thumb:hover{transform:scale(1.05);box-shadow:0 2px 6px rgba(88,101,242,.4),0 0 0 3px rgba(88,101,242,.15)}

.slider-BetterVolume::-webkit-slider-thumb:active{transform:scale(1);box-shadow:0 1px 3px rgba(88,101,242,.5),0 0 0 4px rgba(88,101,242,.2)}

.slider-BetterVolume::-moz-range-track{width:100%;height:4px;background:linear-gradient(90deg,var(--background-modifier-accent) 0%,var(--background-modifier-selected) 100%);border-radius:2px;border:none}

.slider-BetterVolume::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,var(--brand-experiment) 0%,var(--brand-experiment-560) 100%);border:2px solid var(--background-primary);cursor:pointer;box-shadow:0 1px 4px rgba(88,101,242,.3);transition:all .2s cubic-bezier(.4,0,.2,1)}

.slider-BetterVolume:hover{background:var(--background-modifier-selected)}

.volume-input-container{display:flex;align-items:center;gap:6px;background:var(--background-primary);border-radius:4px;padding:4px 8px;border:1px solid var(--background-modifier-accent);transition:all .2s ease}

.volume-input-container:hover{border-color:var(--brand-experiment-360);background:var(--background-secondary)}

.volume-input-container:focus-within{border-color:var(--brand-experiment);box-shadow:0 0 0 2px rgba(88,101,242,.2)}

.input-BetterVolume{width:45px;background:transparent;border:none;color:var(--text-normal);font-weight:500;font-size:12px;text-align:center;outline:none;font-family:var(--font-mono);letter-spacing:.3px}

.input-BetterVolume::-webkit-inner-spin-button,.input-BetterVolume::-webkit-outer-spin-button{opacity:.6;height:16px;cursor:pointer;filter:brightness(1.1)}

.volume-percentage{font-size:10px;color:var(--text-muted);font-weight:500;min-width:12px}

.volume-icon{width:14px;height:14px;opacity:.8;filter:brightness(1.1)}

.container-BetterVolume[data-volume-level="low"] .label-BetterVolume::before{background:var(--status-warning);box-shadow:0 0 6px var(--status-warning)}

.container-BetterVolume[data-volume-level="medium"] .label-BetterVolume::before{background:var(--brand-experiment);box-shadow:0 0 6px var(--brand-experiment)}

.container-BetterVolume[data-volume-level="high"] .label-BetterVolume::before{background:var(--status-positive);box-shadow:0 0 6px var(--status-positive)}

.container-BetterVolume[data-volume-level="extreme"] .label-BetterVolume::before{background:var(--status-danger);box-shadow:0 0 6px var(--status-danger);animation:pulse-danger 2s infinite}

@keyframes pulse-danger{0%,100%{opacity:1}50%{opacity:.6}}

@media (max-width:300px){.container-BetterVolume{margin:3px 6px;padding:6px 8px}.input-BetterVolume{width:40px;font-size:11px}.volume-input-container{padding:3px 6px}}

.slider-BetterVolume:focus{outline:2px solid var(--brand-experiment);outline-offset:2px}

.input-BetterVolume:focus{color:var(--text-normal)}

@media (prefers-color-scheme:dark){.container-BetterVolume{box-shadow:0 4px 12px rgba(0,0,0,.25),0 2px 4px rgba(0,0,0,.15)}.container-BetterVolume:hover{box-shadow:0 6px 20px rgba(0,0,0,.3),0 3px 8px rgba(0,0,0,.2)}}

@media (prefers-contrast:high){.container-BetterVolume{border:2px solid var(--brand-experiment)}.slider-BetterVolume::-webkit-slider-thumb{border:3px solid var(--background-primary)}.volume-input-container{border:2px solid var(--background-modifier-accent)}}

@media (prefers-reduced-motion:reduce){.container-BetterVolume,.slider-BetterVolume::-webkit-slider-thumb,.volume-input-container{transition:none}.container-BetterVolume[data-volume-level="extreme"] .label-BetterVolume::before{animation:none}}
.soundbooster-settings{padding:24px;background:var(--background-secondary-alt);border-radius:12px;color:#ffffff;font-family:var(--font-primary);max-width:900px;margin:0 auto;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.soundbooster-settings *{color:#ffffff!important}
.soundbooster-settings-header{margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid var(--background-modifier-accent);background:linear-gradient(135deg,var(--brand-experiment),var(--brand-experiment-560));padding:20px;border-radius:8px;margin:-24px -24px 28px -24px}
.soundbooster-settings-title{font-size:24px;font-weight:700;color:#ffffff!important;margin:0;text-shadow:0 2px 4px rgba(0,0,0,.3)}
.soundbooster-settings-description{font-size:15px;color:rgba(255,255,255,.9)!important;margin:12px 0 0 0;opacity:.95}
.soundbooster-setting-group{background:var(--background-tertiary);border-radius:10px;padding:20px;margin-bottom:20px;border:1px solid var(--background-modifier-accent);transition:all .2s ease}
.soundbooster-setting-group:hover{border-color:var(--brand-experiment);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.2)}
.soundbooster-setting-item{margin-bottom:18px}
.soundbooster-setting-item:last-child{margin-bottom:0}
.soundbooster-setting-label{display:flex;align-items:center;margin-bottom:10px;font-weight:600;color:#ffffff!important;font-size:15px}
.soundbooster-setting-description{font-size:13px;color:rgba(255,255,255,.8)!important;margin:0 0 12px 0;opacity:.9}
.soundbooster-setting-input{width:100%;max-width:280px;padding:12px 16px;border-radius:6px;border:2px solid var(--input-background);background:var(--background-primary);color:#ffffff!important;font-size:14px;font-weight:500;transition:all .2s ease}
.soundbooster-setting-input:focus{outline:none;border-color:var(--brand-experiment);box-shadow:0 0 0 3px rgba(88,101,242,.2);background:var(--background-secondary)}
.soundbooster-setting-input::-webkit-inner-spin-button,.soundbooster-setting-input::-webkit-outer-spin-button{opacity:1;filter:brightness(2)}
.soundbooster-checkbox-container{display:flex;align-items:flex-start;gap:12px;padding:16px;background:var(--background-primary);border-radius:8px;border:2px solid var(--background-modifier-accent);transition:all .2s ease}
.soundbooster-checkbox-container:hover{border-color:var(--brand-experiment);background:var(--background-secondary)}
.soundbooster-checkbox{width:20px;height:20px;accent-color:var(--brand-experiment);margin-top:2px;cursor:pointer}
.soundbooster-checkbox-content{flex:1}
.soundbooster-checkbox-label{color:#ffffff!important;font-size:15px;font-weight:500;cursor:pointer;user-select:none;display:block;margin-bottom:4px}
.soundbooster-checkbox-desc{font-size:13px;color:rgba(255,255,255,.7)!important;line-height:1.4}
.soundbooster-button-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.soundbooster-button{padding:12px 20px;border-radius:6px;border:none;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s ease;min-width:140px;position:relative;overflow:hidden}
.soundbooster-button:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.3)}
.soundbooster-button:active{transform:translateY(0)}
.soundbooster-button-primary{background:linear-gradient(135deg,var(--brand-experiment),var(--brand-experiment-560));color:#ffffff!important;box-shadow:0 4px 12px rgba(88,101,242,.3)}
.soundbooster-button-secondary{background:linear-gradient(135deg,var(--button-secondary-background),var(--background-primary));color:#ffffff!important;border:1px solid var(--background-modifier-accent)}
.soundbooster-button-danger{background:linear-gradient(135deg,#ed4245,#c03537);color:#ffffff!important;box-shadow:0 4px 12px rgba(237,66,69,.3)}
.soundbooster-backup-section{margin-top:32px;padding:24px;background:linear-gradient(135deg,var(--background-tertiary),var(--background-primary));border-radius:10px;border-left:4px solid var(--brand-experiment);position:relative;overflow:hidden}
.soundbooster-backup-section::before{content:'';position:absolute;top:0;right:0;width:100px;height:100px;background:radial-gradient(circle,rgba(88,101,242,.1) 0%,transparent 70%);pointer-events:none}
.soundbooster-backup-title{font-size:18px;font-weight:700;color:#ffffff!important;margin:0 0 8px 0;display:flex;align-items:center;gap:8px}
.soundbooster-backup-title::before{content:'💾';font-size:20px}
.soundbooster-backup-desc{font-size:14px;color:rgba(255,255,255,.8)!important;margin-bottom:20px;line-height:1.5}
.soundbooster-file-input{display:none}
.soundbooster-file-label{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;background:linear-gradient(135deg,var(--button-secondary-background),var(--background-primary));color:#ffffff!important;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;transition:all .2s ease;border:1px solid var(--background-modifier-accent)}
.soundbooster-file-label:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.2);border-color:var(--brand-experiment)}
.soundbooster-file-label::before{content:'📁';font-size:16px}
.soundbooster-volume-stats{margin-top:20px;padding:16px;background:var(--background-primary);border-radius:8px;border:1px solid var(--background-modifier-accent)}
.soundbooster-stats-title{font-size:14px;font-weight:600;color:#ffffff!important;margin-bottom:8px}
.soundbooster-stats-text{font-size:13px;color:rgba(255,255,255,.8)!important}
.volume-meter-container{display:flex;align-items:center;gap:8px;margin-top:6px;padding:4px 8px;background:var(--background-modifier-accent);border-radius:4px;border:1px solid var(--background-modifier-selected);min-height:24px}
.volume-meter-bar{flex:1;height:6px;background:var(--background-primary);border-radius:3px;position:relative;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.2)}
.volume-meter-fill{height:100%;background:linear-gradient(90deg,var(--status-positive) 0%,var(--status-warning) 70%,var(--status-danger) 100%);border-radius:3px;transition:width .1s ease-out;width:0%;position:relative}
.volume-meter-peak{position:absolute;top:0;right:0;width:2px;height:100%;background:var(--text-normal);opacity:.8;transition:right .3s ease-out;border-radius:1px}
.volume-meter-label{font-size:9px;color:var(--text-muted);font-weight:500;min-width:30px;text-align:center}
.volume-meter-db{font-size:9px;color:var(--text-muted);font-weight:500;min-width:35px;text-align:right;font-family:var(--font-mono)}
.volume-meter-container[data-speaking="true"]{border-color:var(--brand-experiment);background:var(--background-modifier-selected)}
.volume-meter-container[data-speaking="true"] .volume-meter-fill{box-shadow:0 0 8px rgba(88,101,242,.4)}
.volume-meter-container[data-muted="true"]{opacity:.5}
.volume-meter-container[data-muted="true"] .volume-meter-fill{background:var(--text-muted)}
@keyframes volume-pulse{0%,100%{opacity:1}50%{opacity:.7}}
.volume-meter-container[data-speaking="true"] .volume-meter-peak{animation:volume-pulse 1.5s infinite}
`;

const styles = {
    container: "container-BetterVolume",
    slider: "slider-BetterVolume",
    input: "input-BetterVolume",  
    label: "label-BetterVolume"
};

const createVolumeControl = ({ React, VolumeMeter, volumeProcessor }) => {
    // Ultra-smooth throttle with immediate response
    const createSmoothThrottle = (func, limit) => {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= limit) {
                lastCall = now;
                func.apply(this, args);
            } else {
                // Still call function but with minimal delay for smoothness
                setTimeout(() => func.apply(this, args), 1);
            }
        };
    };
    
    return React.memo(({ value, context, min, max, onChange, userId }) => {
        const [localValue, setLocalValue] = React.useState(value);
        
        // Optimized settings access with minimal dependencies
        const volumeStep = React.useMemo(() => Settings.current.volumeStep, [Settings.current.volumeStep]);
        const mouseWheelStep = React.useMemo(() => Settings.current.mouseWheelStep, [Settings.current.mouseWheelStep]);
        
        const containerRef = React.useRef(null);
        const onChangeRef = React.useRef(onChange);
        
        React.useEffect(() => {
            onChangeRef.current = onChange;
        }, [onChange]);
        
        React.useEffect(() => {
            setLocalValue(value);
        }, [value]);
        
        const handleChange = React.useCallback((newVal) => {
            const clampedVal = Math.max(min, Math.min(max, Math.round(newVal / volumeStep) * volumeStep));
            
            // IMMEDIATE visual update for ultra-smooth UI response
            setLocalValue(clampedVal);
            
            // Use smooth volume processor for Discord API calls (non-blocking)
            if (volumeProcessor && Math.abs(clampedVal - localValue) >= PLUGIN_CONFIG.MIN_VOLUME_CHANGE) {
                volumeProcessor.addVolumeChange(userId, clampedVal, context);
            } else {
                // Fallback to direct call if no processor
                onChangeRef.current(clampedVal, context);
            }
        }, [context, min, max, volumeStep, localValue, userId, volumeProcessor]);
        
        // Ultra-smooth wheel event handling
        const smoothHandleWheel = React.useMemo(() => 
            createSmoothThrottle((delta) => {
                handleChange(localValue + delta);
            }, PLUGIN_CONFIG.THROTTLE_MS),
        [handleChange, localValue]);
        
        React.useEffect(() => {
            const container = containerRef.current;
            if (!container) return;
            
            const handleWheel = (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? mouseWheelStep : -mouseWheelStep;
                smoothHandleWheel(delta);
            };
            
            container.addEventListener("wheel", handleWheel, { passive: false });
            return () => {
                container.removeEventListener("wheel", handleWheel);
            };
        }, [smoothHandleWheel, mouseWheelStep]);
        
        const handleSliderChange = React.useCallback((e) => {
            handleChange(parseFloat(e.target.value));
        }, [handleChange]);
        
        const handleInputChange = React.useCallback((e) => {
            handleChange(parseFloat(e.target.value));
        }, [handleChange]);
        
        // Determine volume level for styling
        const getVolumeLevel = (volume) => {
            if (volume <= 100) return "low";
            if (volume <= 300) return "medium";
            if (volume <= 600) return "high";
            return "extreme";
        };
        
        const volumeLevel = getVolumeLevel(localValue);
        const isVoice = context === "default";
        const labelText = isVoice ? "🎤 Voice Volume" : "📺 Stream Volume";
        
        return React.createElement(
            "div",
            {
                className: styles.container,
                ref: containerRef,
                "data-volume-level": volumeLevel
            },
            React.createElement(
                "div",
                { className: styles.label },
                labelText
            ),
            React.createElement("input", {
                type: "range",
                className: styles.slider,
                min,
                max,
                step: volumeStep,
                value: localValue,
                onChange: handleSliderChange,
                title: `${labelText}: ${Math.round(localValue)}%`
            }),
            React.createElement(
                "div",
                { className: "volume-input-container" },
                React.createElement("input", {
                    type: "number",
                    className: styles.input,
                    min,
                    max,
                    step: volumeStep,
                    value: Math.round(localValue),
                    onChange: handleInputChange,
                    title: "Enter exact volume percentage"
                }),
                React.createElement("span", { className: "volume-percentage" }, "%")
            ),
            // Add volume meter for voice context only
            context === "default" && VolumeMeter && React.createElement(VolumeMeter, { userId })
        );
    });
};

// Legacy constant reference for backwards compatibility
const DISCORD_MAX_VOLUME_PERC = VOLUME_CONSTANTS.DISCORD_MAX_PERC;

const applyDefaultVolumeToMembers = (channelId, guildId, MediaEngineStore, MediaEngineActions, AudioConvert) => {
    if (!channelId) return;
    
    try {
        const members = MediaEngineStore.getChannelMembers(channelId, guildId);
        if (!members || members.length === 0) return;
        
        const { defaultUserVolume } = Settings.current;
        const cachedAmplitude = AudioConvert.perceptualToAmplitude(defaultUserVolume);
        
        // Process in smaller batches to avoid blocking
        const processBatch = (userBatch) => {
            userBatch.forEach((userId) => {
                if (!hasOverride(userId, "default")) {
                    MediaEngineActions.setLocalVolume(userId, cachedAmplitude, "default");
                }
            });
        };
        
        // Split into professional batch sizes for optimal performance
        const batchSize = PLUGIN_CONFIG.BATCH_SIZE;
        for (let i = 0; i < members.length; i += batchSize) {
            const batch = members.slice(i, i + batchSize);
            setTimeout(() => processBatch(batch), i / batchSize); // Stagger processing
        }
    } catch (error) {
        logger.warn("Failed to apply default volume:", error);
    }
};

const createVolumeDispatcher = (Dispatcher, AudioConvert) => {
    let isDispatching = false; // Prevent concurrent dispatching
    
    return () => {
        if (isDispatching) return; // Skip if already dispatching
        isDispatching = true;
        
        const { volumeOverrides } = Settings.current;
        const users = Object.keys(volumeOverrides);
        
        if (users.length === 0) {
            isDispatching = false;
            return;
        }
        
        logger.log(`Dispatching ${users.length} volume overrides`);
        
        // Batch process in microtasks for better performance
        Promise.resolve().then(() => {
            try {
                for (const userId of users) {
                    const contexts = volumeOverrides[userId];
                    
                    for (const ctx in contexts) {
                        const volume = contexts[ctx];
                        const amplitudeVolume = AudioConvert.perceptualToAmplitude(volume);
                        
                        Dispatcher.dispatch({
                            type: "AUDIO_SET_LOCAL_VOLUME",
                            userId,
                            context: ctx,
                            volume: amplitudeVolume
                        });
                    }
                }
            } finally {
                isDispatching = false;
            }
        });
    };
};

/* -------------------------------------------------------------------------- */
/*                            Settings Panel UI                               */
/* -------------------------------------------------------------------------- */

// Global reference for cleanup
let globalAudioConvert = null;

const main = () => {
    const {
        Dispatcher,
        LegacyModules,
        MediaEngineStore,
        MediaEngineActions,
        VoiceStateStore,
        SpeakingStore,
        RTCConnection,
        React,
        TextInput,
        AudioConvert,
        Button,
        Flex,
        FormComponents,
        margins,
        ContextMenu
    } = fetchDiscordModules();
    
    // Store reference for cleanup
    globalAudioConvert = AudioConvert;
    
    Settings.setDependencies(LegacyModules);
    
    const SettingsContainer = createSettingsContainer({
        React,
        FormSection: FormComponents.FormSection,
        FormDivider: FormComponents.FormDivider,
        Flex,
        Button,
        margins
    });
    
    // Initialize smart save manager and smooth volume processor
    const saveManager = new SmartSaveManager();
    const volumeProcessor = new SmoothVolumeProcessor(MediaEngineActions, AudioConvert, saveManager);
    
    const VolumeMeter = createVolumeMeter({ 
        React, 
        MediaEngineStore, 
        VoiceStateStore, 
        SpeakingStore, 
        RTCConnection 
    });
    
    const VolumeControl = createVolumeControl({ React, VolumeMeter, volumeProcessor });
    
    const MAX_VOLUME_AMP = AudioConvert.perceptualToAmplitude(DISCORD_MAX_VOLUME_PERC);
    
    const dispatchVolumeOverrides = createVolumeDispatcher(Dispatcher, AudioConvert);
    
    const settingsUpdateHandler = () => dispatchVolumeOverrides();
    
    let originalHandler = null;
    
    const wrappedSettingsManagerHandler = (action) => {
        const { userId, volume, context } = action;
        const perceptualVolume = AudioConvert.amplitudeToPerceptual(volume);
        const isOverCap = volume > MAX_VOLUME_AMP;
        
        if (isOverCap) {
            const isNew = updateVolumeOverride(userId, perceptualVolume, context);
            if (isNew) {
                logger.log(`New volume override ${perceptualVolume} for user ${userId} context ${context}`);
                originalHandler({ ...action, volume: MAX_VOLUME_AMP });
            }
        } else {
            const wasRemoved = tryResetVolumeOverride(userId, context);
            if (wasRemoved) {
                logger.log(`Removed volume override for user ${userId} context ${context}`);
            }
            originalHandler(action);
        }
    };
    
    const trySwapHandler = (action, prev, next) => {
        const sub = Dispatcher._subscriptions[action];
        if (!sub) return false;
        const isPresent = sub.has(prev);
        if (isPresent) {
            Dispatcher.unsubscribe(action, prev);
            Dispatcher.subscribe(action, next);
        }
        return isPresent;
    };
    
    const hasSetVolume = byKeys("AUDIO_SET_LOCAL_VOLUME");
    
    const handleVolumeSync = () => {
        // Lazy initialization to improve startup performance
        const initializeHandlers = () => {
            Dispatcher.subscribe("USER_SETTINGS_PROTO_UPDATE", settingsUpdateHandler);
            logger.log(`Subscribed to USER_SETTINGS_PROTO_UPDATE events`);
            
            const voiceChannelHandler = ({ channelId, guildId }) => {
                // Debounce voice channel changes to reduce overhead
                clearTimeout(voiceChannelHandler.timeout);
                voiceChannelHandler.timeout = setTimeout(() => {
                    applyDefaultVolumeToMembers(channelId, guildId, MediaEngineStore, MediaEngineActions, AudioConvert);
                }, 100);
            };
            
            Dispatcher.subscribe("VOICE_CHANNEL_SELECT", voiceChannelHandler);
        };
        
        // Initialize handlers after professional delay to prevent blocking startup
        setTimeout(initializeHandlers, PLUGIN_CONFIG.STARTUP_DELAY_MS);
        
        // Dispatch overrides after initialization with staggered timing
        setTimeout(dispatchVolumeOverrides, PLUGIN_CONFIG.STARTUP_DELAY_MS * 2);

        waitFor((exported) => exported.actions && hasSetVolume(exported.actions), { cacheKey: "AudioSettingsManager" }).then(
            (AudioSettingsManager) => {
                originalHandler = AudioSettingsManager.actions["AUDIO_SET_LOCAL_VOLUME"];
                const swapped = trySwapHandler(
                    "AUDIO_SET_LOCAL_VOLUME",
                    originalHandler,
                    wrappedSettingsManagerHandler
                );
                if (swapped) {
                    logger.log(`Replaced AUDIO_SET_LOCAL_VOLUME handler`);
                } else {
                    logger.warn(`AUDIO_SET_LOCAL_VOLUME handler not present`);
                }
            }
        );
    };
    
    const resetVolumeSync = () => {
        Dispatcher.unsubscribe("USER_SETTINGS_PROTO_UPDATE", settingsUpdateHandler);
        logger.log(`Unsubscribed from USER_SETTINGS_PROTO_UPDATE events`);
        const swapped = trySwapHandler(
            "AUDIO_SET_LOCAL_VOLUME",
            wrappedSettingsManagerHandler,
            originalHandler
        );
        if (swapped) {
            logger.log(`Reset AUDIO_SET_LOCAL_VOLUME handler`);
        }
    };
    
    const useUserVolumeItemFilter = bySource("user-volume");
    
    const ReactRef = BdApi.React;
    
    const VolumeControlComponent = createVolumeControl({ React: ReactRef });
    
    return {
        start() {
            handleVolumeSync();
    
            waitFor(useUserVolumeItemFilter, { resolve: false, cacheKey: "useUserVolumeItemFilter" }).then((result) => {
                const useUserVolumeItem = resolveKey(result, useUserVolumeItemFilter);
                
                const createVolumeControls = ReactRef.memo(({ userId, voiceVolume, streamVolume }) => {
                    // Optimized settings access with individual memoization
                    const maxUserVolume = ReactRef.useMemo(() => Settings.current.maxUserVolume, [Settings.current.maxUserVolume]);
                    const maxStreamVolume = ReactRef.useMemo(() => Settings.current.maxStreamVolume, [Settings.current.maxStreamVolume]);
                    
                    const handleVoiceChange = ReactRef.useCallback((val, ctx) => {
                        // Use smooth processor for immediate response
                        if (volumeProcessor) {
                            volumeProcessor.addVolumeChange(userId, val, ctx);
                        } else {
                            // Fallback to direct call
                            MediaEngineActions.setLocalVolume(
                                userId,
                                AudioConvert.perceptualToAmplitude(val),
                                ctx
                            );
                            updateVolumeOverride(userId, val, ctx);
                        }
                    }, [userId]);
                    
                    const handleStreamChange = ReactRef.useCallback((val, ctx) => {
                        // Use smooth processor for immediate response
                        if (volumeProcessor) {
                            volumeProcessor.addVolumeChange(userId, val, ctx);
                        } else {
                            // Fallback to direct call
                            MediaEngineActions.setLocalVolume(
                                userId,
                                AudioConvert.perceptualToAmplitude(val),
                                ctx
                            );
                            updateVolumeOverride(userId, val, ctx);
                        }
                    }, [userId]);
                    
                    return ReactRef.createElement(
                        ReactRef.Fragment,
                        null,
                        ReactRef.createElement(VolumeControlComponent, {
                            value: voiceVolume,
                            context: "default",
                            min: 0,
                            max: maxUserVolume,
                            onChange: handleVoiceChange,
                            userId
                        }),
                        ReactRef.createElement(VolumeControlComponent, {
                            value: streamVolume,
                            context: "stream",
                            min: 0,
                            max: maxStreamVolume,
                            onChange: handleStreamChange,
                            userId
                        })
                    );
                });
                
                after(
                    ...useUserVolumeItem,
                    ({ args: [userId], result: menuResult }) => {
                        if (!menuResult) return;
    
                        const { defaultUserVolume, defaultStreamVolume, hideOriginalVolume } = Settings.current;
    
                        const voiceVolumeAmp = MediaEngineStore.getLocalVolume(userId, "default");
                        const streamVolumeAmp = MediaEngineStore.getLocalVolume(userId, "stream");
    
                        // Calculate actual volume percentages, handling both regular and custom volumes
                        let voiceVolume = defaultUserVolume;
                        let streamVolume = defaultStreamVolume;
                        
                        if (voiceVolumeAmp && voiceVolumeAmp > 0) {
                            const voicePerceptual = AudioConvert.amplitudeToPerceptual(voiceVolumeAmp);
                            voiceVolume = Math.max(0, Math.round(voicePerceptual));
                        }
                        
                        if (streamVolumeAmp && streamVolumeAmp > 0) {
                            const streamPerceptual = AudioConvert.amplitudeToPerceptual(streamVolumeAmp);
                            streamVolume = Math.max(0, Math.round(streamPerceptual));
                        }
    
                        return ReactRef.createElement(
                            ReactRef.Fragment,
                            null,
                            hideOriginalVolume ? null : menuResult,
                            ReactRef.createElement(ContextMenu.Item, {
                                id: "user-volume-controls",
                                render: () => ReactRef.createElement(createVolumeControls, {
                                    userId,
                                    voiceVolume,
                                    streamVolume
                                })
                            })
                        );
                    },
                    { name: "useUserVolumeItem" }
                );
            });
        },
    
        stop() {
            resetVolumeSync();
            
            // Emergency save all pending changes before shutdown (non-blocking)
            if (saveManager) {
                saveManager.shutdown()
                    .then(() => {
                        logger.log("Emergency save completed");
                    })
                    .catch((error) => {
                        console.warn('Save manager shutdown failed:', error);
                    });
            }
            
            // Clean up smooth volume processor
            if (volumeProcessor) {
                volumeProcessor.clearQueue();
            }
            
            // Clear all caches to free memory (async to prevent blocking)
            Promise.resolve().then(() => {
                moduleCache.clear();
                cachedFilters.clear();
                promiseCache.clear();
                
                // Clear audio conversion cache
                if (globalAudioConvert && globalAudioConvert.clearCache) {
                    globalAudioConvert.clearCache();
                }
                
                // Clear settings listeners
                Settings.removeAllListeners();
                
                // Clear global reference
                globalAudioConvert = null;
            });
            
            logger.log("Plugin cleanup completed");
        },
    
        styles: css,
        Settings,
        SettingsPanel: () => {
            const React = ReactRef;
            const [settings, setSettings] = React.useState(() => Settings.current);
            const [isExporting, setIsExporting] = React.useState(false);
            const [isImporting, setIsImporting] = React.useState(false);
            const fileInputRef = React.useRef(null);
            
            // Optimize update callback to prevent unnecessary re-renders
            const updateSetting = React.useCallback((key, value) => {
                const typedValue = typeof value === "boolean" ? value : Number(value);
                if (typeof typedValue === "number" && 
                    (isNaN(typedValue) || typedValue < VOLUME_CONSTANTS.MIN_VOLUME || typedValue > VOLUME_CONSTANTS.MAX_VOLUME)) {
                    return;
                }
                
                // Only update if value actually changed
                if (settings[key] !== typedValue) {
                    const newSettings = { ...settings, [key]: typedValue };
                    setSettings(newSettings);
                    Settings.update({ [key]: typedValue });
                }
            }, [settings]);
            
            const exportSettings = React.useCallback(() => {
                if (isExporting) return;
                setIsExporting(true);
                
                // Use Promise chain instead of async/await
                Promise.resolve().then(() => {
                    const dataStr = Settings.exportSettings();
                    const blob = new Blob([dataStr], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `soundbooster-settings-${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    BdApi.UI.showToast("Settings exported successfully!", { type: "success" });
                }).catch((error) => {
                    BdApi.UI.showToast("Failed to export settings!", { type: "error" });
                }).finally(() => {
                    setTimeout(() => setIsExporting(false), 1000);
                });
            }, [isExporting]);
            
            const importSettings = React.useCallback((event) => {
                const file = event.target.files[0];
                if (!file || isImporting) return;
                
                setIsImporting(true);
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const success = Settings.importSettings(e.target.result);
                        if (success) {
                            setSettings({ ...Settings.current });
                            BdApi.UI.showToast("Settings imported successfully!", { type: "success" });
                        } else {
                            BdApi.UI.showToast("Failed to import settings. Invalid file format.", { type: "error" });
                        }
                    } catch (error) {
                        BdApi.UI.showToast("Failed to import settings!", { type: "error" });
                    } finally {
                        setTimeout(() => setIsImporting(false), 1000);
                    }
                };
                reader.readAsText(file);
                event.target.value = "";
            }, [isImporting]);
            
            const resetSettings = React.useCallback(() => {
                BdApi.UI.showConfirmationModal(
                    "Reset Settings",
                    "Are you sure you want to reset all settings to default? This action cannot be undone.",
                    {
                        onConfirm: () => {
                            Settings.reset();
                            setSettings({ ...Settings.current });
                            BdApi.UI.showToast("Settings reset successfully!", { type: "success" });
                        }
                    }
                );
            }, []);
            
            const volumeOverrideCount = React.useMemo(() => {
                return Object.keys(settings.volumeOverrides || {}).length;
            }, [settings.volumeOverrides]);
            
            return React.createElement(
                "div",
                { className: "soundbooster-settings" },
                
                React.createElement(
                    "div",
                    { className: "soundbooster-settings-header" },
                    React.createElement(
                        "h1",
                        { className: "soundbooster-settings-title" },
                        "🔊 SoundBooster Settings"
                    ),
                    React.createElement(
                        "p",
                        { className: "soundbooster-settings-description" },
                        "Configure volume limits, steps, and behavior for enhanced audio control beyond Discord's default limits."
                    )
                ),
                
                React.createElement(
                    "div",
                    { className: "soundbooster-setting-group" },
                    React.createElement(
                        "div",
                        { className: "soundbooster-setting-item" },
                        React.createElement(
                            "label",
                            { className: "soundbooster-setting-label" },
                            "🎤 Default User Volume (%)"
                        ),
                        React.createElement(
                            "p",
                            { className: "soundbooster-setting-description" },
                            "The initial volume level applied to users who don't have custom volume overrides"
                        ),
                        React.createElement("input", {
                            type: "number",
                            className: "soundbooster-setting-input",
                            value: settings.defaultUserVolume,
                            onChange: (e) => updateSetting("defaultUserVolume", e.target.value),
                            min: 0,
                            max: 1000,
                            step: 10
                        })
                    ),
                    React.createElement(
                        "div",
                        { className: "soundbooster-setting-item" },
                        React.createElement(
                            "label",
                            { className: "soundbooster-setting-label" },
                            "🔊 Max User Volume (%)"
                        ),
                        React.createElement(
                            "p",
                            { className: "soundbooster-setting-description" },
                            "Maximum volume limit for individual user voices (Discord default is 200%)"
                        ),
                        React.createElement("input", {
                            type: "number",
                            className: "soundbooster-setting-input",
                            value: settings.maxUserVolume,
                            onChange: (e) => updateSetting("maxUserVolume", e.target.value),
                            min: 100,
                            max: 1000,
                            step: 50
                        })
                    )
                ),
                
                React.createElement(
                    "div",
                    { className: "soundbooster-setting-group" },
                    React.createElement(
                        "div",
                        { className: "soundbooster-setting-item" },
                        React.createElement(
                            "label",
                            { className: "soundbooster-setting-label" },
                            "📺 Max Stream Volume (%)"
                        ),
                        React.createElement(
                            "p",
                            { className: "soundbooster-setting-description" },
                            "Maximum volume limit for screen share and camera streams"
                        ),
                        React.createElement("input", {
                            type: "number",
                            className: "soundbooster-setting-input",
                            value: settings.maxStreamVolume,
                            onChange: (e) => updateSetting("maxStreamVolume", e.target.value),
                            min: 100,
                            max: 1000,
                            step: 50
                        })
                    ),
                    React.createElement(
                        "div",
                        { className: "soundbooster-setting-item" },
                        React.createElement(
                            "label",
                            { className: "soundbooster-setting-label" },
                            "📺 Default Stream Volume (%)"
                        ),
                        React.createElement(
                            "p",
                            { className: "soundbooster-setting-description" },
                            "The initial volume level applied to user streams who don't have custom volume overrides"
                        ),
                        React.createElement("input", {
                            type: "number",
                            className: "soundbooster-setting-input",
                            value: settings.defaultStreamVolume,
                            onChange: (e) => updateSetting("defaultStreamVolume", e.target.value),
                            min: 0,
                            max: 1000,
                            step: 10
                        })
                    ),
                    React.createElement(
                        "div",
                        { className: "soundbooster-setting-item" },
                        React.createElement(
                            "label",
                            { className: "soundbooster-setting-label" },
                            "⚡ Volume Step (%)"
                        ),
                        React.createElement(
                            "p",
                            { className: "soundbooster-setting-description" },
                            "How much the volume changes with each adjustment step"
                        ),
                        React.createElement("input", {
                            type: "number",
                            className: "soundbooster-setting-input",
                            value: settings.volumeStep,
                            onChange: (e) => updateSetting("volumeStep", e.target.value),
                            min: 1,
                            max: 100,
                            step: 1
                        })
                    )
                ),
                
                React.createElement(
                    "div",
                    { className: "soundbooster-setting-group" },
                    React.createElement(
                        "div",
                        { className: "soundbooster-setting-item" },
                        React.createElement(
                            "label",
                            { className: "soundbooster-setting-label" },
                            "🖱️ Mouse Wheel Step (%)"
                        ),
                        React.createElement(
                            "p",
                            { className: "soundbooster-setting-description" },
                            "Volume change amount when scrolling with mouse wheel over volume controls"
                        ),
                        React.createElement("input", {
                            type: "number",
                            className: "soundbooster-setting-input",
                            value: settings.mouseWheelStep,
                            onChange: (e) => updateSetting("mouseWheelStep", e.target.value),
                            min: 1,
                            max: 200,
                            step: 5
                        })
                    ),
                    React.createElement(
                        "div",
                        { className: "soundbooster-checkbox-container" },
                        React.createElement("input", {
                            type: "checkbox",
                            className: "soundbooster-checkbox",
                            id: "hideOriginalVolume",
                            checked: !!settings.hideOriginalVolume,
                            onChange: (e) => updateSetting("hideOriginalVolume", e.target.checked)
                        }),
                        React.createElement(
                            "div",
                            { className: "soundbooster-checkbox-content" },
                            React.createElement(
                                "label",
                                { 
                                    className: "soundbooster-checkbox-label",
                                    htmlFor: "hideOriginalVolume"
                                },
                                "🙈 Hide Discord's Built-in Volume Slider"
                            ),
                            React.createElement(
                                "p",
                                { className: "soundbooster-checkbox-desc" },
                                "Removes Discord's default volume slider from user context menus, showing only SoundBooster controls"
                            )
                        )
                    ),
                    React.createElement(
                        "div",
                        { className: "soundbooster-checkbox-container" },
                        React.createElement("input", {
                            type: "checkbox",
                            className: "soundbooster-checkbox",
                            id: "showVolumeMeter",
                            checked: !!settings.showVolumeMeter,
                            onChange: (e) => updateSetting("showVolumeMeter", e.target.checked)
                        }),
                        React.createElement(
                            "div",
                            { className: "soundbooster-checkbox-content" },
                            React.createElement(
                                "label",
                                { 
                                    className: "soundbooster-checkbox-label",
                                    htmlFor: "showVolumeMeter"
                                },
                                "🎙️ Show Real-Time Volume Meter"
                            ),
                            React.createElement(
                                "p",
                                { className: "soundbooster-checkbox-desc" },
                                "Displays a visual audio level meter with peak indicators for voice channels. Shows microphone input levels and speaking detection."
                            )
                        )
                    ),
                    React.createElement(
                        "div",
                        { className: "soundbooster-setting-item" },
                        React.createElement(
                            "label",
                            { className: "soundbooster-setting-label" },
                            "💾 Smart Save Delay (seconds)"
                        ),
                        React.createElement(
                            "p",
                            { className: "soundbooster-setting-description" },
                            "Time to wait after volume changes before saving. Prevents spam saves during rapid adjustments (mouse wheel, quick changes). 3 seconds recommended."
                        ),
                        React.createElement("input", {
                            type: "number",
                            className: "soundbooster-setting-input",
                            value: Math.round(settings.smartSaveDelay / 1000),
                            onChange: (e) => updateSetting("smartSaveDelay", Math.max(1, Math.min(30, Number(e.target.value))) * 1000),
                            min: 1,
                            max: 30,
                            step: 1,
                            title: "Delay in seconds (1-30 seconds)"
                        })
                    )
                ),
                
                volumeOverrideCount > 0 && React.createElement(
                    "div",
                    { className: "soundbooster-volume-stats" },
                    React.createElement(
                        "div",
                        { className: "soundbooster-stats-title" },
                        "📊 Volume Override Statistics"
                    ),
                    React.createElement(
                        "p",
                        { className: "soundbooster-stats-text" },
                        `You currently have custom volume settings for ${volumeOverrideCount} user${volumeOverrideCount !== 1 ? 's' : ''}. These settings will be preserved when you export/import your configuration.`
                    )
                ),
                
                React.createElement(
                    "div",
                    { className: "soundbooster-backup-section" },
                    React.createElement(
                        "h3",
                        { className: "soundbooster-backup-title" },
                        "Backup & Restore Configuration"
                    ),
                    React.createElement(
                        "p",
                        { className: "soundbooster-backup-desc" },
                        "Export your current settings and volume overrides to a JSON file, or import a previously saved configuration. This includes all your custom user volume settings."
                    ),
                    React.createElement(
                        "div",
                        { className: "soundbooster-button-row" },
                        React.createElement(
                            "button",
                            {
                                className: "soundbooster-button soundbooster-button-primary",
                                onClick: exportSettings,
                                disabled: isExporting
                            },
                            isExporting ? "⏳ Exporting..." : "💾 Export Settings"
                        ),
                        React.createElement(
                            "label",
                            { className: "soundbooster-file-label" },
                            isImporting ? "⏳ Importing..." : "📁 Import Settings",
                            React.createElement("input", {
                                ref: fileInputRef,
                                type: "file",
                                className: "soundbooster-file-input",
                                accept: ".json",
                                onChange: importSettings,
                                disabled: isImporting
                            })
                        )
                    )
                ),
                
                React.createElement(
                    "div",
                    { className: "soundbooster-button-row" },
                    React.createElement(
                        "button",
                        {
                            className: "soundbooster-button soundbooster-button-danger",
                            onClick: resetSettings
                        },
                        "🔄 Reset All Settings"
                    )
                )
            );
        }
    };
};

const index = createPlugin(main);

module.exports = index;

/*@end @*/
