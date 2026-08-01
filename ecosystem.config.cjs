module.exports = {
  apps: [{
    name: 'apex',
    script: 'server.js',
    node_args: '--max-old-space-size=4096',
    max_restarts: 10,
    restart_delay: 5000,
    max_memory_restart: '6G',
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/usr/bin/google-chrome'
    }
  }]
}
