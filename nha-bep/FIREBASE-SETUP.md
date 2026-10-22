# NUS • MÀN HÌNH NHÀ BẾP — FIREBASE REALTIME DATABASE

**Trạng thái hiện tại: SẴN SÀNG TÍCH HỢP, CHƯA KÍCH HOẠT.** Chưa có thông tin dự án Firebase của chủ sở hữu nên website **vẫn đọc API V7 và CODE #8 như trước**, không ngắt hoạt động đang ổn định.

## Các tệp đã chuẩn bị
- `firebase-config.js`: cấu hình **công khai** của Firebase Web App, mặc định `enabled:false`. Không chứa mật khẩu.
- `firebase-live.js`: lắng nghe thay đổi Firebase Realtime Database qua kết nối dài (onValue). Tự quay về API nếu Firebase mất kết nối hoặc không có dữ liệu.
- `firebase-publisher.gs`: mã Apps Script **độc lập**, lấy dữ liệu từ hai API hiện có rồi ghi vào Firebase bằng OAuth2 service account.
- `index.html`: đã gắn bộ kết nối tùy chọn; không sửa CODE MASTER, CODE #8 hay công thức Google Sheets.

## Luồng dữ liệu

Google Sheets → API V7 / API CODE #8 → Apps Script publisher → Firebase RTDB → Website GitHub Pages

Website nhận ngay khi Firebase có bản ghi mới. Trong cấu hình Apps Script độc lập, **bước lấy dữ liệu nguồn chạy khoảng mỗi 1 phút**, cộng thêm độ trễ làm tươi của hai API. Vì thế đây **chưa phải** cập nhật Google Sheets từng giây.

Muốn thật sự gần như ngay lập tức: mã nguồn thực sự thay đổi Google Sheets phải gọi một hàm xuất bản **sau khi ghi thành công**. Đây là một bước tích hợp riêng, cần kiểm thử trước khi sửa CODE MASTER 1.2.8 / CODE #8 đang vận hành.

## Cấu hình (chủ sở hữu thực hiện một lần)

1. Vào <https://console.firebase.google.com/> → tạo/chọn Firebase project; Realtime Database → Create database. Có thể chọn khu vực `asia-southeast1` (Singapore). **Không sử dụng Test mode để đưa dữ liệu thật vào**.
2. Project settings → Your apps → Web app; lấy các trường `apiKey`, `authDomain`, `projectId`, `appId`. Lấy `databaseURL` chính xác từ màn hình Realtime Database.
3. Authentication → Sign-in method → bật **Google**. Thêm `pqtuan399-maker.github.io` vào Authentication → Settings → Authorized domains (nếu chưa có).
4. Trong **Realtime Database → Rules**, cấp quyền đọc CHỈ cho Gmail được giao xem nhà bếp; tuyệt đối không mở `.write:true`. Ví dụ một tài khoản (thay bằng Gmail có quyền):

```json
{
  "rules": {
    "nusKitchen": {
      ".read": "auth != null && auth.token.email_verified === true && auth.token.email === 'GMAIL_DUOC_PHEP@example.com'",
      ".write": false
    }
  }
}
```

   Để cấp nhiều Gmail, sử dụng biểu thức OR cho các địa chỉ được phép. Không dùng Firebase anonymous auth để giả lập phân quyền nhân sự.

5. Trong Firebase Project Settings → Service accounts, tạo khóa **riêng cho máy chủ** có đúng quyền truy cập Realtime Database. Giữ riêng file JSON. **KHÔNG** gửi khóa riêng lên GitHub, email công khai hoặc tin nhắn.
6. Tạo **dự án Apps Script độc lập**, dán nội dung `firebase-publisher.gs` và thêm Script Properties:
   - `NUS_FIREBASE_DATABASE_URL`: địa chỉ HTTPS chính xác của Realtime Database
   - `NUS_FIREBASE_SERVICE_ACCOUNT_JSON`: **toàn bộ nội dung** service account JSON, lưu trong Script Properties (không trong code).
   Chạy thủ công `nusFirebaseInstallMinuteTrigger()` lần đầu để cấp quyền và khởi tạo đồng bộ. Nhật ký phải cho biết số node đã cập nhật.
7. Kiểm tra RTDB xuất hiện:
   - `nusKitchen/snapshotJson`: một **chuỗi JSON** của dữ liệu API V7
   - `nusKitchen/code8Json`: một **chuỗi JSON** của các yêu cầu CODE #8 đã duyệt và cập nhật
   Định dạng JSON-string bảo tồn các mảng rỗng của 8 cột danh sách.
8. Điền các trường public từ bước 2 vào `firebase-config.js`, đổi `enabled:true`, commit lên GitHub. **Không** đặt service-account JSON hoặc private key vào file này.
9. Mở website; nếu đăng nhập chưa có, nút **🔐 Kết nối Gmail** sẽ xuất hiện. Dùng Gmail đã được cấp quyền. Khi kết nối và publisher đã có dữ liệu, trạng thái hiển thị **⚡ FIREBASE · DỮ LIỆU TRỰC TIẾP**. Nếu lỗi kết nối, website tự đọc lại API dự phòng.

## Bảo mật và giới hạn quan trọng

- Firebase config phía web (apiKey/projectId/databaseURL) **không phải khóa quản trị**; Rules và Authentication mới quyết định quyền truy cập.
- Google Sheets và các Web Apps V7/CODE #8 đang có URL truy cập trực tiếp riêng. Chặn Firebase không tự động khóa các endpoint cũ. Muốn bảo mật toàn diện phải rà soát chúng.
- Không đặt `.read:true` cho danh sách họ tên nếu chưa chấp nhận rằng bất kỳ ai trên Internet cũng có thể đọc nội dung.
- GitHub Pages vẫn là website hiện hữu; Firebase RTDB là luồng dữ liệu. Di chuyển Hosting sang Firebase là việc khác.
- Màn hình phải đang mở và có mạng để nhận trực tiếp; trình duyệt điện thoại có thể tạm dừng trang chạy nền. Phát chuông trên iOS cần một lần nhấn **Bật**.
- Để dừng đồng bộ nguồn, chạy `nusFirebaseUninstallMinuteTrigger()`. Để quay về V7 ngay, đổi `enabled:false` trong `firebase-config.js`.

## Những gì CHƯA thực hiện

- Chưa tạo Firebase project/database vì chưa có kết nối Firebase của chủ sở hữu.
- Chưa cài service-account và chưa chạy publisher.
- Chưa thay đổi hoặc cài trigger trong CODE MASTER/CODE #8.
- Chưa tuyên bố đồng bộ thời gian thực hoạt động ở môi trường thật.

Tài liệu tham khảo: <https://firebase.google.com/docs/database/web/read-and-write> và <https://firebase.google.com/docs/database/rest/auth>.
