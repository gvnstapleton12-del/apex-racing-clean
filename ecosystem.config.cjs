module.exports = {
  apps: [{
    name: 'apex',
    script: 'server.js',
    max_restarts: 10,
    restart_delay: 5000,
    exp_backoff_restart_delay: 100,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
