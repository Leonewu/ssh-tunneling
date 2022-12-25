# a container with socks5 server for hopping into ssh_server


FROM centos:7
RUN yum install net-tools -y; \
    yum -y install openssh-clients
COPY ./socks_server/clash /usr/local/bin/clash
RUN chmod +x /usr/local/bin/clash
RUN mkdir -p /etc/clash
COPY ./socks_server/config.yaml  /etc/clash/config.yaml
COPY ./socks_server/bootstrap.sh bootstrap.sh
ENTRYPOINT [ "/bin/bash", "bootstrap.sh" ]
EXPOSE 1080