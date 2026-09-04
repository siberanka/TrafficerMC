import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [
          'mineflayer',
          'minecraft-protocol',
          'minecraft-data',
          'prismarine-nbt',
          'protodef',
          'electron-store',
          'socks',
          'lodash',
          'lodash.merge',
          'uri-js'
        ]
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {}
})
