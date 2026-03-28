const path = require('path');

module.exports = {
  apps: [
    {
      name: 'dashboard-main',
      cwd: __dirname,
      script: path.join(__dirname, 'scripts', 'pm2-main-dev.js'),
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      merge_logs: true,
      out_file: path.join(__dirname, 'logs', 'pm2-dashboard-main.out.log'),
      error_file: path.join(__dirname, 'logs', 'pm2-dashboard-main.err.log'),
      env: {
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        CLICOLOR: '0',
        CLICOLOR_FORCE: '0',
        npm_config_color: 'false',
      },
    },
  ],
};
