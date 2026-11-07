# 把 Laya 多語版（mmBERT／Gemma 系列，25.6 萬詞的 BPE）裁成「中文用」的精簡版，給手機上的網頁使用：
#   - 分詞器：完整版在 JavaScript 裡載入後約占 415 MB 記憶體，精簡版約 35 MB
#   - 模型：嵌入表從 256,000 列裁到約 3.8 萬列，模型從約 350 MB 變成約 180 MB
# 其餘權重完全不動，只是把用不到的嵌入列拿掉並重新編號，所以中文描述算出來的機率和原本一模一樣。
#
# 保留的 token：特殊 token、byte fallback（<0x..>）、所有單一字元、只由中日韓漢字／全形與中文標點／ASCII 數字與標點／▁ 組成的 token，
#   以及模型輸入裡固定英文句子（"noul question:"、選項說明）的所有子字串。merge 規則只留三者都保留的，順序不變。
# 限制：描述裡的英文單字會改成逐字母切（完整版會切成整個字），模型仍看得懂但可能略差。
#
#   USE_TF=0 .venv/bin/python trim_vocab.py
# 輸入：artifacts/laya-web.onnx、artifacts/tokenizer.json（見 export_onnx.py、quant_web.py、quant_embed.py）
# 輸出：../web/public/models/laya/laya-zh.onnx、tokenizer-zh.json（網頁實際使用的檔案）
import json, os, re
import numpy as np
import onnx
from onnx import numpy_helper

A = os.path.join(os.path.dirname(__file__), "artifacts")
D = os.path.join(os.path.dirname(__file__), "..", "web", "public", "models", "laya")
EMB = "m.encoder.embeddings.tok_embeddings.weight"

# 與 shared/layaSeq.ts 的固定字串一致
FIXED = ["noul question: ", " false: no, the statement does not hold", " true: yes, the statement holds"]


def kind(ch):
    o = ord(ch)
    if 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF or 0x20000 <= o <= 0x2FA1F or 0xF900 <= o <= 0xFAFF:
        return "cjk"
    if 0x3000 <= o <= 0x303F or 0xFF00 <= o <= 0xFFEF or 0x2000 <= o <= 0x206F:
        return "punct"
    if ch == "▁":
        return "space"
    if o < 128 and not ch.isalpha():
        return "ascii"  # 數字、標點、換行
    return "other"


# ── 分詞器 ──
t = json.load(open(os.path.join(A, "tokenizer.json"), encoding="utf-8"))
m = t["model"]
assert m["type"] == "BPE"
vocab, merges = m["vocab"], m["merges"]
special = {a["content"] for a in t["added_tokens"]}

# 固定英文句子的每個詞（Metaspace：空白換成 ▁、每個詞前面加 ▁）的所有子字串，BPE 的中間產物一定在裡面
fixed_subs = set()
for s in FIXED:
    for w in re.findall(r"▁?[^▁]+", "▁" + s.replace(" ", "▁")):
        fixed_subs |= {w[i:j] for i in range(len(w)) for j in range(i + 1, len(w) + 1)}

keep = {
    tok
    for tok in vocab
    if tok in special
    or re.fullmatch(r"<0x[0-9A-F]{2}>", tok)
    or len(tok) == 1
    or tok in fixed_subs
    or all(kind(c) != "other" for c in tok)
}
old_ids = sorted(vocab[tok] for tok in keep)
new_id = {old: new for new, old in enumerate(old_ids)}
# shared/layaSeq.ts 的 pad=0、eos=1、bos=2、mask=4 不能變
assert all(new_id[i] == i for i in range(5)), "特殊 token 的 id 改變了"

pair = lambda x: x if isinstance(x, list) else x.split(" ", 1)
m["vocab"] = {tok: new_id[i] for tok, i in vocab.items() if tok in keep}
m["merges"] = [x for x in merges if (lambda a, b: a in keep and b in keep and a + b in keep)(*pair(x))]
t["added_tokens"] = [{**a, "id": new_id[a["id"]]} for a in t["added_tokens"]]
for sp in t["post_processor"].get("special_tokens", {}).values():
    sp["ids"] = [new_id[i] for i in sp["ids"]]
tok_dst = os.path.join(D, "tokenizer-zh.json")
json.dump(t, open(tok_dst, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"分詞器：vocab {len(vocab)} → {len(keep)}，merges {len(merges)} → {len(m['merges'])}，{os.path.getsize(tok_dst) / 2**20:.1f} MB")

# ── 模型：嵌入表只留保留的列（int8 權重與逐列 scale，見 quant_embed.py） ──
model = onnx.load(os.path.join(A, "laya-web.onnx"))
idx = np.array(old_ids)
done = 0
for i, init in enumerate(model.graph.initializer):
    if init.name in (EMB + "_q", EMB + "_scale"):
        a = numpy_helper.to_array(init)
        assert a.shape[0] == len(vocab), (init.name, a.shape)
        model.graph.initializer[i].CopyFrom(numpy_helper.from_array(a[idx], init.name))
        done += 1
assert done == 2, done
model_dst = os.path.join(D, "laya-zh.onnx")
onnx.save(model, model_dst)
print(f"模型：{os.path.getsize(os.path.join(A, 'laya-web.onnx')) / 2**20:.0f} MB → {os.path.getsize(model_dst) / 2**20:.0f} MB")
