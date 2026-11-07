# 網頁版（onnxruntime-web）可以正確執行的量化：權重量化成 8 位元（MatMulNBits），運算仍用 fp32
import os, sys, onnx
from onnxruntime.quantization import quantize_dynamic, QuantType
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer, DefaultWeightOnlyQuantConfig
A = os.path.join(os.path.dirname(__file__), "artifacts")
fp32 = os.path.join(A, "laya-multilingual.fp32.onnx")
out_mm = os.path.join(A, "laya.mm8.onnx")
out_both = os.path.join(A, "laya.mm8-gather8.onnx")
if not os.path.exists(out_mm):
    m = onnx.load(fp32)
    cfg = DefaultWeightOnlyQuantConfig(block_size=32, is_symmetric=True, bits=8, op_types_to_quantize=("MatMul",))
    q = MatMulNBitsQuantizer(m, algo_config=cfg)
    q.process()
    q.model.save_model_to_file(out_mm, use_external_data_format=False)
print("mm8", os.path.getsize(out_mm) // 2**20, "MB")
if not os.path.exists(out_both):
    quantize_dynamic(out_mm, out_both, weight_type=QuantType.QInt8, op_types_to_quantize=["Gather"], per_channel=False)
print("mm8+gather8", os.path.getsize(out_both) // 2**20, "MB")
out_pc = os.path.join(A, "laya.mm8-gather8pc.onnx")
if not os.path.exists(out_pc):
    quantize_dynamic(out_mm, out_pc, weight_type=QuantType.QInt8, op_types_to_quantize=["Gather"], per_channel=True)
print("mm8+gather8pc", os.path.getsize(out_pc) // 2**20, "MB")
