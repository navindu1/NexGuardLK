// File Path: src/config/uploads.js

const multer = require("multer");

// ගොනුව disk එකට save කරනවා වෙනුවට memory එකේ තාවකාලිකව තියාගන්න.
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB (උපරිම ගොනු ප්‍රමාණය)
    fieldSize: 2 * 1024 * 1024, // 2MB (Text Field එකක උපරිම ප්‍රමාණය - මෙය DoS attack නවත්වයි)
    files: 1, // වරකට එක ෆයිල් එකක් පමණක් අප්ලෝඩ් කළ හැක
    fields: 10 // උපරිම Form Fields ගණන 10යි (අනවශ්‍ය දත්ත එවීම නවත්වයි)
  },
});

module.exports = upload;