/**
 * @name VoiceChatFollower
 * @author KuchiS
 * @version 1.1
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
let followInterval = null;

// Configuration options
let config = {
    checkInterval: 2000, // Interval duration for checking user's voice channel (in milliseconds)
    inactivityTimeout: 60 // Inactivity timeout duration (in seconds)
};

const css = `
.VoiceChatFollower-settings {
    padding: 20px;
    background-color: var(--background-secondary);
}

.VoiceChatFollower-settings h3 {
    margin-bottom: 20px;
    color: var(--header-primary);
}

.setting-item {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
}

.setting-label {
    flex: 1;
    margin-right: 10px;
}

.setting-label label {
    font-weight: 500;
    color: var(--text-normal);
}

.setting-help {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 5px;
}

.setting-input input[type="number"] {
    width: 80px;
    padding: 5px;
    border-radius: 3px;
    border: 1px solid var(--background-tertiary);
    background-color: var(--background-secondary-alt);
    color: var(--text-normal);
}
`;

const VoiceStateStore = byName$1("VoiceStateStore");
const ChannelStore = byName$1("ChannelStore");
const VoiceChannelActions = find(m => m.selectVoiceChannel);

function findUserVoiceChannel(userId) {
  const voiceChannels = document.querySelectorAll(".containerDefault__3187b");
  for (const channelElement of voiceChannels) {
    const userElements = channelElement.querySelectorAll(".voiceUser__0470a");
    for (const userElement of userElements) {
      const avatarElement = userElement.querySelector(".content_b60865 .userAvatar_c4f005");
      if (avatarElement && avatarElement.style.backgroundImage.includes(userId)) {
        const linkElement = channelElement.querySelector(".link__95dc0");
        if (linkElement) {
          const channelId = linkElement.getAttribute("data-list-item-id").replace("channels___", "");
          if (channelId) {
            return {
              element: linkElement,
              id: channelId,
              userElement: userElement
            };
          }
        }
      }
    }
  }
  return null;
}

function followUser(userId) {
  if (followedUserId === userId) return;

  try {
    stopFollowing(); // Stop following the current user (if any)

    followedUserId = userId;

    const voiceChannel = findUserVoiceChannel(userId);
    if (voiceChannel) {
      voiceChannel.element.click();
      voiceChannel.userElement.classList.add("followedUser");
      log(`Joined voice channel: ${voiceChannel.id}`);
    } else {
      throw new Error(`Voice channel not found for user ${userId}`);
    }

    let lastSeenTime = Date.now();

    followInterval = setInterval(() => {
      const currentVoiceChannel = findUserVoiceChannel(userId);
      if (currentVoiceChannel) {
        const channelName = currentVoiceChannel.element.querySelector(".name__8d1ec")?.textContent;
        log(`User ${userId} is currently in voice channel ${channelName} (${currentVoiceChannel.id})`);

        if (!currentVoiceChannel.userElement.classList.contains("followedUser")) {
          currentVoiceChannel.userElement.classList.add("followedUser");
        }

        if (currentVoiceChannel.id !== voiceChannel?.id) {
          VoiceChannelActions.selectVoiceChannel(currentVoiceChannel.id);
          log(`Joined new voice channel: ${currentVoiceChannel.id}`);
        }

        lastSeenTime = Date.now();
      } else {
        log(`User ${userId} is not in any voice channel`);

        const elapsedTime = (Date.now() - lastSeenTime) / 1000; // Elapsed time in seconds
        if (elapsedTime > config.inactivityTimeout) {
          stopFollowing();
          log(`Stopped following user ${userId} due to inactivity`);
        }
      }
    }, config.checkInterval);
  } catch (error) {
    console.error("Error in followUser:", error);
  }
}

function stopFollowing() {
  try {
    const followedUserElement = document.querySelector(".voiceUser__0470a.followedUser");
    if (followedUserElement) {
      followedUserElement.classList.remove("followedUser");
    }
    
    followedUserId = null;
    clearInterval(followInterval);
  } catch (error) {
    console.error("Error in stopFollowing:", error);
  }
}

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
                                    const userContext = document.querySelector("#user-context");
                                    if (userContext) {
                                        userContext.remove();
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
    styles: css,
getSettingsPanel: () => {
    return [
        React.createElement("div", { className: "VoiceChatFollower-settings" },
            React.createElement("h3", null, "VoiceChatFollower Settings"),
            React.createElement("div", { className: "setting-item" },
                React.createElement("div", { className: "setting-label" },
                    React.createElement("label", { htmlFor: "checkInterval" }, "Check Interval (ms)"),
                    React.createElement("div", { className: "setting-help" }, "The interval at which to check the user's voice channel.")
                ),
                React.createElement("div", { className: "setting-input" },
                    React.createElement("input", {
                        id: "checkInterval",
                        type: "number",
                        value: config.checkInterval,
                        onChange: (e) => {
                            config.checkInterval = parseInt(e.target.value);
                        }
                    })
                )
            ),
            React.createElement("div", { className: "setting-item" },
                React.createElement("div", { className: "setting-label" },
                    React.createElement("label", { htmlFor: "inactivityTimeout" }, "Inactivity Timeout (s)"),
                    React.createElement("div", { className: "setting-help" }, "The duration of inactivity after which to stop following the user.")
                ),
                React.createElement("div", { className: "setting-input" },
                    React.createElement("input", {
                        id: "inactivityTimeout",
                        type: "number",
                        value: config.inactivityTimeout,
                        onChange: (e) => {
                            config.inactivityTimeout = parseInt(e.target.value);
                        }
                    })
                )
            )
        )
    ];
}
});

module.exports = index;
