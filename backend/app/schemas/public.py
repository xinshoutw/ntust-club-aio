"""免登入端點的輸出形狀(社團導覽頁)。

**公開範圍的唯一定義在這一檔**:逐欄白名單,不從 `ClubProfileOut` 或任何對內 schema
挑減 —— 那樣的話,以後往 `clubs` 加一欄內部欄位,它會自己漏到校外去。

驗證器也刻意不掛(`SocialLinkOut` 同理):輸出 schema 沿用輸入的限制,等於把
「使用者現在能送什麼」變成「庫裡准許存在什麼」,舊值一讀就 500。
"""

import uuid
from datetime import date, time

from pydantic import BaseModel, ConfigDict

from app.schemas.clubs import SocialLinkOut


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
    banner_file_id: uuid.UUID | None
    banner_dim: int
    banner_text_mode: str
    banner_luma: int | None  # auto 字色的推導依據;推導結果不入庫
    # banner_blur 不在字卡上:60 張卡同時跑 CSS filter 會掉幀,字卡只吃黑化


class ClubDetailOut(ClubCardOut):
    """社團詳細頁 = 字卡 + 其餘公開欄位。"""

    intro: str
    website_url: str | None
    public_email: str | None  # 對外窗口;**不是** contact_emails
    social_links: list[SocialLinkOut]
    office_location: str | None
    regular_schedule: str | None
    join_info: str | None
    signup_url: str | None
    founded_year: int | None
    banner_blur: int  # 詳細頁的英雄區才套模糊


class PublicActivityOut(BaseModel):
    """公開活動列表的一列。

    **不回 `content` 與任何金額**:公開頁回答的是「這個社團在辦什麼」,
    不是「這張單裡寫了什麼」。要對外宣傳細節的社團填在簡介或社群連結裡。
    """

    model_config = ConfigDict(from_attributes=True)

    name: str
    date: date | None
    end_date: date | None
    start_time: time | None
    end_time: time | None
    location: str
    type: str  # 社課或會議 / 活動
    is_large: bool
