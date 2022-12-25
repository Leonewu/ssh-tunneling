import * as net from 'net';
import { Client as SshClient, ConnectConfig as SshConnectConfig } from 'ssh2';
import { SocksClient, SocksClientOptions } from 'socks';
import logger from './logger';
import { getAvailablePort } from './utils';

enum STATUS {
  INIT = 0,
  CONNECTING,
  READY,
  CLOSE,
}

type ProxyConfig =  {
  localPort: number;
  destHost: string;
  destPort: number;
  key?: string | number;
}

class SshTunnel {
  constructor(sshConfig: SshConnectConfig & { 
    /**
     * @description socks hopping server for ssh connection 
     * @example socks5:180.80.80.80:1080
     */
    hoppingServer?: string 
  }) {
    const { hoppingServer, ...restConfig } = sshConfig;
    if (hoppingServer) {
      // 初始化 socks 配置
      // socks5://180.80.80.80:1080
      const socksReg = /socks(\d):\/\/([\d.]+):(\d+)/;
      const [, hoppingSocksType, hoppingIp, hoppingPort] =
        socksReg.exec(hoppingServer) || [];
      if (!hoppingIp || !hoppingPort || !hoppingSocksType) {
        throw new Error('socks服务配置错误');
      }
      this.socksConfig = {
        proxy: {
          host: hoppingIp,
          port: Number(hoppingPort),
          type: Number(hoppingSocksType) as 4 | 5,
        },
        command: 'connect',
        destination: {
          host: sshConfig.host || '',
          port: 22,
        },
        timeout: 10000,
      };
    }
    this.sshConfig = restConfig;
  }

  private readonly socksConfig?: SocksClientOptions;

  private readonly sshConfig: SshConnectConfig;

  private proxyList: {
    localPort: number;
    destHost: string;
    destPort: number;
    key?: string | number;
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
          const onClose = (_: string) => {
            // logger.info(`socks ${event}`);
            this.socksStatus = STATUS.CLOSE;
            this.socksSocket = undefined;
            this.socksPromise = undefined;
          };
          this.socksSocket
            .on('close', () => onClose('close'))
            .on('end', () => onClose('end'))
            .on('error', () => onClose('error'));
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
    if (this.sshPromise !== undefined && this.sshStatus === STATUS.CONNECTING) {
      return this.sshPromise;
    }
    this.sshStatus = STATUS.CONNECTING;
    let socksSocket: net.Socket;
    if (this.socksConfig) {
      socksSocket = await this.createSocksClient();
    }
    this.sshPromise = new Promise((resolve, reject) => {
      try {
        const sshClient = new SshClient();
        const onClose = (event: string, error?: any) => {
          // logger.info(`ssh ${event}`);
          this.sshStatus = STATUS.CLOSE;
          this.sshClient = undefined;
          this.sshPromise = undefined;
          this.socksSocket?.destroy(
            new Error(error.message || 'closed by sshClient'),
          );
          reject(error);
          // error && logger.warn(`ssh ${event} `, error.message);
        };
        sshClient
          .on('ready', () => {
            logger.purple('ssh connection ready');
            // 清空上一个 ssh client 的监听函数，销毁上一个 sshClient
            this.sshClient?.removeAllListeners();
            this.sshClient?.destroy();
            this.sshStatus = STATUS.READY;
            this.sshClient = sshClient;
            this.heartbeatPromise = Promise.resolve(true).finally(() => {
              setTimeout(() => {
                this.heartbeatPromise = undefined;
              }, 3000);
            });
            resolve(sshClient);
            this.sshPromise = undefined;
          })
          .connect({
            readyTimeout: 10000,
            ...this.sshConfig,
            sock: socksSocket,
          })
          .on('error', e => {
            onClose('error', e);
          })
          .on('close', e => {
            onClose('close', e);
          })
          .on('timeout', () => {
            onClose('timeout');
          })
          .on('end', () => {
            onClose('end');
          });
      } catch (e) {
        this.sshStatus = STATUS.CLOSE;
        this.sshClient = undefined;
        this.sshPromise = undefined;
        this.socksSocket?.destroy(new Error('closed by sshClient'));
        reject(e);
      }
    });
    return this.sshPromise;
  };

