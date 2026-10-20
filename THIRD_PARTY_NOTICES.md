# Third-Party Notices

This repository is licensed under the [GNU General Public License v3.0](LICENSE).
Some of the plugins in it include code derived from third-party projects that are
distributed under their own, GPL-compatible licenses. Those notices are reproduced
below as required by their licenses.

## BetterVolume by Zerthox

- **Project:** BetterVolume, part of [Zerthox/BetterDiscord-Plugins](https://github.com/Zerthox/BetterDiscord-Plugins)
- **License:** MIT
- **Used in:**
  - `SoundBooster.plugin.js`: plugin scaffolding (meta handling, webpack module
    filters and lookups, patch helpers), the `AUDIO_SET_LOCAL_VOLUME` handler swap
    used to exceed Discord's 200% volume cap, the user context-menu volume patch,
    and the original CSS class structure.
  - `VoiceChatFollower.plugin.js`: plugin scaffolding (meta handling, webpack module
    filters and lookups, `waitFor`, patch helpers, logging style) and the user
    context-menu patch.

The MIT License permits inclusion in a GPL-3.0 project; the MIT notice below must be
kept with the derived code. Modifications made in this repository are licensed under
GPL-3.0.

```
MIT License

Copyright (c) 2016 Zerthox

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
