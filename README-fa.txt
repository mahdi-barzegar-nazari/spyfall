نحوه اعمال (از ریشه پروژه):
1) فایل‌های این پوشه را روی پروژه کپی کنید (همان مسیرها): sw.js, scripts/bundle.mjs, js/platform/serviceWorker.js, package.json, .github/workflows/deploy.yml
2) npm install          (esbuild اضافه می‌شود و package-lock.json به‌روز می‌شود؛ حتماً آن را کامیت کنید، وگرنه npm ci در CI شکست می‌خورد)
3) npm test && npm run build && npm run preview
4) خروجی dist فقط index.html + sw.js + manifest.json + assets است.
   اگر نخواستید همه چیز داخل یک فایل باشد: npm run build:split
