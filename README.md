# Ssh tunneling for nodejs

A ssh tunneling written in nodejs.

## features

- ✨ ***auto reconnect***: A ssh client which can always reconnect automatically by client side.
- ✨ ***port forward***: Another mainly capacity is ssh tunnel port forwarding even behind a hopping server,such as a socks server.
- ✨ ***port checking and finding***: If local port is used, the client will find a available local port to proxy.
- ✨ ***command executing***: Execute any linux command.

### examples

#### simple ssh port forwarding

An example that fowarding port 3000 to 192.168.1.1:3000 through a ssh tunnel.  
The original ssh command is `ssh -L 3000:192.168.1.1:3000 -i ~/.ssh/myPrivateKey myUsername@192.168.1.1`

```typescript
import { SshTunnel } from 'ssh-tunneling';

const sshConfig = {
  host: '192.168.1.1',
  port: 22,
  username: 'myUsername',
  privateKey: fs.readFileSync('~/.ssh/myPrivateKey'),
};
const sshTunnel = new SshTunnel(sshConfig);
const result = await sshTunnel.proxy('3000:192.168.1.1:3000');
// { localPort: 3000, destHost: '192.168.1.1', destPort: 3000, key: '3000:192.168.1.1:3000' }
// or multiple port fowarding if passing an array
const multiResult = await sshTunnel.proxy(['3000:192.168.1.1:3000', '3001:192.168.1.1:3001']);
// [
//    { localPort: 3001, destHost: '192.168.1.1', destPort: 3000, key: '3000:192.168.1.1:3000' },
//    { localPort: 3002, destHost: '192.168.1.1', destPort: 3001, key: '3001:192.168.1.1:3001' },
// ]
// And it will auto find a idle local port if the port pass in is useing.

```

#### ssh port forwarding through a socks5 server

An example that fowarding port 3000 to 192.168.1.1:3000 through a ssh tunnel which only can be connect through a sock5 server.  
The original ssh command is `ssh -o ProxyCommand="nc -X 5 -x 180.80.80.80:1080 %h %p" -L 3000:192.168.1.1:3000 -i ~/.ssh/myPrivateKey myUsername@192.168.1.1`

```typescript
import { SshTunnel } from 'ssh-tunneling';

const sshConfig = {
  host: '192.168.1.1',
  port: 22,
  username: 'myUsername',
  privateKey: fs.readFileSync('~/.ssh/myPrivateKey'),
  socksServer: 'socks5://180.80.80.80:1080',
};
const sshTunnel = new SshTunnel(sshConfig);
const result = await sshTunnel.proxy('3000:192.168.1.1:3000');
// { localPort: 3000, destHost: '192.168.1.1', destPort: 3000, key: '3000:192.168.1.1:3000' }
// or multiple port fowarding if passing an array
const multiResult = await sshTunnel.proxy(['3000:192.168.1.1:3000', '3001:192.168.1.1:3001']);
// [
//    { localPort: 3001, destHost: '192.168.1.1', destPort: 3000, key: '3000:192.168.1.1:3000' },
//    { localPort: 3002, destHost: '192.168.1.1', destPort: 3001, key: '3001:192.168.1.1:3001' },
// ]
// And it will auto find a idle local port if the port pass in is useing.
```

### command executing

Also, you can execute any command through the ssh client

```typescript
import { SshTunnel } from 'ssh-tunneling';

const sshConfig = {
  host: '192.168.1.1',
  port: 22,
  username: 'myUsername',
  privateKey: fs.readFileSync('~/.ssh/myPrivateKey'),
};
const sshTunnel = new SshTunnel(sshConfig);
const result = await sshTunnel.exec('uptime');
```
