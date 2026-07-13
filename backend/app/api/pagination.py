"""分頁與排序慣例(見 docs/architecture.md §4.1)。

- 分頁:?page=1&page_size=20(上限 100);回應 meta={page, page_size, total}
- 排序:?sort=field 升冪、?sort=-field 降冪;欄位走各端點白名單,未知欄位 422
"""

from typing import Annotated, Any

from fastapi import Depends, Query
from sqlalchemy.orm import InstrumentedAttribute

from app.core.errors import validation_error

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


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


def parse_sort(
    sort: str | None,
    allowed: dict[str, InstrumentedAttribute],
    default: Any,
) -> list[Any]:
    """把 ?sort=-date 轉成 order_by 條件;欄位限白名單。"""
    if not sort:
        return [default]
    desc = sort.startswith("-")
    field = sort.removeprefix("-")
    column = allowed.get(field)
    if column is None:
        raise validation_error(f"不支援的排序欄位:{field}", code="INVALID_SORT")
    return [column.desc() if desc else column.asc()]
