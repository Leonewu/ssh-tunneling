import * as net from 'net';
import { Client as SshClient, ConnectConfig as SshConnectConfig } from 'ssh2';
import { SocksClient, SocksClientOptions } from 'socks';
import logger from './logger';
import { getAvailablePort } from './utils';
import EventEmitter from 'events';

const buffer: any = {};

export enum STATUS {
  INIT = 0,
  CONNECTING,
  READY,
  CHECKING,
  CLOSE,
}

type ProxyConfig =  {
  localPort: number;
  destHost: string;
  destPort: number;
  id: string | number;
}

export type SshConfig = SshConnectConfig & {
  /**
   * @description socks hopping server for ssh connection
   * @example socks5://user:password@180.80.80.80:1080
   */
  hoppingServer?: string;
}

class SshTunnel extends EventEmitter {
  constructor(sshConfig: SshConfig) {
    super();
    const { hoppingServer, ...restConfig } = sshConfig;
    if (hoppingServer) {
      // 初始化 socks 配置
      // socks5://user:password@180.80.80.80:1080
      const socksReg = /socks(\d):\/\/([^:]+(?::[^:]+)?@)?([\d.]+):(\d+)/;
      const [, hoppingSocksType, authInfo = '', hoppingIp, hoppingPort] =
        socksReg.exec(hoppingServer) || [];
      if (!hoppingIp || !hoppingPort || !hoppingSocksType) {
        throw new Error('socks服务配置错误');
      }
      const [userId, password] = authInfo.slice(0, -1).split(':');
      this.socksConfig = {
        proxy: {
          host: hoppingIp,
          port: Number(hoppingPort),
          type: Number(hoppingSocksType) as 4 | 5,
          userId: decodeURIComponent(userId),
          password: decodeURIComponent(password),
        },
        command: 'connect',
        destination: {
          host: sshConfig.host || '',
          port: 22,
        },
        timeout: 10000,
      };
    }
    this.sshConfig = {
      ...restConfig,
      // debug(info) {
      //   console.log(new Date().toISOString(), info);
      // }
    };
  }

  private readonly socksConfig?: SocksClientOptions;

  private readonly sshConfig: SshConnectConfig;
  
  private proxyList: {
    localPort: number;
    destHost: string;
    destPort: number;
    id?: string | number;
    server: net.Server;
    type: 'out' | 'in';
  }[] = [];

  private socksSocket?: net.Socket;

  private sshClient?: SshClient;

  private socksStatus: STATUS = STATUS.INIT;

  private sshStatus: STATUS = STATUS.INIT;

  private socksPromise?: Promise<net.Socket>;

  private sshPromise?: Promise<SshClient>;

  /**
   * 获取 socks 实例
   */
  private readonly createSocksClient = async () => {
    if (this.socksSocket && this.socksStatus === STATUS.READY) {
      return this.socksSocket;
    }
    if (
      this.socksPromise !== undefined &&
      this.socksStatus === STATUS.CONNECTING
    ) {
      return this.socksPromise;
    }
    if (this.socksConfig) {
      const socksClient = await SocksClient.createConnection(this.socksConfig);
      this.socksStatus = STATUS.CONNECTING;
      this.socksPromise = new Promise((resolve, reject) => {
        try {
          // 清空上一个 socket 的监听函数
          this.socksSocket?.removeAllListeners();
          this.socksSocket = socksClient.socket;
          const onClose = (e: string) => {
            logger.info(`socks event ${e}`);
            this.socksStatus = STATUS.CLOSE;
            this.socksSocket = undefined;
            this.socksPromise = undefined;
          };
          this.socksSocket
            ?.on('close', () => onClose('close'))
            ?.on('end', () => onClose('end'))
            ?.on('error', () => onClose('error'));
          resolve(this.socksSocket);
          this.socksStatus = STATUS.READY;
          this.socksPromise = undefined;
        } catch (e) {
          this.socksStatus = STATUS.CLOSE;
          this.socksSocket = undefined;
          this.socksPromise = undefined;
          reject(e);
        }
      });
      return this.socksPromise;
    } else {
      throw new Error('没有读取到 socks 配置');
    }
  };

