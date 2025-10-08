// File Path: src/config/uploads.js

const multer = require("multer");

// ගොනුව disk එකට save කරනවා වෙනුවට memory එකේ තාවකාලිකව තියාගන්න.
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 Megabytes limit
  },
});

module.exports = upload;