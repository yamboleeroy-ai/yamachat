# Profile actions

The profile renderer called social helpers that were declared inside a layout block and therefore unavailable in its module scope. `scripts/profile-actions.mjs` moves the existing social helpers to the correct scope, adds a panel below the existing profile, and applies the same adaptation to web/mobile and the generated desktop client. The immutable desktop reference is not edited.

Existing backend paths are reused:

| Action | Existing implementation |
| --- | --- |
| Friend/request state | `ycFriendQuery1029`, `friendships`, existing profile actions including accept, reject, cancel and removal |
| DM | `startDm`, existing `create_direct_thread` RPC |
| Local voice mute | `voiceMixFor`, `setVoiceUserMix`; preserves volume, applies to this device only |
| Block/unblock | `user_blocks`, `ycBlockUser`, `ycUnblockUser`, existing `block_user` / `unblock_user` RPCs |
| Report | `ycOpenProfileReport1029`, existing `report_profile` RPC |

No migrations, new tables, RPC implementations, credentials, update versions or production data are changed. Backend calls exist in the repository; the deployed database schema/RLS and a signed-in two-account production flow have not been independently verified. Read errors disable friend/DM/block actions rather than assuming that a user is unblocked; local mute remains available. Existing RPC errors are surfaced by their existing handlers. No fake local blocking/reporting fallback is introduced.

## Build and verification

```
node scripts/check.mjs
node scripts/build-desktop-client.mjs
node tests/profile-actions.cjs
node tests/profile-layout.cjs
```

The browser tests require Playwright. They cover friend states, duplicate submission prevention, existing action delegation, local mute without volume changes, unknown relationship state, closed dialogs, shared desktop/web output, and full web-client profile layouts at 1440x960, 390x844, 320x568 and 844x390 with isolated data. They do not place real calls or mutate production data.

`build/desktop-profile-actions/desktop-client.html` is the desktop client containing the same panel. Package it using the complete matching Windows source/runtime. This repository only contains the archived HTML, package metadata and boot guard; it lacks `main.js`, `preload.js`, `updater.js` and other files named in the desktop package manifest. Therefore it cannot produce a complete Windows installer by itself. Existing installed Windows apps are not updated by a web deployment.

Android and iOS use the generated web client through the existing mobile build. Native build checks are configured in GitHub Actions. The iOS simulator build requires macOS/Xcode and cannot run locally on Windows. UI tests emulate platform classes, not real iOS WebKit or device audio behavior.

Before changes, `backup/profile-actions-20260923` was created at `150dc6b44ea6c5d8a7e83ed5633168167229c6f7`. Work is on `feat/profile-actions-20260923`. The original dirty local checkout was left untouched. No production deployment is part of this branch.
