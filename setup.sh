#!/bin/bash

# setup.sh

MONGO_PORT=27025
EXPRESS_PORT=8083

MONGO_CONTAINER=datadrift-mongodb
EXPRESS_CONTAINER=datadrift-mongo-express
NETWORK_NAME=app-network

echo "🔍 포트 충돌 검사 중..."

if lsof -i tcp:$MONGO_PORT | grep LISTEN >/dev/null; then
  echo "❌ MongoDB 포트 $MONGO_PORT 가 이미 사용 중입니다."
  lsof -i tcp:$MONGO_PORT | grep LISTEN
  echo "ℹ️ 해당 포트를 사용하는 프로세스를 종료하거나 포트를 변경하세요."
  exit 1
fi

if lsof -i tcp:$EXPRESS_PORT | grep LISTEN >/dev/null; then
  echo "❌ mongo-express 포트 $EXPRESS_PORT 가 이미 사용 중입니다."
  lsof -i tcp:$EXPRESS_PORT | grep LISTEN
  echo "ℹ️ 해당 포트를 사용하는 프로세스를 종료하거나 포트를 변경하세요."
  exit 1
fi

echo "🧹 기존 컨테이너 정리 중..."

# 기존 MongoDB 컨테이너 삭제
if [ "$(docker ps -a -q -f name=^/${MONGO_CONTAINER}$)" ]; then
  echo "⚠️ 기존 MongoDB 컨테이너 제거 중..."
  docker rm -f $MONGO_CONTAINER
fi

# 기존 mongo-express 컨테이너 삭제
if [ "$(docker ps -a -q -f name=^/${EXPRESS_CONTAINER}$)" ]; then
  echo "⚠️ 기존 mongo-express 컨테이너 제거 중..."
  docker rm -f $EXPRESS_CONTAINER
fi

echo "🕸 Docker 네트워크 생성..."
docker network create $NETWORK_NAME 2>/dev/null || echo "ℹ️ 이미 존재하는 네트워크입니다."

echo "⬇️ MongoDB 이미지 다운로드..."
docker pull mongo:8.0

echo "⬇️ mongo-express 이미지 다운로드..."
docker pull mongo-express:latest

echo "🚀 MongoDB 컨테이너 실행..."
docker run -d \
  --name $MONGO_CONTAINER \
  --network $NETWORK_NAME \
  -p $MONGO_PORT:27017 \
  -v mongodb_data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=diquest \
  -e MONGO_INITDB_ROOT_PASSWORD=ek2znptm2 \
  mongo:8.0

echo "🚀 mongo-express 컨테이너 실행..."
docker run -d \
  --name $EXPRESS_CONTAINER \
  --network $NETWORK_NAME \
  -p $EXPRESS_PORT:8081 \
  -e ME_CONFIG_BASICAUTH=false \
  -e ME_CONFIG_MONGODB_ADMINUSERNAME=diquest \
  -e ME_CONFIG_MONGODB_ADMINPASSWORD=ek2znptm2 \
  -e ME_CONFIG_MONGODB_SERVER=$MONGO_CONTAINER \
  mongo-express:latest

echo "✅ 모든 컨테이너가 정상적으로 실행되었습니다."
echo "🌐 브라우저에서 mongo-express에 접속하세요: http://localhost:$EXPRESS_PORT"
