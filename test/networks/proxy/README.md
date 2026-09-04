# Proxy network

This profile opens a real local TCP Minecraft endpoint and emulates the protocol sequence used by
Velocity/Bungee networks with two logical backends: `limbo`/authentication and `lobby`. It does not
pretend to test a specific proxy plugin implementation.

The client authenticates, sends `/server survival`, receives a backend respawn and position, confirms
the new teleport exactly once, answers the sub-server login prompt, and must remain in `play` state.

```powershell
npm run test:network:proxy
```

An opt-in integration test also runs the same auth-to-lobby transition through a real Velocity
process and two local protocol backends. Download an official Velocity jar to the ignored path
`test/runtime/proxy-velocity/velocity.jar`, then run:

```powershell
npm run test:live:proxy
```

The live test writes an isolated offline-mode `velocity.toml` under `test/runtime`, uses ports
25596/25598/25599 by default, verifies backend register/login commands, and requires the client to
remain in play state. Override paths and ports with the `TRAFFICER_VELOCITY_*`,
`TRAFFICER_*_BACKEND_PORT`, and `TRAFFICER_TEST_JAVA` environment variables.

For a deployment-specific check, repeat the assertions with the network's actual forwarding mode
and auth plugin. Do not reuse production secrets.

Never point the live network tests at a public server without its owner's explicit permission.
