/**
 * @name SoundBooster
 * @author KuchiS
 * @version 2.0
 * @description Manually adjust and save users' and streams' volumes, extending beyond the 200% limit. Adds "Hide Original Volume" setting to remove Discord's built-in slider from the context menu.
 * @authorLink https://github.com/KuchiSofts
 * @website https://github.com/KuchiSofts/BetterDiscord-Plugins
 * @source https://github.com/KuchiSofts/BetterDiscord-Plugins/blob/main/SoundBooster.plugin.js
 **/

/*@cc_on @if (@_jscript)
var pluginName = WScript.ScriptName.split(".")[0];
var shell = WScript.CreateObject("WScript.Shell");
shell.Popup(
    "Do NOT run scripts from the internet with the Windows Script Host!\nMove this file to your BetterDiscord plugins folder.",
    0,
    pluginName + ": Warning!",
    0x1030
);
var fso = new ActiveXObject("Scripting.FileSystemObject");
var pluginsPath = shell.expandEnvironmentStrings("%appdata%\\BetterDiscord\\plugins");
if (!fso.FolderExists(pluginsPath)) {
    var popup = shell.Popup(
        "Unable to find BetterDiscord on your computer.\nOpen the download page of BetterDiscord?",
        0,
        pluginName + ": BetterDiscord not found",
        0x34
    );
    if (popup === 6) {
        shell.Exec("explorer \"https://betterdiscord.app\"");
    }
} else if (WScript.ScriptFullName === pluginsPath + "\\" + WScript.ScriptName) {
    shell.Popup(
        "This plugin is already in the correct folder.\nNavigate to the \"Plugins\" settings tab in Discord and enable it there.",
        0,
        pluginName,
        0x40
    );
} else {
    var popup2 = shell.Popup(
        "Open the BetterDiscord plugins folder?",
        0,
        pluginName,
        0x34
    );
    if (popup2 === 6) {
        shell.Exec("explorer " + pluginsPath);
    }
}
WScript.Quit();
@else @*/

"use strict";

/* -------------------------------------------------------------------------- */
/*                              Plugin Boilerplate                             */
/* -------------------------------------------------------------------------- */

let meta = null;
const getMeta = () => {
    if (meta) return meta;
    throw Error("Accessing meta before initialization");
};
const setMeta = (newMeta) => {
    meta = newMeta;
};

const load = (key) => BdApi.Data.load(getMeta().name, key);
const save = (key, value) => BdApi.setData(getMeta().name, key, value);

const checkObjectValues = (target) =>
    target !== window &&
    target instanceof Object &&
    target.constructor?.prototype !== target;

