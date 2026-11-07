# 用上線的 int8 ONNX 模型算出測試描述的各題機率，存成單元測試用的固定資料（不用在測試時跑模型）。
import os, sys, json
os.environ.setdefault("USE_TF", "0")
sys.path.insert(0, os.path.dirname(__file__))
from questions_eval import ZH, tok, sess, build_sequence, _collate_items_numpy, np

TUNE_CASES = [
    ("我今年七十八歲，一個人住，最近腳不好很少出門，三餐常常隨便吃。", ["tp-alone-elder-emergency", "tp-meal-service", "ltc-2", "tp-care-points"]),
    ("我先生上個月過世，我又剛被裁員，家裡兩個小孩要養，房租快付不出來。", ["tp-emergency-bailout", "tp-emergency-relief", "tp-low-income", "tp-mid-low-income"]),
    ("我是原住民，今年五十八歲，沒有固定工作。", ["bli-indigenous-pension", "tp-elder-nhi"]),
    ("我有中度身心障礙證明，收入很低，想問每個月有沒有補助。", ["tp-disability-living", "tp-disability-aids", "tp-low-income", "tp-mid-low-income"]),
    ("我需要買輪椅和助行器，錢不夠。", ["tp-disability-aids", "ltc-2"]),
    ("我媽媽失智了，洗澡吃飯都要人幫忙，我白天要上班照顧不來。", ["ltc-2", "tp-meal-service"]),
    ("我從越南嫁來台灣，語言不太通，想找人諮詢法律問題。", ["tp-new-resident-center"]),
    ("我七十歲，退休後沒什麼收入，健保費繳得很吃力。", ["tp-elder-nhi", "tp-mid-low-elder-allowance", "tp-mid-low-income", "tp-low-income"]),
    ("退休後一個人在家很無聊，想找附近可以聊天、一起吃飯運動的地方。", ["tp-care-points"]),
    ("家裡收入不高，小孩讀高中學費很貴。", ["tp-mid-low-income", "tp-low-income"]),
    ("阿嬤八十五歲，跟我們住，最近跌倒後走路要扶，常常忘記有沒有吃藥。", ["ltc-2", "tp-disability-aids", "tp-care-points"]),
    ("我是印尼來的，先生中風躺在床上，家裡只靠我打零工。", ["tp-new-resident-center", "ltc-2", "tp-emergency-bailout", "tp-low-income", "tp-mid-low-income"]),
    ("我爸爸住在台北，一個人，已經好幾天沒接電話了，我在高雄很擔心。", ["tp-alone-elder-emergency", "tp-care-points"]),
    ("我三十五歲，身體健康，只是想了解有什麼福利。", []),
]

HOLDOUT = [
    ("我七十二歲，老伴走了以後就自己住，晚上會怕跌倒沒人知道。", ["tp-alone-elder-emergency", "tp-care-points"]),
    ("我女兒有自閉症，領有身障手冊，我們家只有我在工作。", ["tp-disability-living", "tp-mid-low-income", "tp-low-income"]),
    ("工廠倒閉，我已經失業三個月，存款快用完了。", ["tp-emergency-bailout", "tp-emergency-relief", "tp-low-income"]),
    ("我爸中風後右半邊沒力，需要人幫他洗澡上廁所。", ["ltc-2", "tp-disability-aids"]),
    ("我是排灣族，六十歲，想知道有沒有給原住民的津貼。", ["bli-indigenous-pension", "tp-elder-nhi"]),
    ("阿公九十歲，牙齒不好，自己煮飯很辛苦。", ["tp-meal-service", "ltc-2", "tp-elder-nhi"]),
    ("我是大陸配偶，剛來台北，不知道去哪裡上課交朋友。", ["tp-new-resident-center"]),
    ("我六十八歲，每月只有幾千塊老農津貼，生活很拮据。", ["tp-mid-low-elder-allowance", "tp-elder-nhi", "tp-mid-low-income", "tp-low-income"]),
    ("媽媽最近常常重複問同樣的問題，還曾經出門找不到路回家。", ["ltc-2"]),
    ("我二十八歲，剛畢業找到工作，想了解租屋補助。", []),
]
import sys as _s
CASES = HOLDOUT if "--holdout" in _s.argv else TUNE_CASES

out = []
for text, gold in CASES:
    items = []
    for k, ins in ZH.items():
        ids, markers = build_sequence(tok, text, {"t": "noul", "ins": ins, "crit": None}, max_len=1024, head_max_len=256)
        items.append({"ids": ids, "markers": markers, "qtype": 2})
    lg = sess.run(None, _collate_items_numpy([items], tok.pad_token_id))[0][:, :2]
    e = np.exp(lg - lg.max(1, keepdims=True)); p = (e / e.sum(1, keepdims=True))[:, 1]
    # 也存下第一題的 token ids，讓網頁端驗證分詞與序列組裝和 Python 完全一致
    first = items[0]
    out.append({"text": text, "gold": gold, "probs": {k: round(float(v), 4) for k, v in zip(ZH, p)},
                "firstIds": first["ids"], "firstMarkers": first["markers"]})
json.dump({"model": "convaiinnovations/laya multilingual, int8 per-channel", "questions": ZH, "cases": out},
          open(os.path.join(os.path.dirname(__file__), "..", "shared", "fixtures", ("laya-holdout.json" if "--holdout" in _s.argv else "laya-cases.json")), "w"), ensure_ascii=False, indent=1)
print("ok", len(out))
