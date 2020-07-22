const BootService = require('./booter_service'),
    DBRestify = require('./db_restify.js'),
    name = require('../package.json').name,
    version = require('../package.json').version,
    description = require('../package.json').description;

module.exports = {
    name,
    version,
    description,
    async created(app) {},

    async ready(app) {
        app.services.bootService = new BootService(app);
        await app.services.bootService.initRoute(app.router);
        new DBRestify().initRoutes(app.router);
    },

    async bootComplete(app) {
        await app.services.bootService.loadStartHotPackages();
    }
};
