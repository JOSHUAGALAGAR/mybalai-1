// PM2 process file for production. The port must match the app port of the site in CloudPanel.
module.exports = {
  apps: [
    {
      name: 'mybalai',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3004',
      cwd: __dirname,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '900M',
      kill_timeout: 8000,
    },
  ],
}
