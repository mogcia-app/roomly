# Guest Data Templates

## Purpose
Use these templates when registering hotel data for the guest chat experience.

Rules:

- Hotel common source of truth is `hearing_sheets/{hotelId}`
- Room-specific data can override hotel common guidance when the room document has the same category fields
- Missing values are allowed
- Unknown items must fall back safely to front desk guidance

## `hearing_sheets/{hotelId}`

```json
{
  "frontDeskHours": [
    "フロント対応時間は24時間です。"
  ],
  "wifiNetworks": [
    {
      "floor": "2階",
      "ssid": "Roomly-Guest-2F",
      "password": "roomly-2025",
      "note": "つながらない場合はフロントへご確認ください。"
    }
  ],
  "breakfastEntries": [
    {
      "style": "和洋ビュッフェ",
      "hours": "7:00〜9:00",
      "location": "1階レストラン",
      "price": "宿泊料金に含む",
      "reservationRequired": false,
      "note": "混雑時はお待ちいただく場合があります。"
    }
  ],
  "bathEntries": [
    {
      "name": "大浴場",
      "hours": "15:00〜24:00 / 6:00〜9:00",
      "location": "2階",
      "note": "タオルは客室からお持ちください。"
    }
  ],
  "facilityEntries": [
    {
      "name": "コインランドリー",
      "hours": "24時間",
      "note": "洗剤は自動投入です。"
    }
  ],
  "facilityLocationEntries": [
    {
      "name": "製氷機",
      "floor": "3階",
      "note": "エレベーターホール横です。"
    }
  ],
  "amenityEntries": [
    {
      "name": "追加タオル",
      "inRoom": false,
      "availableOnRequest": true,
      "requestMethod": "チャットから依頼",
      "price": "無料",
      "note": "混雑時はお時間をいただく場合があります。"
    }
  ],
  "parkingEntries": [
    {
      "name": "ホテル駐車場",
      "capacity": "20台",
      "price": "1泊1000円",
      "hours": "24時間",
      "reservationRequired": true,
      "location": "ホテル裏手",
      "note": "満車時は提携駐車場をご案内します。"
    }
  ],
  "emergencyEntries": [
    {
      "category": "火災・事故",
      "contact": "フロント内線9 / 099-000-0000",
      "steps": "ただちにフロントへ連絡し、避難誘導に従ってください。",
      "note": "医療・火災・事故系は一般回答せず、この案内を優先表示します。"
    }
  ],
  "faqEntries": [
    {
      "question": "チェックアウトは何時ですか？",
      "answer": "チェックアウトは10:00です。"
    }
  ],
  "checkoutEntries": [
    {
      "time": "10:00",
      "method": "フロント精算",
      "keyReturnLocation": "1階フロント",
      "lateCheckoutPolicy": "1時間ごとに追加料金",
      "note": "ご希望の場合は事前にご相談ください。"
    }
  ],
  "roomServiceEntries": [
    {
      "menuName": "軽食メニュー",
      "price": "800円〜",
      "orderMethod": "フロントへ内線",
      "hours": "18:00〜22:00",
      "note": "混雑時は提供に時間がかかります。"
    }
  ],
  "transportEntries": [
    {
      "companyName": "Roomly Taxi",
      "serviceType": "タクシー",
      "phone": "099-111-1111",
      "hours": "24時間",
      "priceNote": "行き先により変動",
      "note": "チャットから手配依頼も可能です。"
    }
  ],
  "nearbySpotEntries": [
    {
      "name": "ファミリーマート",
      "category": "コンビニ",
      "distance": "徒歩3分",
      "hours": "24時間",
      "location": "ホテルを出て右手",
      "note": null
    }
  ]
}
```

## `guest_rich_menus/{hotelId}`

If the document does not exist, the guest app hides the rich menu.

```json
{
  "enabled": true,
  "version": 1,
  "imageUrl": "https://storage.googleapis.com/example/guest-rich-menus/hotel-1/menu.png",
  "imageWidth": 1200,
  "imageHeight": 810,
  "items": [
    {
      "id": "official-site",
      "label": "公式HP",
      "x": 0,
      "y": 0,
      "width": 600,
      "height": 270,
      "actionType": "external_link",
      "visible": true,
      "sortOrder": 1,
      "url": "https://hotel.example.com"
    },
    {
      "id": "instagram",
      "label": "Instagram",
      "x": 600,
      "y": 0,
      "width": 600,
      "height": 270,
      "actionType": "external_link",
      "visible": true,
      "sortOrder": 2,
      "url": "https://instagram.com/hotel-example"
    },
    {
      "id": "taxi",
      "label": "タクシー手配",
      "x": 0,
      "y": 270,
      "width": 600,
      "height": 270,
      "actionType": "handoff_category",
      "visible": true,
      "sortOrder": 3,
      "handoffCategory": "タクシー手配"
    },
    {
      "id": "amenity",
      "label": "アメニティ依頼",
      "x": 600,
      "y": 270,
      "width": 600,
      "height": 270,
      "actionType": "handoff_category",
      "visible": true,
      "sortOrder": 4,
      "handoffCategory": "アメニティ依頼"
    },
    {
      "id": "language",
      "label": "言語変更",
      "x": 0,
      "y": 540,
      "width": 600,
      "height": 270,
      "actionType": "language",
      "visible": true,
      "sortOrder": 5
    },
    {
      "id": "front",
      "label": "フロントに聞く",
      "x": 600,
      "y": 540,
      "width": 600,
      "height": 270,
      "actionType": "human_handoff",
      "visible": true,
      "sortOrder": 6
    }
  ]
}
```

## Supported `actionType`

- `external_link`: `url` required
- `handoff_category`: `handoffCategory` required
- `language`: no extra fields
- `ai_prompt`: `prompt` required
- `human_handoff`: no extra fields

## Recommended Launch Minimum

For each launch hotel, prepare at least:

- one `wifiNetworks` entry
- one `checkoutEntries` entry
- one `emergencyEntries` entry
- one `faqEntries` or `frontDeskHours` entry
- one `guest_rich_menus/{hotelId}` document, or intentionally operate with the rich menu hidden
