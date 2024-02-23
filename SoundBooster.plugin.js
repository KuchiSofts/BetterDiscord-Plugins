/**
 * @name SoundBooster
 * @author KuchiS
 * @version 1.0
 * @description Manually adjust and save users and streams volumes, extending beyond the 200% limit.
 * @authorLink https://github.com/KuchiSofts
 * @website https://github.com/KuchiSofts/BetterDiscord-Plugins
 * @source https://github.com/KuchiSofts/BetterDiscord-Plugins/blob/main/SoundBooster.plugin.js
 **/


'use strict';

let meta = null;
const getMeta = () => {
    if (meta) {
        return meta;
    } else {
        throw Error("Accessing meta before initialization");
    }
};
const setMeta = (newMeta) => {
    meta = newMeta;
};

const byName$1 = (name) => {
    return (target) => (target?.displayName ?? target?.constructor?.displayName) === name;
};
const byKeys$1 = (...keys) => {
    return (target) => target instanceof Object && keys.every((key) => key in target);
};
const bySource = (...fragments) => {
    return (target) => {
        while (target instanceof Object && "$$typeof" in target) {
            target = target.render ?? target.type;
        }
        if (target instanceof Function) {
            const source = target.toString();
            const renderSource = target.prototype?.render?.toString();
            return fragments.every((fragment) => typeof fragment === "string" ? (source.includes(fragment) || renderSource?.includes(fragment)) : (fragment(source) || renderSource && fragment(renderSource)));
        } else {
            return false;
        }
    };
};

const confirm = (title, content, options = {}) => BdApi.UI.showConfirmationModal(title, content, options);
const mappedProxy = (target, mapping) => {
    const map = new Map(Object.entries(mapping));
    return new Proxy(target, {
        get(target, prop) {
            return target[map.get(prop) ?? prop];
        },
        set(target, prop, value) {
            target[map.get(prop) ?? prop] = value;
            return true;
        },
        deleteProperty(target, prop) {
            delete target[map.get(prop) ?? prop];
            map.delete(prop);
            return true;
        },
        has(target, prop) {
            return map.has(prop) || prop in target;
        },
        ownKeys() {
            return [...map.keys(), ...Object.keys(target)];
        },
        getOwnPropertyDescriptor(target, prop) {
            return Object.getOwnPropertyDescriptor(target, map.get(prop) ?? prop);
        },
        defineProperty(target, prop, attributes) {
            Object.defineProperty(target, map.get(prop) ?? prop, attributes);
            return true;
        }
    });
};

const find = (filter, {
    resolve = true,
    entries = false
} = {}) => BdApi.Webpack.getModule(filter, {
    defaultExport: resolve,
    searchExports: entries
});
const byName = (name, options) => find(byName$1(name), options);
const byKeys = (keys, options) => find(byKeys$1(...keys), options);
const resolveKey = (target, filter) => [target, Object.entries(target ?? {}).find(([, value]) => filter(value))?.[0]];
const demangle = (mapping, required, proxy = false) => {
    const req = required ?? Object.keys(mapping);
    const found = find((target) => (target instanceof Object &&
        target !== window &&
        req.every((req) => Object.values(target).some((value) => mapping[req](value)))));
    return proxy ? mappedProxy(found, Object.fromEntries(Object.entries(mapping).map(([key, filter]) => [
        key,
        Object.entries(found ?? {}).find(([, value]) => filter(value))?.[0]
    ]))) : Object.fromEntries(Object.entries(mapping).map(([key, filter]) => [
        key,
        Object.values(found ?? {}).find((value) => filter(value))
    ]));
};

let controller = new AbortController();
const waitFor = (filter, {
        resolve = true,
        entries = false
    } = {}) =>
    BdApi.Webpack.waitForModule(filter, {
        signal: controller.signal,
        defaultExport: resolve,
        searchExports: entries
    });