  private async _exec(command: string): Promise<string> {
    if (!this.sshClient) {
      await this.createSshClient();
    }
    const alive = await this.throttleCheckAlive();
    if (!alive) {
      logger.lightWhite('ssh connection was hung up, reconnecting...');
      await this.createSshClient();
    }
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
  private readonly throttleCheckAlive = () => {
    if (this.heartbeatPromise !== undefined) {
      return this.heartbeatPromise;
    }
    this.heartbeatPromise = new Promise<boolean>(resolve => {
      if (!this.sshClient) {
        resolve(false);
        return;
      }
      try {
        this.sshClient.exec(`echo 1`, {}, (err, stream) => {
          if (err) {
            resolve(false);
            return;
          }
          stream.on('data', () => {
            resolve(true);
            stream.close();
          });
          stream.stderr.on('data', () => {
            resolve(true);
            stream.close();
          });
        });
      } catch (e) {
        //  exec 时会判断是否 not connected
        resolve(false);
      }
      setTimeout(() => {
        // 手动超时 timeout
        resolve(false);
      }, 5000);
    }).finally(() => {
      setTimeout(() => {
        // 防止大量并发请求进来时导致 channel 连接数过大，状态默认缓存 3s 后，自动销毁
        this.heartbeatPromise = undefined;
      }, 3000);
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
      return `ssh -o StrictHostKeyChecking=no -o ProxyCommand="nc -X ${this.socksConfig?.proxy.type} -x ${this.socksConfig?.proxy.host}:${this.socksConfig?.proxy.port} %h %p" -i ~/.ssh/${this.sshConfig.username} ${this.sshConfig.username}@${this.sshConfig.host} -L ${localPort}:${destHost}:${destPort}`;
    }
    return `ssh -o StrictHostKeyChecking=no -i ~/.ssh/${this.sshConfig.username} ${this.sshConfig.username}@${this.sshConfig.host} -L ${localPort}:${destHost}:${destPort}`;
  }

  private _forwardOut = async (proxyConfig: ProxyConfig) => {
    const { localPort, destHost, destPort, key } = proxyConfig;
    if (this.proxyList.find(item => item.localPort === localPort && item.server?.listening)) {
      throw new Error(`localPort ${localPort} is proxying`);
    }
    // logger.lightWhite(`echo -e "${this.sshConfig.privateKey}" > ~/.ssh/${this.sshConfig.username}`);
    logger.bgBlack(this.genSshCommand(proxyConfig));
    if (!this.sshClient) {
      await this.createSshClient();
    }
    const server = net
      .createServer(async netSocket => {
        try {
          const alive = await this.throttleCheckAlive();
          if (!alive) {
            logger.lightWhite('ssh connection was hung up, reconnecting...');
            await this.createSshClient();
          }
          // 并发 exec(`nc ip port`) 数量在超过 服务器 ssh 设置的最大 channel 数时（一般是 10），会有 Channel open failure 的问题
          // @see https://github.com/mscdex/ssh2/issues/219
          // forwardOut 的 localPort 可以为任意数字，不影响
          if (this.sshClient) {
            this.sshClient.forwardOut(
              '127.0.0.1',
              1234,
              destHost,
              destPort,
              (err, stream) => {
                if (err) {
                  logger.warn('forwardout err', err.message);
                  if (err.message?.includes('Connection refused')) {
                    logger.bgRed(
                      `朋友，检查一下目标服务器端口 ${destHost}:${destPort} 是否正常`,
                    );
                  }
                  netSocket.end();
                  return;
                }
                netSocket.pipe(stream);
                stream.pipe(netSocket);
                // stream.on('data', data => {
                //   // console.log('data', data.toString('utf8'));
                //   netSocket.write(data);
                // });
              },
            );
          } else {
            throw new Error();
          }
        } catch (e) {
          logger.warn(e.message);
          logger.lightWhite('ssh connection was hung up, reconnecting...');
          this.createSshClient().catch(err => {
            logger.warn(err.message);
            netSocket.end();
          });
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
      });
    this.proxyList.push({
      localPort, 
      destHost, 
      destPort,
      server,
      key,
      type: 'out'
    });
    logger.cyan(
      `proxy server listening on 127.0.0.1:${localPort} => ${destHost}:${destPort}`,
    );
    process.once('exit', () => {
      console.log('exit');
      this.close();
    });
    return proxyConfig;
  };


  public forwardOut(proxyConfig: string): Promise<ProxyConfig>

  public forwardOut(proxyConfig: string[]): Promise<ProxyConfig[]>

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
          const [localPort, destHost, destPort] = config.split(':') || [];
          const availablePort = await getAvailablePort(Number(localPort));
          const params = {
            localPort: availablePort,
            destHost,
            destPort: Number(destPort),
            key: config
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
        key: proxyConfig
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
  public close = async (key?: string | number) => {
    if (!key) {
      this.sshClient?.destroy();
      this.socksSocket?.destroy();
    }
    const targetList = this.proxyList.filter(item => key ? item.key === key : true);
    targetList.forEach(item => item.server.close());
  }

}

export { logger, SshTunnel }