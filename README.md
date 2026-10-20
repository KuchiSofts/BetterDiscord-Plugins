# Kuchi - Soft's BetterDiscord Plugins

Small, focused [BetterDiscord](https://betterdiscord.app) plugins for voice chat: push quiet friends past Discord's 200% volume cap, and follow someone from channel to channel without lifting a finger.

[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![BetterDiscord](https://img.shields.io/badge/BetterDiscord-plugin-3a71c1.svg)](https://betterdiscord.app)

## Plugins

| Plugin | Description | Version | Download |
| --- | --- | --- | --- |
| **SoundBooster** | Set user and stream volumes above Discord's 200% limit, with precise inputs and a live volume meter. | 2.6.3 | [SoundBooster.plugin.js](https://raw.githubusercontent.com/KuchiSofts/BetterDiscord-Plugins/main/SoundBooster.plugin.js) |
| **VoiceChatFollower** | Adds a "Follow User" option that automatically moves you into whichever voice channel that user joins. | 1.2.0 | [VoiceChatFollower.plugin.js](https://raw.githubusercontent.com/KuchiSofts/BetterDiscord-Plugins/main/VoiceChatFollower.plugin.js) |

> Tip: on the download page, use **Save Page As** (Ctrl+S) and keep the `.plugin.js` file name.

---

## SoundBooster

Discord's per-user volume slider stops at 200%. SoundBooster lets you go further, up to 1000% by default, and type exact values instead of dragging a slider.

### Features

- **Volume above 200%** for both a user's voice and their stream (screen share or camera audio).
- **Precise controls** in the user context menu: a slider plus a number box for exact percentages, with mouse-wheel adjustment.
- **Live volume meter**: your real microphone level for yourself, and a speaking indicator for other users.
- **Remembers everything**: boosted volumes are saved and re-applied when Discord restarts. Saves are batched so rapid changes don't spam disk writes.
- **Optional default volume** applied to users you never adjusted when you join a channel (off by default).
- **Backup and restore**: export or import all settings and per-user volumes as a JSON file, or reset everything.

### Usage

1. Right-click a user in a voice channel (or anywhere their user menu appears).
2. Use the SoundBooster controls to set **Voice Volume** and **Stream Volume**: drag the slider, scroll over it, or type a value.
3. Values up to 200% are handled by Discord as usual. Anything above that is stored by SoundBooster and applied on top.

### How boosting works

Discord clamps local volume at 200%. SoundBooster sits in front of the `AUDIO_SET_LOCAL_VOLUME` handler that saves volumes to your Discord settings: when you pick a value above the cap, it saves the real value as an override, lets Discord store the 200% maximum, and re-dispatches the boosted volume to the audio engine on startup and whenever your Discord settings sync. Dropping a user back to 200% or below removes the override.

> Very high volumes can clip and distort, and they can be loud. Raise volume gradually.

### Settings

Open **User Settings > Plugins > SoundBooster > Settings**:

| Setting | Default | What it does |
| --- | --- | --- |
| Max User Volume | 1000% | Upper limit for voice volume controls. |
| Max Stream Volume | 1000% | Upper limit for stream volume controls. |
| Default User Volume | 0 (off) | When you join a channel, sets this volume for users you never adjusted. |
| Default Stream Volume | 100% | Value shown for stream volume when Discord reports none for that user. |
| Volume Step / Mouse Wheel Step | 100 | How much each slider step or scroll changes the volume. Typed values are kept exact. |
| Hide Discord's Built-in Volume Slider | Off | Shows only SoundBooster's controls in the context menu. |
| Show Real-Time Volume Meter | On | Shows the live volume meter. |
| Smart Save Delay | 3 s | Waits this long after the last change before saving. |

---

## VoiceChatFollower

Want to stay in the same channel as a friend, a streamer or a raid leader? VoiceChatFollower moves you whenever they move.

### Features

- **One-click follow** from the user context menu.
- **Instant channel hopping**: reacts to Discord's live voice-state updates, with periodic re-checks as a fallback.
- **Stops by itself** if the user stays out of voice longer than the inactivity timeout.
- **Toast notifications** when you start or stop following and when you are moved.
- Backs off if a channel can't be joined (full or no permission) instead of retrying nonstop.

### Usage

1. Right-click a user and tick **Follow User**.
2. You join their current voice channel right away, and you move with them from then on.
3. To stop, right-click the same user and untick **Follow User**, or disable the plugin. Following someone else replaces the current follow.

> While you follow someone, VoiceChatFollower moves you back to their channel if you switch away. Stop following first if you want to stay put.

### Settings

Open **User Settings > Plugins > VoiceChatFollower > Settings**:

| Setting | Default | What it does |
| --- | --- | --- |
| Check Interval | 2000 ms | How often to re-check the followed user's channel as a fallback (min 500 ms). |
| Inactivity Timeout | 60 s | Stop following when the user has been out of voice this long (min 5 s). |

Settings are saved automatically.

---

## Installation

1. Install [BetterDiscord](https://betterdiscord.app) if you haven't already.
2. Download the `.plugin.js` file from the [table above](#plugins).
3. Open your plugins folder: **User Settings > Plugins > Open Plugins Folder**. Default locations:
   - Windows: `%appdata%\BetterDiscord\plugins`
   - macOS: `~/Library/Application Support/BetterDiscord/plugins`
   - Linux: `~/.config/BetterDiscord/plugins`
4. Move the downloaded file into that folder.
5. Enable the plugin under **User Settings > Plugins**.

These plugins are not listed in the official BetterDiscord plugin store, so BetterDiscord's built-in updater does not update them. To update, download the file again from the [table above](#plugins) and replace the old one; your settings are kept. Each plugin's `@updateUrl` points to the latest version on `main` for update tools that support it.

## Compatibility

- Requires the **Discord desktop client** with a current **BetterDiscord** build.
- The plugins depend on Discord internals (webpack modules and stores) that Discord changes without notice. If something stops working after a Discord update, please [open an issue](https://github.com/KuchiSofts/BetterDiscord-Plugins/issues) and include the console output (Ctrl+Shift+I).
- SoundBooster and Zerthox's BetterVolume do the same job. Enable only one of them at a time.

## Credits

SoundBooster and VoiceChatFollower are based on **[BetterVolume](https://github.com/Zerthox/BetterDiscord-Plugins)** by **Zerthox**, used under the MIT License (Copyright (c) 2016 Zerthox). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full notice.

## License

Licensed under the [GNU General Public License v3.0](LICENSE). Portions derived from BetterVolume remain available under the MIT License, as described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Disclaimer

Client modifications such as BetterDiscord are against [Discord's Terms of Service](https://discord.com/terms). Use these plugins at your own risk. This project is not affiliated with or endorsed by Discord Inc. or BetterDiscord.