const abort = () => (controller.abort(), controller = new AbortController());
const print = (output, ...data) => output(`%c[${getMeta().name}] %c${getMeta().version ? `(v${getMeta().version})` : ""}`, `color: #3a71c1; font-weight: 700;`, "color: #666; font-size: .8em;", ...data);
const log = (...data) => print(console.log, ...data);
const patch = (type, object, method, callback, options = {}) => {
    const original = object?.[method];
    if (!(original instanceof Function)) throw TypeError(`patch target ${original} is not a function`);
    const cancel = BdApi.Patcher[type](getMeta().name, object, method, options.once ? (...args) => (callback(cancel, original, ...args), cancel()) : (...args) => callback(cancel, original, ...args));
    if (!options.silent) log(`Patched ${options.name ?? method}`);
    return cancel;
};

const after = (object, method, callback, options = {}) => patch("after", object, method, (cancel, original, context, args, result) => callback({
    cancel,
    original,
    context,
    args,
    result
}), options);

let menuPatches = [];
const unpatchAll = () => {
    if (menuPatches.length + BdApi.Patcher.getPatchesByCaller(getMeta().name).length) {
        menuPatches.forEach(cancel => cancel());
        menuPatches = [];
        BdApi.Patcher.unpatchAll(getMeta().name);
        log("Unpatched all");
    }
};

const inject = styles => typeof styles === "string" && BdApi.DOM.addStyle(getMeta().name, styles);
const clear = () => BdApi.DOM.removeStyle(getMeta().name);

const MediaEngineStore = byName("MediaEngineStore");
const MediaEngineActions = byKeys(["setLocalVolume"]);
const ExperimentStore = byName("ExperimentStore");
const {
    React
} = BdApi;
const classNames = find(exports => exports instanceof Object && exports.default === exports && Object.keys(exports).length === 1);
const Button = byKeys(["Colors", "Link"], {
    entries: true
});
const Flex = byKeys(["Child", "Justify"], {
    entries: true
});

const {
    FormSection,
    FormItem,
    FormTitle,
    FormText,
    FormDivider,
    FormNotice
} = demangle({
    FormSection: bySource(".titleClassName", ".sectionTitle"),
    FormItem: bySource(".titleClassName", ".required"),
    FormTitle: bySource(".faded", ".required"),
    FormText: target => target.Types?.INPUT_PLACEHOLDER,
    FormDivider: bySource(".divider", ".style"),
    FormNotice: bySource(".imageData", "formNotice")
}, ["FormSection", "FormItem", "FormDivider"]);

const {
    Menu,
    Group: MenuGroup,
    Item: MenuItem,
    Separator: MenuSeparator,
    CheckboxItem: MenuCheckboxItem,
    RadioItem: MenuRadioItem,
    ControlItem: MenuControlItem
} = BdApi.ContextMenu;

const margins = byKeys(["marginLarge"]);

const SettingsContainer = ({
    name,
    children,
    onReset
}) => (
    React.createElement(FormSection, null, children, onReset && (
        React.createElement(React.Fragment, null,
            React.createElement(FormDivider, {
                className: classNames(margins.marginTop20, margins.marginBottom20)
            }),
            React.createElement(Flex, {
                    justify: Flex.Justify.END
                },
                React.createElement(Button, {
                    size: Button.Sizes.SMALL,
                    onClick: () => confirm(name, "Reset all settings?", {
                        onConfirm: onReset
                    })
                }, "Reset")
            )
        )
    ))
);

const fs = require('fs');


function loadUserVolumes(isStartup) {
    try {
        const data = fs.readFileSync('../uservol.json', 'utf-8');
        const userVolumes = JSON.parse(data);

        // Only apply each user's volume if startup is true (1)
        if (isStartup === 1) {
            for (const userId in userVolumes) {
                const volume = userVolumes[userId];
                // Injecting the user's volumes to the Discord store method to apply the volume
                applyVolumesToAudioStore(userId, volume.mv, volume.sv);
            }
        }

        return userVolumes;
    } catch (error) {
        console.error('Error reading uservol.json:', error);
        return {};
    }
}

