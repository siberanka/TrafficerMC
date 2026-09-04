# Direct backend network

This profile verifies a client connected straight to an offline-mode Paper backend.
The live suite requires AuthMe 6.x with `settings.registration.dialog.preJoin.enable: true`
and tests the configuration-phase dialog response, post-authentication chat, and commands.

Run against the local isolated server only:

```powershell
$env:TRAFFICER_TEST_PORT = '25577'
node test/networks/direct/authmePaperLive.test.js
```

The suite generates a unique username and contains no production address, token, or password.
