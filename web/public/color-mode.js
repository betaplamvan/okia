// Chống nháy theme: đặt class "dark"/"light" lên <html> trước khi vẽ.
// Được root layout nhúng bằng <script async src="/color-mode.js"> (React hoist lên <head>).
// Khóa lưu trữ phải trùng COLOR_MODE_STORAGE_KEY trong src/components/ui/color-mode.tsx.
(function () {
  try {
    var key = "okia-color-mode";
    var pref = localStorage.getItem(key);
    var mode =
      pref === "dark" || pref === "light"
        ? pref
        : matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    var cls = document.documentElement.classList;
    cls.remove("light", "dark");
    cls.add(mode);
    document.documentElement.style.colorScheme = mode;
  } catch {
    /* localStorage bị chặn: dùng mặc định sáng */
  }
})();