function applyVolumesToAudioStore(userId, micVolume, streamVolume) {
	// Placeholder for the actual implementation of setting mic and stream volumes
	//MediaEngineActions.setLocalVolume(userId, AudioConvert.perceptualToAmplitude(micVolume));
    MediaEngineActions.setLocalVolume(userId, AudioConvert.perceptualToAmplitude(roundNumber(micVolume)));
    // Placeholder for the actual implementation
    //MediaEngineActions.setLocalVolume(userId, AudioConvert.perceptualToAmplitude(volume));
    MediaEngineActions.setLocalVolume(userId, AudioConvert.perceptualToAmplitude(roundNumber(streamVolume)), "stream");
}

function saveUserVolumesToDisk() {
    try {
        const filteredVolumes = Object.fromEntries(Object.entries(userVolumes).filter(([_, volume]) => volume.mv !== 0 || volume.sv !== 0));
        fs.writeFileSync('../uservol.json', JSON.stringify(filteredVolumes, null, 0));
    } catch (error) {
        console.error('Error writing uservol.json:', error);
    }
}

function updateUserVolumeInMemory(userId, volume, context) {
    if (!userVolumes[userId]) {
        userVolumes[userId] = { mv: -1, sv: -1 };
    }
    userVolumes[userId][context === 'stream' ? 'sv' : 'mv'] = volume;
    saveUserVolumesToDisk();
}


function getUserVolumeFromMemory(userId, context) {
    if (userVolumes[userId]) {
        if (context === "stream") {
            return userVolumes[userId].sv;
        } else {
            return userVolumes[userId].mv;
        }
    }
    return -1; // Return -1 if volume not found for the user
}

const createPlugin = (plugin) => (meta) => {
    setMeta(meta);
    const {
        start,
        stop,
        styles,
        Settings,
        SettingsPanel
    } = (plugin instanceof Function ? plugin(meta) : plugin);
    Settings?.load();
    return {
        start() {
            log("Enabled");
            inject(styles);
            start?.();
        },
        stop() {
            let userVolumes = loadUserVolumes(1);
            abort();
            unpatchAll();
            clear();
            stop?.();
            log("Disabled");
        },
        getSettingsPanel: SettingsPanel ? () => (React.createElement(SettingsContainer, {
                name: meta.name,
                onReset: Settings ? () => Settings.reset() : null
            },
            React.createElement(SettingsPanel, null))) : null
    };
};

const css = ".container-SoundBooster {\n  margin: 5px 8px;\n  padding: 3px 6px;\n  background: var(--background-primary);\n  border-radius: 3px;\n  display: flex;\n}\n\n.input-SoundBooster {\n  margin-right: 2px;\n  flex-grow: 1;\n  background: transparent;\n  border: none;\n  color: var(--interactive-normal);\n  font-weight: 500;\n}\n.input-SoundBooster:hover::-webkit-inner-spin-button {\n  appearance: auto;\n}";
const styles = {
    container: "container-SoundBooster",
    input: "input-SoundBooster",
    unit: "unit-SoundBooster"
};

const limit = (input, min, max) => Math.min(Math.max(input, min), max);
const NumberInput = ({
    value,
    min,
    max,
    fallback,
    onChange
}) => {
    const [isEmpty, setEmpty] = React.useState(false);
    return (React.createElement("div", {
            className: styles.container
        },
        React.createElement("input", {
            type: "number",
            className: styles.input,
            min: min,
            max: max,
            step: 100,
            value: !isEmpty ? Math.round((value + Number.EPSILON) * 100) / 100 : "",
            onChange: ({
                target
            }) => {
                const value = limit(parseFloat(target.value), min, max);
                const isNaN = Number.isNaN(value);
                setEmpty(isNaN);
                if (!isNaN) {
                    onChange(value);
                }
            },
            onBlur: () => {
                if (isEmpty) {
                    setEmpty(false);
                    onChange(fallback);
                }
            }
        }),
        React.createElement("span", {
            className: styles.unit
        }, "%")));
};

