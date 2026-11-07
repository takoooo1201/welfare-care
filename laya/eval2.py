import json, os, sys, time
os.environ.setdefault("USE_TF", "0")
import laya
sys.path.insert(0, os.path.dirname(__file__))
from eval_zh import CASES, RES  # noqa: E402  (eval_zh 的 CASES 在 import 時不會執行模型，因為下面有 guard)

agent = laya.load("convaiinnovations/laya", subfolder="multilingual")

# A：每一項福利一題是非題
def rank_a(text):
    scores = {}
    for r in RES:
        q = {"fit": {"type": "noul", "instructions": f"這個人的需要和「{r['name']}」有關嗎？{r['summary']}"}}
        scores[r["id"]] = agent.predict(text, q)["answers"]["fit"]["noul"]
    return sorted(scores.items(), key=lambda kv: -kv[1])

# B：一次問多個狀況（是非題），拿到機率
FIELDS = {
    "alone": "這個人一個人住嗎？",
    "care": "這個人或他的家人，洗澡、吃飯、出門等日常生活需要別人幫忙嗎？",
    "dementia": "有人失智嗎？",
    "disability": "這個人有身心障礙或需要輪椅等輔具嗎？",
    "indigenous": "這個人是原住民嗎？",
    "newres": "這個人是新住民或外籍配偶嗎？",
    "poor": "這個人的家庭經濟困難、收入很低嗎？",
    "loss": "最近家裡有人過世、重病或失業嗎？",
    "elder": "這個人是 65 歲以上的長者嗎？",
    "lonely": "這個人想找人陪伴、聊天或參加社區活動嗎？",
}
def fields_b(text):
    out = {}
    for k, ins in FIELDS.items():
        out[k] = agent.predict(text, {k: {"type": "noul", "instructions": ins}})["answers"][k]["noul"]
    return out

for text, gold in CASES:
    t = time.time(); ra = rank_a(text); ta = (time.time()-t)*1000
    t = time.time(); fb = fields_b(text); tb = (time.time()-t)*1000
    top = [k for k, _ in ra[:5]]
    print(f"\n{text}\n  gold={gold}")
    print(f"  A[{ta:.0f}ms] top1={'✓' if top[0] in gold else '✗'} top5={'✓' if any(g in top for g in gold) else '✗'} " + ", ".join(f"{k}:{p:.2f}" for k, p in ra[:5]))
    print(f"  B[{tb:.0f}ms] " + " ".join(f"{k}={v:.2f}" for k, v in fb.items()))
