#!/bin/bash

set -e

echo "preparing ssh server and socks server..."
docker-compose up -d

npx ts-node ./__test__/index.ts

echo "stop all container"
docker-compose stop
