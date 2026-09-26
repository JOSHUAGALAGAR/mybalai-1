/* eslint-disable @typescript-eslint/no-require-imports -- PM2 loads this file as CommonJS */
// PM2 process file for production. The port must match the app port of the site in CloudPanel.
const fs = require('node:fs')
const path = require('node:path')

// Run from the `current` link (…/current), not from the release folder it points to today: PM2 remembers
// the folder it was started in, so a fixed release path would keep serving the OLD release after a deploy.
const current = path.resolve(__dirname, '..', '..', 'current')

module.exports = {
  apps: [
    {
      name: 'mybalai',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3004',
      cwd: fs.existsSync(current) ? current : __dirname,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '900M',
      kill_timeout: 8000,
    },
  ],
}
