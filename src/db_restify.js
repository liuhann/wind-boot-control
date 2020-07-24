/**
 * 实现database相关Rest接口服务
 */
module.exports = class DBRestify {
  constructor (dbName, colName) {
    this.dbName = dbName
    this.colName = colName
  }

  async initRoute (app) {
    const { router, logger } = app
    // auto inject to app
    if (!app.restdb) {
      app.restdb = {}
    }
    if (app.restdb[this.dbName + '.' + this.colName]) {
      console.warn(this.dbName + '.' + this.colName + ' already registered')
      return
    }
    app.restdb[this.dbName + '.' + this.colName] = this
    this.logger = logger
    await this.initCollection(app)
    const path = `restful/${this.dbName}/${this.colName}`
    // 创建对象
    router.post(`/${path}`, async (ctx, next) => {
      const object = ctx.request.body
      this.logger.debug('creating object [%o]', object)
      object.creator = ctx.user ? ctx.user.id : ''
      ctx.body = await this.create(ctx.request.body)
      await next()
    })

    // 列表查询
    router.get(`/${path}`, async (ctx, next) => {
      const skip = parseInt(ctx.request.query.skip) || 0
      const limit = parseInt(ctx.request.query.limit) || 20
      const sort = ctx.request.query.sort
      const order = ctx.request.query.order
      const projection = ctx.request.query.projection
      const query = Object.assign({}, ctx.request.query)
      delete query.skip
      delete query.limit
      delete query.sort
      delete query.order
      delete query.projection

      const options = {
        skip,
        limit
      }
      if (sort) {
        options.sort = {
          [sort]: parseInt(order)
        }
      }
      if (projection) {
        const projects = projection.split(',')
        options.projection = {}
        for (const p of projects) {
          options.projection[p] = 1
        }
      }
      this.logger.debug('query %s  query=%o options=%o', path, query, options)

      ctx.body = await this.list(query, options)
      await next()
    })

    // 按id获取
    router.get(`/${path}/:id`, async (ctx, next) => {
      const { id } = ctx.params

      this.logger.debug('findOne id=%s', id)
      ctx.body = await this.getDocument(id)
      await next()
    })

    // 多个查找
    router.post(`/${path}/id`, async (ctx, next) => {
      const { ids } = ctx.request.body

      ctx.body = await this.getMultipleDocuments(ids)
      await next()
    })

    // 字段投影
    router.get(`/${path}/distinct/:field`, async (ctx, next) => {
      const { field } = ctx.params

      ctx.body = await this.distinct(field, ctx.request.query)

      await next()
    })

    // 复杂搜索
    router.post(`/${path}/search`, async (ctx, next) => {
      const skip = parseInt(ctx.request.query.skip) || 0
      const limit = parseInt(ctx.request.query.limit) || 20
      const sort = ctx.request.query.sort
      const order = ctx.request.query.order
      const projection = ctx.request.query.projection
      const query = Object.assign({}, ctx.request.body)

      const options = {
        skip,
        limit
      }
      if (sort) {
        options.sort = {
          [sort]: parseInt(order)
        }
      }
      if (projection) {
        const projects = projection.split(',')
        options.projection = {}
        for (const p of projects) {
          options.projection[p] = 1
        }
      }
      this.logger.debug('query %s  query=%o options=%o', path, query, options)

      ctx.body = await this.list(query, options)
      await next()
    })

    // 更新字段
    router.patch(`/${path}/:id`, async (ctx, next) => {
      const { id } = ctx.params
      ctx.body = await this.patch(id, ctx.request.body)

      await next()
    })

    // 单个删除
    router.delete(`/${path}/:id`, async (ctx, next) => {
      const { id } = ctx.params
      ctx.body = await this.delete(id)

      await next()
    })

    // 批量删除
    router.delete(`/${path}`, async (ctx, next) => {
      const deleteList = ctx.request.body
      ctx.body = await this.delete(deleteList)
      await next()
    })

    app.info(`${this.dbName}/${this.colName} restful enabled`)

    return `${this.dbName}/${this.colName}`
  }

  async initCollection (app) {
    if (!this.coll) {
      const db = await app.getDb(this.dbName)
      this.coll = await db.getCollection(this.colName)
    }
  }

  setAdmin (admin) {
    this.admin = admin
  }

  async ensureIndex (indexKey) {}

  async list (query, options) {
    // consider value convert to true or false
    for (const key in query) {
      if (query[key] === 'true' || query[key] === 'false') {
        query[key] = JSON.parse(query[key])
      }
    }
    const list = await this.coll.find(query, options)
    const total = await this.coll.count(query)
    return {
      query,
      options,
      list,
      total
    }
  }

  /**
   * 创建一条文档，如何发生主键重复时， overwriteOnDuplicated 可配置是否可替换
   * @param ctx
   * @param next
   * @returns {Promise<void>}
   */
  async create (object) {
    if (object._id) {
      const existed = await this.coll.exist(object._id)
      if (existed) {
        return await this.coll.update(object._id, object)
      }
    }
    return await this.coll.insert(object)
  }

  async getMultipleDocuments (ids) {
    return await this.coll.find({
      _id: {
        $in: ids
      }
    })
  }

  async getDocument (id) {
    return await this.coll.findOne(id)
  }

  /**
         * 更新文档
         * @param ctx
         * @param next
         * @returns {Promise<void>}
         */
  async patch (id, patch) {
    return await this.coll.patch(id, patch)
  }

  async delete (id) {
    return await this.coll.remove(id)
  }

  /**
         * 获取coll的distinct列值
         * @param ctx
         * @param next
         * @returns {Promise<void>}
         */
  async distinct (field) {
    return await this.coll.distinct(field)
  }
}