  /**
   * 获取已经成功连接的 ssh 实例
   */
  private readonly createSshClient = async () => {
    // if (this.sshClient) {
    //   return this.sshClient;
    // }
    // if (this.sshStatus === STATUS.READY) {
    //   return this.sshClient;
    // }
    // if (this.sshStatus === STATUS.CONNECTING) {
    //   return this.sshPromise;
    // }
    // this.sshStatus = STATUS.CONNECTING;
    const onClose = (event: string, error?: any) => {
      // logger.info(`ssh ${event}`);
      // this.sshStatus = STATUS.CLOSE;
      // this.sshPromise = undefined;
      // this.socksSocket?.destroy(
      //   new Error(error.message || 'closed by sshClient'),
      // );
      // error && logger.warn(`ssh ${event} `, error.message);
    };
    this.sshClient = new SshClient();
    this.sshClient
      .on('error', e => {
        // onClose('error', e);
        logger.red(`first listened error event:${e}`)
      })
      .on('close', e => {
        // onClose('close', e);
        logger.red(`first listened close event:${e}`)
      })
    //   .on('timeout', () => {
    //     onClose('timeout');
    //   })
    //   .on('end', () => {
    //     onClose('end');
    //   });
  };

  /** */
  public async connect() {
    logger.bgBlue(`调用 connect 函数, ${STATUS[this.sshStatus]}`);
    if (this.sshStatus === STATUS.READY) {
      return this.sshClient;
    }
    if (this.sshStatus === STATUS.CONNECTING) {
      return this.sshPromise;
    }
    this.sshStatus = STATUS.CONNECTING;
    let socksSocket: net.Socket;
    this.sshPromise = new Promise(async (resolve, reject) => {
    logger.bgBlue(`开始连接, ${STATUS[this.sshStatus]}`);
      if (this.socksConfig) {
        socksSocket = await this.createSocksClient();
      }
      const onError = async (e: any) => {
        try {
          // TODO: create instance every time will lose any packages?
          // this.stream = 'pause';
          // this.emit('pause');
          this.socksSocket?.destroy();
          this.socksStatus = STATUS.CLOSE;
          this.sshClient?.destroy();
          this.sshStatus = STATUS.CLOSE;
          await this.createSshClient();
          await this.connect();
        } catch(e) {
          reject(`连接失败 ${e || ''}`)
        }
      }

      const onReady = async () => {
        logger.purple('ssh connection ready');
        this.sshStatus = STATUS.READY;
        try {
          console.log('连接完成后检查一下');
          await this.throttleCheckAlive();
          resolve(true);
        } catch(e) {
          this.sshStatus = STATUS.CLOSE;
          console.log(e);
          reject(e);
        }
      }
      this.sshClient?.once('ready', onReady);
      this.sshClient?.on('error', onError);
      try {
        this.sshClient?.connect({
          readyTimeout: 10000,
          ...this.sshConfig,
          sock: socksSocket,
        })
      } catch(e) {
        this.sshClient?.removeListener('error', onError);
        logger.error(`ssh connection error${e}`);
        this.sshStatus = STATUS.CLOSE;
        throw e;
      }
    })
    return this.sshPromise;
  }

