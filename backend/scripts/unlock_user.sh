#!/bin/sh
# 用法: ./unlock_user.sh [username]  (預設 super)
USER="${1:-super}"
docker exec club-aio-db-1 psql -U club -d club_aio -c \
  "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE username = '$USER'"
