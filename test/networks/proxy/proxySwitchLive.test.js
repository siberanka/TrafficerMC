// The proxy harness opens a real local TCP Minecraft endpoint and performs the
// same respawn/position sequence used by BungeeCord, Velocity, and LimboAuth.
// Keeping the implementation in the legacy path preserves downstream runners.
await import('../../proxyServerSwitch.test.js')
