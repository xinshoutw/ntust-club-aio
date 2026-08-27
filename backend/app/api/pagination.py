"""分頁與排序慣例(見 docs/architecture.md §4.1)。

- 分頁:?page=1&page_size=20(上限 100);回應 meta={page, page_size, total}
- 排序:?sort=-reviewed_at,name 逗號分隔多鍵(至多 3 鍵),每鍵可 - 前綴表降冪;
  欄位走各端點白名單,未知欄位/超過鍵數上限 422;重複鍵保留首見;空字串視同未提供
- 模糊搜尋:一律走 ilike_contains,別自己拼 f"%{x}%"
"""

from typing import Annotated, Any

from fastapi import Depends, Query

from app.core.errors import validation_error

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# LIKE 萬用字元跳脫表(escape 字元為反斜線)
_LIKE_ESCAPE = str.maketrans({"\\": "\\\\", "%": "\\%", "_": "\\_"})


def ilike_contains(column: Any, text: str) -> Any:
    """包含式模糊搜尋,萬用字元一律跳脫。

    不跳脫的話,搜「100%」會變成「100 開頭的任何字」、搜「B1_2」的底線會吃掉任一字元
    —— 使用者打的是字面值,不是 pattern。
    """
    return column.ilike(f"%{text.strip().translate(_LIKE_ESCAPE)}%", escape="\\")


MAX_SORT_KEYS = 3


class PageParams:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    def meta(self, total: int) -> dict[str, int]:
        return {"page": self.page, "page_size": self.page_size, "total": total}


Pagination = Annotated[PageParams, Depends()]


class NullsLast:
    """排序白名單值包裝:該鍵不論升降冪一律 NULLS LAST(無值者殿後)。"""

    def __init__(self, column: Any) -> None:
        self._column = column

    def asc(self) -> Any:
        return self._column.asc().nulls_last()

    def desc(self) -> Any:
        return self._column.desc().nulls_last()


def parse_sort(
    sort: str | None,
    allowed: dict[str, Any],
    default: Any,
) -> list[Any]:
    """把 ?sort=-reviewed_at,name 轉成 order_by 條件串(依鍵序);欄位限白名單。

    default 可為單一條件、條件序列(list/tuple)或 None;
    未帶 sort(或空字串)時原樣展開為預設排序鏈。
    """
    ordering: dict[str, Any] = {}
    for raw in (sort or "").split(","):
        key = raw.strip()
        if not key:
            continue
        desc = key.startswith("-")
        field = key.removeprefix("-")
        if field in ordering:
            continue  # 重複鍵(含一升一降)保留首見
        column = allowed.get(field)
        if column is None:
            raise validation_error(f"不支援的排序欄位:{field}", code="INVALID_SORT")
        ordering[field] = column.desc() if desc else column.asc()
    if len(ordering) > MAX_SORT_KEYS:
        raise validation_error(f"排序欄位至多 {MAX_SORT_KEYS} 個", code="INVALID_SORT")
    if ordering:
        return list(ordering.values())
    if default is None:
        return []
    if isinstance(default, list | tuple):
        return list(default)
    return [default]
