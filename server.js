// Máy chủ nhỏ riêng để phục vụ tính năng "Xem AR" — thay thế tmpfiles.org.
//
// Vì sao cần máy chủ này: Google Scene Viewer chạy như 1 app RIÊNG BIỆT,
// nó phải tự TẢI file .glb qua Internet bằng 1 link https thật — không thể
// dùng link "blob:" (chỉ có nghĩa nội bộ trong app) hay máy chủ lạ trả sai
// header. Máy chủ này chỉ làm đúng 2 việc: (1) nhận file .glb app gửi lên,
// (2) phát lại đúng Content-Type "model/gltf-binary" mà Scene Viewer cần.
//
// File chỉ lưu TẠM trong RAM (không ghi ra ổ đĩa), tự xoá sau 30 phút hoặc
// khi máy chủ khởi động lại — không lưu trữ lâu dài, không có gì đọng lại.

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // tối đa 50MB / file, đủ dùng cho 1 cấu kiện
});

// Cho phép mọi origin gọi tới (app Capacitor gọi từ "capacitor://localhost"
// hoặc "https://localhost", Scene Viewer gọi trực tiếp không có origin).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Lưu file tạm trong RAM: id -> { buffer, expiresAt }
const store = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 phút

setInterval(() => {
  const now = Date.now();
  for (const [id, item] of store.entries()) {
    if (item.expiresAt < now) store.delete(id);
  }
}, 5 * 60 * 1000).unref();

app.get("/", (req, res) => {
  res.type("text/plain").send("AR temp-file server OK. POST /upload, GET /models/:id.glb");
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    return res.status(400).json({ error: "Thiếu file hoặc file rỗng." });
  }

  const id = crypto.randomUUID();
  store.set(id, { buffer: req.file.buffer, expiresAt: Date.now() + TTL_MS });

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({ url: `${baseUrl}/models/${id}.glb` });
});

app.get("/models/:id.glb", (req, res) => {
  const item = store.get(req.params.id);
  if (!item) return res.status(404).send("Không tìm thấy hoặc file đã hết hạn (30 phút).");

  res.setHeader("Content-Type", "model/gltf-binary");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", item.buffer.length);
  res.send(item.buffer);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AR temp-file server đang chạy ở cổng ${PORT}`);
});
