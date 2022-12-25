#!/bin/bash

set -e

# 清除网段
echo y | docker network prune
# 开网段
docker network create --subnet=172.18.0.0/24 test
# 移除容器
docker stop $(docker ps -a | awk '/ssh/{print $1}') && docker rm $(docker ps -a | awk '/ssh/{print $1}')
# 编译镜像
docker build -t ssh ./__test__ -f ./__test__/ssh_server/Dockerfile
# 启动容器，指定 ip
ssh_container_id=$(docker run --name ssh -p 12345:22 --network test --ip 172.18.0.123 -d ssh)

# docker stop $(docker ps -a | awk '/socks/{print $1}') && docker rm $(docker ps -a | awk '/socks/{print $1}')
# docker build -t socks ./__test__ -f ./__test__/socks_server/Dockerfile
# socks_container_id=$(docker run --name socks -p 12346:1080 --network ssh --ip 172.18.0.124 -d socks)

npx ts-node ./__test__/index.ts


docker stop $ssh_container_id && docker rm $ssh_container_id
