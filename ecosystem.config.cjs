module.exports = {
  apps: [{
    name: 'assistant',
    script: 'src/index.js',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production',
    },
    watch: false,
    max_memory_restart: '500M',
    error_file: './data/logs/error.log',
    out_file: './data/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 5000,
    max_restarts: 10,
  }],
};
