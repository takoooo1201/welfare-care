import os, sys
os.environ.setdefault("USE_TF", "0")
sys.path.insert(0, os.path.dirname(__file__))
from questions_eval import CASES, ZH, tok, sess, build_sequence, _collate_items_numpy, np

# 自訂「是／否」選項的說明（noul 的 criteria）
CRIT = {
    "alone": ("自己一個人住、獨居", "和家人或其他人同住"),
    "care": ("行動不便，洗澡、吃飯、走路或出門需要人幫忙、要人照顧", "生活可以自理，不需要別人照顧"),
    "dementia": ("失智、記性變差、會忘東忘西或迷路", "記憶正常，沒有失智"),
    "disability": ("有身心障礙、領有身障證明", "沒有身心障礙"),
    "aids": ("需要輪椅、助行器、拐杖等輔具", "不需要輔具"),
    "indigenous": ("原住民", "不是原住民"),
    "newres": ("外籍配偶、新住民，從越南、印尼、泰國、菲律賓或中國大陸嫁來或移民來臺灣", "在臺灣出生長大的本地人"),
    "poor": ("經濟困難，收入很低、沒有收入或付不出錢", "經濟狀況還可以"),
    "loss": ("家裡最近有人過世、中風、重病、受傷或失業", "家裡最近沒有發生變故"),
    "elder": ("65 歲以上的長者、老人", "65 歲以下的年輕人或中年人"),
    "lonely": ("覺得孤單無聊，想找人陪伴、聊天或參加社區活動", "不需要陪伴"),
    "meals": ("三餐沒辦法好好吃，需要有人送餐", "三餐可以自己處理"),
    "nhi": ("健保費繳不起、負擔很重", "健保費沒有問題"),
    "school": ("家裡有小孩讀書，學費負擔很重", "沒有學費的問題"),
}

def run(text, use_crit=True):
    items = []
    for k, ins in ZH.items():
        q = {"t": "noul", "ins": ins, "crit": None}
        if use_crit:
            t, f = CRIT[k]; q["crit"] = {"true": t, "false": f}
        ids, markers = build_sequence(tok, text, q, max_len=1024, head_max_len=256)
        items.append({"ids": ids, "markers": markers, "qtype": 2})
    f = _collate_items_numpy([items], tok.pad_token_id)
    lg = sess.run(None, f)[0][:, :2]
    e = np.exp(lg - lg.max(1, keepdims=True)); p = (e / e.sum(1, keepdims=True))[:, 1]
    return dict(zip(ZH.keys(), p))

for th in (0.5, 0.6):
    tp = fp = fn = 0; miss = []
    for text, gold in CASES:
        for k, v in run(text).items():
            pos = v >= th
            if pos and k in gold: tp += 1
            elif pos: fp += 1; miss.append(f"多判 {k}({v:.2f}) ← {text[:14]}")
            elif k in gold: fn += 1; miss.append(f"漏判 {k}({v:.2f}) ← {text[:14]}")
    print(f"\n== 自訂選項說明，門檻 {th}: 精確率 {tp/max(1,tp+fp):.2f}、召回率 {tp/max(1,tp+fn):.2f}（tp {tp} fp {fp} fn {fn}）")
    if th == 0.5:
        for m in miss: print("  ", m)
