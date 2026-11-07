# 嵌入表逐列 int8：Gather(W, ids) → Gather(Wq, ids) 轉 float × Gather(scale, ids)
import os, numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto
A = os.path.join(os.path.dirname(__file__), "artifacts")
src = os.path.join(A, "laya.mm8.onnx")
dst = os.path.join(A, "laya-web.onnx")  # 完整詞彙版，再由 trim_vocab.py 裁成網頁用的 laya-zh.onnx
m = onnx.load(src)
g = m.graph
inits = {i.name: i for i in g.initializer}
done = 0
for node in list(g.node):
    if node.op_type != "Gather" or node.input[0] not in inits:
        continue
    W = numpy_helper.to_array(inits[node.input[0]])
    if W.ndim != 2 or W.shape[0] < 10000:
        continue
    scale = np.maximum(np.abs(W).max(axis=1, keepdims=True), 1e-8) / 127.0
    Wq = np.clip(np.round(W / scale), -127, 127).astype(np.int8)
    base = node.input[0]
    g.initializer.remove(inits[base])
    g.initializer.extend([numpy_helper.from_array(Wq, base + "_q"), numpy_helper.from_array(scale.astype(np.float32), base + "_scale")])
    out = node.output[0]
    axis = [a for a in node.attribute if a.name == "axis"]
    kw = {"axis": axis[0].i} if axis else {}
    idx = list(g.node).index(node)
    g.node.remove(node)
    new = [
        helper.make_node("Gather", [base + "_q", node.input[1]], [out + "_q"], **kw),
        helper.make_node("Cast", [out + "_q"], [out + "_qf"], to=TensorProto.FLOAT),
        helper.make_node("Gather", [base + "_scale", node.input[1]], [out + "_s"], **kw),
        helper.make_node("Mul", [out + "_qf", out + "_s"], [out]),
    ]
    for k, n in enumerate(new):
        g.node.insert(idx + k, n)
    err = np.abs(Wq.astype(np.float32) * scale - W).max()
    print("embedding", W.shape, "最大誤差", float(err))
    done += 1
assert done == 1, done
onnx.save(m, dst)
print("web model", os.path.getsize(dst) // 2**20, "MB")
