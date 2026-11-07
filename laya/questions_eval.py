# 調整「聽懂狀況」的問句：用實際要上線的 int8 ONNX 模型，比較中文與英文問句的正確率。
import os, sys
os.environ.setdefault("USE_TF", "0")
import numpy as np, onnxruntime as ort
from transformers import AutoTokenizer
sys.path.insert(0, os.path.dirname(__file__))
from laya.common import build_sequence
from laya.onnx_agent import _collate_items_numpy

D = os.path.join(os.path.dirname(__file__), "..", "web", "public", "models", "laya")
tok = AutoTokenizer.from_pretrained(D)
sess = ort.InferenceSession(os.path.join(D, "laya-int8.onnx"), providers=["CPUExecutionProvider"])

ZH = {
    "alone": "這個人一個人住嗎？",
    "care": "這個人（或他照顧的家人）行動不便，洗澡、吃飯、走路或出門需要別人幫忙嗎？",
    "dementia": "有人失智、記性變差或會迷路嗎？",
    "disability": "這個人有身心障礙證明，或是身體有障礙嗎？",
    "aids": "這個人需要輪椅、助行器、拐杖等輔具嗎？",
    "indigenous": "這個人是原住民嗎？",
    "newres": "這個人是從外國（例如越南、印尼、中國大陸）嫁到臺灣或移民來的新住民嗎？",
    "poor": "這個人的家庭經濟困難、收入很低或付不出錢嗎？",
    "loss": "最近家裡有人過世、重病、受傷或失業嗎？",
    "elder": "這個人是 65 歲以上的長者嗎？",
    "lonely": "這個人覺得孤單，想找人陪伴、聊天或參加社區活動嗎？",
    "meals": "這個人三餐沒辦法好好吃，需要有人送餐嗎？",
    "nhi": "這個人覺得健保費負擔很重嗎？",
    "school": "家裡有小孩在讀書，學費負擔很重嗎？",
}
EN = {
    "alone": "Does this person live alone?",
    "care": "Does this person (or the family member they care for) need help with bathing, eating, walking or going out?",
    "dementia": "Does someone have dementia, memory loss or get lost?",
    "disability": "Does this person have a disability or a disability certificate?",
    "aids": "Does this person need a wheelchair, walker, cane or other assistive device?",
    "indigenous": "Is this person indigenous (Taiwanese aboriginal)?",
    "newres": "Is this person an immigrant or foreign spouse who moved to Taiwan (e.g. from Vietnam, Indonesia, mainland China)?",
    "poor": "Is this person's household poor, with very low income or unable to pay bills?",
    "loss": "Did someone in the family recently die, become seriously ill or injured, or lose their job?",
    "elder": "Is this person 65 years old or older?",
    "lonely": "Does this person feel lonely or want company, chatting or community activities?",
    "meals": "Is this person unable to eat proper meals and in need of meal delivery?",
    "nhi": "Does this person find health insurance premiums hard to afford?",
    "school": "Does the family have children in school with heavy tuition costs?",
}
CASES = [
    ("我今年七十八歲，一個人住，最近腳不好很少出門，三餐常常隨便吃。", {"alone", "care", "elder", "meals"}),
    ("我先生上個月過世，我又剛被裁員，家裡兩個小孩要養，房租快付不出來。", {"loss", "poor"}),
    ("我是原住民，今年五十八歲，沒有固定工作。", {"indigenous", "poor"}),
    ("我有中度身心障礙證明，收入很低，想問每個月有沒有補助。", {"disability", "poor"}),
    ("我需要買輪椅和助行器，錢不夠。", {"aids", "poor", "care"}),
    ("我媽媽失智了，洗澡吃飯都要人幫忙，我白天要上班照顧不來。", {"dementia", "care", "elder"}),
    ("我從越南嫁來台灣，語言不太通，想找人諮詢法律問題。", {"newres"}),
    ("我七十歲，退休後沒什麼收入，健保費繳得很吃力。", {"elder", "poor", "nhi"}),
    ("退休後一個人在家很無聊，想找附近可以聊天、一起吃飯運動的地方。", {"alone", "lonely", "elder"}),
    ("家裡收入不高，小孩讀高中學費很貴。", {"poor", "school"}),
    ("阿嬤八十五歲，跟我們住，最近跌倒後走路要扶，常常忘記有沒有吃藥。", {"elder", "care", "dementia"}),
    ("我是印尼來的，先生中風躺在床上，家裡只靠我打零工。", {"newres", "care", "poor", "loss"}),
    ("我爸爸住在台北，一個人，已經好幾天沒接電話了，我在高雄很擔心。", {"alone", "elder"}),
    ("我三十五歲，身體健康，只是想了解有什麼福利。", set()),
]

def run(QS, text):
    items = []
    for k, ins in QS.items():
        ids, markers = build_sequence(tok, text, {"t": "noul", "ins": ins, "crit": None}, max_len=1024, head_max_len=256)
        items.append({"ids": ids, "markers": markers, "qtype": 2})
    f = _collate_items_numpy([items], tok.pad_token_id)
    lg = sess.run(None, f)[0][:, :2]
    e = np.exp(lg - lg.max(1, keepdims=True)); p = (e / e.sum(1, keepdims=True))[:, 1]
    return dict(zip(QS.keys(), p))

for name, QS in [("中文問句", ZH), ("英文問句", EN)]:
    tp = fp = fn = tn = 0; miss = []
    for text, gold in CASES:
        p = run(QS, text)
        for k, v in p.items():
            pos = v >= 0.5
            if pos and k in gold: tp += 1
            elif pos: fp += 1; miss.append(f"多判 {k}({v:.2f}) ← {text[:14]}")
            elif k in gold: fn += 1; miss.append(f"漏判 {k}({v:.2f}) ← {text[:14]}")
            else: tn += 1
    prec = tp / max(1, tp + fp); rec = tp / max(1, tp + fn)
    print(f"\n== {name}: 精確率 {prec:.2f}、召回率 {rec:.2f}（tp {tp} fp {fp} fn {fn}）")
    for m in miss: print("  ", m)