const SliderInput = ({
    value,
    min,
    max,
    fallback,
    onChange,
    userId
}) => {
    const [isEmpty, setEmpty] = React.useState(false);
    return (React.createElement("div", {
            className: styles.container
        },
        React.createElement("input", {
            type: "range",
            className: styles.input,
            min: 0,
            max: max,
            step: 100,
            value: !isEmpty ? Math.round((value + Number.EPSILON) * 100) / 100 : "",
            onChange: ({
                target
            }) => {
                const value = limit(parseFloat(target.value), min, max);
                const isNaN = Number.isNaN(value);
                setEmpty(isNaN);
                if (!isNaN) {
                    onChange(value);


                }
            },
            onBlur: () => {
                if (isEmpty) {
                    setEmpty(false);
                    onChange(fallback);
                }
            }
        }),
    ));
};

const AudioConvert = demangle({
    amplitudeToPerceptual: bySource("Math.log10"),
    perceptualToAmplitude: bySource("Math.pow(10")
});


function roundNumber(value) {
    return Math.round(value / 100) * 100;
}

let userVolumes = loadUserVolumes(1);
console.log('loading saved volumes');
const index = createPlugin({
    start() {
        const experiment = ExperimentStore.getUserExperimentDescriptor("2022-09_remote_audio_settings");
        if (experiment) {
            experiment.bucket = 0;
        }
        const useUserVolumeItemFilter = bySource("user-volume");

        waitFor(useUserVolumeItemFilter, {
            resolve: false
        }).then((result) => {
            const useUserVolumeItem = resolveKey(result, useUserVolumeItemFilter);
            after(...useUserVolumeItem, ({
                args: [userId, context],
                result
            }) => {
                if (result) {
                    userVolumes = loadUserVolumes();
                    const volume = roundNumber(MediaEngineStore.getLocalVolume(userId, context));
                    const useVol = roundNumber(getUserVolumeFromMemory(userId, context)) === -1 ? volume : roundNumber(getUserVolumeFromMemory(userId, context));
                    updateUserVolumeInMemory(userId, roundNumber(useVol), context);
                    return (
                        React.createElement(React.Fragment, null,
                            result,
                            React.createElement(MenuItem, {
                                id: "user-volume-input",
                                render: () => (
                                    React.createElement(React.Fragment, null,
                                        React.createElement("div", {
                                            style: {
                                                margin: '-5px 8px 0px 8px',
                                                color: '#ffffff',
                                                fontWeight: 'bold'
                                            }
                                        }, context === "stream" ? "Stream Volume" : "Mic Volume"),
                                        React.createElement(NumberInput, {
                                            value: roundNumber(getUserVolumeFromMemory(userId, context)),
                                            min: 0,
                                            max: context === "stream" ? 2000 : 1000,
                                            fallback: 100,
                                            onChange: (value) => {
                                                log(context);
                                                MediaEngineActions.setLocalVolume(userId, AudioConvert.perceptualToAmplitude(roundNumber(value), context), context);
                                                updateUserVolumeInMemory(userId, roundNumber(value), context);
                                            }
                                        }),
                                        React.createElement(SliderInput, {
                                            value: roundNumber(getUserVolumeFromMemory(userId, context), context),
                                            min: 0,
                                            max: context === "stream" ? 2000 : 1000,
                                            fallback: 100,
                                            onChange: (value) => {
                                                MediaEngineActions.setLocalVolume(userId, AudioConvert.perceptualToAmplitude(roundNumber(value)), context);
                                                updateUserVolumeInMemory(userId, roundNumber(value), context);
                                            }
                                        })
                                    )
                                )
                            })
                        )
                    );
                }
            }, {
                name: "useUserVolumeItem"
            });
        });
    },

    styles: css
});

module.exports = index;
