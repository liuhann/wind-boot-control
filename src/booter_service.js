const fsExtra = require('fs-extra'),
    path = require('path'),
    fs = require('fs'),
    axios = require('axios'),
    execa = require('execa'),
    os = require('os');

const OFFICIAL_NPM_SERVER = 'http://registry.npmjs.org'
module.exports = class BooterService {
    name = '加载器服务'
    constructor(app) {
        this.app = app;
        this.assetServer = app.config.assetServer || 'http://10.10.247.1:4873'
        this.logger = app.logger;
        this.booter = app.booter;
        this.publicPath = path.resolve('./', app.config.public);
        this.routePrefix = '/control'
    }

    async initRoute(router) {
        this.bootdb = await this.app.getDb('boot');
        this.pkgColl = await this.bootdb.getCollection('hot-packages');
        router.get(this.routePrefix + '/os', async(ctx, next) => {
            ctx.body = this.getOSProperties();
            await next();
        });

        router.get(this.routePrefix + '/server/update', async(ctx, next) => {
            ctx.body = await this.runUpdate();
            await next();
        });

        router.get(this.routePrefix + '/server/restart', async(ctx, next) => {
            ctx.body = await this.runRestart();
            await next();
        });

        // 列举所有热部署的模块
        router.get(this.routePrefix + '/package/hot/list', async(ctx, next) => {
            ctx.body = await this.getHotModules();
            await next();
        });

        // 获取系统级模块列表
        router.get(this.routePrefix + '/package/system/list', async(ctx, next) => {
            ctx.body = await this.getPackageList(ctx);
            await next();
        });

        // 删除热部署的模块
        router.get(this.routePrefix + '/package/uninstall', async(ctx, next) => {
            const { name } = ctx.query;
            const result = await this.uninstallHotModule(name);
            ctx.body = {
                result
            };
            await next();
        });

        router.get(this.routePrefix + '/package/searchname', async(ctx, next) => {
            const { name } = ctx.query;
            const result = await this.searchPackageByName(name);
            ctx.body = {
                result
            };
            await next();
        });

        router.get(this.routePrefix + '/package/info', async(ctx, next) => {
            const { name } = ctx.query;
            const result = await this.getPackageInfo(name);
            ctx.body = result;
            await next();
        })

        // 安装、部署远程npm服务器的模块
        router.get(this.routePrefix + '/package/install', async(ctx, next) => {
            const { name } = ctx.query;
            // 依赖本地资源下载服务
            const installResult = await this.installHotModule(name)
            ctx.body = installResult
            
            await next();
        });
    }

    getOSProperties = () => {
        return {
            time: new Date().getTime(),
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
    
    /**
     * 使用 verdaccio 服务器提供的按名称搜索npm包方法，返回包列表
     * @param {String} name 包名称
     */
    searchPackageByName = async name => {
        const response = await axios.get(this.assetServer + '/-/verdaccio/search/' + name);
        return response.data;
    }


    async getPackageInfo(query) {
        try {
            const response = await axios.get(this.assetServer + '/' + query);
            return response.data;
        } catch (err) {
            return null
        }
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

    async uninstallHotModule(name) {
        this.logger.trace('undeploy module', name);
        const pack = await this.pkgColl.findOne({
            name: name
        });
        const moduleRequired = require(name);
        // 对于web项目 移除拷贝到public的
        if (moduleRequired.type === 'app') {
            if (moduleRequired.route) {
                await fs.promises.rmdir(path.resolve('./public', moduleRequired.route), {
                    recursive: true
                });
            }
        }
        
        await this.pkgColl.remove({ name });
        await execa('npm uninstall ' + name);
        return pack;
    }

    /**
     * 加载模块， 记录到 boot/hot-packages中
     */
    async installHotModule(name) {
        const result = {}
        this.logger.debug('install package: ', name);

        await execa('npm uninstall ' + name);
        const installResult = await execa('npm i ' + name);

        result.installResult = installResult
        
        this.logger.trace(installResult);
        
        let installedPackage = require(name);
        
        let pack = await this.pkgColl.findOne({
            name: name
        });

        if (pack) {
            if (pack.version !== installedPackage.version) {
                await this.pkgColl.patch(pack._id, {
                    version,
                    updated: new Date()
                })
            }
        } else {
            pack = await this.pkgColl.insert({
                name,
                description: installedPackage.description,
                version: installedPackage.version,
                type: installedPackage.type,
                created: new Date()
            });
        }

        if (installedPackage.type === 'app') {
            await this.copyWebModule(name, modulePath);
        } else if (installedPackage.type === 'node') {
            result.start = await this.startHotModule(name);
        }

        return result
    }

    async copyWebModule(name, modulePath) {
        const destPath = path.resolve('./public', name);

        await fsExtra.copy(modulePath + '/public', destPath);
    }

    /**
     * 启动模块内容
     */
    async startHotModule(moduleName) {
        try {
            const packageModule = require(moduleName);
            await this.booter.loadPackage(packageModule);
            // 标识为热启动模块
            packageModule.hot = true;
            await this.pkgColl.patch({
                name: moduleName
            }, {
                started: new Date()
            })

        } catch (err) {
            if (this.logger) {
                this.logger.error('pack start error %O', err);
            }
            return err;
        }
        return 'started';
    }
};
