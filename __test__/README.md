# test

1. generate a pair of ssh keys locally. `ssh-keygen -m PEM -t rsa -b 4096 -Cssh@docker`

2. create a dockerfile

    - centos system
    - install openssh-server
    - configure ssh config
    - copy authorized keys
    - start a sshd server
    - export port

3. `docker build -t ssh .`
4. `docker run --name ssh -p 1234:22 -d ssh`