  private async _exec(command: string): Promise<string> {
    let res = '';
    return new Promise((resolve, reject) => {
      this.sshClient?.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        stream.on('data', data => {
          res += data.toString('utf8');
        });
        stream.on('close', () => {
          resolve(res);
        });
        stream.stderr.on('data', data => {
          reject(data.toString('utf8'));
          stream.close();
        });
      });
    });
  }

  public exec(command: string): Promise<string>

  public exec(command: string[]): Promise<{ command: string; result: string }[]>

  /**
   * @description execute command
   * @params a command or commands array
   * @return If passing one command, it will return the result after executed.
   * @return If passing a command array, it will return an array by order after all of them were executed.
   */
  public async exec(command: any): Promise<any> {
    if (!this.sshClient) {
      await this.createSshClient();
    }
    const alive = await this.throttleCheckAlive();
    logger.bgBlue(alive)
    if (!alive) {
      // logger.white('ssh connection was hung up, reconnecting...');
      await this.connect().catch(e => {});
    }
    if (Array.isArray(command)) {
      const divider = '__ssh_tunneling_divider__'
      const combinedCommand = command.join(` && echo -n ${divider} && `);
      const res = (await this._exec(combinedCommand)).split(divider);
      return command.map((item, i) => {
        return {
          command: item,
          result: res[i]
        }
      });
    }
    return this._exec(command);
  }

  /**
   * ssh hearbeat
   */
  private heartbeatPromise?: Promise<boolean>;

  /**
   * 手动查询 ssh 是否被挂起
   */
  private readonly throttleCheckAlive = async () => {
    console.log('调用 check函数', STATUS[this.sshStatus])
    if (this.sshStatus === STATUS.CONNECTING) {
      await this.connect();
    }
    if (![STATUS.CHECKING, STATUS.READY].includes(this.sshStatus)) {
      return false;
    }
    if ([STATUS.CHECKING].includes(this.sshStatus)) {
      return this.heartbeatPromise;
    }
    this.sshStatus = STATUS.CHECKING;
    const uuid = performance.now();
    this.heartbeatPromise = new Promise<boolean>(async resolve => {
      console.log('检查ssh exec连接状态');
      try {
        const res = await Promise.race([
          this._exec(`echo 1`),
          new Promise((_, rej) => {
            setTimeout(() => {
              rej('exec timeout');
            }, 3000);
          }),
        ]);
        console.log('检查ssh exec连接状态成功');
        this.sshStatus = STATUS.READY;
        resolve(true);
      } catch (e) {
        //  exec 时会判断是否 not connected
        console.log('ssh exec 失败', e)
        resolve(false);
        this.sshStatus = STATUS.CLOSE;
        this.sshClient.end();
      }
    }).finally(() => {

      // setTimeout(() => {
      //   // 防止大量并发请求进来时导致 channel 连接数过大，状态默认缓存 3s 后，自动销毁
      //   this.heartbeatPromise = undefined;
      // }, 5000);
    });
    return this.heartbeatPromise;
  };

  private genSshCommand(proxyConfig: ProxyConfig) {
    const {
      localPort,
      destHost,
      destPort
    } = proxyConfig;
    if (this.socksConfig) {
      let str = `ssh -o StrictHostKeyChecking=no -o ProxyCommand="nc -X ${this.socksConfig?.proxy.type} -x ${this.socksConfig?.proxy.host}:${this.socksConfig?.proxy.port} %h %p" ${this.sshConfig.username}@${this.sshConfig.host} -L ${localPort}:${destHost}:${destPort}`;
      // if (this.socksConfig.proxy.userId) {
      //   str += ` --proxy-auth "${this.socksConfig.proxy.userId}${this.socksConfig.proxy.password ? `:${this.socksConfig.proxy.password}` : ''}"`;
      // }
      return str;
    }
    return `ssh -o StrictHostKeyChecking=no ${this.sshConfig.username}@${this.sshConfig.host} -L ${localPort}:${destHost}:${destPort}`;
  }


  public async autoReconnect() {
    try {
      await this.connect();
    } catch(e) {
      logger.warn(`ssh autoReconnect error, ${e}`);
      return this.autoReconnect();
    }
  }

  private _forwardOut = async (proxyConfig: ProxyConfig) => {
    const { localPort, destHost, destPort, id } = proxyConfig;
    if (this.proxyList.find(item => item.id === id)) {
      throw new Error(`id ${id} is duplicated, use another one please`);
    }
    logger.bgBlack(this.genSshCommand(proxyConfig));
    if (!this.sshClient) {
      await this.createSshClient();
    }
    // TODO: 这里要加回来
    await this.connect();
    const server = net
      .createServer({
        keepAlive: true,
      }, async socket => {
        try {
          logger.bgYellow(`createServer 回调，请求进来了', ${[localPort, destHost, destPort, id].join('-----')}`);
          const alive = await this.throttleCheckAlive();
          if (!alive) {
            logger.white('请求进来后检查状态返回失败，开始重连: ssh connection was hung up, reconnecting...');
            await this.connect();
          }
          // 并发 exec(`nc ip port`) 数量在超过 服务器 ssh 设置的最大 channel 数时（一般是 10），会有 Channel open failure 的问题
          // @see https://github.com/mscdex/ssh2/issues/219
          // forwardOut 的 localPort 可以为任意数字，不影响
          this.sshClient!.forwardOut(
            '127.0.0.1',
            1234,
            destHost,
            destPort,
            (err, stream) => {
              if (err) {
                logger.warn(`${id} forwardout err: ${err.message}`);
                if (err.message?.includes('Connection refused')) {
                  logger.bgRed(
                    `朋友，检查一下目标服务器端口 ${id} ${destHost}:${destPort} 是否正常`,
                  );
                }
                socket.end();
                return;
              }
              // https://stackoverflow.com/questions/17245881/how-do-i-debug-error-econnreset-in-node-js
              // if no error hanlder, it may occur this error which casued by client side.
              // Then the local server will exit.
              // Error: read ECONNRESET
              // at TCP.onStreamRead (node:internal/stream_base_commons:217:20) {
              //   errno: -54,
              //   code: 'ECONNRESET',
              //   syscall: 'read'
              // }
              socket.on('error', err => {
                console.log('[ssh-tunneling]: local socket error\n', err);
              });
              stream.on('error', err => {
                console.log('[ssh-tunneling]: remote stream error\n', err);
              });
              // pipeline(socket, stream);
              // pipeline(stream, socket);
              logger.bgGreen(`forwardOut 回调，请求进来了 ${[localPort, destHost, destPort, id].join('-----')}，注册事件`)
              // this.once('pause', () => {
                // logger.bgMint(`${[localPort, destHost, destPort, id].join('-----')} 暂停传输，状态为 socket: ${socket.isPaused() ? '暂停中' : '已恢复'} stream: ${stream.isPaused() ? '暂停中' : '已恢复'}`);
                // console.log('\n');
                // stream.pause();
                // socket.pause();
              // });

              // this.once('resume', () => {
              //   // logger.bgOrange(`${[localPort, destHost, destPort, id].join('-----')} 恢复传输, 状态为 socket: ${socket.isPaused() ? '暂停中' : '已恢复'} stream: ${stream.isPaused() ? '暂停中' : '已恢复'}`);
              //   // console.log('\n');
              //   // stream.resume();
              //   // socket.resume();
              //   logger.bgOrange(`resume ${[localPort, destHost, destPort, id].join('-----')}`);
              //   if (buffer[id]?.length) {
              //     console.log('buffer', id, buffer[id].length);
              //     buffer[id].forEach(stream.write);
              //   }
              // });

              socket.pipe(stream);
              stream.pipe(socket);
              socket.on('end', () => {
                stream.end();
              });
              stream.on('end', () => {
                socket.end();
              })
              // socket.on('data', data => {
              //   // logger.orange(`local data, ${data.toString('utf8')}`)
              //   logger.orange(`local data ${[localPort, destHost, destPort, id].join('-----')}, ${this.stream}`)
              //   if (this.stream !== 'resume') {
              //     console.log('入站')
              //     if (!buffer[id]) {
              //       buffer[id] = [];
              //     }
              //     buffer[id].push(data);
              //     // socket.pause();
              //     // stream.pause();
              //   } else {
              //     if (buffer[id]?.length) {
              //       console.log('buffer', id, buffer[id].length);
              //       buffer[id].forEach(stream.write);
              //     }
              //     stream.write(data);
              //   }
              // })
              // stream.on('data', data => {
              //   // logger.green(`remote data, ${data.toString('utf8')}`)
              //   logger.green(`remote data ${[localPort, destHost, destPort, id].join('-----')}`)
              //   socket.write(data);
              // })
            },
          );

        } catch (e) {
          console.error(e);
          logger.warn(e ?? e.message);
          logger.white('error retry: ssh connection was hung up, reconnecting...');
          await this.autoReconnect();
          // this.createSshClient().catch(err => {
          //   logger.warn(err.message);
          //   socket.end();
          // });
        }
      })
      .listen(localPort)
      .on('connection', async () => {
        // console.log('connection');
        // server?.getConnections((err, count) => {
        //   console.log(`当前有${count}个连接`);
        // })
      }).on('listening', () => {
        // console.log(`listening ${localPort}`);
      }).on('close', () => {
        logger.gray(`proxy server ${id} is closed`);
      });
    this.proxyList.push({
      localPort,
      destHost,
      destPort,
      server,
      id,
      type: 'out'
    });
    logger.startLine().mint('proxy server ').blue(id).mint(` is listening on 127.0.0.1:${localPort} => ${destHost}:${destPort}`).endLine();
    return proxyConfig;
  };


  public forwardOut(proxyConfig: string): Promise<ProxyConfig>

  public forwardOut(proxyConfig: { id: string | number, proxy: string }): Promise<ProxyConfig>

  public forwardOut(proxyConfig: string[]): Promise<ProxyConfig[]>

  public forwardOut(proxyConfig: { id: string | number, proxy: string }[]): Promise<ProxyConfig[]>

  /**
   * @description ssh port forwarding
   * @expample proxy('3000:192.168.1.1:3000')
   * @expample proxy(['3000:192.168.1.1:3000', '3001:192.168.1.1:3001'])
   */
  public async forwardOut (proxyConfig: any): Promise<any> {
    if (Array.isArray(proxyConfig)) {
      const result: ProxyConfig[] = [];
      await proxyConfig.reduce((pre, config) => {
        return pre.then(async () => {
          let localPort: string = '';
          let destHost: string = '';
          let destPort: string = '';
          let id: string | number = '';
          if (typeof config === 'string') {
            [localPort, destHost, destPort] = config.split(':') || [];
            id = config;
          }
          if (Object.prototype.toString.call(config) === '[object Object]') {
            [localPort, destHost, destPort] = config.proxy.split(':') || [];
            id = config.id;
          }
          if ([localPort, destHost, destPort, id].some(s => !s)) {
            throw new Error(`params ${typeof proxyConfig === 'string' ? proxyConfig :JSON.stringify(proxyConfig)} is invalid`)
          }
          localPort = await getAvailablePort(Number(localPort));
          const params = {
            localPort: Number(localPort),
            destHost,
            destPort: Number(destPort),
            id
          }
          await this._forwardOut(params);
          result.push(params);
        });
      }, Promise.resolve());
      return result;
    }
    if (typeof proxyConfig === 'string') {
      const [localPort, destHost, destPort] = proxyConfig.split(':');
      const availablePort = await getAvailablePort(Number(localPort));
      const params: ProxyConfig = {
        localPort: availablePort,
        destHost,
        destPort: Number(destPort),
        id: proxyConfig
      }
      await this._forwardOut(params);
      return params;
    }
    if (Object.prototype.toString.call(proxyConfig) === '[object Object]') {
      const [localPort, destHost, destPort] = proxyConfig.proxy.split(':') || [];
      const availablePort = await getAvailablePort(Number(localPort));
      const params: ProxyConfig = {
        localPort: availablePort,
        destHost,
        destPort: Number(destPort),
        id: proxyConfig.id
      }
      await this._forwardOut(params);
      return params;
    }
    throw new Error(`params ${proxyConfig} is invalid`);
  }

  /**
   * @descrption close tunnel and destroy all the instance
   * @params key: The server key you want to close.If passing empty, it will close all the servers and the main ssh client.
   */
  public close = async (id?: string | number) => {
    if (!id) {
      this.sshClient?.destroy();
      this.socksSocket?.destroy();
    }
    const targetList = this.proxyList.filter(item => id ? item.id === id : true);
    targetList.forEach(item => item.server.close());
  }

  getSSHClient(): SshClient | undefined  {
    return this.sshClient
  }
  getSocksStatus(): STATUS {
    return this.socksStatus
  }

}

export { logger, SshTunnel, getAvailablePort }