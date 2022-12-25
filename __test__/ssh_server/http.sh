#!/bin/bash

set -e

echo 'start http service...'

while true;
  do echo -e "HTTP/1.1 200 OK\n\nssh" | nc -l -p 80; 
done
