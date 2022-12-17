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
  srcPort: number;
  destHost: string;
  destPort: number;
}

class SshTunnel {
  constructor(sshConfig: SshConnectConfig & { socksServer?: string }) {
    const { socksServer, ...restConfig } = sshConfig;
    if (socksServer) {
      // 初始化 socks 配置
      // socks5://180.80.80.80:1080
      const socksReg = /socks(\d):\/\/([\d.]+):(\d+)/;
      const [, hoppingSocksType, hoppingIp, hoppingPort] =
        socksReg.exec(socksServer) || [];
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
    srcPort: number;
    destHost: string;
    destPort: number;
    server: net.Server;
  }[] = [];

  private socksSocket?: net.Socket;

  private sshClient?: SshClient;

  private server?: net.Server;

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

  /**
   * execute command
   */
  public async exec(command: string): Promise<string> {
    if (!this.sshClient) {
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
      srcPort,
      destHost,
      destPort
    } = proxyConfig;
    if (this.socksConfig) {
      return `ssh -o StrictHostKeyChecking=no -o ProxyCommand="nc -X ${this.socksConfig?.proxy.type} -x ${this.socksConfig?.proxy.host}:${this.socksConfig?.proxy.port} %h %p" -i ~/.ssh/${this.sshConfig.username} ${this.sshConfig.username}@${destHost} -L ${srcPort}:${destHost}:${destPort}`;
    }
    return `ssh -o StrictHostKeyChecking=no -i ~/.ssh/${this.sshConfig.username} ${this.sshConfig.username}@${destHost} -L ${srcPort}:${destHost}:${destPort}`;
  }

  private _proxy = async (proxyConfig: ProxyConfig) => {
    const { srcPort, destHost, destPort } = proxyConfig;
    if (this.proxyList.find(item => item.srcPort === srcPort)) {
      throw new Error(`local srcPort ${srcPort} is proxying`);
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
          // forwardOut 的 srcPort 可以为任意数字，不影响
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
      .listen(srcPort)
      .on('connection', async () => {
        // console.log('connection');
        // this.server?.getConnections((err, count) => {
        //   console.log(`当前有${count}个连接`);
        // })
      }).on('listening', () => {
        // console.log(`listening ${srcPort}`);
      });
    this.proxyList.push({
      srcPort, 
      destHost, 
      destPort,
      server
    });
    logger.cyan(
      `proxy server listening on 127.0.0.1:${srcPort} => ${destHost}:${destPort}`,
    );
    process.once('exit', () => {
      console.log('exit');
      this.sshClient?.destroy();
      this.socksSocket?.destroy();
      this.server?.close();
      this.proxyList.forEach(item => item.server.close());
    });
    return proxyConfig;
  };

  /**
   * @description ssh port forwarding
   * @expample proxy('3000:192.168.1.1:3000')
   * @expample proxy(['3000:192.168.1.1:3000', '3001:192.168.1.1:3001'])
   */
  public proxy = async (proxyConfig: string | string[]) => {
    if (Array.isArray(proxyConfig)) {
      const result: ProxyConfig[] = [];
      await proxyConfig.reduce((pre, config) => {
        return pre.then(async () => {
          const [srcPort, destHost, destPort] = config.split(':') || [];
          const localPort = await getAvailablePort(Number(srcPort));
          const params = {
            srcPort: localPort,
            destHost,
            destPort: Number(destPort)
          }
          await this._proxy(params);
          result.push(params)
        });
      }, Promise.resolve());
      return result;
    }
    if (typeof proxyConfig === 'string') {
      const [srcPort, destHost, destPort] = proxyConfig.split(':');
      const localPort = await getAvailablePort(Number(srcPort));
      const params: ProxyConfig = {
        srcPort: localPort,
        destHost,
        destPort: Number(destPort)
      }
      await this._proxy(params);
      return params;
    }
    throw new Error('function proxy params invalid');
  }

}

export { logger, SshTunnel }