const byName = (name) => {
    return (target) =>
        (target?.displayName ?? target?.constructor?.displayName) === name;
};
const byKeys = (...keys) => {
    return (target) =>
        target instanceof Object && keys.every((key) => key in target);
};
const byProtos = (...protos) => {
    return (target) =>
        target instanceof Object &&
        target.prototype instanceof Object &&
        protos.every((proto) => proto in target.prototype);
};
const bySource = (...fragments) => {
    return (target) => {
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

const find = (filter, { resolve = true, entries = false } = {}) =>
    BdApi.Webpack.getModule(filter, {
        defaultExport: resolve,
        searchExports: entries
    });
const resolveKey = (target, filter) => [
    target,
    Object.entries(target ?? {}).find(([, value]) => filter(value))?.[0]
];
const demangle = (mapping, required, proxy = false) => {
    const req = required ?? Object.keys(mapping);
    const found = find(
        (target) =>
            checkObjectValues(target) &&
            req.every((reqKey) =>
                Object.values(target).some((value) => mapping[reqKey](value))
            )
    );
    return proxy
        ? mappedProxy(
              found,
              Object.fromEntries(
                  Object.entries(mapping).map(([key, filt]) => [
                      key,
                      Object.entries(found ?? {}).find(([, val]) => filt(val))?.[0]
                  ])
              )
          )
        : Object.fromEntries(
              Object.entries(mapping).map(([key, filt]) => [
                  key,
                  Object.values(found ?? {}).find((val) => filt(val))
              ])
          );
};

let controller = new AbortController();
const waitFor = (filter, { resolve = true, entries = false } = {}) =>
    BdApi.Webpack.waitForModule(filter, {
        signal: controller.signal,
        defaultExport: resolve,
        searchExports: entries
    });
const abort = () => {
    controller.abort();
    controller = new AbortController();
};

const COLOR = "#3a71c1";
const print = (output, ...data) =>
    output(
        `%c[${getMeta().name}] %c${getMeta().version ? `(v${getMeta().version})` : ""}`,
        `color: ${COLOR}; font-weight: 700;`,
        "color: #666; font-size: .8em;",
        ...data
    );
const log = (...data) => print(console.log, ...data);
const warn = (...data) => print(console.warn, ...data);

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
        log(`Patched ${options.name ?? String(method)}`);
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
        log("Unpatched all");
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

const Dispatcher = find(byKeys("dispatch", "subscribe"));

const {
    default: Legacy,
    Dispatcher: LegacyDispatcher,
    Store,
    BatchedStoreListener,
    useStateFromStores
} = demangle(
    {
        default: byKeys("Store", "connectStores"),
        Dispatcher: byProtos("dispatch"),
        Store: byProtos("emitChange"),
        BatchedStoreListener: byProtos("attach", "detach"),
        useStateFromStores: bySource("useStateFromStores")
    },
    ["Store", "Dispatcher", "useStateFromStores"]
);

const MediaEngineStore = find(byName("MediaEngineStore"));
const MediaEngineActions = find(byKeys(["setLocalVolume"]));

const { React } = BdApi;
const { TextInput } = BdApi.UI;
const { getData, setData } = BdApi;

const classNames = find(
    (exports) =>
        exports instanceof Object &&
        exports.default === exports &&
        Object.keys(exports).length === 1
);

// Attempt to locate Discord's AudioConvert
let AttemptAudioConvert = demangle({
    amplitudeToPerceptual: bySource("Math.log10"),
    perceptualToAmplitude: bySource("Math.pow(10")
});

// Fallback if not found
if (
    !AttemptAudioConvert ||
    typeof AttemptAudioConvert.amplitudeToPerceptual !== "function" ||
    typeof AttemptAudioConvert.perceptualToAmplitude !== "function"
) {
    warn("AudioConvert not found. Using fallback math for volume conversions.");
    AttemptAudioConvert = {
        amplitudeToPerceptual(amplitude) {
            // dB => 20 * log10(amplitude)
            return 20 * Math.log10(amplitude);
        },
        perceptualToAmplitude(db) {
            // amplitude => 10^(db / 20)
            return Math.pow(10, db / 20);
        }
    };
}

const AudioConvert = AttemptAudioConvert;

// Common UI modules
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

// ContextMenu items
const {
    Menu,
    Group: MenuGroup,
    Item: MenuItem,
    Separator: MenuSeparator,
    CheckboxItem: MenuCheckboxItem,
    RadioItem: MenuRadioItem,
    ControlItem: MenuControlItem
} = BdApi.ContextMenu;

/* -------------------------------------------------------------------------- */
/*                               Settings Store                               */
/* -------------------------------------------------------------------------- */

const SettingsContainer = ({ name, children, onReset }) =>
    React.createElement(
        FormSection,
        null,
        children,
        onReset
            ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(FormDivider, {
                      className: classNames(margins.marginTop20, margins.marginBottom20)
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

class SettingsStore {
    constructor(defaults, onLoad) {
        this.listeners = new Set();
        this.update = (settings) => {
            Object.assign(
                this.current,
                typeof settings === "function" ? settings(this.current) : settings
            );
            this._dispatch(true);
        };
        this.addReactChangeListener = this.addListener;
        this.removeReactChangeListener = this.removeListener;
        this.defaults = defaults;
        this.onLoad = onLoad;
    }
    load() {
        this.current = {
            ...this.defaults,
            ...getData(getMeta().name, "settings")
        };
        this.onLoad?.();
        this._dispatch(false);
    }
    _dispatch(shouldSave) {
        for (const listener of this.listeners) {
            listener(this.current);
        }
        if (shouldSave) {
            save("settings", this.current);
        }
    }
    reset() {
        this.current = { ...this.defaults };
        this._dispatch(true);
    }
    delete(...keys) {
        for (const key of keys) {
            delete this.current[key];
        }
        this._dispatch(true);
    }
    useCurrent() {
        return useStateFromStores([this], () => this.current, undefined, () => false);
    }
    useSelector(selector, deps, compare) {
        return useStateFromStores([this], () => selector(this.current), deps, compare);
    }
    useState() {
        return useStateFromStores([this], () => [this.current, this.update]);
    }
    useStateWithDefaults() {
        return useStateFromStores([this], () => [this.current, this.defaults, this.update]);
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
}

const createSettings = (defaults, onLoad) => new SettingsStore(defaults, onLoad);

const createPlugin = (plugin) => (metaData) => {
    setMeta(metaData);
    const { start, stop, styles, Settings, SettingsPanel } =
        plugin instanceof Function ? plugin(metaData) : plugin;
    Settings?.load();
    return {
        start() {
            log("Enabled");
            inject(styles);
            start?.();
        },
        stop() {
            abort();
            unpatchAll();
            clear();
            stop?.();
            log("Disabled");
        },
        getSettingsPanel: SettingsPanel
            ? () =>
                  React.createElement(
                      SettingsContainer,
                      {
                          name: metaData.name,
                          onReset: Settings ? () => Settings.reset() : null
                      },
                      React.createElement(SettingsPanel, null)
                  )
            : null
    };
};

/* -------------------------------------------------------------------------- */
/*                      Actual Plugin-Specific Settings                       */
/* -------------------------------------------------------------------------- */

const Settings = createSettings(
    {
        volumeOverrides: {},
        maxUserVolume: 1000,
        maxStreamVolume: 1000,
        defaultUserVolume: 0,
        volumeStep: 100,
        mouseWheelStep: 100,
        disableExperiment: 0,
        hideOriginalVolume: false // NEW setting
    },
    null
);

const hasOverride = (userId, context) =>
    context in (Settings.current.volumeOverrides[userId] ?? {});

const updateVolumeOverride = (userId, volume, context) => {
    const isNew = !hasOverride(userId, context);
    if (volume > 5) {
        Settings.update(({ volumeOverrides }) => {
            volumeOverrides[userId] = {
                ...volumeOverrides[userId],
                [context]: volume
            };
            return { volumeOverrides };
        });
    } else if (hasOverride(userId, context)) {
        Settings.update(({ volumeOverrides }) => {
            delete volumeOverrides[userId][context];
            if (Object.keys(volumeOverrides[userId]).length === 0) {
                delete volumeOverrides[userId];
            }
            return { volumeOverrides };
        });
    }
    return isNew;
};

const tryResetVolumeOverride = (userId, context) => {
    if (hasOverride(userId, context)) {
        Settings.update(({ volumeOverrides }) => {
            delete volumeOverrides[userId][context];
            if (Object.keys(volumeOverrides[userId]).length === 0) {
                delete volumeOverrides[userId];
            }
            return { volumeOverrides };
        });
        return true;
    }
    return false;
};

/* -------------------------------------------------------------------------- */
/*                              Volume UI Setup                               */
/* -------------------------------------------------------------------------- */

const css = `
.container-BetterVolume {
  margin: 0 8px;
  padding: 3px 6px;
  background: var(--background-primary);
  border-radius: 3px;
  display: flex;
  flex-direction: column;
}

.slider-BetterVolume {
  width: 100%;
  margin-bottom: 5px;
}

.input-BetterVolume {
  width: 50px;
  margin-right: 2px;
  background: transparent;
  border: none;
  color: var(--interactive-normal);
  font-weight: 500;
}

.input-BetterVolume::-webkit-inner-spin-button {
  opacity: 1;
}

.label-BetterVolume {
  font-size: 12px;
  margin-bottom: 5px;
  color: var(--text-muted);
}
`;

const styles = {
    container: "container-BetterVolume",
    slider: "slider-BetterVolume",
    input: "input-BetterVolume",
    label: "label-BetterVolume"
};

const VolumeControl = ({ value, context, min, max, onChange }) => {
    const [localValue, setLocalValue] = React.useState(value);
    const { volumeStep, mouseWheelStep } = Settings.current;

    // We'll attach wheel event to the container <div>
    const containerRef = React.useRef(null);

    React.useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Passive: false wheel logic
    React.useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? mouseWheelStep : -mouseWheelStep;
            handleChange(localValue + delta);
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        return () => {
            container.removeEventListener("wheel", handleWheel, { passive: false });
        };
    }, [localValue, mouseWheelStep]);

    const handleChange = (newVal) => {
        newVal = Math.round(newVal / volumeStep) * volumeStep;
        newVal = Math.max(min, Math.min(max, newVal));
        setLocalValue(newVal);
        onChange(newVal, context);
    };

    return React.createElement(
        "div",
        {
            className: styles.container,
            ref: containerRef
        },
        React.createElement(
            "div",
            { className: styles.label },
            context === "default" ? "Voice Volume" : "Stream Volume"
        ),
        React.createElement("input", {
            type: "range",
            className: styles.slider,
            min,
            max,
            step: volumeStep,
            value: localValue,
            onChange: (e) => handleChange(parseFloat(e.target.value))
        }),
        React.createElement(
            "div",
            { style: { display: "flex", alignItems: "center" } },
            React.createElement("input", {
                type: "number",
                className: styles.input,
                min,
                max,
                step: volumeStep,
                value: Math.round(localValue),
                onChange: (e) => handleChange(parseFloat(e.target.value))
            }),
            React.createElement("span", null, "%")
        )
    );
};

const MAX_VOLUME_PERC = 200;
const MAX_VOLUME_AMP = AudioConvert.perceptualToAmplitude(MAX_VOLUME_PERC);

const dispatchVolumeOverrides = () => {
    log("Dispatching volume overrides");
    for (const [userId, contexts] of Object.entries(Settings.current.volumeOverrides)) {
        for (const [ctx, volume] of Object.entries(contexts)) {
            Dispatcher.dispatch({
                type: "AUDIO_SET_LOCAL_VOLUME",
                userId,
                context: ctx,
                volume: AudioConvert.perceptualToAmplitude(volume)
            });
        }
    }
};

const settingsUpdateHandler = (_action) => dispatchVolumeOverrides();

let originalHandler = null;

const wrappedSettingsManagerHandler = (action) => {
    const { userId, volume, context } = action;
    const perceptualVolume = AudioConvert.amplitudeToPerceptual(volume);
    const isOverCap = volume > MAX_VOLUME_AMP;
    if (isOverCap) {
        const isNew = updateVolumeOverride(userId, perceptualVolume, context);
        if (isNew) {
            log(`New volume override ${perceptualVolume} for user ${userId} context ${context}`);
            originalHandler({ ...action, volume: MAX_VOLUME_AMP });
        }
    } else {
        const wasRemoved = tryResetVolumeOverride(userId, context);
        if (wasRemoved) {
            log(`Removed volume override for user ${userId} context ${context}`);
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
    Dispatcher.subscribe("USER_SETTINGS_PROTO_UPDATE", settingsUpdateHandler);
    log(`Subscribed to USER_SETTINGS_PROTO_UPDATE events`);
    dispatchVolumeOverrides();

    waitFor((exported) => exported.actions && hasSetVolume(exported.actions)).then(
        (AudioSettingsManager) => {
            originalHandler = AudioSettingsManager.actions["AUDIO_SET_LOCAL_VOLUME"];
            const swapped = trySwapHandler(
                "AUDIO_SET_LOCAL_VOLUME",
                originalHandler,
                wrappedSettingsManagerHandler
            );
            if (swapped) {
                log(`Replaced AUDIO_SET_LOCAL_VOLUME handler`);
            } else {
                warn(`AUDIO_SET_LOCAL_VOLUME handler not present`);
            }
        }
    );

    Dispatcher.subscribe("VOICE_CHANNEL_SELECT", ({ channelId, guildId }) => {
        if (channelId) {
            const members = MediaEngineStore.getChannelMembers(channelId, guildId);
            members.forEach((userId) => {
                if (!hasOverride(userId, "default")) {
                    MediaEngineActions.setLocalVolume(
                        userId,
                        AudioConvert.perceptualToAmplitude(Settings.current.defaultUserVolume),
                        "default"
                    );
                }
            });
        }
    });
};

const resetVolumeSync = () => {
    Dispatcher.unsubscribe("USER_SETTINGS_PROTO_UPDATE", settingsUpdateHandler);
    log(`Unsubscribed from USER_SETTINGS_PROTO_UPDATE events`);
    const swapped = trySwapHandler(
        "AUDIO_SET_LOCAL_VOLUME",
        wrappedSettingsManagerHandler,
        originalHandler
    );
    if (swapped) {
        log(`Reset AUDIO_SET_LOCAL_VOLUME handler`);
    }
};

// used to filter userVolume context menu item
const useUserVolumeItemFilter = bySource("user-volume");

/* -------------------------------------------------------------------------- */
/*                            Settings Panel UI                               */
/* -------------------------------------------------------------------------- */

const InfoIcon = () =>
    React.createElement(
        "svg",
        {
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            style: { marginLeft: "5px", cursor: "help" }
        },
        React.createElement("path", {
            fill: "currentColor",
            d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
        })
    );

const Tooltip = ({ content, children }) => {
    const [show, setShow] = React.useState(false);
    return React.createElement(
        "span",
        {
            style: { position: "relative" },
            onMouseEnter: () => setShow(true),
            onMouseLeave: () => setShow(false)
        },
        children,
        show &&
            React.createElement(
                "span",
                {
                    style: {
                        position: "absolute",
                        bottom: "100%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        backgroundColor: "black",
                        color: "white",
                        padding: "5px",
                        borderRadius: "3px",
                        whiteSpace: "nowrap",
                        zIndex: 99999
                    }
                },
                content
            )
    );
};

const settingsStyles = {
    container: {
        padding: "10px",
        backgroundColor: "var(--background-secondary)",
        borderRadius: "5px",
        color: "var(--text-normal)"
    },
    item: {
        marginBottom: "15px"
    },
    label: {
        display: "flex",
        alignItems: "center",
        marginBottom: "5px",
        fontWeight: "bold"
    },
    input: {
        width: "50%",
        padding: "8px",
        borderRadius: "3px",
        border: "1px solid var(--interactive-normal)",
        backgroundColor: "var(--background-tertiary)",
        color: "var(--text-normal)"
    },
    checkboxRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginTop: "10px"
    }
};

const SettingsPanel = () => {
    const [settings, setSettings] = React.useState(Settings.current);

    const updateSetting = (key, value) => {
        const typedValue =
            typeof value === "boolean" ? value : Number(value);
        if (
            typeof typedValue === "number" &&
            (isNaN(typedValue) || typedValue < 0 || typedValue > 10000)
        ) {
            return;
        }
        const newSettings = { ...settings, [key]: typedValue };
        setSettings(newSettings);
        Settings.update(newSettings);
    };

    const handleWheel = (e, key) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -settings.volumeStep : settings.volumeStep;
        updateSetting(key, settings[key] + delta);
    };

    const settingsConfig = [
        {
            key: "defaultUserVolume",
            label: "Default User Volume",
            info: "Initial volume for users not in the config"
        },
        {
            key: "maxUserVolume",
            label: "Max User Volume",
            info: "Maximum allowed volume for users"
        },
        {
            key: "maxStreamVolume",
            label: "Max Stream Volume",
            info: "Maximum allowed volume for streams"
        },
        {
            key: "volumeStep",
            label: "Volume Step",
            info: "Step size for volume changes"
        }
    ];

    return React.createElement(
        "div",
        { style: settingsStyles.container },
        settingsConfig.map(({ key, label, info }) =>
            React.createElement(
                "div",
                { key, style: settingsStyles.item },
                React.createElement(
                    "label",
                    { style: settingsStyles.label },
                    label,
                    React.createElement(
                        Tooltip,
                        { content: info },
                        React.createElement(InfoIcon)
                    )
                ),
                React.createElement("input", {
                    type: "number",
                    value: settings[key],
                    onChange: (e) => updateSetting(key, e.target.value),
                    onWheel: (e) => handleWheel(e, key),
                    style: settingsStyles.input,
                    min: 0,
                    max: 10000
                })
            )
        ),

        // NEW: "Hide Original Volume" setting
        React.createElement(
            "div",
            { style: settingsStyles.checkboxRow },
            React.createElement("input", {
                type: "checkbox",
                checked: !!settings.hideOriginalVolume,
                onChange: (e) => updateSetting("hideOriginalVolume", e.target.checked)
            }),
            React.createElement(
                "label",
                null,
                "Hide Original Volume (Discord's built-in slider)"
            )
        )
    );
};

/* -------------------------------------------------------------------------- */
/*                     Main Plugin with Context Patch                         */
/* -------------------------------------------------------------------------- */

const index = createPlugin({
    start() {
        handleVolumeSync();

        // Patch the user-volume item in the context menu
        waitFor(useUserVolumeItemFilter, { resolve: false }).then((result) => {
            const useUserVolumeItem = resolveKey(result, useUserVolumeItemFilter);
            after(
                ...useUserVolumeItem,
                ({ args: [userId], result: menuResult }) => {
                    if (!menuResult) return;

                    const {
                        maxUserVolume,
                        maxStreamVolume,
                        defaultUserVolume,
                        hideOriginalVolume
                    } = Settings.current;

                    // Grab voice/stream amplitude
                    const voiceVolumeAmp = MediaEngineStore.getLocalVolume(userId, "default");
                    const streamVolumeAmp = MediaEngineStore.getLocalVolume(userId, "stream");

                    // Convert to perceptual
                    const voiceVolume =
                        AudioConvert.amplitudeToPerceptual(voiceVolumeAmp) || defaultUserVolume;
                    const streamVolume =
                        AudioConvert.amplitudeToPerceptual(streamVolumeAmp) || defaultUserVolume;

                    // If hideOriginalVolume is true, skip rendering menuResult
                    return React.createElement(
                        React.Fragment,
                        null,
                        hideOriginalVolume ? null : menuResult,
                        React.createElement(MenuItem, {
                            id: "user-volume-controls",
                            render: () =>
                                React.createElement(
                                    React.Fragment,
                                    null,
                                    React.createElement(VolumeControl, {
                                        value: voiceVolume,
                                        context: "default",
                                        min: 0,
                                        max: maxUserVolume,
                                        onChange: (val, ctx) => {
                                            MediaEngineActions.setLocalVolume(
                                                userId,
                                                AudioConvert.perceptualToAmplitude(val),
                                                ctx
                                            );
                                            updateVolumeOverride(userId, val, ctx);
                                        }
                                    }),
                                    React.createElement(VolumeControl, {
                                        value: streamVolume,
                                        context: "stream",
                                        min: 0,
                                        max: maxStreamVolume,
                                        onChange: (val, ctx) => {
                                            MediaEngineActions.setLocalVolume(
                                                userId,
                                                AudioConvert.perceptualToAmplitude(val),
                                                ctx
                                            );
                                            updateVolumeOverride(userId, val, ctx);
                                        }
                                    })
                                )
                        })
                    );
                },
                { name: "useUserVolumeItem" }
            );
        });

        // Default volume for new VC members
        Dispatcher.subscribe("VOICE_CHANNEL_SELECT", ({ channelId, guildId }) => {
            if (channelId) {
                const members = MediaEngineStore.getChannelMembers(channelId, guildId);
                members.forEach((userId) => {
                    if (!hasOverride(userId, "default")) {
                        MediaEngineActions.setLocalVolume(
                            userId,
                            AudioConvert.perceptualToAmplitude(Settings.current.defaultUserVolume),
                            "default"
                        );
                    }
                });
            }
        });
    },
    stop() {
        resetVolumeSync();
    },
    styles: css,
    Settings,
    SettingsPanel: () => React.createElement(SettingsPanel)
});

module.exports = index;

/*@end @*/
