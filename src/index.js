const BootService = require('./booter_service')
const DBRestify = require('./db_restify.js')
const name = require('../package.json').name
const version = require('../package.json').version
const description = require('../package.json').description

module.exports = {
  name,
  version,
  description,
  async created (app) {},

  async ready (app) {
    app.services.bootService = new BootService(app)
    await app.services.bootService.initRoute(app.router)

    const testShell = new DBRestify('test', 'shell')
    await testShell.initRoute(app)
  },

  async bootComplete (app) {
    await app.services.bootService.loadStartHotPackages()
  }
}
