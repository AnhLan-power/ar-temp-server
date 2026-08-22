# AR Temp-File Server — Hướng dẫn triển khai

Máy chủ này chỉ có 1 nhiệm vụ: nhận file `.glb` app gửi lên, và phát lại
đúng header `Content-Type: model/gltf-binary` mà Google Scene Viewer cần để
đọc được. File chỉ lưu tạm trong RAM, tự xoá sau 30 phút, không ghi ra ổ
đĩa, không cần database.

## Cách 1 — Deploy lên Render.com (miễn phí, khuyên dùng)

1. Tạo tài khoản GitHub nếu chưa có, tạo 1 repo mới (VD: `ar-temp-server`),
   đẩy (push) toàn bộ thư mục `ar-server/` này lên repo đó.
2. Vào https://render.com, đăng nhập bằng GitHub.
3. Bấm **New +** → **Web Service** → chọn đúng repo vừa tạo.
4. Cấu hình:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Bấm **Create Web Service**, đợi build xong (~2-3 phút). Render sẽ cho
   1 địa chỉ dạng: `https://ar-temp-server-xxxx.onrender.com`
6. Mở địa chỉ đó trên trình duyệt, thấy dòng chữ
   `AR temp-file server OK...` là máy chủ đã chạy đúng.

⚠️ Gói Free của Render sẽ "ngủ" sau 15 phút không có ai gọi tới, lần gọi
đầu tiên sau đó sẽ mất thêm ~30-50 giây để "thức dậy" — chỉ ảnh hưởng lần
đầu, không phải lỗi.

## Cách 2 — Chạy thử ngay trên máy tính (test nội bộ trước khi deploy)

```
cd ar-server
npm install
npm start
```
Máy chủ chạy ở `http://localhost:3000`. Dùng công cụ như `ngrok` nếu muốn
có link https tạm để điện thoại gọi vào được từ xa:
```
ngrok http 3000
```

## Sau khi có link máy chủ — cập nhật vào app

Mở file `index.html`, tìm dòng:
```js
const AR_UPLOAD_SERVER = "https://YOUR-AR-SERVER.onrender.com";
```
Thay `https://YOUR-AR-SERVER.onrender.com` bằng đúng địa chỉ Render (hoặc
ngrok) của cậu, lưu lại, copy `index.html` vào `www/`, chạy
`npx cap sync android`, build lại app như bình thường.
