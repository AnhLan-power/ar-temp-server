// Máy chủ nhỏ riêng để phục vụ tính năng "Xem AR" — thay thế tmpfiles.org.
//
// Vì sao cần máy chủ này: Google Scene Viewer chạy như 1 app RIÊNG BIỆT,
// nó phải tự TẢI file mô hình qua 1 link https thật — không thể dùng link
// "blob:" (chỉ có nghĩa nội bộ trong app) hay máy chủ lạ trả sai header.
// Máy chủ này chỉ làm đúng 2 việc: (1) nhận file .gltf app gửi lên, (2)
// phát lại đúng Content-Type "model/gltf+json" mà Scene Viewer cần.
//
// Định dạng dùng là .gltf (JSON thường, buffer nhúng base64 ngay trong
// JSON) thay vì .glb nhị phân — đơn giản, ít rủi ro sai lệch byte hơn khi
// tự đóng gói ở phía app.
//
// File chỉ lưu TẠM trong RAM (không ghi ra ổ đĩa), tự xoá sau 30 phút hoặc
// khi máy chủ khởi động lại — không lưu trữ lâu dài, không có gì đọng lại.

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const app = express();

// QUAN TRỌNG: Render (và hầu hết PaaS khác) giải mã HTTPS ở lớp edge/proxy
// của họ rồi mới chuyển tiếp request vào container bằng HTTP thường. Nếu
// không bật "trust proxy", Express sẽ đọc req.protocol là "http" (đúng như
// những gì nó THẤY ở tầng container), khiến link trả về trong JSON bị sai
// thành "http://..." dù người dùng truy cập bằng https://. Đây chính là lý
// do Chrome báo "Insecure download blocked" và rất có thể là nguyên nhân
// khiến Scene Viewer từ chối tải model bấy lâu nay.
app.set("trust proxy", true);

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
  res.type("text/plain").send("AR temp-file server OK. POST /upload, GET /models/:id.gltf");
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    return res.status(400).json({ error: "Thiếu file hoặc file rỗng." });
  }

  const id = crypto.randomUUID();
  store.set(id, { buffer: req.file.buffer, expiresAt: Date.now() + TTL_MS });

  // Luôn ép "https" khi chạy công khai (Render...) — không dựa vào
  // req.protocol vì có thể bị sai qua proxy. Riêng khi chạy thử trên máy
  // (localhost) thì giữ nguyên "http" để test nội bộ vẫn hoạt động được.
  const host = req.get("host") || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const baseUrl = `${isLocal ? "http" : "https"}://${host}`;
  res.json({ url: `${baseUrl}/models/${id}.gltf` });
});

app.get("/models/:id.gltf", (req, res) => {
  const item = store.get(req.params.id);
  if (!item) return res.status(404).send("Không tìm thấy hoặc file đã hết hạn (30 phút).");

  res.setHeader("Content-Type", "model/gltf+json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", item.buffer.length);
  res.send(item.buffer);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AR temp-file server đang chạy ở cổng ${PORT}`);
});
