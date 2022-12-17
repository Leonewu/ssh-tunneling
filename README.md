# ssh tunneling

This is a ssh tunneling written in nodejs.

## features

- ✨ ***auto reconnect***: A ssh client which can always reconnect automatically by client side.
- ✨ ***port forward***: Another mainly capacity is ssh tunnel port forwarding even behind a hopping server,such as a socks server.
- ✨ ***command executing***.

### ssh port frowarding

#### simple ssh port forwarding

An example that fowarding port 3000 to 192.168.1.1:3000 through a ssh tunnel.  
The original ssh command is `ssh -L 3000:192.168.1.1:3000 -i ~/.ssh/myPrivateKey myUsername@192.168.1.1`

```typescript
const sshConfig = {
  host: '192.168.1.1',
  port: 22,
  username: 'myUsername',
  privateKey: fs.readFileSync('~/.ssh/myPrivateKey'),
};
const sshTunnel = new SshTunnel(sshConfig);
await sshTunnel.proxy('3000:192.168.1.1:3000');
// multiple port fowarding 
await sshTunnel.proxy(['3000:192.168.1.1:3000', '3001:192.168.1.1:3001']);
```

#### ssh port forwarding through a socks5 server

An example that fowarding port 3000 to 192.168.1.1:3000 through a ssh tunnel which only can be connect through a sock5 server.  
The original ssh command is `ssh -o ProxyCommand="nc -X 5 -x 180.80.80.80:1080 %h %p" -L 3000:192.168.1.1:3000 -i ~/.ssh/myPrivateKey myUsername@192.168.1.1`

```typescript
const sshConfig = {
  host: '192.168.1.1',
  port: 22,
  username: 'myUsername',
  privateKey: fs.readFileSync('~/.ssh/myPrivateKey'),
  socksServer: 'socks5://180.80.80.80:1080',
};
const sshTunnel = new SshTunnel(sshConfig);
await sshTunnel.proxy('3000:192.168.1.1:3000');
// If you want to forward multiple port, just passing an array.
await sshTunnel.proxy(['3000:192.168.1.1:3000', '3001:192.168.1.1:3001']);
```

### command executing

Also, you can execute any command through the ssh client

```typescript
const sshConfig = {
  host: '192.168.1.1',
  port: 22,
  username: 'myUsername',
  privateKey: fs.readFileSync('~/.ssh/myPrivateKey'),
};
const sshTunnel = new SshTunnel(sshConfig);
const result = await sshTunnel.exec('uptime');
```
