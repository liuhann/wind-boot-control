
/**
 * 实现database相关Rest接口服务
 */
module.exports = class DBRestify {
    constructor() {

    }

    initRoutes(router) {
        router.get('/database/list', this.listDatabase);
        router.get('/database/:dbname/collections', this.listDataBaseCollections);
        router.get('/database/:dbname/:collection/documents', this.listDocuments);
    }

    listDatabase = async(ctx, next) => {
        ctx.body = ctx.getDbs();
        await next();
    }

    listDataBaseCollections = async(ctx, next) => {
        ctx.body = ctx.getDb(ctx.params.dbname).getCollections();
        await next();
    }

    listDocuments = async(ctx, next) => {
        const { dbname, collection } = ctx.params,

            dbColl = ctx.getDb(dbname).getCollection(collection);

        ctx.body = await dbColl.find({
        }, {
            skip: ctx.query.skip,
            limit: ctx.query.limit
        });
        await next();
    }
};
