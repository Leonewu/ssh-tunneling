import net from 'net';

export const checkPortAvailable = (port: number, host?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer()
      .listen(port, host)
      .on('listening', () => {
        resolve(true);
        server.close();
      })
      .on('error', (err) => {
        if ((err as any)?.code === 'EADDRINUSE') {
          resolve(false);
        }
      });
  });
}

/**
 * @description check whether port is idle and then return another idle port if the port pass in is unavailable
 */
export const getAvailablePort = async (port: number) => {
  if (port > 65535) {
    throw new Error('There is no available port');
  }
  // check the *
  let isAvailable = await checkPortAvailable(port);
  if (isAvailable) {
    // check the localhost 
    isAvailable = await checkPortAvailable(port, '127.0.0.1')
  }
  if (!isAvailable) {
    return getAvailablePort(port + 1);
  }
  return port;
}

export function padRight(str: string, length: number, padStr?: string) {
  if (isNaN(str.length) || length - str.length < 0) {
    return str;
  }
  return `${str}${(padStr || ' ').repeat(length - str.length)}`;
}

export function padLeft(str: string, length: number, padStr?: string) {
  if (isNaN(str.length) || length - str.length < 0) {
    return str;
  }
  return `${(padStr || ' ').repeat(length - str.length)}${str}`;
}