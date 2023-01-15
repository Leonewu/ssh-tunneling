import net from 'net';

export const checkPortAvailable = (port: number) => {
  return new Promise((resolve) => {
    const server = net.createServer()
      .listen(port)
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

export const getAvailablePort = async (port: number) => {
  if (port > 65535) {
    throw new Error('There is no available port');
  }
  const isAvailable = await checkPortAvailable(port);
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