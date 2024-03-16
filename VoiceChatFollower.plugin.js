/**
 * @name VoiceChatFollower
 * @author KuchiS
 * @version 1.0
 * @description Adds a "Follow Me" checkbox to the user context menu in voice chat, allowing you to automatically follow a user to the voice channel they join.
 * @authorLink https://github.com/KuchiSofts
 * @website https://github.com/KuchiSofts/BetterDiscord-Plugins
 * @source https://github.com/KuchiSofts/BetterDiscord-Plugins/blob/main/VoiceChatFollower.plugin.js
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

const ExperimentStore = byName$1("ExperimentStore");
const { React } = BdApi;

const {
    CheckboxItem: MenuCheckboxItem,
} = BdApi.ContextMenu;

let followedUserId = null;
let followTimeout = null;

const css = `
.container-VoiceChatFollower {
  margin: 5px 8px;
  padding: 3px 6px;
  background: var(--background-primary);
  border-radius: 3px;
  display: flex;
}

.checkbox-VoiceChatFollower {
  margin-right: 8px;
}

.label-VoiceChatFollower {
  color: var(--interactive-normal);
  font-weight: 500;
}
`;

const VoiceStateStore = byName$1("VoiceStateStore");
const VoiceChannelStore = byName$1("GuildChannelsStore");
const VoiceChannelActions = byName$1("VoiceChannelActions");

function findUserVoiceChannel(userId) {
    const voiceChannels = document.querySelectorAll(".containerDefault__3187b");
    for (const channelElement of voiceChannels) {
        const userElement = channelElement.querySelector(".voiceUser__0470a");
        if (userElement) {
            const avatarElement = userElement.querySelector(".content_b60865 .userAvatar_c4f005");
            if (avatarElement && avatarElement.style.backgroundImage.includes(userId)) {
                const linkElement = channelElement.querySelector(".link__95dc0");
                if (linkElement) {
                    const channelId = linkElement.getAttribute("data-list-item-id").replace("channels___", "");
                    if (channelId) {
                        //linkElement.click();
                        return linkElement;
                    }
                }
            }
        }
    }
    return null;
}

function followUser(userId) {
    if (followedUserId === userId) return;

    followedUserId = userId;
    clearTimeout(followTimeout);

    const voiceChannel = findUserVoiceChannel(userId);
	//log(`userid: ${userId} 148 ---- vc : ${voiceChannel}`);
    if (voiceChannel) {
        voiceChannel.click();
		log(`userid: ${voiceChannel.id} 151`);
    }

    const handleVoiceStateUpdate = () => {
        const newVoiceChannel = findUserVoiceChannel(userId);
        if (newVoiceChannel && newVoiceChannel.id !== voiceChannel?.id) {
            VoiceChannelActions.selectVoiceChannel(newVoiceChannel.id);
        }
    };

    VoiceStateStore.addChangeListener(handleVoiceStateUpdate);

    followTimeout = setTimeout(() => {
        VoiceStateStore.removeChangeListener(handleVoiceStateUpdate);
        followedUserId = null;
    }, 10000);
}

function stopFollowing() {
    followedUserId = null;
    clearTimeout(followTimeout);
}

const createPlugin = (plugin) => (meta) => {
    setMeta(meta);
    const {
        start,
        stop,
        styles,
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
    };
};

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
                args: [userId],
                result
            }) => {
                if (result) {
                    return (
                        React.createElement(React.Fragment, null,
                            React.createElement(MenuCheckboxItem, {
                                id: "user-follow-checkbox",
                                label: "Follow Me",
                                checked: followedUserId === userId,
                                action: () => {
                                    if (followedUserId === userId) {
                                        stopFollowing();
                                    } else {
                                        followUser(userId);
                                    }
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
    styles: css
});

module.exports = index;
