# 用中文白話描述測試 Laya 多語版：把 14 項福利當成 choice 的選項，取機率最高的 5 項。
import json, os, sys, time
os.environ.setdefault("USE_TF", "0")
import laya

RES = json.load(open(os.path.join(os.path.dirname(__file__), "resources.json")))
criteria = {r["id"]: f'{r["name"]}：{r["summary"]}' for r in RES}
Q = {"best": {"type": "choice", "instructions": "這個人最需要、最可能符合哪一項福利？", "criteria": criteria}}

CASES = [
    ("我今年七十八歲，一個人住，最近腳不好很少出門，三餐常常隨便吃。", ["tp-alone-elder-emergency", "tp-meal-service", "ltc-2"]),
    ("我先生上個月過世，我又剛被裁員，家裡兩個小孩要養，房租快付不出來。", ["tp-emergency-bailout", "tp-emergency-relief", "tp-low-income"]),
    ("我是原住民，今年五十八歲，沒有固定工作。", ["bli-indigenous-pension"]),
    ("我有中度身心障礙證明，收入很低，想問每個月有沒有補助。", ["tp-disability-living"]),
    ("我需要買輪椅和助行器，錢不夠。", ["tp-disability-aids"]),
    ("我媽媽失智了，洗澡吃飯都要人幫忙，我白天要上班照顧不來。", ["ltc-2"]),
    ("我從越南嫁來台灣，語言不太通，想找人諮詢法律問題。", ["tp-new-resident-center"]),
    ("我七十歲，退休後沒什麼收入，健保費繳得很吃力。", ["tp-elder-nhi", "tp-mid-low-elder-allowance"]),
    ("退休後一個人在家很無聊，想找附近可以聊天、一起吃飯運動的地方。", ["tp-care-points"]),
    ("家裡收入不高，小孩讀高中學費很貴。", ["tp-mid-low-income"]),
]

if __name__ == "__main__":
    t0 = time.time()
    agent = laya.load("convaiinnovations/laya", subfolder="multilingual")
    print(f"load {time.time()-t0:.1f}s", file=sys.stderr)
    hit1 = hit5 = 0
    for text, gold in CASES:
        t = time.time()
        r = agent.predict(text, Q)
        ms = (time.time() - t) * 1000
        probs = r["answers"]["best"].get("probabilities") or {}
        top = sorted(probs.items(), key=lambda kv: -kv[1])[:5]
        h1 = top and top[0][0] in gold
        h5 = any(k in gold for k, _ in top)
        hit1 += bool(h1); hit5 += bool(h5)
        print(f"\n[{ms:.0f}ms] {text}\n  gold={gold}  top1={'✓' if h1 else '✗'} top5={'✓' if h5 else '✗'}")
        for k, p in top:
            print(f"    {p:.3f} {k}")
    print(f"\ntop1 {hit1}/{len(CASES)}  top5 {hit5}/{len(CASES)}")
