#!/bin/sh
# 每日資料庫備份(decisions.md OPS-01):防誤刪與系統錯誤,**存在同一台機器**。
# 異地備份不做 —— 需要時 infra 主動連上處理。
#
# 由 host cron 呼叫,不在容器內排程(重啟不會漏班,也不必多裝套件):
#
#     15 3 * * *  cd /srv/club-aio && ./backend/scripts/backup_db.sh \
#         >> /var/log/club-aio/backup.log 2>&1
#
# 產物:$BACKUP_DIR/club_aio_YYYY-MM-DD.dump(pg_dump 自訂格式,可 pg_restore 選表還原)。
# 保留 $KEEP_DAYS 天,更舊的自動刪除 —— 沒有輪替的話備份自己就會把磁碟寫滿,
# 而磁碟寫滿是整個系統停擺。
#
# 還原:
#     docker compose exec -T db pg_restore -U club -d club_aio --clean --if-exists \
#         < backups/club_aio_2026-08-20.dump
set -eu

BACKUP_DIR=${BACKUP_DIR:-./backups}
KEEP_DAYS=${KEEP_DAYS:-14}
# compose 服務名與 .env 的資料庫設定;預設值與 compose.yml 一致
DB_SERVICE=${DB_SERVICE:-db}
DB_USER=${POSTGRES_USER:-club}
DB_NAME=${POSTGRES_DB:-club_aio}

stamp=$(date +%F)
mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/club_aio_$stamp.dump"
tmp="$target.part"

# 寫到 .part 再改名:中途失敗(磁碟滿、容器重啟)不會留下一個看起來完整的半截備份,
# 而半截備份比沒有備份更危險 —— 要用的時候才發現還不回去
docker compose exec -T "$DB_SERVICE" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-privileges > "$tmp"

# pg_dump 失敗時 set -e 已經跳出;這裡擋的是「成功但吐了 0 byte」
if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    echo "$(date -Iseconds) 備份失敗:輸出為空" >&2
    exit 1
fi
mv "$tmp" "$target"
echo "$(date -Iseconds) 備份完成 $target ($(wc -c < "$target") bytes)"

# 輪替:先確認今天這份在,再刪舊的
find "$BACKUP_DIR" -maxdepth 1 -name 'club_aio_*.dump' -mtime "+$KEEP_DAYS" -print -delete
