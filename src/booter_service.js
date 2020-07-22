const fsExtra = require('fs-extra'),
    path = require('path'),
    fs = require('fs'),
    execa = require('execa'),
    os = require('os');

module.exports = class BooterService {
    name = '加载器服务'
    constructor(app) {
        this.app = app;
        this.logger = app.logger;
        this.booter = app.booter;
        this.publicPath = path.resolve('./', app.config.public);
    }

    initRoute(router) {
        this.bootdb = this.app.getDb('boot');
        this.pkgColl = this.bootdb.getCollection('hot-packages');
        router.get('/os', async(ctx, next) => {
            ctx.body = this.getOSProperties();
            await next();
        });

        router.get('/server/update', async(ctx, next) => {
            ctx.body = await this.runUpdate();
            await next();
        });

        router.get('/server/restart', async(ctx, next) => {
            ctx.body = await this.runRestart();
            await next();
        });

        // 列举所有热部署的模块
        router.get('/package/hot/list', async(ctx, next) => {
            ctx.body = await this.getHotModules();
            await next();
        });

        // 获取系统级模块列表
        router.get('/package/system/list', async(ctx, next) => {
            ctx.body = await this.getPackageList(ctx);
            await next();
        });

        // 删除热部署的模块
        router.get('/package/undeploy', async(ctx, next) => {
            const { name } = ctx.query,
                result = await this.unDeployModule(name);

            ctx.body = {
                result
            };
            await next();
        });

        // 安装、部署远程npm服务器的模块
        router.get('/package/deploy', async(ctx, next) => {
            const { name } = ctx.query;

            // 依赖本地资源下载服务
            if (!ctx.app.services.localAssets) {
                throw new ctx.app.HttpError('500101', 'localAssets service need to be deployed');
            }
            const installResult = await ctx.app.services.localAssets.installPackage(name),
                type = installResult.package.type,
                startResult = await this.installHotModule(installResult.package.name, installResult.package.version, installResult.location + '/package', type);

            ctx.body = {
                installResult,
                startResult
            };
            await next();
        });
    }

    getOSProperties = () => {
        return {
            arch: os.arch(),
            cpus: os.cpus(),
            freemem: os.freemem(),
            loadavg: os.loadavg(),
            totalmem: os.totalmem(),
            uptime: os.uptime()
        };
    }

    runRestart = async() => {
        await this.app.restart();
    }

    runUpdate = async() => {
        const update = await execa('npm update');

        await this.app.restart();
        return update;
    }

    searchPackagesByName = async name => {

    }

    getPackageList = async(ctx) => {
        const packages = ctx.app.packages,
            packageNames = packages.map(p => ({
                version: p.version,
                name: p.name,
                description: p.description
            }));

        return packageNames;
    }

    async getHotModules() {
        return (await this.pkgColl.find({})).list;
    }

    async loadStartHotPackages() {
        const packs = (await this.pkgColl.find({})).list;

        for (const pack of packs) {
            if (pack.type === 'node') {
                try {
                    await this.startHotModule(pack.path);
                    await this.pkgColl.patch(pack.id, {
                        started: true
                    });
                } catch (e) {
                    await this.pkgColl.patch(pack.id, {
                        started: false,
                        error: e
                    });
                }
            }
        }
    }

    stopPackage(ctx, next) {

    }

    monitor(ctx, next) {

    }

    async unDeployModule(name) {
        if (this.logger && this.logger.isDebugEnabled()) {
            this.logger.debug('undeploy module', name);
        }
        const pack = await this.pkgColl.findOne({
            name: name
        });

        // 对于web项目 移除拷贝到public的
        if (pack.type === 'app') {
            await fs.promises.rmdir(path.resolve('./public', name), {
                recursive: true
            });
        }

        await this.pkgColl.remove({ name });
        return pack;
    }

    /**
     * 加载模块， 记录到 boot/hot-packages中
     */
    async installHotModule(name, version, modulePath, type) {
        if (this.logger && this.logger.isDebugEnabled()) {
            this.logger.debug('check boot package', name, version, modulePath);
        }
        let pack = await this.pkgColl.findOne({
            name: name
        });

        if (pack) {
            if (pack.path !== modulePath) {
                await this.pkgColl.patch(pack.id, {
                    path: modulePath,
                    version,
                    updated: new Date()
                });
            }
        } else {
            pack = await this.pkgColl.insert({
                name,
                version,
                type,
                path: modulePath,
                created: new Date()
            });
        }
        if (this.logger && this.logger.isDebugEnabled()) {
            this.logger.debug('pack confirmed');
        }

        if (type === 'app') {
            await this.copyWebModule(name, modulePath);
        } else if (type === 'node') {
            await this.startHotModule(modulePath);
        }
    }

    async copyWebModule(name, modulePath) {
        const destPath = path.resolve('./public', name);

        await fsExtra.copy(modulePath + '/public', destPath);
    }

    /**
     * 启动模块内容
     */
    async startHotModule(modulePath) {
        try {
            const packageModule = require(modulePath);

            if (this.logger && this.logger.isDebugEnabled()) {
                this.logger.debug('booter.load', packageModule);
            }
            await this.booter.loadPackage(packageModule);

            // 标识为热启动模块
            packageModule.hot = true;
        } catch (err) {
            if (this.logger) {
                this.logger.error('pack start error %O', err);
            }
            return err;
        }
        return 'started';
    }
};
