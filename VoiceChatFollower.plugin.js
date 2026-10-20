/**
 * @name VoiceChatFollower
 * @author KuchiS
 * @version 1.2.0
 * @description Adds a "Follow User" option to the user context menu that automatically moves you into whichever voice channel that user joins.
 * @authorLink https://github.com/KuchiSofts
 * @website https://github.com/KuchiSofts/BetterDiscord-Plugins
 * @source https://github.com/KuchiSofts/BetterDiscord-Plugins/blob/main/VoiceChatFollower.plugin.js
 * @updateUrl https://github.com/KuchiSofts/BetterDiscord-Plugins/raw/main/VoiceChatFollower.plugin.js
 **/

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

const byName = (name) => {
    return (target) => (target?.displayName ?? target?.constructor?.displayName) === name;
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

const find = (filter, {
    resolve = true,
    entries = false
} = {}) => BdApi.Webpack.getModule(filter, {
    defaultExport: resolve,
    searchExports: entries
});
const byName$1 = (name, options) => find(byName(name), options);
const resolveKey = (target, filter) => [target, Object.entries(target ?? {}).find(([, value]) => filter(value))?.[0]];

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
const abort = () => {
    controller.abort();
    controller = new AbortController();
};
const print = (output, ...data) => output(`%c[${getMeta().name}] %c${getMeta().version ? `(v${getMeta().version})` : ""}`, `color: #3a71c1; font-weight: 700;`, "color: #666; font-size: .8em;", ...data);
const log = (...data) => print(console.log, ...data);
const patch = (type, object, method, callback, options = {}) => {
    const original = object?.[method];
    if (!(original instanceof Function)) throw TypeError(`patch target ${original} is not a function`);
    const cancel = BdApi.Patcher[type](getMeta().name, object, method, options.once ? (...args) => {
        callback(cancel, original, ...args);
        cancel();
    } : (...args) => callback(cancel, original, ...args));
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

const unpatchAll = () => {
    BdApi.Patcher.unpatchAll(getMeta().name);
    log("Unpatched all");
};

const inject = styles => typeof styles === "string" && BdApi.DOM.addStyle(getMeta().name, styles);
const clear = () => BdApi.DOM.removeStyle(getMeta().name);

const { React } = BdApi;

const {
    CheckboxItem: MenuCheckboxItem,
} = BdApi.ContextMenu;

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_CONFIG = {
    checkInterval: 2000, // Fallback polling interval for the followed user's voice channel (in milliseconds)
    inactivityTimeout: 60 // Stop following after the user has been out of voice this long (in seconds)
};
const MIN_CHECK_INTERVAL = 500;
const MIN_INACTIVITY_TIMEOUT = 5;

let config = { ...DEFAULT_CONFIG };

const loadConfig = () => {
    const saved = BdApi.Data.load(getMeta().name, "settings") ?? {};
    config = { ...DEFAULT_CONFIG, ...saved };
};
const saveConfig = () => BdApi.Data.save(getMeta().name, "settings", config);

/* -------------------------------------------------------------------------- */
/*                               Discord Modules                              */
/* -------------------------------------------------------------------------- */

const getStore = (name) => BdApi.Webpack.getStore?.(name) ?? byName$1(name);

let VoiceStateStore = null;
let SelectedChannelStore = null;
let ChannelStore = null;
let UserStore = null;
let Dispatcher = null;
let VoiceChannelActions = null;

const fetchModules = () => {
    VoiceStateStore = getStore("VoiceStateStore");
    SelectedChannelStore = getStore("SelectedChannelStore");
    ChannelStore = getStore("ChannelStore");
    UserStore = getStore("UserStore");
    // Both are named (non-default) exports in current Discord builds, so search all exports
    Dispatcher = find((m) => m?.dispatch instanceof Function && m?.subscribe instanceof Function && m?.unsubscribe instanceof Function, { entries: true });
    VoiceChannelActions = find((m) => m?.selectVoiceChannel instanceof Function, { entries: true });
};

/* -------------------------------------------------------------------------- */
/*                                Follow Logic                                */
/* -------------------------------------------------------------------------- */

const RETRY_SAME_CHANNEL_MS = 10000;

let followedUserId = null;
let followInterval = null;
let lastSeenTime = 0;
let lastAttempt = { channelId: null, time: 0 };

const toast = (message, type = "info") => BdApi.UI?.showToast?.(message, { type });

const getUserName = (userId) => {
    const user = UserStore?.getUser?.(userId);
    return user?.globalName ?? user?.username ?? userId;
};

const getUserVoiceChannelId = (userId) => VoiceStateStore?.getVoiceStateForUser?.(userId)?.channelId ?? null;

const getOwnVoiceChannelId = () => SelectedChannelStore?.getVoiceChannelId?.() ?? null;

const getChannelName = (channelId) => ChannelStore?.getChannel?.(channelId)?.name ?? channelId;

const syncWithFollowedUser = () => {
    if (!followedUserId) return;

    try {
        const targetChannelId = getUserVoiceChannelId(followedUserId);

        if (!targetChannelId) {
            const elapsedSeconds = (Date.now() - lastSeenTime) / 1000;
            if (elapsedSeconds > config.inactivityTimeout) {
                const name = getUserName(followedUserId);
                log(`Stopped following ${followedUserId}: not in voice for ${config.inactivityTimeout}s`);
                stopFollowing();
                toast(`Stopped following ${name} (not in a voice channel)`, "warning");
            }
            return;
        }

        lastSeenTime = Date.now();

        if (targetChannelId === getOwnVoiceChannelId()) return;

        // Avoid hammering a channel we cannot join (full, no permission, ...)
        const now = Date.now();
        if (lastAttempt.channelId === targetChannelId && now - lastAttempt.time < RETRY_SAME_CHANNEL_MS) return;
        lastAttempt = { channelId: targetChannelId, time: now };

        if (!VoiceChannelActions?.selectVoiceChannel) {
            throw new Error("selectVoiceChannel action not found");
        }
        VoiceChannelActions.selectVoiceChannel(targetChannelId);
        log(`Following ${followedUserId} into voice channel ${targetChannelId}`);
        toast(`Joining ${getUserName(followedUserId)} in ${getChannelName(targetChannelId)}`);
    } catch (error) {
        console.error(`[${getMeta().name}] Error while following user:`, error);
    }
};

const onVoiceStateUpdates = ({ voiceStates }) => {
    if (!followedUserId || !Array.isArray(voiceStates)) return;
    if (voiceStates.some((state) => state?.userId === followedUserId)) {
        // Let the stores process the update before reading from them
        setTimeout(syncWithFollowedUser, 0);
    }
};

const startPolling = () => {
    clearInterval(followInterval);
    followInterval = setInterval(syncWithFollowedUser, config.checkInterval);
};

function followUser(userId) {
    if (!userId || followedUserId === userId) return;

    stopFollowing(); // Stop following the current user (if any)

    followedUserId = userId;
    lastSeenTime = Date.now();
    lastAttempt = { channelId: null, time: 0 };

    Dispatcher?.subscribe?.("VOICE_STATE_UPDATES", onVoiceStateUpdates);
    startPolling(); // Fallback in case an event is missed; also drives the inactivity timeout

    log(`Started following ${userId}`);
    toast(`Following ${getUserName(userId)}`, "success");
    syncWithFollowedUser();
}

function stopFollowing() {
    clearInterval(followInterval);
    followInterval = null;
    Dispatcher?.unsubscribe?.("VOICE_STATE_UPDATES", onVoiceStateUpdates);

    if (followedUserId) {
        log(`Stopped following ${followedUserId}`);
    }
    followedUserId = null;
    lastAttempt = { channelId: null, time: 0 };
}

/* -------------------------------------------------------------------------- */
/*                               Settings Panel                               */
/* -------------------------------------------------------------------------- */

const css = `
.VoiceChatFollower-settings {
    padding: 20px;
    background-color: var(--background-secondary);
}

.VoiceChatFollower-settings h3 {
    margin-bottom: 20px;
    color: var(--header-primary);
}

.VoiceChatFollower-settings .setting-item {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
}

.VoiceChatFollower-settings .setting-label {
    flex: 1;
    margin-right: 10px;
}

.VoiceChatFollower-settings .setting-label label {
    font-weight: 500;
    color: var(--text-normal);
}

.VoiceChatFollower-settings .setting-help {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 5px;
}

.VoiceChatFollower-settings .setting-input input[type="number"] {
    width: 80px;
    padding: 5px;
    border-radius: 3px;
    border: 1px solid var(--background-tertiary);
    background-color: var(--background-secondary-alt);
    color: var(--text-normal);
}
`;

const NumberSetting = ({ id, label, help, value, min, onChange }) => {
    const [draft, setDraft] = React.useState(String(value));

    const commit = () => {
        const parsed = parseInt(draft, 10);
        const next = Number.isFinite(parsed) ? Math.max(min, parsed) : value;
        setDraft(String(next));
        if (next !== value) onChange(next);
    };

    return React.createElement("div", { className: "setting-item" },
        React.createElement("div", { className: "setting-label" },
            React.createElement("label", { htmlFor: id }, label),
            React.createElement("div", { className: "setting-help" }, help)
        ),
        React.createElement("div", { className: "setting-input" },
            React.createElement("input", {
                id,
                type: "number",
                min,
                value: draft,
                onChange: (e) => setDraft(e.target.value),
                onBlur: commit,
                onKeyDown: (e) => {
                    if (e.key === "Enter") commit();
                }
            })
        )
    );
};

const SettingsPanel = () => {
    const [current, setCurrent] = React.useState({ ...config });

    const update = (key, value) => {
        config = { ...config, [key]: value };
        saveConfig();
        setCurrent({ ...config });
        if (key === "checkInterval" && followedUserId) {
            startPolling(); // Apply the new interval immediately
        }
    };

    return React.createElement("div", { className: "VoiceChatFollower-settings" },
        React.createElement("h3", null, "VoiceChatFollower Settings"),
        React.createElement(NumberSetting, {
            id: "checkInterval",
            label: "Check Interval (ms)",
            help: `How often to re-check the followed user's voice channel, as a fallback to live updates (min ${MIN_CHECK_INTERVAL}).`,
            value: current.checkInterval,
            min: MIN_CHECK_INTERVAL,
            onChange: (value) => update("checkInterval", value)
        }),
        React.createElement(NumberSetting, {
            id: "inactivityTimeout",
            label: "Inactivity Timeout (s)",
            help: `Stop following when the user has not been in a voice channel for this long (min ${MIN_INACTIVITY_TIMEOUT}).`,
            value: current.inactivityTimeout,
            min: MIN_INACTIVITY_TIMEOUT,
            onChange: (value) => update("inactivityTimeout", value)
        })
    );
};

/* -------------------------------------------------------------------------- */
/*                                   Plugin                                   */
/* -------------------------------------------------------------------------- */

const createPlugin = (plugin) => (meta) => {
    setMeta(meta);
    const {
        start,
        stop,
        styles,
        getSettingsPanel
    } = (plugin instanceof Function ? plugin(meta) : plugin);
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
        getSettingsPanel: getSettingsPanel
    };
};

const index = createPlugin({
    start() {
        loadConfig();
        fetchModules();

        const useUserVolumeItemFilter = bySource("user-volume");
        const { signal } = controller;

        waitFor(useUserVolumeItemFilter, {
            resolve: false
        }).then((result) => {
            // Lookup was aborted, or the plugin was stopped before it resolved
            if (!result || signal.aborted) return;
            const useUserVolumeItem = resolveKey(result, useUserVolumeItemFilter);
            after(...useUserVolumeItem, ({
                args: [userId],
                result
            }) => {
                if (result && userId !== UserStore?.getCurrentUser?.()?.id) {
                    return (
                        React.createElement(React.Fragment, null,
                            React.createElement(MenuCheckboxItem, {
                                id: "user-follow-checkbox",
                                label: "Follow User",
                                checked: followedUserId === userId,
                                action: () => {
                                    if (followedUserId === userId) {
                                        const name = getUserName(userId);
                                        stopFollowing();
                                        toast(`Stopped following ${name}`);
                                    } else {
                                        followUser(userId);
                                    }
                                    BdApi.ContextMenu.close?.();
                                }
                            }),
                            result
                        )
                    );
                }
            }, {
                name: "useUserVolumeItem"
            });
        });
    },
    stop() {
        stopFollowing();
    },
    styles: css,
    getSettingsPanel: () => React.createElement(SettingsPanel)
});

module.exports = index;
