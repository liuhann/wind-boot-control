process.env.DEBUG = "wind:*";
const WindBoot = require('wind-boot');
const http = require('wind-core-http');
const dao = require('wind-core-dao');
const log = require('wind-core-log');

const control = require('../src')

const booter = new WindBoot({
  packages: [http, dao, log, control]
})

booter.start()