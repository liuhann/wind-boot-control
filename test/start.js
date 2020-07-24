process.env.DEBUG = 'wind:*';
const WindBoot = require('wind-boot')
const http = require('wind-core-http')
const dao = require('wind-core-dao')
const nedb = require('wind-dao-nedb')
const log = require('wind-core-log')

const control = require('../src')

const booter = new WindBoot({
  packages: [http, dao, nedb, log, control]
})

booter.start()
