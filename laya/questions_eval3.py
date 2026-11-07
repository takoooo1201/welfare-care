import os, sys, re
os.environ.setdefault("USE_TF", "0")
sys.path.insert(0, os.path.dirname(__file__))
from questions_eval import CASES, ZH, tok, sess, build_sequence, _collate_items_numpy, np

def margins(text):
    items = []
    for k, ins in ZH.items():
        ids, markers = build_sequence(tok, text, {"t": "noul", "ins": ins, "crit": None}, max_len=1024, head_max_len=256)
        items.append({"ids": ids, "markers": markers, "qtype": 2})
    lg = sess.run(None, _collate_items_numpy([items], tok.pad_token_id))[0][:, :2]
    return lg[:, 1] - lg[:, 0]   # true 的 logit 減 false 的 logit

NEUTRAL = ["你好。", "我想了解有哪些福利。", "今天天氣很好。", "請問一下。"]
base = np.mean([margins(t) for t in NEUTRAL], axis=0)
print("各題的固定偏好（logit 差）:", {k: round(float(b), 2) for k, b in zip(ZH, base)})

def sig(x): return 1 / (1 + np.exp(-x))
for shift in (0.0, 0.5, 1.0):
    tp = fp = fn = 0; miss = []
    for text, gold in CASES:
        m = margins(text) - base - shift
        for k, v in zip(ZH, sig(m)):
            pos = v >= 0.5
            if pos and k in gold: tp += 1
            elif pos: fp += 1; miss.append(f"多判 {k}({v:.2f}) ← {text[:14]}")
            elif k in gold: fn += 1; miss.append(f"漏判 {k}({v:.2f}) ← {text[:14]}")
    print(f"\n== 扣掉固定偏好 shift={shift}: 精確率 {tp/max(1,tp+fp):.2f}、召回率 {tp/max(1,tp+fn):.2f}（tp {tp} fp {fp} fn {fn}）")
    if shift == 0.5:
        for x in miss: print("  ", x)
