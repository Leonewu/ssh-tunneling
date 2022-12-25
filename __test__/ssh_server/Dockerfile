# a container has a ssh server and a http server


FROM centos:7
RUN yum install openssh-server -y; \
    yum install nc -y; \
    yum install net-tools -y
COPY ./config/sshd_config /etc/ssh/sshd_config
RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key; \
    ssh-keygen -t dsa -f /etc/ssh/ssh_host_dsa_key; \
    ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key; \
    ssh-keygen -t ecdsa -f /etc/ssh/ssh_host_ecdsa_key; \
    mkdir -p ~/.ssh; \
    touch /root/.ssh/authorized_keys;
COPY ./config/authorized_keys /root/.ssh/authorized_keys
COPY ./ssh_server/bootstrap.sh ./bootstrap.sh
COPY ./ssh_server/http.sh ./http.sh
RUN chmod 600 /root/.ssh 
ENTRYPOINT [ "/bin/bash", "bootstrap.sh"] 
EXPOSE 22
# EXPOSE 80