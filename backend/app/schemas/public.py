"""免登入端點的輸出形狀(社團導覽頁)。

**公開範圍的唯一定義在這一檔**:逐欄白名單,不從 `ClubProfileOut` 或任何對內 schema
挑減 —— 那樣的話,以後往 `clubs` 加一欄內部欄位,它會自己漏到校外去。

驗證器也刻意不掛:輸出 schema 沿用輸入的限制,等於把「使用者現在能送什麼」變成
「庫裡准許存在什麼」,舊值一讀就 500。
"""

import uuid
from datetime import date, time

from pydantic import BaseModel, ConfigDict


class ClubCardOut(BaseModel):
    """導覽字卡:只有畫得出一張卡所需的欄位。

    簡介、聯絡方式、入社資訊都不在這裡 —— 全校六十幾個社團的字卡牆一次回傳,
    詳細頁才需要的長文不該跟著走一遍。
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    en_name: str | None
    kind: str  # 社團/學會
    attribute: str | None  # 停社舊社團原性質不可考 → None
    tagline: str | None
    tags: list[str]
    recruit_status: str | None
    avatar_file_id: uuid.UUID | None
    # 橫幅是 3:1,字卡與詳細頁用**同一個**比例,兩邊都不裁切;圖上不壓任何文字
    banner_file_id: uuid.UUID | None


class ClubDetailOut(ClubCardOut):
    """社團詳細頁 = 字卡 + 其餘公開欄位。"""

    intro: str
    website_url: str | None
    public_email: str | None  # 對外窗口;**不是** contact_emails
    instagram: str | None  # 帳號 ID,不含網址前綴
    office_location: str | None
    regular_schedule: str | None
    join_info: str | None
    signup_url: str | None


class PublicActivityOut(BaseModel):
    """公開活動列表的一列;社團詳細頁點開的活動彈窗也只讀這一列(D-42)。

    **回 `content`(活動內容)、不回任何金額**:活動內容是申請時寫的那段介紹(上限 150 字),
    點開一場活動想知道的就是它;補助、經費來源與承辦備註是學務處與社團之間的事。
    """

    model_config = ConfigDict(from_attributes=True)

    # 前端不顯示單號(design-guide §6),但列表要一個穩定的 key ——
    # 拿 index 或「日期+名稱」當 key 會在同日同名時互撞
    id: int
    name: str
    date: date | None
    end_date: date | None
    start_time: time | None
    end_time: time | None
    location: str
    type: str  # 社課或會議 / 活動
    is_large: bool
    content: str
    # 結案照片:只有結案通過的活動有(`api/v1/public._public_photos`),
    # 經 `/public/files/activity-photos/{id}` 取轉過的 JPEG
    photo_file_ids: list[uuid.UUID] = []
