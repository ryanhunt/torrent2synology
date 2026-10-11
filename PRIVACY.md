# Privacy policy

Torrent2Synology sends the torrent and magnet links you choose to your own Synology NAS. It has no server of its own and collects no analytics or telemetry.

## What it stores

Everything is stored locally in your browser's extension storage, and is never synced to your browser account or other devices:

- Your NAS address, username, and password. The password is stored as plain text unless you turn on **Encryption**, in which case it is stored encrypted with a passphrase you choose (the unlocked copy is kept in memory only, and is cleared when the browser closes).
- Your download folder settings and left-click preference.
- A trusted-device token issued by your NAS, if you use 2-step verification, so you are not asked for a code each time.

## Where data goes

- Your NAS address, username, password (and 2-step code or trusted-device token) are sent **only to the NAS address you enter**, to log in to Download Station.
- The link you choose to send is sent to your NAS. For `.torrent` links the extension may first download the file from the site hosting it, using your browser's normal cookies for that site, and then upload it to your NAS.
- Nothing is sent to the developer or to any third party.

## Permissions

- **All websites:** to download `.torrent` files from the sites you click on, to talk to your NAS at whatever address you use, and (only if you turn on **Capture Left Clicks**) to notice clicks on magnet and torrent links.
- **Context menus, notifications, storage:** the right-click menu, status messages, and saving your settings.
- **webRequest (read-only):** to tell whether a connection to your NAS failed because of an untrusted HTTPS certificate. It does not block or modify requests.

## Your controls

- **Clear stored password** in the settings removes the saved password.
- Removing the extension deletes all of its stored data.

## Contact

Questions or issues: https://github.com/ryanhunt/torrent2synology/issues
