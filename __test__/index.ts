import { SshTunnel } from '../src';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';


// simple case: ssh connetion establishment, command excuting via ssh client, ssh port forwarding
(async () => {
  const client = new SshTunnel({
    host: '127.0.0.1',
    port: 12345,
    privateKey: fs.readFileSync(path.resolve(__dirname, './config/private_key')),
    username: 'root',
  });
  const res = await client.exec('echo 1');
  console.log('echo 1 expected 1, received:', res);
  await client.forwardOut('88:127.0.0.1:80');
  const response = await fetch('http://127.0.0.1:88');
  const data = await response.text();
  console.log('http request expected ssh, received: ', data);
  client.close();
})();


// complicated case: ssh connetion establishment toward a socks server, excute command and foward out port via ssh client
(async () => {
  const client = new SshTunnel({
    host: '172.18.0.123',
    port: 22,
    privateKey: fs.readFileSync(path.resolve(__dirname, './config/private_key')),
    username: 'root',
    hoppingServer: 'socks5://127.0.0.1:12346'
  });
  const res = await client.exec('echo 1');
  console.log('echo 1 expected 1, received:', res);
  const proxy1 = await client.forwardOut([{
    id: 'proxy1-1',
    proxy: '88:127.0.0.1:80'
  }, {
    id: 'proxy1-2',
    proxy: '88:127.0.0.1:80'
  }]);
  const proxy2 = await client.forwardOut({
    id: 'proxy2',
    proxy: '88:127.0.0.1:80'
  });
  const proxy3 = await client.forwardOut(['88:127.0.0.1:80', '89:127.0.0.1:80']);
  const proxy4 = await client.forwardOut('90:127.0.0.1:80');
  console.log(proxy1);
  console.log(proxy2);
  console.log(proxy3);
  console.log(proxy4);
  const response = await fetch('http://127.0.0.1:88');
  const data = await response.text();
  console.log('http request expected ssh, received: ', data);
  client.close();
})();