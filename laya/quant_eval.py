# 比較不同量化方式：與 PyTorch 原模型的 P(true) 差多少
import os, sys, time, glob
os.environ.setdefault("USE_TF", "0")
import numpy as np, torch, laya
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
from laya.common import build_sequence
from laya.onnx_agent import _collate_items_numpy
sys.path.insert(0, os.path.dirname(__file__))
from eval_zh import CASES
from eval2_fields import FIELDS

D = os.path.join(os.path.dirname(__file__), "..", "web", "public", "models", "laya")
fp32 = os.path.join(D, "laya-multilingual.fp32.onnx")
agent = laya.load("convaiinnovations/laya", subfolder="multilingual")
tok = agent.tok

def feeds_for(text):
    items = []
    for k, ins in FIELDS.items():
        ids, markers = build_sequence(tok, text, {"t": "noul", "ins": ins, "crit": None}, max_len=1024, head_max_len=256)
        items.append({"ids": ids, "markers": markers, "qtype": 2})
    return _collate_items_numpy([items], tok.pad_token_id)

def probs(sess, f):
    lg = sess.run(None, f)[0][:, :2]
    e = np.exp(lg - lg.max(1, keepdims=True)); return (e / e.sum(1, keepdims=True))[:, 1]

ALL = [feeds_for(t) for t, _ in CASES]
base = ort.InferenceSession(fp32, providers=["CPUExecutionProvider"])
ref = [probs(base, f) for f in ALL]

variants = {
  "int8-pc": dict(per_channel=True, op_types_to_quantize=["MatMul", "Gather"]),
  "int8-pc-matmul-only": dict(per_channel=True, op_types_to_quantize=["MatMul"]),
  "int8-pc-reduce": dict(per_channel=True, reduce_range=True, op_types_to_quantize=["MatMul", "Gather"]),
}
for name, kw in variants.items():
    out = os.path.join(D, f"laya-multilingual.{name}.onnx")
    if not os.path.exists(out):
        quantize_dynamic(fp32, out, weight_type=QuantType.QInt8, **kw)
    s = ort.InferenceSession(out, providers=["CPUExecutionProvider"])
    t = time.time(); got = [probs(s, f) for f in ALL]; ms = (time.time() - t) * 1000 / len(ALL)
    d = np.abs(np.concatenate(got) - np.concatenate(ref))
    flips = int(((np.concatenate(got) > .5) != (np.concatenate(ref) > .5)).sum())
    print(f"{name:22s} {os.path.getsize(out)//2**20:5d}MB  mean|Δp|={d.mean():.3f} max={d.max():.3f} flips={flips}/{d.size}  {ms:.0f}ms/描述(10題)")
