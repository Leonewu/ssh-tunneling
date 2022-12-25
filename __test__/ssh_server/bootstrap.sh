#!/bin/bash

set -e

echo 'start sshd service...'

/usr/sbin/sshd -D -p 22 & /bin/bash ./http.sh


