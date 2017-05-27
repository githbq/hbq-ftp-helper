const PromiseFtp = require('promise-ftp')
const fs = require('fs')
const pathTool = require('path')
const mkdirpPromise = require('mkdirp-promise')
const FTP_STATE = {
    notYetConnected: 'not yet connected',
    connecting: 'connecting',
    connected: 'connected',
    loggingOut: 'logging out',
    disconnecting: 'disconnecting',
    disconnected: 'disconnected',
    reconnecting: 'reconnecting'
}
module.exports = class {
    private defaultFtpConfig
    private defaultOptions
    public ftpConfig
    public options
    public prefix
    public isShowLog
    public ftpConnection
    constructor(ftpConfig, options) {
        options = options || {}
        //默认ftp配置
        this.defaultFtpConfig = {}
        //     {
        //     host: '',
        //     port: 21,
        //     user: '',
        //     password: ''
        // }
        //实际ftp配置
        this.ftpConfig = Object.assign({}, this.defaultFtpConfig, ftpConfig)
        //默认选项
        this.defaultOptions = {
            isShowLog: true,
            isOnce: true
        }
        //实际选项
        this.options = Object.assign({}, this.defaultOptions, options)
        //统一路径 前缀
        this.prefix = this.options.prefix || ''
        //showLog
        this.isShowLog = this.options.isShowLog || false
        //连接实例
        this.ftpConnection = null
    }
    //获取状态
    getStatus(connection) {
        if (connection || this.ftpConnection) {
            return (connection || this.ftpConnection).getConnectionStatus()
        } else {
            return null
        }
    }
    //创建链接
    getConnection(isOnce: Boolean = false) {
        let connection = null
        let connectionPromise = null
        if (isOnce) {
            connection = new PromiseFtp()
            connectionPromise = connection.connect(this.ftpConfig)
        } else {
            if (!this.ftpConnection) {
                connection = this.ftpConnection = new PromiseFtp()
                connectionPromise = connection.connect(this.ftpConfig)
            } else {
                connection = this.ftpConnection
                if (this.getStatus(connection) !== FTP_STATE.connected) {
                    connectionPromise = this.ftpConnection.reconnect(this.ftpConfig)
                } else {
                    return Promise.resolve(connection)
                }
            }
        }
        return connectionPromise.then(() => {
            return connection
        })
    }
    //路径处理
    pathResolve(pathStr) {
        return pathStr.replace(/\\/g, '/')
    }
    //远程路径处理
    resolveRemotePath(remotePath, isAbsolute) {
        let prefix = isAbsolute ? '' : this.prefix
        return this.pathResolve(pathTool.join(prefix, remotePath))
    }
    //关闭连接
    closeConnection(connection) {
        return (connection || this.ftpConnection).end()
            .catch(() => { })
            .then(() => {
                this.showLog(`connection:ended`)
            })
    }
    //打印log
    showLog(arg) {
        this.isShowLog && console.log(arg)
    }
    //一次性获取列表
    getListOnce(remotePath, isAbsolute) {
        return this.getList(remotePath, isAbsolute, true)
    }
    //获取列表
    getList(remotePath, isAbsolute, isOnce) {
        let result = null
        remotePath = this.resolveRemotePath(remotePath, isAbsolute)
        let connection = null
        return this.getConnection(isOnce).then((con) => {
            connection = con
            return connection.list(remotePath)
        })
            .then((list) => {
                result = list
                if (isOnce) {
                    return this.closeConnection(connection)
                }
            })
            .then(() => {
                this.showLog(`getList:complete remotePath:${remotePath}`)
                this.showLog(result)
                return result
            })
    }
    //一次性删除
    deleteOnce(remotePath, isAbsolute) {
        return this.delete(remotePath, isAbsolute, true)
    }
    //删除
    delete(remotePath, isAbsolute, isOnce) {
        remotePath = this.resolveRemotePath(remotePath, isAbsolute)
        let connection = null
        return this.getConnection(isOnce).then((con) => {
            connection = con
            return connection.delete(remotePath)
        }).then(() => {
            this.showLog(`delete:complete remotePath:${remotePath}`)
            if (isOnce) {
                return this.closeConnection(connection)
            }
        })

    }
    //一次性上传
    uploadOnce(filePath, remotePath, isAbsolute) {
        return this.upload(filePath, remotePath, isAbsolute, true)
    }
    //上传
    upload(filePath, remotePath, isAbsolute, isOnce) {
        // remotePath 对应FTP上的文件路径  xx/xxx.txt 
        //filePath 本地磁盘上的文件路径   xx/xxx.txt or can be a ReadableStream, a Buffer, or a path to a local file
        remotePath = this.resolveRemotePath(remotePath, isAbsolute)
        let connection = null
        return this.getConnection(isOnce)
            .then((con) => {
                let dirname = pathTool.dirname(remotePath)
                this.showLog(`mkpath:${dirname}`)
                connection = con
                return connection.mkdir(dirname, true)
            }).then((serverMessage) => {
                this.showLog(`serverMessage:${serverMessage}`)
                return connection.put(filePath, remotePath)
            }).then(() => {
                if (isOnce) {
                    return this.closeConnection(connection)
                }
            }).then(() => {
                this.showLog(`upload:complete remotePath:${remotePath}`)
                return { remotePath }
            })
    }
    downloadOnce(localPath, remotePath, isAbsolute) {
        return this.download(localPath, remotePath, isAbsolute, true)
    }
    //下载
    download(localPath, remotePath, isAbsolute, isOnce) {
        remotePath = this.resolveRemotePath(remotePath, isAbsolute)
        let connection = null
        let localFilePath = pathTool.resolve(localPath)
        let dirName = pathTool.dirname(localFilePath)
        return this.getConnection()
            .then((con) => {
                connection = con
                return mkdirpPromise(dirName)
            }).then(() => {
                return connection.get(remotePath)
            }).then((stream) => {
                return new Promise((resolve, reject) => {
                    stream.once('close', resolve)
                    stream.once('error', reject)
                    stream.pipe(fs.createWriteStream(localFilePath))
                })
            }).then(() => {
                if (isOnce) {
                    return this.closeConnection(connection)
                }
            }).then(() => {
                this.showLog(`download:complete localPath:${localPath}`)
                return { localPath, remotePath }
            })
    }
}