# 把 Laya 多語版匯出成 ONNX，再量化成 int8，給網頁（onnxruntime-web）在手機上執行。
# ONNX 與完整分詞器放在 artifacts/（再由 quant_web.py、quant_embed.py、trim_vocab.py 處理），tokenizer_config.json 另外複製到 ../web/public/models/laya/。
# 兩個資料夾都列入 .gitignore，太大不進版本控制。
#   USE_TF=0 .venv/bin/python export_onnx.py
import os, shutil, sys, glob
os.environ.setdefault("USE_TF", "0")
import numpy as np
import torch
import laya
from laya.common import build_sequence
from laya.onnx_agent import _collate_items_numpy

OUT = os.path.join(os.path.dirname(__file__), "..", "web", "public", "models", "laya")
ART = os.path.join(os.path.dirname(__file__), "artifacts")
os.makedirs(OUT, exist_ok=True)
os.makedirs(ART, exist_ok=True)
fp32 = os.path.join(ART, "laya-multilingual.fp32.onnx")
int8 = os.path.join(ART, "laya-multilingual.int8.onnx")

agent = laya.load("convaiinnovations/laya", subfolder="multilingual")
model = agent.model.to("cpu").float().eval()
tok = agent.tok


class Wrap(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, input_ids, attention_mask, marker_pos, marker_mask, qtype):
        out = self.m(input_ids, attention_mask, marker_pos, marker_mask, qtype)
        return out[0], out[1]


def sample():
    items = []
    for ins, k in [("這個人一個人住嗎？", 2), ("這個人經濟困難嗎？", 2)]:
        q = {"t": "noul", "ins": ins, "crit": None}
        ids, markers = build_sequence(tok, "我今年七十八歲，一個人住。", q, max_len=1024, head_max_len=256)
        items.append({"ids": ids, "markers": markers, "qtype": 2})
    b = _collate_items_numpy([items], tok.pad_token_id)
    return {k: torch.from_numpy(v) for k, v in b.items()}


inp = sample()
with torch.no_grad():
    ref = Wrap(model)(**inp)
print("torch logits", ref[0].numpy())

if not os.path.exists(fp32):
    torch.onnx.export(
        Wrap(model), tuple(inp[k] for k in ["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"]), fp32,
        input_names=["input_ids", "attention_mask", "marker_pos", "marker_mask", "qtype"],
        output_names=["logits", "act"],
        dynamic_axes={"input_ids": {0: "n", 1: "L"}, "attention_mask": {0: "n", 1: "L"},
                      "marker_pos": {0: "n", 1: "k"}, "marker_mask": {0: "n", 1: "k"}, "qtype": {0: "n"},
                      "logits": {0: "n", 1: "k"}, "act": {0: "n"}},
        opset_version=17, dynamo=False,
    )
print("fp32", os.path.getsize(fp32) // 2**20, "MB (+external data)" if glob.glob(fp32 + ".data") else "MB")

import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
if not os.path.exists(int8):
    quantize_dynamic(fp32, int8, weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul", "Gather"])
print("int8", os.path.getsize(int8) // 2**20, "MB")

feeds = {k: v.numpy() for k, v in inp.items()}
for path in [fp32, int8]:
    s = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    out = s.run(None, feeds)
    print(os.path.basename(path), out[0], "max diff", float(np.abs(out[0] - ref[0].numpy()).max()))

# 分詞器與設定給網頁用
src = os.path.dirname(glob.glob(os.path.expanduser(
    "~/.cache/huggingface/hub/models--convaiinnovations--laya/snapshots/*/multilingual/tokenizer/tokenizer.json"))[0])
for f in ["tokenizer.json", "tokenizer_config.json"]:
    shutil.copyfile(os.path.join(src, f), os.path.join(ART, f))
shutil.copyfile(os.path.join(src, "tokenizer_config.json"), os.path.join(OUT, "tokenizer_config.json"))
print("done", OUT)
