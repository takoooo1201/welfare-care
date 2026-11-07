// 「用說的找福利」的模型檔（由 laya/trim_vocab.py 產生，放在 web/public/models/laya/），Worker 與畫面共用。
export const LAYA_BASE = `${import.meta.env.BASE_URL}models/laya/`;
export const LAYA_FILES = ['laya-zh.onnx', 'tokenizer-zh.json', 'tokenizer_config.json'] as const;
/** 改了模型檔就要換名字，讓舊的快取失效（舊名字的快取會被刪掉） */
export const LAYA_CACHE = 'wc-laya-v2';
